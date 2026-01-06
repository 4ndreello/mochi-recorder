const { BrowserWindow, ipcMain, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const CatboxUploader = require('../upload/catbox-uploader');

class PostRecordingDialog {
  constructor() {
    this.window = null;
    this.uploader = new CatboxUploader();
    this.setupIpcHandlers();
  }

  setupIpcHandlers() {
    ipcMain.handle('copy-file-to-clipboard', async (event, filePath) => {
      console.log('[COPY] Copiando arquivo:', filePath);
      
      const isWayland = process.env.WAYLAND_DISPLAY || 
                       process.env.XDG_SESSION_TYPE === 'wayland';
      
      if (isWayland) {
        const { exec } = require('child_process');
        exec(`wl-copy -t text/uri-list "file://${filePath}"`);
      } else {
        const { exec } = require('child_process');
        exec(`echo -n "file://${filePath}" | xclip -selection clipboard -t text/uri-list`);
      }
      
      console.log('[COPY] URI copiado!');
      return { success: true };
    });

    ipcMain.handle('upload-to-catbox', async (event, filePath) => {
      console.log('[UPLOAD] Iniciando upload:', filePath);
      try {
        const stats = await fs.promises.stat(filePath);
        console.log('[UPLOAD] Tamanho:', (stats.size / 1024 / 1024).toFixed(2), 'MB');
        
        const senderWebContents = event.sender;
        
        const result = await this.uploader.upload(filePath, (progress) => {
          if (senderWebContents && !senderWebContents.isDestroyed()) {
            senderWebContents.send('upload-progress', progress);
          }
        });
        
        console.log('[UPLOAD] Concluído:', result.url);
        return result;
      } catch (error) {
        console.error('[UPLOAD] Erro:', error.message);
        const message = error.code === 'ECONNRESET' 
          ? 'Conexão perdida. Tente novamente.'
          : error.message || 'Erro desconhecido';
        throw new Error(message);
      }
    });
  }

  show(videoPath) {
    if (this.window) {
      this.window.close();
    }

    this.window = new BrowserWindow({
      width: 300,
      height: 180,
      resizable: false,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: false,
      backgroundColor: '#1a1a1a',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    this.window.loadFile(path.join(__dirname, '../../renderer/post-recording-dialog.html'));

    this.window.webContents.on('did-finish-load', () => {
      const stats = fs.statSync(videoPath);
      this.window.webContents.send('video-data', {
        path: videoPath,
        fileName: path.basename(videoPath),
        size: stats.size
      });
    });

    this.window.on('closed', () => {
      this.window = null;
    });

    this.window.center();
  }

  close() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
      this.window = null;
    }
  }
}

module.exports = PostRecordingDialog;
