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
const SettingsManager = require("./utils/settings-manager");

let trayManager;
let areaSelector;
let recordingOverlay;
let postRecordingDialog;
let updateManager;
let captureManager;
let mouseTracker;
let eventRecorder;
let settingsManager;
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
  showCursor: true,
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
  const iconPath = path.join(__dirname, "../renderer/assets/icon.png");
  const { nativeImage } = require("electron");
  const icon = nativeImage.createFromPath(iconPath);
  if (!icon.isEmpty()) {
    app.dock?.setIcon(icon);
    if (process.platform === "linux") {
      app.setAppUserModelId("com.mochi.app");
    }
  }

  settingsManager = new SettingsManager();
  const savedSettings = settingsManager.load();
  recordingSettings = savedSettings.recordingSettings;
  useMicrophone = savedSettings.useMicrophone;
  useSystemAudio = savedSettings.useSystemAudio;

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

ipcMain.on("rerecord-clicked", () => {
  console.log("[MAIN] Re-record requested");
  if (recordingOverlay) {
    recordingOverlay.close();
    recordingOverlay = null;
  }
  selectedRegion = null;
  showAreaSelector();
});

function showAreaSelector() {
  if (
    areaSelector ||
    recordingOverlay ||
    isRecording ||
    isStartingRecording
  ) {
    console.log("[MAIN] Area selector or recording already active, ignoring");
    return;
  }

  areaSelector = new AreaSelector();
  areaSelector.create(
    (region) => {
      selectedRegion = region;
      areaSelector = null;
      showRecordingOverlay(region);
    },
    () => {
      console.log("[MAIN] Area selection cancelled");
      areaSelector = null;
    }
  );
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
    captureManager.setDrawMouse(!recordingSettings.showCursor);

    const hrtimeStart = process.hrtime.bigint();
    recordingStartTime = Date.now();

    // Only track mouse if cursor overlay is enabled
    if (recordingSettings.showCursor) {
      mouseTracker = new MouseTracker();
      eventRecorder = new EventRecorder(metadataPath);
      
      eventRecorder.setSession({
        width: selectedRegion.width,
        height: selectedRegion.height,
        fps: recordingSettings.fps,
        region: selectedRegion
      });

      mouseTracker.start((event) => {
        eventRecorder.record(event, event.t);
      });
    } else {
      mouseTracker = null;
      eventRecorder = null;
    }

    const hrtimeBeforeFFmpeg = process.hrtime.bigint();
    const videoStartOffset = Number(hrtimeBeforeFFmpeg - hrtimeStart) / 1_000_000;

    await captureManager.startRecording(videoPath, selectedRegion);

    if (eventRecorder) {
      eventRecorder.setVideoStartOffset(videoStartOffset);
    }

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

    if (mouseTracker) {
      console.log("[MAIN] Stopping mouse tracker...");
      mouseTracker.stop();
      console.log("[MAIN] Mouse tracker stopped");
    }

    if (eventRecorder) {
      console.log("[MAIN] Finishing event recorder...");
      await eventRecorder.finish();
      console.log("[MAIN] Event recorder finished");
    }

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
    processor.enableCursor = recordingSettings.showCursor;

    processor.setProgressCallback(({ stage, percent }) => {
      if (recordingOverlay) {
        recordingOverlay.notifyProcessingProgress(stage, percent);
      }
    });

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
  settingsManager.save({ recordingSettings, useMicrophone, useSystemAudio });
  return { useMicrophone };
});

ipcMain.handle("get-system-audio-status", () => {
  return { useSystemAudio };
});

ipcMain.handle("toggle-system-audio", () => {
  useSystemAudio = !useSystemAudio;
  settingsManager.save({ recordingSettings, useMicrophone, useSystemAudio });
  return { useSystemAudio };
});

ipcMain.handle("get-settings", () => {
  return recordingSettings;
});

ipcMain.handle("set-settings", (event, settings) => {
  recordingSettings = { ...recordingSettings, ...settings };
  settingsManager.save({ recordingSettings, useMicrophone, useSystemAudio });
  console.log("[MAIN] Settings updated:", recordingSettings);
  return recordingSettings;
});
