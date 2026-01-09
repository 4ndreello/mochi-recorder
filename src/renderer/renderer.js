const { ipcRenderer } = require('electron');
const FFmpegDownloadModal = require('./components/FFmpegDownloadModal');

let downloadModal = null;

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const info = document.getElementById('info');
const processing = document.getElementById('processing');
const success = document.getElementById('success');
const outputPath = document.getElementById('outputPath');
const micToggle = document.getElementById('micToggle');
const micLabel = document.getElementById('micLabel');

let isRecording = false;
let isMicEnabled = false;

async function updateStatus() {
  const status = await ipcRenderer.invoke('get-recording-status');
  isRecording = status.isRecording;
  
  if (isRecording) {
    statusDot.className = 'status-dot recording';
    statusText.textContent = 'Recording...';
    startBtn.disabled = true;
    stopBtn.disabled = false;
    info.style.display = 'block';
    processing.style.display = 'none';
    success.style.display = 'none';
  } else {
    statusDot.className = 'status-dot';
    statusText.textContent = 'Ready';
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

startBtn.addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('start-recording');
  
  if (result.success) {
    await updateStatus();
  } else {
    alert(`Error starting recording: ${result.error}`);
  }
});

stopBtn.addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('stop-recording');
  
  if (result.success) {
    isRecording = false;
    statusDot.className = 'status-dot processing';
    statusText.textContent = 'Processing...';
    startBtn.disabled = true;
    stopBtn.disabled = true;
    info.style.display = 'none';
    processing.style.display = 'block';
    success.style.display = 'none';
  } else {
    alert(`Error stopping recording: ${result.error}`);
    await updateStatus();
  }
});

// Listeners for main process events
ipcRenderer.on('processing-started', () => {
  statusDot.className = 'status-dot processing';
  statusText.textContent = 'Processando...';
  info.style.display = 'none';
  processing.style.display = 'block';
});

ipcRenderer.on('processing-complete', (event, data) => {
  statusDot.className = 'status-dot';
  statusText.textContent = 'Pronto';
  info.style.display = 'none';
  processing.style.display = 'none';
  success.style.display = 'block';
  outputPath.textContent = `Saved to: ${data.outputPath}`;
  startBtn.disabled = false;
  stopBtn.disabled = true;
});

// Initialize FFmpeg Download Modal
async function initializeFFmpeg() {
  try {
    console.log('[Renderer] ===== FFmpeg Initialization =====');
    const status = await ipcRenderer.invoke('ffmpeg-check-installation');

    if (status.installed) {
      console.log(`[Renderer] ✓ FFmpeg found: ${status.source}`);
      return true;
    }

    console.log('[Renderer] ✗ FFmpeg not found, showing download modal...');

    // Create and show download modal
    downloadModal = new FFmpegDownloadModal();
    downloadModal.show();
    console.log('[Renderer] Download modal displayed');

    // Setup modal callbacks
    downloadModal.onRetry = () => {
      console.log('[Renderer] User clicked retry');
      downloadModal.setStatus('downloading');
      ipcRenderer.invoke('ffmpeg-start-download');
    };

    downloadModal.onUseSystem = () => {
      console.log('[Renderer] User chose to use system FFmpeg');
      downloadModal.hide();
      downloadModal.destroy();
      downloadModal = null;
      // Proceed without download - BinaryResolver will use system FFmpeg
      updateStatus();
      updateMicStatus();
    };

    downloadModal.onExit = () => {
      console.log('[Renderer] User clicked exit');
      ipcRenderer.send('app-exit-ffmpeg-missing');
    };

    // Start download
    console.log('[Renderer] Starting FFmpeg download...');
    ipcRenderer.invoke('ffmpeg-start-download');

    // Listen for download progress
    ipcRenderer.on('ffmpeg-download-progress', (event, progress) => {
      downloadModal?.setProgress(
        progress.downloaded,
        progress.total,
        progress.percentage,
        progress.speed
      );
    });

    // Listen for status changes
    ipcRenderer.on('ffmpeg-download-status', (event, status) => {
      console.log(`[Renderer] Download status: ${status}`);
      downloadModal?.setStatus(status);
    });

    // Listen for errors
    ipcRenderer.on('ffmpeg-download-error', (event, errorMessage) => {
      console.error(`[Renderer] Download error: ${errorMessage}`);
      downloadModal?.setError(errorMessage);
    });

    // Listen for completion
    ipcRenderer.on('ffmpeg-download-complete', () => {
      console.log('[Renderer] FFmpeg download completed');
      setTimeout(() => {
        downloadModal?.hide();
        downloadModal?.destroy();
        downloadModal = null;
        updateStatus();
        updateMicStatus();
      }, 1000);
    });

  } catch (err) {
    console.error('[Renderer] FFmpeg initialization error:', err);
    alert(`Erro ao verificar FFmpeg: ${err.message}`);
  }
}

// Update initial status
initializeFFmpeg();

async function updateMicStatus() {
  const status = await ipcRenderer.invoke('get-microphone-status');
  isMicEnabled = status.useMicrophone;
  updateMicUI();
}

function updateMicUI() {
  if (isMicEnabled) {
    micToggle.classList.remove('muted');
    micToggle.classList.add('unmuted');
    micLabel.textContent = 'Microphone on';
  } else {
    micToggle.classList.remove('unmuted');
    micToggle.classList.add('muted');
    micLabel.textContent = 'Microphone off';
  }
}

micToggle.addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('toggle-microphone');
  isMicEnabled = result.useMicrophone;
  updateMicUI();
});

