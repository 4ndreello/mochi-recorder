const { execSync } = require("child_process");
const BaseCapture = require("./base-capture");

class WaylandCapture extends BaseCapture {
  constructor() {
    super();
  }

  async getPipeWireSource() {
    try {
      // Try to find PipeWire source
      // In modern Wayland, PipeWire is used for screen capture
      execSync('pw-cli list-objects | grep -i "screen" | head -1', {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      });

      // PipeWire usually uses pipewire:// format
      // For FFmpeg, we use pipewire:0 as default
      return "pipewire:0";
    } catch (error) {
      console.warn(
        "[MAIN] Error detecting PipeWire source, using default:",
        error
      );
      return "pipewire:0";
    }
  }

  /**
   * Implementa getVideoSource da classe base
   */
  async getVideoSource() {
    return await this.getPipeWireSource();
  }

  async buildVideoArgs() {
    const source = await this.getVideoSource();
    return ["-thread_queue_size", "1024", "-f", "pipewire", "-i", source, "-r", String(this.fps)];
  }
}

module.exports = WaylandCapture;
