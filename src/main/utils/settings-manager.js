const { app } = require("electron");
const path = require("path");
const fs = require("fs");

class SettingsManager {
  constructor() {
    this.settingsPath = path.join(app.getPath("userData"), "settings.json");
    this.defaultSettings = {
      recordingSettings: {
        fps: 30,
        quality: "medium",
        showCursor: true,
      },
      useMicrophone: false,
      useSystemAudio: true,
    };
  }

  load() {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, "utf-8");
        const loaded = JSON.parse(data);
        console.log("[SETTINGS] Configuracoes carregadas de:", this.settingsPath);
        // Merge with defaults to ensure all keys exist
        return {
          ...this.defaultSettings,
          ...loaded,
          recordingSettings: {
            ...this.defaultSettings.recordingSettings,
            ...(loaded.recordingSettings || {}),
          },
        };
      }
    } catch (error) {
      console.error("[SETTINGS] Erro ao carregar configuracoes:", error);
    }
    console.log("[SETTINGS] Usando configuracoes padrao");
    return this.defaultSettings;
  }

  save(settings) {
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2));
      console.log("[SETTINGS] Configuracoes salvas em:", this.settingsPath);
    } catch (error) {
      console.error("[SETTINGS] Erro ao salvar configuracoes:", error);
    }
  }

  getPath() {
    return this.settingsPath;
  }
}

module.exports = SettingsManager;
