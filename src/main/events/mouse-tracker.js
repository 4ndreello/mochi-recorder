const x11 = require('x11');
const { EventEmitter } = require('events');
const { execSync } = require('child_process');
const { detectEnvironment } = require('../utils/env-detector');

const POLLING_INTERVAL_MS = 1;
const TARGET_POLLING_HZ = 1000;

class MouseTracker extends EventEmitter {
  constructor() {
    super();
    this.isTracking = false;
    this.x11Client = null;
    this.x11Display = null;
    this.x11Root = null;
    this.display = null;
    this.environment = null;
    this.startTimeNs = null;
    this.lastButtonState = 0;
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
      this.display = process.env.DISPLAY || ':0';
      
      x11.createClient((err, display) => {
        if (err) {
          console.warn('[MouseTracker] Could not connect to X11, using fallback:', err.message);
          this.startPolling(callback);
          return;
        }

        this.x11Client = display.client;
        this.x11Display = display;
        this.x11Root = display.screen[0].root;
        this.setupNativeX11Tracking(callback);
      });
    } catch (error) {
      console.warn('[MouseTracker] Error initializing X11, using polling:', error);
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
    console.log('[MouseTracker] X11 connected, using polling');
    this.isTracking = true;
    this.setupBasicPolling(callback);
  }

  setupNativeX11Tracking(callback) {
    console.log(`[MouseTracker] Native X11 tracking enabled (target: ${TARGET_POLLING_HZ}Hz)`);
    this.isTracking = true;
    this.startTimeNs = process.hrtime.bigint();
    
    let lastX = null;
    let lastY = null;
    
    const queryPointer = () => {
      if (!this.isTracking || !this.x11Client) return;
      
      this.x11Client.QueryPointer(this.x11Root, (err, pointer) => {
        if (err || !this.isTracking) {
          if (this.isTracking) {
            setTimeout(queryPointer, POLLING_INTERVAL_MS);
          }
          return;
        }
        
        const x = pointer.rootX;
        const y = pointer.rootY;
        const buttons = pointer.mask;
        
        const nowNs = process.hrtime.bigint();
        const elapsedMs = Number(nowNs - this.startTimeNs) / 1_000_000;
        
        if (lastX !== x || lastY !== y) {
          callback({
            type: 'move',
            x: x,
            y: y,
            t: elapsedMs,
            timestamp: Date.now()
          });
          lastX = x;
          lastY = y;
        }
        
        const leftButton = (buttons & 0x100) !== 0;
        const wasLeftPressed = (this.lastButtonState & 0x100) !== 0;
        
        if (leftButton && !wasLeftPressed) {
          callback({
            type: 'click',
            x: x,
            y: y,
            button: 1,
            t: elapsedMs,
            timestamp: Date.now()
          });
        }
        
        this.lastButtonState = buttons;
        
        setImmediate(queryPointer);
      });
    };
    
    queryPointer();
  }

  startPolling(callback) {
    this.isTracking = true;
    this.setupBasicPolling(callback);
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
    console.log('[MouseTracker] Using xdotool fallback polling (100Hz)');
    
    this.startTimeNs = process.hrtime.bigint();
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
          
          const nowNs = process.hrtime.bigint();
          const elapsedMs = Number(nowNs - this.startTimeNs) / 1_000_000;
          
          if (lastX !== x || lastY !== y) {
            callback({
              type: 'move',
              x: x,
              y: y,
              t: elapsedMs,
              timestamp: Date.now()
            });
            lastX = x;
            lastY = y;
          }
        }
      } catch (e) {
      }
    }, 10);
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
      }
      this.x11Client = null;
      this.x11Display = null;
      this.x11Root = null;
    }
  }
}

module.exports = MouseTracker;

