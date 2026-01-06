const { spawn } = require("child_process");
const { execSync } = require("child_process");
const { getSystemAudioMonitor } = require("../utils/env-detector");

class X11Capture {
  constructor() {
    this.ffmpegProcess = null;
    this.display = process.env.DISPLAY || ":0";
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

  async getScreenResolution() {
    try {
      const output = execSync(`xrandr | grep '*' | head -1`, {
        encoding: "utf-8",
      });
      const match = output.match(/(\d+)x(\d+)/);
      if (match) {
        return { width: parseInt(match[1]), height: parseInt(match[2]) };
      }
    } catch (error) {
      console.warn("Erro ao detectar resolução, usando padrão:", error);
    }
    return { width: 1920, height: 1080 };
  }

  async getX11ScreenBounds() {
    // Obter bounds reais da tela virtual do X11
    // O x11grab usa coordenadas absolutas da tela virtual, não do Electron
    try {
      const output = execSync(`xrandr --current`, {
        encoding: "utf-8",
      });

      // Encontrar o mínimo x,y de todos os displays conectados
      // Isso nos dá o offset real do X11
      let minX = Infinity,
        minY = Infinity;
      const lines = output.split("\n");
      for (const line of lines) {
        // Procurar por padrão: 1920x1080+1366+0 ou similar
        const match = line.match(/(\d+)x(\d+)\+(\d+)\+(\d+)/);
        if (match) {
          const x = parseInt(match[3]);
          const y = parseInt(match[4]);
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
        }
      }

      if (minX !== Infinity && minY !== Infinity) {
        return { minX, minY };
      }
    } catch (error) {
      console.warn("Erro ao detectar bounds do X11:", error);
    }
    return { minX: 0, minY: 0 };
  }

  async getElectronScreenBounds() {
    // Obter bounds do Electron para comparar
    // O Electron pode estar normalizando de forma diferente
    const { screen } = require("electron");
    const displays = screen.getAllDisplays();
    let minX = Infinity,
      minY = Infinity;

    console.log("[X11Capture] Displays do Electron:");
    displays.forEach((display, i) => {
      const bounds = display.bounds;
      console.log(
        `  Display ${i}: bounds=${JSON.stringify(bounds)}, isPrimary=${
          display.id === screen.getPrimaryDisplay().id
        }`
      );
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
    });

    return {
      minX: minX === Infinity ? 0 : minX,
      minY: minY === Infinity ? 0 : minY,
    };
  }

  async findDisplayForCoordinates(x, y) {
    // Encontrar qual display contém as coordenadas
    const { screen } = require("electron");
    const displays = screen.getAllDisplays();

    for (const display of displays) {
      const bounds = display.bounds;
      if (
        x >= bounds.x &&
        x < bounds.x + bounds.width &&
        y >= bounds.y &&
        y < bounds.y + bounds.height
      ) {
        return display;
      }
    }
    return screen.getPrimaryDisplay();
  }

  async startRecording(outputPath) {
    const resolution = await this.getScreenResolution();

    // Se houver região selecionada, usar ela; senão, gravar tela inteira
    let size, offset;
    if (this.region && this.region.width > 0 && this.region.height > 0) {
      size = `${this.region.width}x${this.region.height}`;

      // O x11grab usa coordenadas absolutas do X11
      // O Electron pode normalizar coordenadas de forma diferente
      const x11Bounds = await this.getX11ScreenBounds();
      const electronBounds = await this.getElectronScreenBounds();

      // Encontrar qual display contém a seleção
      const targetDisplay = await this.findDisplayForCoordinates(
        this.region.x,
        this.region.y
      );
      console.log(
        `[X11Capture] Display alvo:`,
        JSON.stringify(targetDisplay.bounds)
      );

      // O Electron e o X11 usam coordenadas absolutas da tela virtual
      // As coordenadas já devem estar corretas
      let adjustedX = this.region.x;
      let adjustedY = this.region.y;

      // Verificar se a seleção está dentro de algum display
      const { screen } = require("electron");
      const displays = screen.getAllDisplays();
      let insideDisplay = false;
      for (const display of displays) {
        const b = display.bounds;
        if (
          adjustedX >= b.x &&
          adjustedX < b.x + b.width &&
          adjustedY >= b.y &&
          adjustedY < b.y + b.height
        ) {
          insideDisplay = true;
          console.log(
            `[X11Capture] Seleção está dentro do display: ${JSON.stringify(b)}`
          );
          break;
        }
      }

      if (!insideDisplay) {
        console.log(
          `[X11Capture] AVISO: Seleção está fora de todos os displays!`
        );
        console.log(
          `[X11Capture] Isso pode indicar um problema com as coordenadas.`
        );
      }

      offset = `${adjustedX},${adjustedY}`;
      console.log(`[X11Capture] Gravação: ${size} em ${offset}`);
      console.log(`[X11Capture] Região Electron:`, JSON.stringify(this.region));
      console.log(`[X11Capture] X11 bounds:`, JSON.stringify(x11Bounds));
      console.log(
        `[X11Capture] Electron bounds:`,
        JSON.stringify(electronBounds)
      );
      console.log(
        `[X11Capture] Coordenadas finais: x=${adjustedX}, y=${adjustedY}`
      );
    } else {
      size = `${resolution.width}x${resolution.height}`;
      offset = "0,0";
    }

    const audioMonitor = getSystemAudioMonitor();
    const args = [
      "-f",
      "pulse",
      "-i",
      audioMonitor,
      "-f",
      "x11grab",
      "-s",
      size,
      "-r",
      "60",
      "-i",
      `${this.display}+${offset}`,
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
      outputPath,
    ];

    this.ffmpegProcess = spawn("ffmpeg", args);

    return new Promise((resolve, reject) => {
      let hasError = false;
      let errorOutput = "";

      this.ffmpegProcess.stderr.on("data", (data) => {
        // FFmpeg escreve logs no stderr, mas isso é normal
        const output = data.toString();
        errorOutput += output;

        if (
          output.includes("error") ||
          output.includes("Error") ||
          output.includes("not divisible by 2")
        ) {
          console.error("FFmpeg error:", output);
          hasError = true;
        }
      });

      this.ffmpegProcess.on("error", (error) => {
        console.error("Erro ao iniciar FFmpeg:", error);
        reject(error);
      });

      // Aguardar um pouco para garantir que FFmpeg iniciou
      setTimeout(() => {
        if (hasError) {
          reject(
            new Error(
              `FFmpeg falhou ao iniciar: ${errorOutput.substring(0, 200)}`
            )
          );
        } else if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
          resolve();
        } else {
          reject(new Error("FFmpeg não iniciou corretamente"));
        }
      }, 1500);
    });
  }

  async stopRecording() {
    return new Promise((resolve) => {
      if (this.ffmpegProcess) {
        // Enviar 'q' para FFmpeg parar graciosamente
        this.ffmpegProcess.stdin.write("q\n");

        this.ffmpegProcess.on("close", (code) => {
          console.log(`FFmpeg finalizado com código ${code}`);
          this.ffmpegProcess = null;
          resolve();
        });

        // Timeout de segurança
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

module.exports = X11Capture;
