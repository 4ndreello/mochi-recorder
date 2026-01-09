const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

class FFmpegDownloadWindow {
  constructor() {
    this.window = null;
    this.iconPath = path.join(__dirname, '../../renderer/assets/icon.png');
  }

  create() {
    if (this.window) {
      this.window.focus();
      return this.window;
    }

    this.window = new BrowserWindow({
      width: 400,
      height: 280,
      resizable: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: false,
      backgroundColor: "#00000000",
      icon: this.iconPath,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableWebSQL: false,
        spellcheck: false,
      },
    });

    this.window.loadFile(
      path.join(__dirname, "../../renderer/ffmpeg-download.html")
    );

    this.window.on("closed", () => {
      this.window = null;
    });

    this.window.center();

    return this.window;
  }

  show() {
    if (this.window) {
      this.window.show();
    }
  }

  close() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
      this.window = null;
    }
  }

  isVisible() {
    return this.window && !this.window.isDestroyed() && this.window.isVisible();
  }
}

module.exports = FFmpegDownloadWindow;
