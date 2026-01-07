const { Tray, Menu, nativeImage, app } = require("electron");
const path = require("path");
const packageJson = require("../../../package.json");

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

    // Create icon for tray (using icon.png)
    const icon = this.createIcon();
    this.tray = new Tray(icon);

    this.tray.setToolTip("Mochi - Click to record");
    this.updateMenu();

    // Click on icon
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
    // Load icon from file
    const iconPath = path.join(__dirname, "../../renderer/assets/icon.png");
    let icon = nativeImage.createFromPath(iconPath);

    // If icon file doesn't exist, fallback to programmatic icon
    if (icon.isEmpty()) {
      console.log("[TRAY] Icon file not found, using fallback");
      return this.createFallbackIcon(recording);
    }

    // Resize icon to appropriate size for system tray (typically 16x16 or 22x22)
    // Different Linux DEs may prefer different sizes, so we'll use a standard size
    const traySize = process.platform === "linux" ? 22 : 16;
    icon = icon.resize({ width: traySize, height: traySize });

    // If recording, we can optionally add a red overlay or indicator
    // For now, we'll just use the normal icon
    // You could enhance this later to show a recording indicator

    return icon;
  }

  createFallbackIcon(recording = false) {
    // Fallback: Create icon programmatically (16x16 or 22x22)
    const size = 22;
    const canvas = Buffer.alloc(size * size * 4);

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = 8;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const distance = Math.sqrt(
          Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)
        );

        if (distance <= radius) {
          if (recording) {
            // Pulsing red when recording
            canvas[idx] = 244; // R
            canvas[idx + 1] = 67; // G
            canvas[idx + 2] = 54; // B
            canvas[idx + 3] = 255; // A
          } else {
            // Gray when stopped
            canvas[idx] = 100; // R
            canvas[idx + 1] = 100; // G
            canvas[idx + 2] = 100; // B
            canvas[idx + 3] = 255; // A
          }
        } else if (distance <= radius + 1) {
          // Smooth border (simple anti-aliasing)
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
          // Transparent
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
    const versionLabel = `Version ${packageJson.version}`;

    const menuItems = this.isRecording
      ? [
          {
            label: "⏹ Stop Recording",
            click: () => this.onStopRecording(),
          },
          { type: "separator" },
          {
            label: versionLabel,
            enabled: false,
          },
          { type: "separator" },
          {
            label: "Quit",
            click: () => this.onQuit(),
          },
        ]
      : [
          {
            label: "Start Recording",
            click: () => this.onStartRecording(),
          },
          { type: "separator" },
          {
            label: versionLabel,
            enabled: false,
          },
          { type: "separator" },
          {
            label: "Quit",
            click: () => this.onQuit(),
          },
        ];

    const contextMenu = Menu.buildFromTemplate(menuItems);
    this.tray.setContextMenu(contextMenu);
  }

  setRecording(isRecording) {
    this.isRecording = isRecording;

    // Update icon
    const icon = this.createIcon(isRecording);
    this.tray.setImage(icon);

    // Update tooltip
    this.tray.setToolTip(
      isRecording
        ? "Mochi - Recording... (click to stop)"
        : "Mochi - Click to record"
    );

    // Update menu
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
