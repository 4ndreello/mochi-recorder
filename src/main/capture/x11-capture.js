const { execSync } = require("child_process");
const BaseCapture = require("./base-capture");

class X11Capture extends BaseCapture {
  constructor() {
    super();
    this.display = process.env.DISPLAY || ":0";
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

  /**
   * Constrói os argumentos de vídeo específicos do X11
   */
  async buildVideoArgs() {
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
        `[MAIN] [X11Capture] Display alvo:`,
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
            `[MAIN] [X11Capture] Seleção está dentro do display: ${JSON.stringify(
              b
            )}`
          );
          break;
        }
      }

      if (!insideDisplay) {
        console.log(
          `[MAIN] [X11Capture] AVISO: Seleção está fora de todos os displays!`
        );
        console.log(
          `[MAIN] [X11Capture] Isso pode indicar um problema com as coordenadas.`
        );
      }

      offset = `${adjustedX},${adjustedY}`;
      console.log(`[MAIN] [X11Capture] Gravação: ${size} em ${offset}`);
      console.log(
        `[MAIN] [X11Capture] Região Electron:`,
        JSON.stringify(this.region)
      );
      console.log(`[MAIN] [X11Capture] X11 bounds:`, JSON.stringify(x11Bounds));
      console.log(
        `[MAIN] [X11Capture] Electron bounds:`,
        JSON.stringify(electronBounds)
      );
      console.log(
        `[MAIN] [X11Capture] Coordenadas finais: x=${adjustedX}, y=${adjustedY}`
      );
    } else {
      size = `${resolution.width}x${resolution.height}`;
      offset = "0,0";
    }

    return [
      "-f",
      "x11grab",
      "-s",
      size,
      "-r",
      "60",
      "-i",
      `${this.display}+${offset}`,
    ];
  }
}

module.exports = X11Capture;
