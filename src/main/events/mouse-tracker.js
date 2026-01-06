const x11 = require('x11');
const { EventEmitter } = require('events');
const { execSync } = require('child_process');
const { detectEnvironment } = require('../utils/env-detector');

class MouseTracker extends EventEmitter {
  constructor() {
    super();
    this.isTracking = false;
    this.x11Client = null;
    this.display = null;
    this.environment = null;
  }

  async start(callback) {
    if (this.isTracking) {
      return;
    }

    // Detectar ambiente
    this.environment = await detectEnvironment();

    if (this.environment === 'x11') {
      await this.startX11(callback);
    } else if (this.environment === 'wayland') {
      await this.startWayland(callback);
    } else {
      console.warn('Ambiente desconhecido, tentando X11...');
      await this.startX11(callback);
    }
  }

  async startX11(callback) {
    try {
      // Tentar conectar ao X11
      this.display = process.env.DISPLAY || ':0';
      
      x11.createClient((err, display) => {
        if (err) {
          console.warn('Não foi possível conectar ao X11, usando método alternativo:', err);
          this.startPolling(callback);
          return;
        }

        this.x11Client = display;
        this.setupX11Tracking(callback);
      });
    } catch (error) {
      console.warn('Erro ao inicializar X11, usando polling:', error);
      this.startPolling(callback);
    }
  }

  async startWayland(callback) {
    // Wayland não permite captura direta de eventos de mouse por segurança
    // Vamos usar métodos alternativos como libinput ou evtest
    console.log('Wayland detectado, usando método alternativo de rastreamento');
    
    try {
      // Tentar usar evtest (requer permissões)
      this.setupWaylandTracking(callback);
    } catch (error) {
      console.warn('Erro ao configurar rastreamento Wayland, usando fallback:', error);
      this.startPolling(callback);
    }
  }

  setupWaylandTracking(callback) {
    // Para Wayland, podemos tentar usar evtest ou libinput
    // Por enquanto, usar polling como fallback
    // Em produção, seria necessário um módulo nativo ou usar portal de permissões
    this.startPolling(callback);
  }

  setupX11Tracking(callback) {
    // Evitar bad access: usar método mais seguro
    // Em vez de modificar root window, usar polling ou xinput
    console.log('X11 conectado, usando método seguro de rastreamento');
    
    // Usar método alternativo mais seguro para evitar bad access
    this.setupAlternativeClickMonitoring(callback);
  }

  startPolling(callback) {
    // Fallback: usar polling com xdotool ou método alternativo
    // Para MVP, vamos usar um método mais simples
    const { spawn } = require('child_process');
    
    // Usar xdotool para monitorar mouse (se disponível)
    const xdotool = spawn('xdotool', ['mousemove', '--', 'getmouselocation', '--shell'], {
      stdio: ['ignore', 'pipe', 'ignore']
    });

    let lastX = null;
    let lastY = null;
    let lastClickTime = 0;

    // Polling alternativo usando xev ou método nativo
    // Por enquanto, vamos usar um intervalo simples
    this.pollInterval = setInterval(() => {
      if (!this.isTracking) return;

      // Para MVP, vamos focar apenas em cliques
      // O rastreamento completo de mouse será melhorado depois
    }, 100);

    this.isTracking = true;

    // Monitorar cliques via xinput ou método alternativo
    this.setupClickMonitoring(callback);
  }

  setupClickMonitoring(callback) {
    // Usar xinput para monitorar cliques
    const { spawn } = require('child_process');
    
    try {
      // Tentar usar xinput test-xi2 para eventos de mouse
      const xinput = spawn('xinput', ['test-xi2', '--root'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      xinput.stdout.on('data', (data) => {
        if (!this.isTracking) return;
        
        const output = data.toString();
        // Parse xinput output (formato específico)
        // Por enquanto, vamos usar método mais simples
      });

      xinput.on('error', () => {
        // xinput não disponível, usar método alternativo
        this.setupAlternativeClickMonitoring(callback);
      });
    } catch (error) {
      this.setupAlternativeClickMonitoring(callback);
    }
  }

  setupAlternativeClickMonitoring(callback) {
    // Método alternativo usando xinput ou evtest
    // Tentar usar evtest para monitorar eventos de mouse
    const { spawn } = require('child_process');
    
    try {
      // Tentar encontrar dispositivo de mouse
      const devices = execSync('xinput list --id-only', { encoding: 'utf-8' });
      const deviceIds = devices.trim().split('\n').filter(id => id);
      
      // Usar o primeiro dispositivo (geralmente o mouse)
      if (deviceIds.length > 0) {
        const deviceId = deviceIds[0];
        const xinput = spawn('xinput', ['test', deviceId], {
          stdio: ['ignore', 'pipe', 'ignore']
        });

        let buffer = '';
        xinput.stdout.on('data', (data) => {
          if (!this.isTracking) return;
          
          buffer += data.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          lines.forEach(line => {
            if (line.includes('button press') || line.includes('button release')) {
              // Parse xinput output
              const isPress = line.includes('press');
              const match = line.match(/button (\d+)/);
              if (match) {
                // Obter posição atual do mouse
                try {
                  const pos = execSync('xdotool getmouselocation --shell', { encoding: 'utf-8' });
                  const xMatch = pos.match(/X=(\d+)/);
                  const yMatch = pos.match(/Y=(\d+)/);
                  
                  if (xMatch && yMatch) {
                    const event = {
                      type: isPress ? 'click' : 'release',
                      x: parseInt(xMatch[1]),
                      y: parseInt(yMatch[1]),
                      button: parseInt(match[1]),
                      timestamp: Date.now()
                    };
                    callback(event);
                  }
                } catch (e) {
                  // Ignorar erro
                }
              }
            }
          });
        });

        xinput.on('error', () => {
          // Fallback final: usar método de polling básico
          this.setupBasicPolling(callback);
        });
      } else {
        this.setupBasicPolling(callback);
      }
    } catch (error) {
      this.setupBasicPolling(callback);
    }
  }

  setupBasicPolling(callback) {
    // Método mais básico: polling periódico da posição do mouse
    // Este método não captura cliques perfeitamente, mas é um fallback
    console.log('Usando método básico de rastreamento (limitado)');
    
    let lastX = null;
    let lastY = null;
    
    this.pollInterval = setInterval(() => {
      if (!this.isTracking) return;
      
      try {
        const pos = execSync('xdotool getmouselocation --shell', { encoding: 'utf-8' });
        const xMatch = pos.match(/X=(\d+)/);
        const yMatch = pos.match(/Y=(\d+)/);
        
        if (xMatch && yMatch) {
          const x = parseInt(xMatch[1]);
          const y = parseInt(yMatch[1]);
          
          if (lastX !== x || lastY !== y) {
            callback({
              type: 'move',
              x: x,
              y: y,
              timestamp: Date.now()
            });
            lastX = x;
            lastY = y;
          }
        }
      } catch (e) {
        // Ignorar erro
      }
    }, 50); // Poll a cada 50ms
  }

  stop() {
    this.isTracking = false;
    
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    if (this.x11Client) {
      try {
        this.x11Client.close();
      } catch (error) {
        // Ignorar erro ao fechar
      }
      this.x11Client = null;
    }
  }
}

module.exports = MouseTracker;

