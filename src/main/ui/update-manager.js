const { autoUpdater } = require("electron-updater");
const { BrowserWindow, ipcMain } = require("electron");
const path = require("path");

class UpdateManager {
  constructor() {
    this.updateWindow = null;
    this.isDevMode = process.argv.includes("--dev");
    this.checkInterval = null;
    this.updateInfo = null;

    // Configure autoUpdater
    autoUpdater.autoDownload = false; // Don't download automatically, wait for user confirmation
    autoUpdater.autoInstallOnAppQuit = false; // Don't install automatically

    this.setupEventHandlers();
    this.setupIpcHandlers();
  }

  setupEventHandlers() {
    autoUpdater.on("checking-for-update", () => {
      console.log("[UPDATE] Checking for updates...");
    });

    autoUpdater.on("update-available", (info) => {
      console.log("[UPDATE] Update available:", info.version);
      this.updateInfo = info;
      this.showUpdateDialog(info);
    });

    autoUpdater.on("update-not-available", (info) => {
      console.log("[UPDATE] Application is up to date:", info.version);
    });

    autoUpdater.on("error", (err) => {
      console.error("[UPDATE] Error checking for updates:", err);
      // Don't show error to user, just log
    });

    autoUpdater.on("download-progress", (progressObj) => {
      const percent = Math.round(progressObj.percent);
      console.log("[UPDATE] Download progress:", percent + "%");

      if (this.updateWindow && !this.updateWindow.isDestroyed()) {
        this.updateWindow.webContents.send("download-progress", percent);
      }
    });

    autoUpdater.on("update-downloaded", (info) => {
      console.log("[UPDATE] Download completed:", info.version);

      if (this.updateWindow && !this.updateWindow.isDestroyed()) {
        this.updateWindow.webContents.send("download-complete");
      }
    });
  }

  setupIpcHandlers() {
    ipcMain.handle("update-install", async () => {
      try {
        console.log("[UPDATE] Installing update...");
        // For .deb, electron-updater will try to install automatically
        // If sudo permissions are needed, the system will prompt the user
        // The second parameter (true) forces installation even if app is not packaged
        autoUpdater.quitAndInstall(false, true);
      } catch (error) {
        console.error("[UPDATE] Error installing:", error);
        // If it fails due to lack of permissions, inform the user
        if (error.message && error.message.includes("permission")) {
          throw new Error(
            "Administrator permissions required to install the update. " +
              "Please run the application with appropriate permissions."
          );
        }
        throw error;
      }
    });

    ipcMain.handle("update-download", async () => {
      try {
        console.log("[UPDATE] Starting update download...");
        await autoUpdater.downloadUpdate();
      } catch (error) {
        console.error("[UPDATE] Error downloading:", error);
        throw error;
      }
    });

    ipcMain.handle("update-skip", () => {
      console.log("[UPDATE] User chose to skip update");
      this.closeUpdateDialog();
    });

    ipcMain.handle("get-update-info", () => {
      return this.updateInfo;
    });
  }

  showUpdateDialog(info) {
    if (this.updateWindow) {
      this.updateWindow.focus();
      return;
    }

    this.updateWindow = new BrowserWindow({
      width: 400,
      height: 280,
      resizable: false,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: false,
      backgroundColor: "#1a1a1a",
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    this.updateWindow.loadFile(
      path.join(__dirname, "../../renderer/update-dialog.html")
    );

    this.updateWindow.webContents.on("did-finish-load", () => {
      this.updateWindow.webContents.send("update-info", {
        currentVersion: require("../../../package.json").version,
        newVersion: info.version,
        releaseNotes: info.releaseNotes || "Improvements and bug fixes.",
      });
    });

    this.updateWindow.on("closed", () => {
      this.updateWindow = null;
    });

    this.updateWindow.center();
  }

  closeUpdateDialog() {
    if (this.updateWindow && !this.updateWindow.isDestroyed()) {
      this.updateWindow.close();
      this.updateWindow = null;
    }
  }

  async checkForUpdates() {
    if (this.isDevMode) {
      console.log(
        "[UPDATE] Dev mode active, skipping update check"
      );
      return;
    }

    try {
      console.log("[UPDATE] Checking for updates...");
      await autoUpdater.checkForUpdates();
    } catch (error) {
      console.error("[UPDATE] Error checking for updates:", error);
    }
  }

  startPeriodicCheck(intervalMinutes = 30) {
    if (this.isDevMode) {
      return;
    }

    // Check on initialization
    this.checkForUpdates();

    // Check periodically
    const intervalMs = intervalMinutes * 60 * 1000;
    this.checkInterval = setInterval(() => {
      this.checkForUpdates();
    }, intervalMs);

    console.log(
      `[UPDATE] Periodic check configured for every ${intervalMinutes} minutes`
    );
  }

  stopPeriodicCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

module.exports = UpdateManager;
