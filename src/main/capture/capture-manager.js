const { detectEnvironment } = require('../utils/env-detector');
const X11Capture = require('./x11-capture');
const WaylandCapture = require('./wayland-capture');

class CaptureManager {
  constructor() {
    this.environment = null;
    this.captureInstance = null;
    this.ffmpegProcess = null;
    this.useMicrophone = false;
  }

  async initialize() {
    this.environment = await detectEnvironment();
    
    if (this.environment === 'x11') {
      this.captureInstance = new X11Capture();
    } else if (this.environment === 'wayland') {
      this.captureInstance = new WaylandCapture();
    } else {
      throw new Error('Environment not supported. X11 or Wayland required.');
    }
  }

  setUseMicrophone(useMic) {
    this.useMicrophone = useMic;
  }

  async startRecording(outputPath, region = null) {
    if (!this.captureInstance) {
      await this.initialize();
    }

    if (region && this.captureInstance.setRegion) {
      this.captureInstance.setRegion(region);
    }
    
    if (this.captureInstance.setUseMicrophone) {
      this.captureInstance.setUseMicrophone(this.useMicrophone);
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

