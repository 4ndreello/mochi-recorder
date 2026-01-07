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
      console.warn('Unknown environment, trying X11...');
      await this.startX11(callback);
    }
  }

  async startX11(callback) {
    try {
      // Tentar conectar ao X11
      this.display = process.env.DISPLAY || ':0';
      
      x11.createClient((err, display) => {
        if (err) {
          console.warn('Could not connect to X11, using alternative method:', err);
          this.startPolling(callback);
          return;
        }

        this.x11Client = display;
        this.setupX11Tracking(callback);
      });
    } catch (error) {
      console.warn('Error initializing X11, using polling:', error);
      this.startPolling(callback);
    }
  }

  async startWayland(callback) {
    // Wayland doesn't allow direct mouse event capture for security
    // We'll use alternative methods like libinput or evtest
    console.log('Wayland detected, using alternative tracking method');
    
    try {
      // Try to use evtest (requires permissions)
      this.setupWaylandTracking(callback);
    } catch (error) {
      console.warn('Error setting up Wayland tracking, using fallback:', error);
      this.startPolling(callback);
    }
  }

  setupWaylandTracking(callback) {
    // For Wayland, we can try to use evtest or libinput
    // For now, use polling as fallback
    // In production, a native module or permission portal would be needed
    this.startPolling(callback);
  }

  setupX11Tracking(callback) {
    // Avoid bad access: use safer method
    // Instead of modifying root window, use polling or xinput
    console.log('X11 connected, using safe tracking method');
    
    // Use safer alternative method to avoid bad access
    this.setupAlternativeClickMonitoring(callback);
  }

  startPolling(callback) {
    // Fallback: use polling with xdotool or alternative method
    // For MVP, we'll use a simpler method
    const { spawn } = require('child_process');
    
    // Use xdotool to monitor mouse (if available)
    const xdotool = spawn('xdotool', ['mousemove', '--', 'getmouselocation', '--shell'], {
      stdio: ['ignore', 'pipe', 'ignore']
    });

    let lastX = null;
    let lastY = null;
    let lastClickTime = 0;

    // Alternative polling using xev or native method
    // For now, we'll use a simple interval
    this.pollInterval = setInterval(() => {
      if (!this.isTracking) return;

      // For MVP, we'll focus only on clicks
      // Full mouse tracking will be improved later
    }, 100);

    this.isTracking = true;

    // Monitor clicks via xinput or alternative method
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
        // Parse xinput output (specific format)
        // For now, we'll use simpler method
      });

      xinput.on('error', () => {
        // xinput not available, use alternative method
        this.setupAlternativeClickMonitoring(callback);
      });
    } catch (error) {
      this.setupAlternativeClickMonitoring(callback);
    }
  }

  setupAlternativeClickMonitoring(callback) {
    // Alternative method using xinput or evtest
    // Try to use evtest to monitor mouse events
    const { spawn } = require('child_process');
    
    try {
      // Try to find mouse device
      const devices = execSync('xinput list --id-only', { encoding: 'utf-8' });
      const deviceIds = devices.trim().split('\n').filter(id => id);
      
      // Use first device (usually the mouse)
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
                // Get current mouse position
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
          // Final fallback: use basic polling method
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
    // Most basic method: periodic polling of mouse position
    // This method doesn't capture clicks perfectly, but it's a fallback
    console.log('Using basic tracking method (limited)');
    
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
    }, 50); // Poll every 50ms
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
        // Ignore error on close
      }
      this.x11Client = null;
    }
  }
}

module.exports = MouseTracker;

