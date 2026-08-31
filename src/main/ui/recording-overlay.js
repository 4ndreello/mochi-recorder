const { BrowserWindow, screen, ipcMain } = require("electron");
const path = require("path");
const { execSync } = require("child_process");

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
    const minX = screenBounds.x + 10;
    const maxX = screenBounds.x + screenBounds.width - width - 10;
    x = Math.max(minX, Math.min(x, maxX));

    // Try TOP outside
    let y = region.y - height - this.controlsGap;
    let side = "top";

    if (y < screenBounds.y) {
      // Try BOTTOM outside
      y = region.y + region.height + this.controlsGap;
      side = "bottom";

      if (y + height > screenBounds.y + screenBounds.height) {
        // Doesn't fit outside. Position inside the region.
        // Choose inside-top or inside-bottom based on region position on screen
        const screenCenterY = screenBounds.y + screenBounds.height / 2;
        if (region.y < screenCenterY) {
          // Region is in upper half - place controls at top inside
          y = region.y + this.controlsGap;
          side = "inside-top";
        } else {
          // Region is in lower half - place controls at bottom inside
          y = region.y + region.height - height - this.controlsGap;
          side = "inside-bottom";
        }
      }
    }

    return { x: Math.round(x), y: Math.round(y), side };
  }
  create(region, onReadyCallback = null) {
    this.region = region;
    this.onReadyCallback = onReadyCallback;
    this.regionAbsolute = region;

    const isWayland = !!process.env.HYPRLAND_INSTANCE_SIGNATURE || process.env.XDG_SESSION_TYPE === "wayland";
    let minX, minY, totalWidth, totalHeight;
    // On Wayland/Hyprland a single window cannot span all outputs - compositor tiles/clamps it.
    // Use the display containing the region instead; still allows dragging within that monitor.
    if (isWayland) {
      const display = screen.getDisplayMatching(region);
      const b = display.bounds;
      minX = b.x;
      minY = b.y;
      totalWidth = b.width;
      totalHeight = b.height;
    } else {
      const displays = screen.getAllDisplays();
      minX = Infinity;
      let minY2 = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      displays.forEach((display) => {
        const bounds = display.bounds;
        minX = Math.min(minX, bounds.x);
        minY2 = Math.min(minY2, bounds.y);
        maxX = Math.max(maxX, bounds.x + bounds.width);
        maxY = Math.max(maxY, bounds.y + bounds.height);
      });
      minY = minY2;
      totalWidth = maxX - minX;
      totalHeight = maxY - minY;
    }

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
      focusable: true,
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
    this.borderWindow.setMenuBarVisibility(false);
    this.borderWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
    });
    this.borderWindow.setAlwaysOnTop(true, "screen-saver");
    // Click-through by default: transparent areas must not block desktop.
    // Handles will temporarily disable ignore via IPC from renderer.
    this.borderWindow.setIgnoreMouseEvents(true, { forward: true });

    this.expectedBounds = {
      x: minX,
      y: minY,
      width: totalWidth,
      height: totalHeight,
    };

    this.borderWindow.webContents.on("did-finish-load", () => {
      // Hyprland may have clamped the window; re-apply requested geometry
      try { this.borderWindow.setPosition(minX, minY); } catch {}
      try { this.borderWindow.setSize(totalWidth, totalHeight); } catch {}

      setTimeout(() => {
        let actualBounds;
        try { actualBounds = this.borderWindow.getBounds(); } catch { actualBounds = this.expectedBounds; }
        // On Wayland getBounds() may be clamped; prefer expected target for offset calc
        const isClamped = actualBounds.width !== this.expectedBounds.width || actualBounds.height !== this.expectedBounds.height;
        const base = isClamped ? this.expectedBounds : actualBounds;
        const adjustedRegion = {
          x: this.regionAbsolute.x - base.x,
          y: this.regionAbsolute.y - base.y,
          width: this.regionAbsolute.width,
          height: this.regionAbsolute.height,
        };
        this.borderWindow.webContents.send("set-region", adjustedRegion);
      }, 80);
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
    this._ensureHyprlandFloating();
    return this.borderWindow;
  }

  setupIpcHandlers() {
    ipcMain.removeAllListeners("expand-controls");
    ipcMain.removeAllListeners("enable-window-drag");
    ipcMain.removeAllListeners("set-ignore-mouse-events");

    ipcMain.on("expand-controls", () => {
      this.expandControls();
    });

    ipcMain.on("enable-window-drag", () => {
      if (this.controlsWindow && !this.controlsWindow.isDestroyed()) {
        this.controlsWindow.setMovable(true);
      }
    });

    ipcMain.on("set-ignore-mouse-events", (event, ignore, options) => {
      if (this.borderWindow && !this.borderWindow.isDestroyed()) {
        const opts = options || { forward: true };
        if (opts.forward === undefined) opts.forward = true;
        this.borderWindow.setIgnoreMouseEvents(ignore, opts);
      }
    });
  }

  _ensureHyprlandFloating() {
    if (!process.env.HYPRLAND_INSTANCE_SIGNATURE) return;
    try {
      execSync('hyprctl keyword windowrulev2 "float, title:^(Recording Border)$" 2>/dev/null', { timeout: 800, stdio: "ignore" });
      execSync('hyprctl keyword windowrulev2 "float, title:^(Recording Controls)$" 2>/dev/null', { timeout: 800, stdio: "ignore" });
    } catch {}
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

      // Always forward clicks: transparent areas must never block desktop.
      // Handles will temporarily disable ignore via renderer IPC.
      this.borderWindow.setIgnoreMouseEvents(true, { forward: true });
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
      try { this.borderWindow.destroy(); } catch { try { this.borderWindow.close(); } catch {} }
      this.borderWindow = null;
    }
    if (this.controlsWindow && !this.controlsWindow.isDestroyed()) {
      try { this.controlsWindow.destroy(); } catch { try { this.controlsWindow.close(); } catch {} }
      this.controlsWindow = null;
    }
  }

  updateRegion(region) {
    this.region = region;
    this.regionAbsolute = region;
    if (this.borderWindow && !this.borderWindow.isDestroyed()) {
      let bounds;
      try { bounds = this.borderWindow.getBounds(); } catch (e) { bounds = this.expectedBounds; }
      const isClamped = bounds.width !== this.expectedBounds.width || bounds.height !== this.expectedBounds.height;
      const base = isClamped ? this.expectedBounds : bounds;
      const adjustedRegion = {
        x: region.x - base.x,
        y: region.y - base.y,
        width: region.width,
        height: region.height,
      };
      this.borderWindow.webContents.send("set-region", adjustedRegion);
    }
  }
}

module.exports = RecordingOverlay;
