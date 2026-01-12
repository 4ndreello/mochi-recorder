const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync, spawnSync } = require('child_process');
const { app, ipcMain } = require('electron');

class BinaryResolver {
  static cachedPaths = {};
  static downloadInProgress = false;

  static getDownloadedPath(name) {
    return path.join(os.homedir(), '.config', 'mochi', 'bin', name);
  }

  static getSystemPath(name) {
    try {
      const result = spawnSync('which', [name], {
        encoding: 'utf-8',
        timeout: 2000
      });

      if (result.status === 0) {
        return result.stdout.trim();
      }
      return null;
    } catch (err) {
      return null;
    }
  }

  static testBinary(binaryPath) {
    try {
      const result = spawnSync(binaryPath, ['-version'], {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const hasOutput = result.stdout || result.stderr;
      const isValid = result.status === 0 && hasOutput && hasOutput.length > 0;
      console.log(`[BinaryResolver] Test binary "${binaryPath}": status=${result.status}, hasOutput=${!!hasOutput}, valid=${isValid}`);
      if (!isValid) {
        console.log(`[BinaryResolver] - stdout: ${result.stdout?.substring(0, 50)}`);
        console.log(`[BinaryResolver] - stderr: ${result.stderr?.substring(0, 50)}`);
      }
      return isValid;
    } catch (err) {
      console.log(`[BinaryResolver] Test binary "${binaryPath}" failed: ${err.message}`);
      return false;
    }
  }

  static isDownloaded() {
    const ffmpegPath = this.getDownloadedPath('ffmpeg');
    return fs.existsSync(ffmpegPath) && this.testBinary(ffmpegPath);
  }

  static async resolveBinary(name) {
    if (this.cachedPaths[name]) {
      console.log(`[BinaryResolver] Using cached path for ${name}: ${this.cachedPaths[name]}`);
      return this.cachedPaths[name];
    }

    console.log(`[BinaryResolver] ===== Resolving ${name} =====`);

    const downloadedPath = this.getDownloadedPath(name);
    console.log(`[BinaryResolver] Checking Mochi binary at: ${downloadedPath}`);
    if (fs.existsSync(downloadedPath)) {
      console.log(`[BinaryResolver] - File exists, testing...`);
      if (this.testBinary(downloadedPath)) {
        console.log(`[BinaryResolver] ✓ Mochi binary is VALID: ${downloadedPath}`);
        this.cachedPaths[name] = downloadedPath;
        return downloadedPath;
      } else {
        console.log(`[BinaryResolver] ✗ Mochi binary is INVALID (test failed)`);
      }
    } else {
      console.log(`[BinaryResolver] ✗ Mochi binary NOT FOUND - download required`);
    }

    console.log(`[BinaryResolver] ✗ ${name} not found in Mochi folder, download required`);
    throw new Error(`${name} not found. Download required.`);
  }

  static triggerDownload() {
    return new Promise((resolve, reject) => {
      this.downloadInProgress = true;
      const mainWindow = require('electron').BrowserWindow.getAllWindows()[0];

      if (!mainWindow) {
        this.downloadInProgress = false;
        reject(new Error('No window available'));
        return;
      }

      ipcMain.once('ffmpeg-download-complete', () => {
        this.downloadInProgress = false;
        this.cachedPaths['ffmpeg'] = this.getDownloadedPath('ffmpeg');
        resolve(this.cachedPaths['ffmpeg']);
      });

      ipcMain.once('ffmpeg-download-failed', () => {
        this.downloadInProgress = false;
        reject(new Error('FFmpeg download failed'));
      });

      mainWindow.webContents.send('show-ffmpeg-download-modal');

      setTimeout(() => {
        if (this.downloadInProgress) {
          this.downloadInProgress = false;
          reject(new Error('FFmpeg download timeout'));
        }
      }, 30 * 60 * 1000);
    });
  }

  static async getFFmpegPath() {
    const args = process.argv;
    const systemPath = this.getSystemPath('ffmpeg');
    
    if (args.includes('--force-system-binary')) {
      if (systemPath) {
        console.log('[BinaryResolver] Forcing system binary via command line');
        return systemPath;
      }
    }

    if (systemPath) {
      try {
        const formats = execSync(`"${systemPath}" -formats 2>&1`, { encoding: 'utf-8' });
        if (formats.includes('pulse')) {
          console.log('[BinaryResolver] Using system FFmpeg (has pulse support)');
          this.cachedPaths['ffmpeg'] = systemPath;
          return systemPath;
        }
      } catch (e) {
        console.warn('[BinaryResolver] Error checking system FFmpeg formats:', e.message);
      }
    }

    return this.resolveBinary('ffmpeg');
  }

  static async getFFprobePath() {
    const systemPath = this.getSystemPath('ffprobe');
    if (systemPath && this.cachedPaths['ffmpeg'] && !this.cachedPaths['ffmpeg'].includes('.config/mochi')) {
      return systemPath;
    }
    return this.resolveBinary('ffprobe');
  }
}

module.exports = BinaryResolver;
