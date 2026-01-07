const { BrowserWindow, screen } = require('electron');
const path = require('path');

class FloatingButton {
  constructor() {
    this.window = null;
  }

  create() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    this.window = new BrowserWindow({
      width: 60,
      height: 60,
      x: screenWidth - 80,
      y: screenHeight - 80,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableWebSQL: false,
        spellcheck: false
      }
    });

    this.window.loadFile(path.join(__dirname, '../../renderer/floating-button.html'));
    this.window.setIgnoreMouseEvents(false);

    // Remover menu
    this.window.setMenuBarVisibility(false);

    return this.window;
  }

  show() {
    if (this.window) {
      this.window.show();
    }
  }

  hide() {
    if (this.window) {
      this.window.hide();
    }
  }

  close() {
    if (this.window) {
      this.window.close();
      this.window = null;
    }
  }
}

module.exports = FloatingButton;

