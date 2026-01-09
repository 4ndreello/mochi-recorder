const { BrowserWindow, screen, ipcMain } = require("electron");
const path = require("path");

class RecordingOverlay {
  constructor() {
    this.borderWindow = null;
    this.controlsWindow = null;
    this.region = null;
    this.controlsWidth = 400;
    this.controlsHeight = 200;
    this.positionSide = "top";
    this.controlsGap = 12;
    this.iconPath = path.join(__dirname, "../../renderer/assets/icon.png");
  }

  calculateControlsPosition(region, width, height) {
    const display = screen.getDisplayMatching(region);
    const screenBounds = display.bounds;

    let x = region.x + Math.floor(region.width / 2) - Math.floor(width / 2);
    let y = region.y - height - this.controlsGap;
    let side = "top";

    if (y < screenBounds.y) {
      y = region.y + region.height + this.controlsGap;
      side = "bottom";

      if (y + height > screenBounds.y + screenBounds.height) {
        y = region.y + region.height - height - this.controlsGap;
        side = "inside";
      }
    }

    const minX = screenBounds.x + 10;
    const maxX = screenBounds.x + screenBounds.width - width - 10;
    x = Math.max(minX, Math.min(x, maxX));

    return { x: Math.round(x), y: Math.round(y), side };
  }

  create(region, onReadyCallback = null) {
    this.region = region;
    this.onReadyCallback = onReadyCallback;
    this.regionAbsolute = region;

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

    this.borderWindow = new BrowserWindow({
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
      focusable: false,
      hasShadow: false,
      backgroundColor: "#00000000",
      enableLargerThanScreen: true,
      type: "toolbar",
      thickFrame: false,
      icon: this.iconPath,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableWebSQL: false,
        spellcheck: false,
      },
    });

    this.borderWindow.loadFile(
      path.join(__dirname, "../../renderer/recording-border.html"),
    );
    this.borderWindow.setIgnoreMouseEvents(true);
    this.borderWindow.setMenuBarVisibility(false);
    this.borderWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
    });
    this.borderWindow.setAlwaysOnTop(true, "screen-saver");

    this.expectedBounds = {
      x: minX,
      y: minY,
      width: totalWidth,
      height: totalHeight,
    };

    this.borderWindow.webContents.on("did-finish-load", () => {
      this.borderWindow.setPosition(minX, minY);
      this.borderWindow.setSize(totalWidth, totalHeight);

      setTimeout(() => {
        const actualBounds = this.borderWindow.getBounds();
        const adjustedRegion = {
          x: this.regionAbsolute.x - actualBounds.x,
          y: this.regionAbsolute.y - actualBounds.y,
          width: this.regionAbsolute.width,
          height: this.regionAbsolute.height,
        };
        this.borderWindow.webContents.send("set-region", adjustedRegion);
      }, 50);
    });

    const controlsPos = this.calculateControlsPosition(
      region,
      this.controlsWidth,
      this.controlsHeight,
    );
    this.positionSide = controlsPos.side;

    this.controlsWindow = new BrowserWindow({
      width: this.controlsWidth,
      height: this.controlsHeight,
      x: controlsPos.x,
      y: controlsPos.y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: true,
      hasShadow: false,
      backgroundColor: "#00000000",
      type: "toolbar",
      thickFrame: false,
      icon: this.iconPath,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableWebSQL: false,
        spellcheck: false,
      },
    });

    this.controlsWindow.loadFile(
      path.join(__dirname, "../../renderer/recording-controls.html"),
    );
    this.controlsWindow.setMenuBarVisibility(false);
    this.controlsWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
    });
    this.controlsWindow.setAlwaysOnTop(true, "screen-saver");

    this.controlsWindow.webContents.on("did-finish-load", () => {
      this.controlsWindow.webContents.send("position-side", this.positionSide);

      if (this.onReadyCallback) {
        this.onReadyCallback();
      }
    });

    this.setupIpcHandlers();

    return this.borderWindow;
  }

  setupIpcHandlers() {
    ipcMain.removeAllListeners("expand-controls");
    ipcMain.removeAllListeners("enable-window-drag");

    ipcMain.on("expand-controls", () => {
      this.expandControls();
    });

    ipcMain.on("enable-window-drag", () => {
      if (this.controlsWindow && !this.controlsWindow.isDestroyed()) {
        this.controlsWindow.setMovable(true);
      }
    });
  }

  expandControls() {
    if (this.controlsWindow && !this.controlsWindow.isDestroyed()) {
      this.controlsWindow.webContents.send(
        "controls-expanded",
        this.positionSide,
      );
    }

    this.hideBorder();
  }

  hideBorder() {
    if (this.borderWindow && !this.borderWindow.isDestroyed()) {
      this.borderWindow.hide();
    }
  }

  setRecordingState(state) {
    if (this.borderWindow && !this.borderWindow.isDestroyed()) {
      this.borderWindow.webContents.send("set-recording-state", state);
    }
  }

  notifyRecordingStarted() {
    if (this.controlsWindow && !this.controlsWindow.isDestroyed()) {
      this.controlsWindow.webContents.send("recording-started");
    }
    this.setRecordingState("recording");
  }

  notifyProcessingProgress(stage, percent) {
    if (this.controlsWindow && !this.controlsWindow.isDestroyed()) {
      this.controlsWindow.webContents.send("processing-progress", {
        stage,
        percent,
      });
    }
  }

  notifyRecordingFinished(videoPath) {
    if (this.controlsWindow && !this.controlsWindow.isDestroyed()) {
      this.controlsWindow.webContents.send("recording-finished", {
        path: videoPath,
      });
    }
  }

  notifyError(errorMessage) {
    if (this.controlsWindow && !this.controlsWindow.isDestroyed()) {
      this.controlsWindow.webContents.send("recording-error", {
        error: errorMessage,
      });
    }
  }

  show() {
    if (this.borderWindow && !this.borderWindow.isDestroyed()) {
      this.borderWindow.show();
    }
    if (this.controlsWindow && !this.controlsWindow.isDestroyed()) {
      this.controlsWindow.show();
    }
  }

  hide() {
    if (this.borderWindow && !this.borderWindow.isDestroyed()) {
      this.borderWindow.hide();
    }
    if (this.controlsWindow && !this.controlsWindow.isDestroyed()) {
      this.controlsWindow.hide();
    }
  }

  close() {
    if (this.borderWindow && !this.borderWindow.isDestroyed()) {
      this.borderWindow.close();
      this.borderWindow = null;
    }
    if (this.controlsWindow && !this.controlsWindow.isDestroyed()) {
      this.controlsWindow.close();
      this.controlsWindow = null;
    }
  }

  updateRegion(region) {
    this.region = region;
    if (this.borderWindow && !this.borderWindow.isDestroyed()) {
      const bounds = this.borderWindow.getBounds();
      const adjustedRegion = {
        x: region.x - bounds.x,
        y: region.y - bounds.y,
        width: region.width,
        height: region.height,
      };
      this.borderWindow.webContents.send("set-region", adjustedRegion);
    }
  }
}

module.exports = RecordingOverlay;
