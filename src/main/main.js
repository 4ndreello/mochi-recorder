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
const FFmpegDownloadWindow = require("./ui/ffmpeg-download-window");
const SettingsManager = require("./utils/settings-manager");
const FFmpegDownloader = require("./utils/ffmpeg-downloader");
const BinaryResolver = require("./utils/binary-resolver");

let trayManager;
let areaSelector;
let recordingOverlay;
let postRecordingDialog;
let updateManager;
let ffmpegDownloadWindow;
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

app.whenReady().then(async () => {
  console.log("[MAIN] ===== App Initialization =====");
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

  // Always create tray first
  createTray();

  // Check FFmpeg installation
  console.log("[MAIN] Checking FFmpeg installation...");
  let ffmpegReady = false;

  try {
    const ffmpegPath = await BinaryResolver.getFFmpegPath();
    console.log(`[MAIN] ✓ FFmpeg found: ${ffmpegPath}`);

    const ffprobePath = await BinaryResolver.getFFprobePath();
    console.log(`[MAIN] ✓ FFprobe found: ${ffprobePath}`);

    ffmpegReady = true;
  } catch (err) {
    console.error(`[MAIN] ✗ FFmpeg check failed: ${err.message}`);
    console.log("[MAIN] FFmpeg not found. Showing download window to user...");

    // Create and show FFmpeg download window
    ffmpegDownloadWindow = new FFmpegDownloadWindow();
    ffmpegDownloadWindow.create();
    ffmpegDownloadWindow.show();
  }

  // Only initialize UpdateManager if FFmpeg is ready
  // This prevents update check during first-time setup
  if (ffmpegReady) {
    updateManager = new UpdateManager();
    updateManager.startPeriodicCheck(30); // Check every 30 minutes
  }

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
  // Immediately disable resize/drag handles while FFmpeg starts
  if (recordingOverlay) {
    recordingOverlay.setRecordingState("starting");
  }
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

ipcMain.on("region-drag-start", () => {
  if (!recordingOverlay || isRecording) return;

  if (recordingOverlay.controlsWindow && !recordingOverlay.controlsWindow.isDestroyed()) {
    recordingOverlay.controlsWindow.hide();
  }
});

ipcMain.on("region-changed", (event, newRegion) => {
  if (!recordingOverlay || isRecording) return;

  selectedRegion = newRegion;
  recordingOverlay.updateRegion(newRegion);

  const newControlsPos = recordingOverlay.calculateControlsPosition(
    newRegion,
    recordingOverlay.controlsWidth,
    recordingOverlay.controlsHeight
  );

  if (recordingOverlay.controlsWindow && !recordingOverlay.controlsWindow.isDestroyed()) {
    recordingOverlay.controlsWindow.setPosition(newControlsPos.x, newControlsPos.y);
    recordingOverlay.positionSide = newControlsPos.side;
    recordingOverlay.controlsWindow.webContents.send("position-side", newControlsPos.side);
    recordingOverlay.controlsWindow.show();
  }
});

ipcMain.handle("get-border-window-bounds", () => {
  if (recordingOverlay && recordingOverlay.borderWindow && !recordingOverlay.borderWindow.isDestroyed()) {
    return recordingOverlay.borderWindow.getBounds();
  }
  return null;
});

function showAreaSelector() {
  // Ignore if FFmpeg is being downloaded
  if (ffmpegDownloadWindow && ffmpegDownloadWindow.isVisible()) {
    console.log("[MAIN] FFmpeg download in progress, ignoring click");
    return;
  }

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

// FFmpeg Downloader Handlers
ipcMain.handle("ffmpeg-check-installation", async () => {
  try {
    console.log("[FFmpeg] Checking installation from renderer...");

    const isDownloaded = BinaryResolver.isDownloaded();
    if (isDownloaded) {
      console.log("[FFmpeg] Found downloaded FFmpeg");
      return { installed: true, source: "downloaded" };
    }

    const systemPath = BinaryResolver.getSystemPath("ffmpeg");
    if (systemPath && BinaryResolver.testBinary(systemPath)) {
      console.log("[FFmpeg] Found system FFmpeg");
      return { installed: true, source: "system" };
    }

    console.log("[FFmpeg] No FFmpeg found, download needed");
    return { installed: false, source: null };
  } catch (err) {
    console.error("[FFmpeg] Check installation error:", err);
    return { installed: false, source: null };
  }
});

ipcMain.handle("ffmpeg-start-download", async (event) => {
  try {
    const mainWindow = BrowserWindow.getAllWindows()[0];

    const onProgress = (progress) => {
      mainWindow?.webContents.send("ffmpeg-download-progress", {
        downloaded: progress.downloaded,
        total: progress.total,
        percentage: progress.percentage,
        speed: progress.speed
      });
    };

    mainWindow?.webContents.send("ffmpeg-download-status", "downloading");

    await FFmpegDownloader.downloadFFmpeg(onProgress);

    mainWindow?.webContents.send("ffmpeg-download-status", "extracting");
    const binPath = FFmpegDownloader.getBinPath();
    await FFmpegDownloader.extractTarball(
      path.join(require("os").tmpdir(), "mochi-ffmpeg-download.tar.xz"),
      binPath
    );

    mainWindow?.webContents.send("ffmpeg-download-status", "verifying");
    const ffmpegPath = path.join(binPath, "ffmpeg");
    const ffprobePath = path.join(binPath, "ffprobe");

    // Make executable
    const fs = require("fs");
    fs.chmodSync(ffmpegPath, 0o755);
    fs.chmodSync(ffprobePath, 0o755);

    // Verify
    await FFmpegDownloader.verifyChecksum(ffmpegPath);
    await FFmpegDownloader.verifyChecksum(ffprobePath);

    // Save version info
    FFmpegDownloader.saveVersion();

    mainWindow?.webContents.send("ffmpeg-download-status", "completed");
    console.log("[FFmpeg] Download completed successfully");

    // Clear cache so it detects the new binary
    BinaryResolver.cachedPaths = {};

    // Signal completion to BinaryResolver
    mainWindow?.webContents.send("ffmpeg-download-complete");

    return { success: true };
  } catch (err) {
    console.error("[FFmpeg] Download error:", err);
    const mainWindow = BrowserWindow.getAllWindows()[0];
    mainWindow?.webContents.send("ffmpeg-download-status", "error");
    mainWindow?.webContents.send("ffmpeg-download-error", err.message);
    return { success: false, error: err.message };
  }
});

// Handle FFmpeg download from the download window
ipcMain.handle("ffmpeg-start-download-from-window", async (event) => {
  try {
    const onProgress = (progress) => {
      ffmpegDownloadWindow?.window?.webContents.send("ffmpeg-download-progress", {
        downloaded: progress.downloaded,
        total: progress.total,
        percentage: progress.percentage,
        speed: progress.speed
      });
    };

    ffmpegDownloadWindow?.window?.webContents.send("ffmpeg-download-status", "downloading");

    await FFmpegDownloader.downloadFFmpeg(onProgress);

    ffmpegDownloadWindow?.window?.webContents.send("ffmpeg-download-status", "extracting");
    const binPath = FFmpegDownloader.getBinPath();
    await FFmpegDownloader.extractTarball(
      path.join(require("os").tmpdir(), "mochi-ffmpeg-download.tar.xz"),
      binPath
    );

    ffmpegDownloadWindow?.window?.webContents.send("ffmpeg-download-status", "verifying");
    const ffmpegPath = path.join(binPath, "ffmpeg");
    const ffprobePath = path.join(binPath, "ffprobe");

    // Make executable
    const fs = require("fs");
    fs.chmodSync(ffmpegPath, 0o755);
    fs.chmodSync(ffprobePath, 0o755);

    // Verify
    await FFmpegDownloader.verifyChecksum(ffmpegPath);
    await FFmpegDownloader.verifyChecksum(ffprobePath);

    // Save version info
    FFmpegDownloader.saveVersion();

    ffmpegDownloadWindow?.window?.webContents.send("ffmpeg-download-status", "completed");
    console.log("[FFmpeg] Download from window completed successfully");

    // Clear cache so it detects the new binary
    BinaryResolver.cachedPaths = {};

    // Close the download window
    setTimeout(() => {
      if (ffmpegDownloadWindow) {
        ffmpegDownloadWindow.close();
        ffmpegDownloadWindow = null;
      }
    }, 1500);

    return { success: true };
  } catch (err) {
    console.error("[FFmpeg] Download error from window:", err);
    ffmpegDownloadWindow?.window?.webContents.send("ffmpeg-download-status", "error");
    ffmpegDownloadWindow?.window?.webContents.send("ffmpeg-download-error", err.message);
    return { success: false, error: err.message };
  }
});

// Handle user clicking "Use System FFmpeg"
ipcMain.on("ffmpeg-use-system", () => {
  console.log("[MAIN] User chose to use system FFmpeg from download window");
  if (ffmpegDownloadWindow) {
    ffmpegDownloadWindow.close();
    ffmpegDownloadWindow = null;
  }
});

// Handle FFmpeg download window close (after successful download)
ipcMain.on("ffmpeg-download-window-close", () => {
  console.log("[MAIN] FFmpeg download completed, closing window");
  if (ffmpegDownloadWindow) {
    ffmpegDownloadWindow.close();
    ffmpegDownloadWindow = null;
  }

  // Now start UpdateManager since FFmpeg is ready
  if (!updateManager) {
    updateManager = new UpdateManager();
    updateManager.startPeriodicCheck(30);
  }
});

ipcMain.handle("ffmpeg-cancel-download", () => {
  // TODO: Implement cancellation if needed
  console.log("[FFmpeg] Download cancellation requested");
  return { success: true };
});

// Handle exit when FFmpeg is missing
ipcMain.on("app-exit-ffmpeg-missing", () => {
  console.log("[MAIN] User chose to exit due to missing FFmpeg");
  console.log(
    "[MAIN] Please install FFmpeg: sudo apt install ffmpeg (Ubuntu/Debian)"
  );
  app.quit();
});

// Get FFmpeg setup information
ipcMain.handle("get-ffmpeg-info", () => {
  return {
    hasFFmpeg: BinaryResolver.getSystemPath("ffmpeg") !== null,
    ffmpegPath: BinaryResolver.getSystemPath("ffmpeg"),
    downloadUrl: BinaryResolver.getDownloadUrl(),
    configPath: BinaryResolver.getBinPath()
  };
});
