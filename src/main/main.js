const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const CaptureManager = require("./capture/capture-manager");
const MouseTracker = require("./events/mouse-tracker");
const EventRecorder = require("./events/event-recorder");
const VideoProcessor = require("./processing/video-processor");
const TrayManager = require("./ui/tray-manager");
const AreaSelector = require("./ui/area-selector");
const RecordingOverlay = require("./ui/recording-overlay");
const PostRecordingDialog = require("./ui/post-recording-dialog");
const UpdateManager = require("./ui/update-manager");

let trayManager;
let areaSelector;
let recordingOverlay;
let postRecordingDialog;
let updateManager;
let captureManager;
let mouseTracker;
let eventRecorder;
let isRecording = false;
let isStartingRecording = false;
let recordingStartTime = 0;
let videoPath = "";
let metadataPath = "";
let selectedRegion = null;
let useMicrophone = false;
let useSystemAudio = true;
let recordingSettings = {
  fps: 30,
  quality: "medium",
};

// Garantir que apenas uma instância do Mochi esteja rodando
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log(
    "[MAIN] Já existe uma instância do Mochi rodando. Fechando esta instância."
  );
  app.quit();
} else {
  // Quando uma segunda instância tentar abrir, focar na janela existente
  app.on("second-instance", () => {
    console.log(
      "[MAIN] Segunda instância detectada. Focando na instância existente."
    );

    // Tentar focar em qualquer janela que possa estar aberta
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((window) => {
      if (window.isMinimized()) {
        window.restore();
      }
      window.focus();
    });
  });
}

function createTray() {
  trayManager = new TrayManager();
  trayManager.create({
    onStartRecording: () => showAreaSelector(),
    onStopRecording: () => stopRecording(),
    onQuit: () => app.quit(),
  });

  postRecordingDialog = new PostRecordingDialog();
}

app.whenReady().then(() => {
  // Set application icon for launcher/desktop
  const iconPath = path.join(__dirname, "../renderer/assets/icon.png");
  const { nativeImage } = require("electron");
  const icon = nativeImage.createFromPath(iconPath);
  if (!icon.isEmpty()) {
    app.dock?.setIcon(icon); // macOS (if available)
    // For Linux, the icon is set via electron-builder during build
    // But we can also set it here for development
    if (process.platform === "linux") {
      // On Linux, the icon is primarily set via the .desktop file
      // which electron-builder generates, but we ensure it's available
      app.setAppUserModelId("com.mochi.app");
    }
  }

  createTray();

  // Initialize UpdateManager and start periodic check
  updateManager = new UpdateManager();
  updateManager.startPeriodicCheck(30); // Check every 30 minutes

  app.on("activate", () => {
    if (!trayManager) {
      createTray();
    }
  });
});

app.on("window-all-closed", (e) => {});

ipcMain.on("stop-recording-clicked", () => {
  stopRecording();
});

ipcMain.on("start-recording-clicked", () => {
  startCapture();
});

ipcMain.on("close-recording-overlay", () => {
  if (recordingOverlay) {
    recordingOverlay.close();
    recordingOverlay = null;
  }
});

ipcMain.on("cancel-recording-overlay", () => {
  if (recordingOverlay) {
    recordingOverlay.close();
    recordingOverlay = null;
  }
  selectedRegion = null;
});

function showAreaSelector() {
  areaSelector = new AreaSelector();
  areaSelector.create((region) => {
    selectedRegion = region;
    showRecordingOverlay(region);
  });
  areaSelector.show();
}

async function showRecordingOverlay(region) {
  recordingOverlay = new RecordingOverlay();

  await new Promise((resolve) => {
    recordingOverlay.create(region, () => {
      resolve();
    });
    recordingOverlay.show();
  });
}

