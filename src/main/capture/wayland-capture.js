const { spawn } = require("child_process");
const { execSync } = require("child_process");
const { getSystemAudioMonitor } = require("../utils/env-detector");

class WaylandCapture {
  constructor() {
    this.ffmpegProcess = null;
    this.region = null; // {x, y, width, height}
  }

  setRegion(region) {
    if (region) {
      // Garantir que dimensões sejam pares (requisito do libx264)
      this.region = {
        x: region.x,
        y: region.y,
        width: region.width % 2 === 0 ? region.width : region.width - 1,
        height: region.height % 2 === 0 ? region.height : region.height - 1,
      };
    } else {
      this.region = null;
    }
  }

  async getPipeWireSource() {
    try {
      // Tentar encontrar fonte PipeWire
      // No Wayland moderno, PipeWire é usado para captura de tela
      const output = execSync(
        'pw-cli list-objects | grep -i "screen" | head -1',
        {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "ignore"],
        }
      );

      // PipeWire geralmente usa formato pipewire://
      // Para FFmpeg, usamos pipewire:0 como padrão
      return "pipewire:0";
    } catch (error) {
      console.warn("Erro ao detectar fonte PipeWire, usando padrão:", error);
      return "pipewire:0";
    }
  }

  async startRecording(outputPath) {
    const source = await this.getPipeWireSource();
    const audioMonitor = getSystemAudioMonitor();

    const args = [
      "-f",
      "pulse",
      "-i",
      audioMonitor,
      "-f",
      "pipewire",
      "-i",
      source,
      "-r",
      "60",
    ];

    if (this.region && this.region.width > 0 && this.region.height > 0) {
      args.push(
        "-vf",
        `crop=${this.region.width}:${this.region.height}:${this.region.x}:${this.region.y}`
      );
    }

    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-y",
      outputPath
    );

    this.ffmpegProcess = spawn("ffmpeg", args);

    this.ffmpegProcess.stderr.on("data", (data) => {
      const output = data.toString();
      if (output.includes("error") || output.includes("Error")) {
        console.error("FFmpeg error:", output);
      }
    });

    this.ffmpegProcess.on("error", (error) => {
      console.error("Erro ao iniciar FFmpeg:", error);
      throw error;
    });

    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
          resolve();
        } else {
          reject(
            new Error(
              "FFmpeg não iniciou corretamente. Verifique se PipeWire está instalado e funcionando."
            )
          );
        }
      }, 1000);
    });
  }

  async stopRecording() {
    return new Promise((resolve) => {
      if (this.ffmpegProcess) {
        this.ffmpegProcess.stdin.write("q\n");

        this.ffmpegProcess.on("close", (code) => {
          console.log(`FFmpeg finalizado com código ${code}`);
          this.ffmpegProcess = null;
          resolve();
        });

        setTimeout(() => {
          if (this.ffmpegProcess) {
            this.ffmpegProcess.kill();
            this.ffmpegProcess = null;
            resolve();
          }
        }, 5000);
      } else {
        resolve();
      }
    });
  }
}

module.exports = WaylandCapture;
