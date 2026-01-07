const { BrowserWindow, screen, ipcMain } = require("electron");
const path = require("path");

class RecordingOverlay {
  constructor() {
    this.borderWindow = null;
    this.controlsWindow = null;
    this.region = null;
    this.controlsWidth = 340;
    this.controlsHeight = 44;
    this.expandedControlsWidth = 320;
    this.expandedControlsHeight = 110;
    this.positionSide = "top";
    this.controlsGap = 12;
  }

  /**
   * Calculates the ideal position for the controls window
   * Priority: Above -> Below -> Inside the region
   */
  calculateControlsPosition(region, width, height) {
    const display = screen.getDisplayMatching(region);
    const screenBounds = display.bounds;

    let x = region.x + Math.floor(region.width / 2) - Math.floor(width / 2);
    let y = region.y - height - this.controlsGap;
    let side = "top";

    // Check if it's going out the top
    if (y < screenBounds.y) {
      // Try to position below the region
      y = region.y + region.height + this.controlsGap;
      side = "bottom";

      // Check if it's going out the bottom
      if (y + height > screenBounds.y + screenBounds.height) {
        // Position inside the region (at internal footer)
        y = region.y + region.height - height - this.controlsGap;
        side = "inside";
      }
    }

    // Horizontal adjustment - don't allow it to go outside side edges
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
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    this.borderWindow.loadFile(
      path.join(__dirname, "../../renderer/recording-border.html"),
    );
    // Allow mouse events to pass through, but we'll handle them in the renderer
    this.borderWindow.setIgnoreMouseEvents(true, { forward: true });
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
        // Send border window bounds to renderer for drag calculations
        this.borderWindow.webContents.send("border-window-bounds", actualBounds);
        // Setup mouse events to only capture when over border area
        // This allows controls window to receive events normally
        this.setupBorderMouseEvents(adjustedRegion);
      }, 50);
    });

    // Calculate smart position for controls
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
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    this.controlsWindow.loadFile(
      path.join(__dirname, "../../renderer/recording-controls.html"),
    );
    // Ensure controls window can receive mouse events and is always on top
    // This must be set BEFORE setting ignoreMouseEvents on border
    this.controlsWindow.setIgnoreMouseEvents(false);
    this.controlsWindow.setMenuBarVisibility(false);
    this.controlsWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
    });
    // Set controls window to be above border window with higher priority
    this.controlsWindow.setAlwaysOnTop(true, "screen-saver", 1);
    
    // Force controls window to be on top by showing it after border
    // and ensuring it has focus priority
    this.controlsWindow.setSkipTaskbar(true);

    this.controlsWindow.webContents.on("did-finish-load", () => {
      // Inform renderer which side is positioned to adjust internal layout
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
    ipcMain.removeAllListeners("start-dragging-border");
    ipcMain.removeAllListeners("update-border-position");
    ipcMain.removeAllListeners("stop-dragging-border");

    ipcMain.on("expand-controls", () => {
      this.expandControls();
    });

    ipcMain.on("enable-window-drag", () => {
      if (this.controlsWindow && !this.controlsWindow.isDestroyed()) {
        this.controlsWindow.setMovable(true);
      }
    });

    ipcMain.on("start-dragging-border", () => {
      this.hideControlsWithFade();
      // Temporarily disable controls window events during drag
      // so border can receive all mouse events for dragging
      if (this.controlsWindow && !this.controlsWindow.isDestroyed()) {
        this.controlsWindow.setIgnoreMouseEvents(true, { forward: true });
      }
    });

    ipcMain.on("update-border-position", (event, newRegion) => {
      this.updateRegionDuringDrag(newRegion);
    });

    ipcMain.on("stop-dragging-border", () => {
      // Re-enable controls window events
      if (this.controlsWindow && !this.controlsWindow.isDestroyed()) {
        this.controlsWindow.setIgnoreMouseEvents(false);
      }
      this.showControlsWithFade();
      this.repositionControls();
    });
  }

  expandControls() {
    if (this.controlsWindow && !this.controlsWindow.isDestroyed()) {
      const bounds = this.controlsWindow.getBounds();
      const heightDiff = this.expandedControlsHeight - this.controlsHeight;

      let newY = bounds.y;

      // If positioned above or inside, expand upward
      // If positioned below, expand downward
      if (this.positionSide === "top" || this.positionSide === "inside") {
        newY = bounds.y - heightDiff;
      }
      // Se 'bottom', newY permanece o mesmo (expande para baixo)

      // Recalculate X to keep centered based on recording region
      const display = screen.getDisplayMatching(this.region);
      const screenBounds = display.bounds;

      let newX =
        this.region.x +
        Math.floor(this.region.width / 2) -
        Math.floor(this.expandedControlsWidth / 2);

      // Horizontal adjustment - don't allow it to go outside side edges
      const minX = screenBounds.x + 10;
      const maxX =
        screenBounds.x + screenBounds.width - this.expandedControlsWidth - 10;
      newX = Math.max(minX, Math.min(newX, maxX));

      this.controlsWindow.setBounds({
        x: Math.round(newX),
        y: Math.round(newY),
        width: this.expandedControlsWidth,
        height: this.expandedControlsHeight,
      });

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

  setupBorderMouseEvents(adjustedRegion) {
    if (!this.borderWindow || this.borderWindow.isDestroyed()) return;
    
    // Store region for reference
    this.adjustedRegion = adjustedRegion;
    
    const borderWindow = this.borderWindow;
    
    // SOLUÇÃO ALTERNATIVA: Não usar callback, confiar apenas no CSS pointer-events
    // No estado ready, permitir que a janela receba eventos
    // O CSS pointer-events: auto apenas na borda permitirá arrastar
    // O CSS pointer-events: none no body permitirá que controles funcionem quando mouse não está sobre borda
    // Mas precisamos garantir que a janela de controles tenha prioridade
    
    // Usar forward: true para permitir que eventos passem através quando não capturados
    // Mas permitir que a janela capture eventos quando necessário
    borderWindow.setIgnoreMouseEvents(true, { forward: true });
    
    // Agora vamos monitorar a posição do mouse e ajustar dinamicamente
    // Quando mouse está sobre borda, permitir eventos
    // Quando mouse não está sobre borda, ignorar eventos
    this.startMouseMonitoring(adjustedRegion);
  }
  
  startMouseMonitoring(adjustedRegion) {
    if (!this.borderWindow || this.borderWindow.isDestroyed()) return;
    
    const borderWindow = this.borderWindow;
    const borderBounds = borderWindow.getBounds();
    
    // Calcular área absoluta da borda
    const borderHitArea = {
      x: borderBounds.x + adjustedRegion.x - 10,
      y: borderBounds.y + adjustedRegion.y - 10,
      width: adjustedRegion.width + 20,
      height: adjustedRegion.height + 20
    };
    
    // Monitorar posição do mouse periodicamente
    if (this.mouseMonitorInterval) {
      clearInterval(this.mouseMonitorInterval);
    }
    
    this.mouseMonitorInterval = setInterval(() => {
      if (!borderWindow || borderWindow.isDestroyed()) {
        clearInterval(this.mouseMonitorInterval);
        return;
      }
      
      try {
        const cursorPos = screen.getCursorScreenPoint();
        const isOverBorder = (
          cursorPos.x >= borderHitArea.x &&
          cursorPos.x <= borderHitArea.x + borderHitArea.width &&
          cursorPos.y >= borderHitArea.y &&
          cursorPos.y <= borderHitArea.y + borderHitArea.height
        );
        
        // Se mouse está sobre borda, permitir eventos (não ignorar)
        // Se mouse não está sobre borda, ignorar eventos (permitir que controles funcionem)
        borderWindow.setIgnoreMouseEvents(!isOverBorder, { forward: true });
      } catch (error) {
        console.error("[BORDER] Error monitoring mouse:", error);
      }
    }, 50); // Verificar a cada 50ms
  }
  
  stopMouseMonitoring() {
    if (this.mouseMonitorInterval) {
      clearInterval(this.mouseMonitorInterval);
      this.mouseMonitorInterval = null;
    }
  }

  setRecordingState(state) {
    if (this.borderWindow && !this.borderWindow.isDestroyed()) {
      this.borderWindow.webContents.send("set-recording-state", state);
      // Re-setup mouse events when state changes
      if (this.adjustedRegion) {
        if (state === "ready") {
          // In ready state, start monitoring mouse to allow dragging
          this.setupBorderMouseEvents(this.adjustedRegion);
        } else {
          // When recording, stop monitoring and always ignore mouse events
          this.stopMouseMonitoring();
          this.borderWindow.setIgnoreMouseEvents(true, { forward: true });
        }
      }
    }
  }

  notifyRecordingStarted() {
    if (this.controlsWindow && !this.controlsWindow.isDestroyed()) {
      this.controlsWindow.webContents.send("recording-started");
    }
    this.setRecordingState("recording");
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
    this.stopMouseMonitoring();
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
    this.regionAbsolute = region;
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

  updateRegionDuringDrag(newRegion) {
    // newRegion is relative to borderWindow, convert to absolute
    if (this.borderWindow && !this.borderWindow.isDestroyed()) {
      const bounds = this.borderWindow.getBounds();
      const absoluteRegion = {
        x: bounds.x + newRegion.x,
        y: bounds.y + newRegion.y,
        width: newRegion.width,
        height: newRegion.height,
      };
      
      this.region = newRegion; // Keep relative for border window
      this.regionAbsolute = absoluteRegion; // Store absolute for main.js
      
      // Update border window region (it's already relative, so use as-is)
      this.borderWindow.webContents.send("set-region", newRegion);
      
      // Update the adjusted region and restart mouse monitoring with new region
      this.adjustedRegion = newRegion;
      this.stopMouseMonitoring();
      this.startMouseMonitoring(newRegion);

      // Notify main.js to update selectedRegion with absolute coordinates
      if (this.onRegionUpdateCallback) {
        this.onRegionUpdateCallback(absoluteRegion);
      }
    }
  }

  setRegionUpdateCallback(callback) {
    this.onRegionUpdateCallback = callback;
  }

  hideControlsWithFade() {
    if (this.controlsWindow && !this.controlsWindow.isDestroyed()) {
      this.controlsWindow.webContents.send("fade-out-controls");
    }
  }

  showControlsWithFade() {
    if (this.controlsWindow && !this.controlsWindow.isDestroyed()) {
      // Ensure window can receive mouse events
      this.controlsWindow.setIgnoreMouseEvents(false);
      this.controlsWindow.webContents.send("fade-in-controls");
    }
  }

  repositionControls() {
    if (this.controlsWindow && !this.controlsWindow.isDestroyed() && this.region) {
      const controlsPos = this.calculateControlsPosition(
        this.region,
        this.controlsWidth,
        this.controlsHeight,
      );
      this.positionSide = controlsPos.side;

      this.controlsWindow.setBounds({
        x: controlsPos.x,
        y: controlsPos.y,
        width: this.controlsWidth,
        height: this.controlsHeight,
      });

      // Inform renderer which side is positioned
      this.controlsWindow.webContents.send("position-side", this.positionSide);
    }
  }
}

module.exports = RecordingOverlay;
