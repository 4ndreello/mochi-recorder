const { execSync } = require("child_process");
const BaseCapture = require("./base-capture");

class WaylandCapture extends BaseCapture {
  constructor() {
    super();
  }

  async getPipeWireSource() {
    try {
      // Tentar encontrar fonte PipeWire
      // No Wayland moderno, PipeWire é usado para captura de tela
      execSync('pw-cli list-objects | grep -i "screen" | head -1', {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      });

      // PipeWire geralmente usa formato pipewire://
      // Para FFmpeg, usamos pipewire:0 como padrão
      return "pipewire:0";
    } catch (error) {
      console.warn(
        "[MAIN] Erro ao detectar fonte PipeWire, usando padrão:",
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

  /**
   * Constrói os argumentos de vídeo específicos do Wayland
   */
  async buildVideoArgs() {
    const source = await this.getVideoSource();
    return ["-f", "pipewire", "-i", source, "-r", "60"];
  }
}

module.exports = WaylandCapture;
