const { autoUpdater } = require("electron-updater");
const { BrowserWindow, ipcMain } = require("electron");
const path = require("path");

class UpdateManager {
  constructor() {
    this.updateWindow = null;
    this.isDevMode = process.argv.includes("--dev");
    this.checkInterval = null;
    this.updateInfo = null;

    // Configurar autoUpdater
    autoUpdater.autoDownload = false; // Não baixar automaticamente, esperar confirmação do usuário
    autoUpdater.autoInstallOnAppQuit = false; // Não instalar automaticamente

    this.setupEventHandlers();
    this.setupIpcHandlers();
  }

  setupEventHandlers() {
    autoUpdater.on("checking-for-update", () => {
      console.log("[UPDATE] Verificando atualizações...");
    });

    autoUpdater.on("update-available", (info) => {
      console.log("[UPDATE] Atualização disponível:", info.version);
      this.updateInfo = info;
      this.showUpdateDialog(info);
    });

    autoUpdater.on("update-not-available", (info) => {
      console.log("[UPDATE] Aplicativo está atualizado:", info.version);
    });

    autoUpdater.on("error", (err) => {
      console.error("[UPDATE] Erro ao verificar atualizações:", err);
      // Não mostrar erro ao usuário, apenas logar
    });

    autoUpdater.on("download-progress", (progressObj) => {
      const percent = Math.round(progressObj.percent);
      console.log("[UPDATE] Progresso do download:", percent + "%");

      if (this.updateWindow && !this.updateWindow.isDestroyed()) {
        this.updateWindow.webContents.send("download-progress", percent);
      }
    });

    autoUpdater.on("update-downloaded", (info) => {
      console.log("[UPDATE] Download concluído:", info.version);

      if (this.updateWindow && !this.updateWindow.isDestroyed()) {
        this.updateWindow.webContents.send("download-complete");
      }
    });
  }

  setupIpcHandlers() {
    ipcMain.handle("update-install", async () => {
      try {
        console.log("[UPDATE] Instalando atualização...");
        // Para .deb, o electron-updater tentará instalar automaticamente
        // Se precisar de permissões sudo, o sistema solicitará ao usuário
        // O segundo parâmetro (true) força a instalação mesmo se o app não estiver empacotado
        autoUpdater.quitAndInstall(false, true);
      } catch (error) {
        console.error("[UPDATE] Erro ao instalar:", error);
        // Se falhar por falta de permissões, informar ao usuário
        if (error.message && error.message.includes("permission")) {
          throw new Error(
            "Permissões de administrador necessárias para instalar a atualização. " +
              "Por favor, execute o aplicativo com permissões adequadas."
          );
        }
        throw error;
      }
    });

    ipcMain.handle("update-download", async () => {
      try {
        console.log("[UPDATE] Iniciando download da atualização...");
        await autoUpdater.downloadUpdate();
      } catch (error) {
        console.error("[UPDATE] Erro ao baixar:", error);
        throw error;
      }
    });

    ipcMain.handle("update-skip", () => {
      console.log("[UPDATE] Usuário optou por pular atualização");
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
        releaseNotes: info.releaseNotes || "Melhorias e correções de bugs.",
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
        "[UPDATE] Modo dev ativo, pulando verificação de atualizações"
      );
      return;
    }

    try {
      console.log("[UPDATE] Verificando atualizações...");
      await autoUpdater.checkForUpdates();
    } catch (error) {
      console.error("[UPDATE] Erro ao verificar atualizações:", error);
    }
  }

  startPeriodicCheck(intervalMinutes = 30) {
    if (this.isDevMode) {
      return;
    }

    // Verificar na inicialização
    this.checkForUpdates();

    // Verificar periodicamente
    const intervalMs = intervalMinutes * 60 * 1000;
    this.checkInterval = setInterval(() => {
      this.checkForUpdates();
    }, intervalMs);

    console.log(
      `[UPDATE] Verificação periódica configurada para a cada ${intervalMinutes} minutos`
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
