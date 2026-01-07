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
  createTray();

  // Inicializar UpdateManager e começar verificação periódica
  updateManager = new UpdateManager();
  updateManager.startPeriodicCheck(30); // Verificar a cada 30 minutos

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
    console.log("[MAIN] Nenhuma região selecionada");
    return;
  }

  if (isRecording || isStartingRecording) {
    console.log("[MAIN] Já está gravando ou iniciando, ignorando");
    return;
  }

  isStartingRecording = true;
  console.log("[MAIN] Iniciando captura...");

  try {
    const timestamp = Date.now();
    videoPath = path.join(app.getPath("temp"), `mochi_raw_${timestamp}.mp4`);
    metadataPath = path.join(
      app.getPath("temp"),
      `mochi_metadata_${timestamp}.json`
    );

    captureManager = new CaptureManager();
    captureManager.setUseMicrophone(useMicrophone);
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
    console.log("[MAIN] Captura iniciada com sucesso!");

    if (recordingOverlay) {
      recordingOverlay.notifyRecordingStarted();
    }

    if (trayManager) {
      trayManager.setRecording(true);
    }
  } catch (error) {
    console.error("[MAIN] Erro ao iniciar captura:", error);
    isRecording = false;
    isStartingRecording = false;

    if (recordingOverlay) {
      recordingOverlay.notifyError(error.message);
    }
  }
}

async function stopRecording() {
  console.log(
    "[MAIN] stopRecording chamado, isRecording:",
    isRecording,
    "isStartingRecording:",
    isStartingRecording
  );

  if (!isRecording && !isStartingRecording) {
    console.log("[MAIN] Não está gravando, ignorando");
    return;
  }

  if (isStartingRecording) {
    console.log("[MAIN] Ainda iniciando, aguardando...");
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
    console.log("[MAIN] Gravação não iniciou corretamente");
    if (recordingOverlay) {
      recordingOverlay.notifyError("Gravação não iniciou corretamente");
    }
    return;
  }

  try {
    console.log("[MAIN] Parando captura...");
    await captureManager.stopRecording();
    console.log("[MAIN] Captura parada");

    console.log("[MAIN] Parando mouse tracker...");
    mouseTracker.stop();
    console.log("[MAIN] Mouse tracker parado");

    console.log("[MAIN] Finalizando event recorder...");
    await eventRecorder.finish();
    console.log("[MAIN] Event recorder finalizado");

    isRecording = false;

    if (trayManager) {
      trayManager.setRecording(false);
    }

    const fs = require("fs").promises;
    console.log("[MAIN] Verificando arquivo de vídeo:", videoPath);

    try {
      const stats = await fs.stat(videoPath);
      console.log("[MAIN] Arquivo existe, tamanho:", stats.size, "bytes");

      if (stats.size === 0) {
        throw new Error("Arquivo de vídeo está vazio");
      }
    } catch (error) {
      console.error("[MAIN] Erro ao verificar vídeo:", error.message);
      throw new Error("Vídeo não foi gravado corretamente: " + error.message);
    }

    const outputPath = path.join(
      app.getPath("downloads"),
      `mochi_${Date.now()}.mp4`
    );
    console.log("[MAIN] Processando vídeo para:", outputPath);

    const processor = new VideoProcessor(videoPath, metadataPath, outputPath);

    await processor.process();

    console.log("[MAIN] Vídeo processado com sucesso!");

    if (recordingOverlay) {
      console.log("[MAIN] Notificando overlay...");
      recordingOverlay.notifyRecordingFinished(outputPath);
    }
  } catch (error) {
    console.error("[MAIN] Erro ao parar gravação:", error);
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
