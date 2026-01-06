const { BrowserWindow, screen } = require("electron");
const path = require("path");

class AreaSelector {
  constructor() {
    this.window = null;
    this.selection = null;
  }

  create(callback) {
    // Obter todos os displays para cobrir toda a área de múltiplos monitores
    const displays = screen.getAllDisplays();
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    displays.forEach((display) => {
      const bounds = display.bounds;
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    });

    const totalWidth = maxX - minX;
    const totalHeight = maxY - minY;

    console.log("[AreaSelector] Displays detectados:");
    displays.forEach((display, i) => {
      console.log(`  Display ${i}: bounds=${JSON.stringify(display.bounds)}`);
    });
    console.log(
      `[AreaSelector] Área total: ${totalWidth}x${totalHeight} em (${minX}, ${minY})`
    );

    this.window = new BrowserWindow({
      width: totalWidth,
      height: totalHeight,
      x: minX,
      y: minY,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    this.window.loadFile(
      path.join(__dirname, "../../renderer/area-selector.html")
    );
    this.window.setIgnoreMouseEvents(false);

    // Remover menu
    this.window.setMenuBarVisibility(false);
    this.window.setFullScreenable(false);

    // Callback será chamado quando receber seleção
    this.callback = callback;
    // Guardar offset para converter coordenadas
    // A janela começa em (minX, minY), então as coordenadas relativas precisam ser ajustadas
    this.windowBounds = { x: minX, y: minY };
    console.log(
      `[AreaSelector] windowBounds definido como: ${JSON.stringify(
        this.windowBounds
      )}`
    );

    // Verificar a posição real da janela após criação
    this.window.on("ready-to-show", () => {
      const actualBounds = this.window.getBounds();
      console.log(
        `[AreaSelector] Bounds reais da janela: ${JSON.stringify(actualBounds)}`
      );
    });

    // Listener para IPC messages do renderer
    const { ipcMain } = require("electron");

    const areaSelectedHandler = (event, data) => {
      if (event.sender === this.window.webContents) {
        // IMPORTANTE: Usar os bounds REAIS da janela, não os esperados
        // O Electron pode mover a janela para uma posição diferente
        const actualBounds = this.window.getBounds();

        // Converter coordenadas relativas para absolutas
        const absoluteSelection = {
          x: actualBounds.x + data.x,
          y: actualBounds.y + data.y,
          width: data.width,
          height: data.height,
        };

        console.log("Seleção recebida:", {
          relativa: data,
          absoluta: absoluteSelection,
          windowBoundsEsperados: this.windowBounds,
          windowBoundsReais: actualBounds,
        });

        this.selection = absoluteSelection;
        if (this.callback) {
          this.callback(absoluteSelection);
        }
        this.close();
        ipcMain.removeListener("area-selected", areaSelectedHandler);
        ipcMain.removeListener("selection-cancelled", cancelledHandler);
      }
    };

    const cancelledHandler = (event) => {
      if (event.sender === this.window.webContents) {
        this.close();
        ipcMain.removeListener("area-selected", areaSelectedHandler);
        ipcMain.removeListener("selection-cancelled", cancelledHandler);
      }
    };

    ipcMain.on("area-selected", areaSelectedHandler);
    ipcMain.on("selection-cancelled", cancelledHandler);

    return this.window;
  }

  show() {
    if (this.window) {
      this.window.show();
      // NÃO usar fullscreen - isso pode mudar as coordenadas
      // Apenas maximizar para cobrir toda a área virtual
      // this.window.setFullScreen(true);

      // Verificar posição após mostrar
      const bounds = this.window.getBounds();
      console.log(
        `[AreaSelector] Janela mostrada em: ${JSON.stringify(bounds)}`
      );
    }
  }

  close() {
    if (this.window) {
      this.window.close();
      this.window = null;
    }
  }

  getSelection() {
    return this.selection;
  }
}

module.exports = AreaSelector;
