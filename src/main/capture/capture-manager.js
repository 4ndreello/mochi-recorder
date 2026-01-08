const { detectEnvironment } = require('../utils/env-detector');
const X11Capture = require('./x11-capture');
const WaylandCapture = require('./wayland-capture');

class CaptureManager {
  constructor() {
    this.environment = null;
    this.captureInstance = null;
    this.useMicrophone = false;
    this.useSystemAudio = true;
    this.fps = 30;
    this.quality = "medium";
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

  setUseSystemAudio(useSystemAudio) {
    this.useSystemAudio = useSystemAudio;
  }

  setFps(fps) {
    this.fps = fps;
  }

  setQuality(quality) {
    this.quality = quality;
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

    if (this.captureInstance.setUseSystemAudio) {
      this.captureInstance.setUseSystemAudio(this.useSystemAudio);
    }

    if (this.captureInstance.setFps) {
      this.captureInstance.setFps(this.fps);
    }

    if (this.captureInstance.setQuality) {
      this.captureInstance.setQuality(this.quality);
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

