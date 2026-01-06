const { BrowserWindow, screen, ipcMain } = require("electron");
const path = require("path");

class AreaSelector {
  constructor() {
    this.windows = []; // Array de { window, display }
    this.selection = null;
    this.callback = null;
    this.areaSelectedHandler = null;
    this.cancelledHandler = null;
    this.selectionStartedHandler = null;
  }

  create(callback) {
    const displays = screen.getAllDisplays();

    console.log("[AreaSelector] Displays detectados:");
    displays.forEach((display, i) => {
      console.log(`  Display ${i}: bounds=${JSON.stringify(display.bounds)}`);
    });

    this.callback = callback;

    // Criar uma janela para cada monitor
    displays.forEach((display, index) => {
      const bounds = display.bounds;

      const window = new BrowserWindow({
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        show: false,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
        },
      });

      window.loadFile(
        path.join(__dirname, "../../renderer/area-selector.html")
      );
      window.setIgnoreMouseEvents(false);
      window.setMenuBarVisibility(false);
      window.setFullScreenable(false);

      window.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      });

      window.webContents.on("did-finish-load", () => {
        window.setBounds({
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        });

        window.webContents.send("display-info", {
          displayIndex: index,
          displayId: display.id,
          bounds: bounds,
        });
      });

      this.windows.push({ window, display, index, targetBounds: bounds });

      console.log(
        `[AreaSelector] Janela ${index} criada para display em (${bounds.x}, ${bounds.y}) ${bounds.width}x${bounds.height}`
      );
    });

    this.setupIpcHandlers();

    return this.windows.length > 0 ? this.windows[0].window : null;
  }

  setupIpcHandlers() {
    // Handler quando uma seleção é concluída
    this.areaSelectedHandler = (event, data) => {
      // Encontrar qual janela enviou o evento
      const sourceWindow = this.windows.find(
        (w) => w.window.webContents === event.sender
      );

      if (sourceWindow) {
        const actualBounds = sourceWindow.window.getBounds();

        // Converter coordenadas relativas para absolutas
        const absoluteSelection = {
          x: actualBounds.x + data.x,
          y: actualBounds.y + data.y,
          width: data.width,
          height: data.height,
        };

        console.log("[AreaSelector] Seleção recebida:", {
          displayIndex: sourceWindow.index,
          relativa: data,
          absoluta: absoluteSelection,
        });

        this.selection = absoluteSelection;
        if (this.callback) {
          this.callback(absoluteSelection);
        }
        this.close();
      }
    };

    // Handler quando seleção é cancelada
    this.cancelledHandler = (event) => {
      const sourceWindow = this.windows.find(
        (w) => w.window.webContents === event.sender
      );

      if (sourceWindow) {
        console.log("[AreaSelector] Seleção cancelada");
        this.close();
      }
    };

    // Handler quando usuário começa a selecionar em um monitor
    // Escurece os outros monitores
    this.selectionStartedHandler = (event, data) => {
      const sourceWindow = this.windows.find(
        (w) => w.window.webContents === event.sender
      );

      if (sourceWindow) {
        console.log(
          `[AreaSelector] Seleção iniciada no display ${sourceWindow.index}`
        );

        // Notificar TODOS os outros monitores para escurecer
        this.windows.forEach((w) => {
          if (w.window.webContents !== event.sender) {
            w.window.webContents.send("dim-overlay");
          }
        });
      }
    };

    ipcMain.on("area-selected", this.areaSelectedHandler);
    ipcMain.on("selection-cancelled", this.cancelledHandler);
    ipcMain.on("selection-started", this.selectionStartedHandler);
  }

  removeIpcHandlers() {
    if (this.areaSelectedHandler) {
      ipcMain.removeListener("area-selected", this.areaSelectedHandler);
    }
    if (this.cancelledHandler) {
      ipcMain.removeListener("selection-cancelled", this.cancelledHandler);
    }
    if (this.selectionStartedHandler) {
      ipcMain.removeListener("selection-started", this.selectionStartedHandler);
    }
  }

  show() {
    this.windows.forEach(({ window, index, targetBounds }) => {
      window.setBounds({
        x: targetBounds.x,
        y: targetBounds.y,
        width: targetBounds.width,
        height: targetBounds.height,
      });
      window.show();
      window.setBounds({
        x: targetBounds.x,
        y: targetBounds.y,
        width: targetBounds.width,
        height: targetBounds.height,
      });

      const actualBounds = window.getBounds();
      console.log(
        `[AreaSelector] Janela ${index} mostrada em: ${JSON.stringify(actualBounds)} (esperado: ${JSON.stringify(targetBounds)})`
      );
    });
  }

  close() {
    this.removeIpcHandlers();

    this.windows.forEach(({ window }) => {
      if (window && !window.isDestroyed()) {
        window.close();
      }
    });
    this.windows = [];
  }

  getSelection() {
    return this.selection;
  }
}

module.exports = AreaSelector;
