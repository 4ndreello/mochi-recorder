const https = require('https');
const fs = require('fs');
const path = require('path');

class CatboxUploader {
  constructor() {
    this.catboxUrl = 'catbox.moe';
    this.litterboxUrl = 'litterbox.catbox.moe';
    this.catboxLimit = 200 * 1024 * 1024;
    this.maxRetries = 3;
  }

  async upload(filePath, onProgress = () => {}) {
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    console.log('[UPLOADER] Tamanho:', (fileSize / 1024 / 1024).toFixed(2), 'MB');

    if (fileSize > this.catboxLimit) {
      console.log('[UPLOADER] Usando Litterbox (arquivo > 200MB)');
      return await this.uploadWithRetry(filePath, onProgress, 'litterbox');
    }

    console.log('[UPLOADER] Usando Catbox.moe');
    return await this.uploadWithRetry(filePath, onProgress, 'catbox');
  }

  async uploadWithRetry(filePath, onProgress, service) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[UPLOADER] Tentativa ${attempt}/${this.maxRetries}`);
        
        if (service === 'litterbox') {
          return await this.uploadToLitterbox(filePath, onProgress);
        } else {
          return await this.uploadToCatbox(filePath, onProgress);
        }
      } catch (error) {
        lastError = error;
        console.error(`[UPLOADER] Tentativa ${attempt} falhou:`, error.message);
        
        if (attempt < this.maxRetries) {
          const delay = attempt * 2000;
          console.log(`[UPLOADER] Aguardando ${delay}ms antes de tentar novamente...`);
          await new Promise(r => setTimeout(r, delay));
          onProgress(0);
        }
      }
    }
    
    throw lastError;
  }

  async uploadToCatbox(filePath, onProgress) {
    return new Promise((resolve, reject) => {
      const fileName = path.basename(filePath);
      const stats = fs.statSync(filePath);
      const fileSize = stats.size;

      const boundary = `----FormBoundary${Math.random().toString(36).substring(2)}`;
      
      const header = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="reqtype"\r\n\r\n` +
        `fileupload\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="fileToUpload"; filename="${fileName}"\r\n` +
        `Content-Type: video/mp4\r\n\r\n`
      );

      const footer = Buffer.from(`\r\n--${boundary}--\r\n`);

      const options = {
        hostname: this.catboxUrl,
        port: 443,
        path: '/user/api.php',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': header.length + fileSize + footer.length,
          'User-Agent': 'Mochi/1.0',
          'Accept': '*/*',
          'Connection': 'keep-alive'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200 && data.startsWith('https://')) {
            resolve({
              url: data.trim(),
              service: 'Catbox.moe',
              permanent: true
            });
          } else {
            reject(new Error(`Erro: ${data || res.statusCode}`));
          }
        });
      });

      req.on('error', (error) => {
        console.error('[CATBOX] Erro:', error.code);
        reject(error);
      });

      req.setTimeout(300000, () => {
        req.destroy();
        reject(new Error('Timeout'));
      });

      req.write(header);

      const fileStream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
      let uploaded = 0;
      
      fileStream.on('data', (chunk) => {
        uploaded += chunk.length;
        const progress = Math.round((uploaded / fileSize) * 100);
        onProgress(progress);
        
        if (!req.write(chunk)) {
          fileStream.pause();
          req.once('drain', () => fileStream.resume());
        }
      });

      fileStream.on('end', () => {
        req.write(footer);
        req.end();
      });

      fileStream.on('error', (error) => {
        req.destroy();
        reject(error);
      });
    });
  }

  async uploadToLitterbox(filePath, onProgress) {
    return new Promise((resolve, reject) => {
      const fileName = path.basename(filePath);
      const stats = fs.statSync(filePath);
      const fileSize = stats.size;

      const boundary = `----FormBoundary${Math.random().toString(36).substring(2)}`;
      
      const header = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="reqtype"\r\n\r\n` +
        `fileupload\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="time"\r\n\r\n` +
        `72h\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="fileToUpload"; filename="${fileName}"\r\n` +
        `Content-Type: video/mp4\r\n\r\n`
      );

      const footer = Buffer.from(`\r\n--${boundary}--\r\n`);

      const options = {
        hostname: this.litterboxUrl,
        port: 443,
        path: '/resources/internals/api.php',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': header.length + fileSize + footer.length,
          'User-Agent': 'Mochi/1.0',
          'Accept': '*/*',
          'Connection': 'keep-alive'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200 && data.startsWith('https://')) {
            resolve({
              url: data.trim(),
              service: 'Litterbox',
              permanent: false,
              expiresIn: '3 dias'
            });
          } else {
            reject(new Error(`Erro: ${data || res.statusCode}`));
          }
        });
      });

      req.on('error', (error) => {
        console.error('[LITTERBOX] Erro:', error.code);
        reject(error);
      });

      req.setTimeout(600000, () => {
        req.destroy();
        reject(new Error('Timeout'));
      });

      req.write(header);

      const fileStream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
      let uploaded = 0;
      
      fileStream.on('data', (chunk) => {
        uploaded += chunk.length;
        const progress = Math.round((uploaded / fileSize) * 100);
        onProgress(progress);
        
        if (!req.write(chunk)) {
          fileStream.pause();
          req.once('drain', () => fileStream.resume());
        }
      });

      fileStream.on('end', () => {
        req.write(footer);
        req.end();
      });

      fileStream.on('error', (error) => {
        req.destroy();
        reject(error);
      });
    });
  }
}

module.exports = CatboxUploader;
