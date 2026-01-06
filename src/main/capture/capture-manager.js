const { detectEnvironment } = require('../utils/env-detector');
const X11Capture = require('./x11-capture');
const WaylandCapture = require('./wayland-capture');

class CaptureManager {
  constructor() {
    this.environment = null;
    this.captureInstance = null;
    this.ffmpegProcess = null;
  }

  async initialize() {
    this.environment = await detectEnvironment();
    
    if (this.environment === 'x11') {
      this.captureInstance = new X11Capture();
    } else if (this.environment === 'wayland') {
      this.captureInstance = new WaylandCapture();
    } else {
      throw new Error('Ambiente não suportado. Necessário X11 ou Wayland.');
    }
  }

  async startRecording(outputPath, region = null) {
    if (!this.captureInstance) {
      await this.initialize();
    }

    // Definir região se fornecida
    if (region && this.captureInstance.setRegion) {
      this.captureInstance.setRegion(region);
    }

    return await this.captureInstance.startRecording(outputPath);
  }

  async stopRecording() {
    if (this.captureInstance) {
      return await this.captureInstance.stopRecording();
    }
  }

  getEnvironment() {
    return this.environment;
  }
}

module.exports = CaptureManager;

