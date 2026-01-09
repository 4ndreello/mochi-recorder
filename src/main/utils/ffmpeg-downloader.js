const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");
const tar = require("tar");

class FFmpegDownloader {
  static getDownloadUrl() {
    const arch = process.arch === "arm64" ? "arm64" : "amd64";
    return `https://johnvansickle.com/ffmpeg/builds/ffmpeg-git-${arch}-static.tar.xz`;
  }

  static getBinPath() {
    const binPath = path.join(os.homedir(), ".config", "mochi", "bin");
    if (!fs.existsSync(binPath)) {
      fs.mkdirSync(binPath, { recursive: true });
    }
    return binPath;
  }

  static getVersionFilePath() {
    return path.join(this.getBinPath(), ".version");
  }

  static async downloadFFmpeg(progressCallback) {
    const url = this.getDownloadUrl();
    const tmpPath = path.join(os.tmpdir(), "mochi-ffmpeg-download.tar.xz");

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(tmpPath);
      let startTime = Date.now();
      let lastProgressTime = startTime;
      let lastDownloaded = 0;

      const request = https.get(url, (response) => {
        const totalSize = parseInt(response.headers["content-length"], 10);

        response.on("data", (chunk) => {
          lastDownloaded += chunk.length;
          const now = Date.now();

          // Atualizar progresso apenas a cada 500ms para não sobrecarregar
          if (now - lastProgressTime > 500) {
            const elapsed = (now - startTime) / 1000;
            const speed = lastDownloaded / elapsed;
            const percentage = Math.round((lastDownloaded / totalSize) * 100);

            if (progressCallback) {
              progressCallback({
                downloaded: lastDownloaded,
                total: totalSize,
                percentage,
                speed: speed / (1024 * 1024), // MB/s
              });
            }

            lastProgressTime = now;
          }
        });

        response.pipe(file);
      });

      request.on("error", (err) => {
        fs.unlink(tmpPath, () => {});
        reject(new Error(`Failed to download FFmpeg: ${err.message}`));
      });

      file.on("finish", () => {
        file.close();
        resolve(tmpPath);
      });

      file.on("error", (err) => {
        fs.unlink(tmpPath, () => {});
        reject(new Error(`Failed to save FFmpeg: ${err.message}`));
      });
    });
  }

  static async extractTarball(archivePath, destPath) {
    return new Promise((resolve, reject) => {
      // Use system tar command for .tar.xz files (Node.js tar doesn't support XZ)
      const { exec } = require("child_process");

      // Create temp extraction directory
      const tempDir = path.join(os.tmpdir(), "mochi-ffmpeg-extract");

      // Extract with system tar, then copy ffmpeg and ffprobe to destPath
      const cmd = `rm -rf "${tempDir}" && mkdir -p "${tempDir}" && tar -xJf "${archivePath}" -C "${tempDir}" --strip-components=1 && cp "${tempDir}/ffmpeg" "${destPath}/ffmpeg" && cp "${tempDir}/ffprobe" "${destPath}/ffprobe" && rm -rf "${tempDir}" "${archivePath}"`;

      exec(cmd, { timeout: 120000 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Failed to extract FFmpeg: ${error.message}`));
          return;
        }
        resolve();
      });
    });
  }

  static async verifyChecksum(filePath) {
    try {
      // Verificar se o arquivo existe e tem tamanho mínimo (> 50MB)
      const stats = fs.statSync(filePath);
      if (stats.size < 50 * 1024 * 1024) {
        throw new Error("FFmpeg binary is too small");
      }

      // Testar se o binário funciona
      const version = execSync(`"${filePath}" -version 2>&1`, {
        timeout: 5000,
        encoding: "utf-8",
      });

      if (!version.includes("ffmpeg")) {
        throw new Error("FFmpeg binary is invalid");
      }

      return true;
    } catch (err) {
      throw new Error(`Verification failed: ${err.message}`);
    }
  }

  static saveVersion() {
    try {
      const version = execSync(
        `"${path.join(this.getBinPath(), "ffmpeg")}" -version 2>&1`,
        {
          timeout: 5000,
          encoding: "utf-8",
        }
      );

      const versionLine = version.split("\n")[0];
      fs.writeFileSync(this.getVersionFilePath(), versionLine);
    } catch (err) {
      // Se falhar, criar arquivo vazio
      fs.writeFileSync(this.getVersionFilePath(), "unknown");
    }
  }

  static async install() {
    try {
      const binPath = this.getBinPath();

      console.log("[FFmpegDownloader] Starting download...");

      // Step 1: Download
      const archivePath = await this.downloadFFmpeg((progress) => {
        console.log(
          `[FFmpegDownloader] Download progress: ${progress.percentage}% (${(
            progress.downloaded /
            1024 /
            1024
          ).toFixed(1)}MB / ${(progress.total / 1024 / 1024).toFixed(
            1
          )}MB @ ${progress.speed.toFixed(1)}MB/s)`
        );
      });

      console.log("[FFmpegDownloader] Download complete. Extracting...");

      // Step 2: Extract
      await this.extractTarball(archivePath, binPath);

      console.log("[FFmpegDownloader] Extraction complete. Verifying...");

      // Step 3: Verify both ffmpeg and ffprobe
      const ffmpegPath = path.join(binPath, "ffmpeg");
      const ffprobePath = path.join(binPath, "ffprobe");

      // Make executable
      fs.chmodSync(ffmpegPath, 0o755);
      fs.chmodSync(ffprobePath, 0o755);

      // Verify
      await this.verifyChecksum(ffmpegPath);
      await this.verifyChecksum(ffprobePath);

      console.log("[FFmpegDownloader] Verification complete.");

      // Save version info
      this.saveVersion();

      console.log("[FFmpegDownloader] FFmpeg installed successfully");
      return true;
    } catch (err) {
      console.error("[FFmpegDownloader] Installation failed:", err.message);
      throw err;
    }
  }
}

module.exports = FFmpegDownloader;
