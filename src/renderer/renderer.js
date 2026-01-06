const { ipcRenderer } = require('electron');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const info = document.getElementById('info');
const processing = document.getElementById('processing');
const success = document.getElementById('success');
const outputPath = document.getElementById('outputPath');

let isRecording = false;

async function updateStatus() {
  const status = await ipcRenderer.invoke('get-recording-status');
  isRecording = status.isRecording;
  
  if (isRecording) {
    statusDot.className = 'status-dot recording';
    statusText.textContent = 'Gravando...';
    startBtn.disabled = true;
    stopBtn.disabled = false;
    info.style.display = 'block';
    processing.style.display = 'none';
    success.style.display = 'none';
  } else {
    statusDot.className = 'status-dot';
    statusText.textContent = 'Pronto';
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

startBtn.addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('start-recording');
  
  if (result.success) {
    await updateStatus();
  } else {
    alert(`Erro ao iniciar gravação: ${result.error}`);
  }
});

stopBtn.addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('stop-recording');
  
  if (result.success) {
    isRecording = false;
    statusDot.className = 'status-dot processing';
    statusText.textContent = 'Processando...';
    startBtn.disabled = true;
    stopBtn.disabled = true;
    info.style.display = 'none';
    processing.style.display = 'block';
    success.style.display = 'none';
  } else {
    alert(`Erro ao parar gravação: ${result.error}`);
    await updateStatus();
  }
});

// Listeners para eventos do processo principal
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
  outputPath.textContent = `Salvo em: ${data.outputPath}`;
  startBtn.disabled = false;
  stopBtn.disabled = true;
});

// Atualizar status inicial
updateStatus();

