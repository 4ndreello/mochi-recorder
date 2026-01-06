const { spawn } = require("child_process");
const { execSync } = require("child_process");
const { getSystemAudioMonitor, getSystemMicrophone } = require("../utils/env-detector");

class WaylandCapture {
  constructor() {
    this.ffmpegProcess = null;
    this.region = null;
    this.useMicrophone = false;
  }

  setRegion(region) {
    if (region) {
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

  setUseMicrophone(useMic) {
    this.useMicrophone = useMic;
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
    const microphone = this.useMicrophone ? getSystemMicrophone() : null;

    let args = [];
    
    if (microphone) {
      args = [
        "-f", "pulse", "-i", audioMonitor,
        "-f", "pulse", "-i", microphone,
        "-f", "pipewire", "-i", source,
        "-r", "60",
      ];
      
      let filterComplex = "[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2[aout]";
      
      if (this.region && this.region.width > 0 && this.region.height > 0) {
        filterComplex = `[2:v]crop=${this.region.width}:${this.region.height}:${this.region.x}:${this.region.y}[vout];[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2[aout]`;
        args.push("-filter_complex", filterComplex, "-map", "[vout]", "-map", "[aout]");
      } else {
        args.push("-filter_complex", filterComplex, "-map", "2:v", "-map", "[aout]");
      }
      
      args.push(
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k",
        "-y", outputPath
      );
    } else {
      args = [
        "-f", "pulse", "-i", audioMonitor,
        "-f", "pipewire", "-i", source,
        "-r", "60",
      ];

      if (this.region && this.region.width > 0 && this.region.height > 0) {
        args.push("-vf", `crop=${this.region.width}:${this.region.height}:${this.region.x}:${this.region.y}`);
      }

      args.push(
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k",
        "-y", outputPath
      );
    }

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
