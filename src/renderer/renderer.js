const { ipcRenderer } = require('electron');

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

// Update initial status
updateStatus();
updateMicStatus();

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