async function startCapture() {
  if (!selectedRegion) {
    console.log("[MAIN] No region selected");
    return;
  }

  if (isRecording || isStartingRecording) {
    console.log("[MAIN] Already recording or starting, ignoring");
    return;
  }

  isStartingRecording = true;
  console.log("[MAIN] Starting capture...");

  try {
    const timestamp = Date.now();
    videoPath = path.join(app.getPath("temp"), `mochi_raw_${timestamp}.mp4`);
    metadataPath = path.join(
      app.getPath("temp"),
      `mochi_metadata_${timestamp}.json`
    );

    captureManager = new CaptureManager();
    captureManager.setUseMicrophone(useMicrophone);
    captureManager.setUseSystemAudio(useSystemAudio);
    captureManager.setFps(recordingSettings.fps);
    captureManager.setQuality(recordingSettings.quality);
    mouseTracker = new MouseTracker();
    eventRecorder = new EventRecorder(metadataPath);

    recordingStartTime = Date.now();

    mouseTracker.start((event) => {
      const relativeTime = Date.now() - recordingStartTime;
      eventRecorder.record(event, relativeTime);
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    await captureManager.startRecording(videoPath, selectedRegion);

    isRecording = true;
    isStartingRecording = false;
    console.log("[MAIN] Capture started successfully!");

    if (recordingOverlay) {
      recordingOverlay.notifyRecordingStarted();
    }

    if (trayManager) {
      trayManager.setRecording(true);
    }
  } catch (error) {
    console.error("[MAIN] Error starting capture:", error);
    isRecording = false;
    isStartingRecording = false;

    if (recordingOverlay) {
      recordingOverlay.notifyError(error.message);
    }
  }
}

async function stopRecording() {
  console.log(
    "[MAIN] stopRecording called, isRecording:",
    isRecording,
    "isStartingRecording:",
    isStartingRecording
  );

  if (!isRecording && !isStartingRecording) {
    console.log("[MAIN] Not recording, ignoring");
    return;
  }

  if (isStartingRecording) {
    console.log("[MAIN] Still starting, waiting...");
    await new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!isStartingRecording) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  if (!isRecording) {
    console.log("[MAIN] Recording did not start correctly");
    if (recordingOverlay) {
      recordingOverlay.notifyError("Recording did not start correctly");
    }
    return;
  }

  try {
    console.log("[MAIN] Stopping capture...");
    await captureManager.stopRecording();
    console.log("[MAIN] Capture stopped");

    console.log("[MAIN] Stopping mouse tracker...");
    mouseTracker.stop();
    console.log("[MAIN] Mouse tracker stopped");

    console.log("[MAIN] Finishing event recorder...");
    await eventRecorder.finish();
    console.log("[MAIN] Event recorder finished");

    isRecording = false;

    if (trayManager) {
      trayManager.setRecording(false);
    }

    const fs = require("fs").promises;
    console.log("[MAIN] Checking video file:", videoPath);

    try {
      const stats = await fs.stat(videoPath);
      console.log("[MAIN] File exists, size:", stats.size, "bytes");

      if (stats.size === 0) {
        throw new Error("Video file is empty");
      }
    } catch (error) {
      console.error("[MAIN] Error checking video:", error.message);
      throw new Error("Video was not recorded correctly: " + error.message);
    }

    const outputPath = path.join(
      "/tmp",
      `mochi_${Date.now()}.mp4`
    );
    console.log("[MAIN] Processing video to:", outputPath);

    const processor = new VideoProcessor(videoPath, metadataPath, outputPath);

    await processor.process();

    console.log("[MAIN] Video processed successfully!");

    if (recordingOverlay) {
      console.log("[MAIN] Notifying overlay...");
      recordingOverlay.notifyRecordingFinished(outputPath);
    }
  } catch (error) {
    console.error("[MAIN] Error stopping recording:", error);
    console.error("[MAIN] Stack:", error.stack);

    isRecording = false;

    if (recordingOverlay) {
      recordingOverlay.notifyError(error.message);
    }
  }
}

ipcMain.handle("get-recording-status", () => {
  return { isRecording };
});

ipcMain.handle("get-microphone-status", () => {
  return { useMicrophone };
});

ipcMain.handle("toggle-microphone", () => {
  useMicrophone = !useMicrophone;
  return { useMicrophone };
});

ipcMain.handle("get-system-audio-status", () => {
  return { useSystemAudio };
});

ipcMain.handle("toggle-system-audio", () => {
  useSystemAudio = !useSystemAudio;
  return { useSystemAudio };
});

ipcMain.handle("get-settings", () => {
  return recordingSettings;
});

ipcMain.handle("set-settings", (event, settings) => {
  recordingSettings = { ...recordingSettings, ...settings };
  console.log("[MAIN] Settings updated:", recordingSettings);
  return recordingSettings;
});
