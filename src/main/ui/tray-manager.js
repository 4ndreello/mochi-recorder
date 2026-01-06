const { Tray, Menu, nativeImage, app } = require("electron");
const path = require("path");

class TrayManager {
  constructor() {
    this.tray = null;
    this.isRecording = false;
    this.onStartRecording = null;
    this.onStopRecording = null;
    this.onQuit = null;
  }

  create(callbacks = {}) {
    this.onStartRecording = callbacks.onStartRecording || (() => {});
    this.onStopRecording = callbacks.onStopRecording || (() => {});
    this.onQuit = callbacks.onQuit || (() => app.quit());

    // Criar ícone para o tray (círculo vermelho simples)
    const icon = this.createIcon();
    this.tray = new Tray(icon);

    this.tray.setToolTip("Mochi - Clique para gravar");
    this.updateMenu();

    // Clique no ícone
    this.tray.on("click", () => {
      if (this.isRecording) {
        this.onStopRecording();
      } else {
        this.onStartRecording();
      }
    });

    return this.tray;
  }

  createIcon(recording = false) {
    // Criar ícone programaticamente (16x16 ou 22x22)
    const size = 22;
    const canvas = Buffer.alloc(size * size * 4);

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = 8;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const distance = Math.sqrt(
          Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2),
        );

        if (distance <= radius) {
          if (recording) {
            // Vermelho pulsante quando gravando
            canvas[idx] = 244; // R
            canvas[idx + 1] = 67; // G
            canvas[idx + 2] = 54; // B
            canvas[idx + 3] = 255; // A
          } else {
            // Cinza quando parado
            canvas[idx] = 100; // R
            canvas[idx + 1] = 100; // G
            canvas[idx + 2] = 100; // B
            canvas[idx + 3] = 255; // A
          }
        } else if (distance <= radius + 1) {
          // Borda suave (anti-aliasing simples)
          const alpha = Math.max(0, 1 - (distance - radius));
          if (recording) {
            canvas[idx] = 244;
            canvas[idx + 1] = 67;
            canvas[idx + 2] = 54;
          } else {
            canvas[idx] = 100;
            canvas[idx + 1] = 100;
            canvas[idx + 2] = 100;
          }
          canvas[idx + 3] = Math.floor(alpha * 255);
        } else {
          // Transparente
          canvas[idx] = 0;
          canvas[idx + 1] = 0;
          canvas[idx + 2] = 0;
          canvas[idx + 3] = 0;
        }
      }
    }

    return nativeImage.createFromBuffer(canvas, {
      width: size,
      height: size,
    });
  }

  updateMenu() {
    const menuItems = this.isRecording
      ? [
          {
            label: "⏹ Parar Gravação",
            click: () => this.onStopRecording(),
          },
          { type: "separator" },
          {
            label: "Sair",
            click: () => this.onQuit(),
          },
        ]
      : [
          {
            label: "Iniciar Gravação",
            click: () => this.onStartRecording(),
          },
          { type: "separator" },
          {
            label: "Sair",
            click: () => this.onQuit(),
          },
        ];

    const contextMenu = Menu.buildFromTemplate(menuItems);
    this.tray.setContextMenu(contextMenu);
  }

  setRecording(isRecording) {
    this.isRecording = isRecording;

    // Atualizar ícone
    const icon = this.createIcon(isRecording);
    this.tray.setImage(icon);

    // Atualizar tooltip
    this.tray.setToolTip(
      isRecording
        ? "Mochi - Gravando... (clique para parar)"
        : "Mochi - Clique para gravar",
    );

    // Atualizar menu
    this.updateMenu();
  }

  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

module.exports = TrayManager;
