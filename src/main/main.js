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

let trayManager;
let areaSelector;
let recordingOverlay;
let postRecordingDialog;
let captureManager;
let mouseTracker;
let eventRecorder;
let isRecording = false;
let isStartingRecording = false;
let recordingStartTime = 0;
let videoPath = "";
let metadataPath = "";
let selectedRegion = null;

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

  app.on("activate", () => {
    if (!trayManager) {
      createTray();
    }
  });
});

app.on("window-all-closed", (e) => {
});

ipcMain.on("stop-recording-clicked", () => {
  stopRecording();
});

ipcMain.on("close-recording-overlay", () => {
  if (recordingOverlay) {
    recordingOverlay.close();
    recordingOverlay = null;
  }
});

function showAreaSelector() {
  areaSelector = new AreaSelector();
  areaSelector.create((region) => {
    selectedRegion = region;
    startRecording(region);
  });
  areaSelector.show();
}

async function startRecording(region) {
  if (isRecording || isStartingRecording) {
    console.log("[MAIN] Já está gravando ou iniciando, ignorando");
    return;
  }

  isStartingRecording = true;
  console.log("[MAIN] Iniciando gravação...");

  try {
    const timestamp = Date.now();
    videoPath = path.join(
      app.getPath("temp"),
      `mochi_raw_${timestamp}.mp4`
    );
    metadataPath = path.join(
      app.getPath("temp"),
      `mochi_metadata_${timestamp}.json`
    );

    captureManager = new CaptureManager();
    mouseTracker = new MouseTracker();
    eventRecorder = new EventRecorder(metadataPath);

    recordingStartTime = Date.now();

    mouseTracker.start((event) => {
      const relativeTime = Date.now() - recordingStartTime;
      eventRecorder.record(event, relativeTime);
    });

    recordingOverlay = new RecordingOverlay();

    await new Promise((resolve) => {
      recordingOverlay.create(region, () => {
        resolve();
      });
      recordingOverlay.show();
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    await captureManager.startRecording(videoPath, region);

    isRecording = true;
    isStartingRecording = false;
    console.log("[MAIN] Gravação iniciada com sucesso!");

    if (trayManager) {
      trayManager.setRecording(true);
    }
  } catch (error) {
    console.error("[MAIN] Erro ao iniciar gravação:", error);
    isRecording = false;
    isStartingRecording = false;
    
    if (recordingOverlay) {
      recordingOverlay.close();
      recordingOverlay = null;
    }
  }
}

async function stopRecording() {
  console.log("[MAIN] stopRecording chamado, isRecording:", isRecording, "isStartingRecording:", isStartingRecording);
  
  if (!isRecording && !isStartingRecording) {
    console.log("[MAIN] Não está gravando, ignorando");
    return;
  }

  if (isStartingRecording) {
    console.log("[MAIN] Ainda iniciando, aguardando...");
    await new Promise(resolve => {
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
