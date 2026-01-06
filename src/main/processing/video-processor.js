const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const ZoomAnalyzer = require('./zoom-analyzer');
const { execSync } = require('child_process');

class VideoProcessor {
  constructor(inputVideoPath, metadataPath, outputPath) {
    this.inputVideoPath = inputVideoPath;
    this.metadataPath = metadataPath;
    this.outputPath = outputPath;
    this.metadata = null;
    this.screenWidth = 1920;
    this.screenHeight = 1080;
  }

  async loadMetadata() {
    try {
      const data = await fs.readFile(this.metadataPath, 'utf-8');
      this.metadata = JSON.parse(data);
      return this.metadata;
    } catch (error) {
      throw new Error(`Erro ao carregar metadata: ${error.message}`);
    }
  }

  async getVideoDimensions() {
    try {
      const output = execSync(
        `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of json "${this.inputVideoPath}"`,
        { encoding: 'utf-8' }
      );
      const data = JSON.parse(output);
      if (data.streams && data.streams[0]) {
        this.screenWidth = data.streams[0].width;
        this.screenHeight = data.streams[0].height;
        return { width: this.screenWidth, height: this.screenHeight };
      }
    } catch (error) {
      console.warn('Erro ao detectar dimensões do vídeo, usando padrão:', error);
    }
    return { width: this.screenWidth, height: this.screenHeight };
  }

  async process() {
    // Verificar se o arquivo de vídeo existe e é válido
    const fs = require('fs').promises;
    try {
      await fs.access(this.inputVideoPath);
    } catch (error) {
      throw new Error(`Arquivo de vídeo não encontrado ou inválido: ${this.inputVideoPath}`);
    }

    await this.loadMetadata();
    
    // Tentar obter dimensões, mas continuar mesmo se falhar
    try {
      await this.getVideoDimensions();
    } catch (error) {
      console.warn('Não foi possível obter dimensões do vídeo, usando valores padrão');
      // Se não conseguir, usar valores da metadata ou padrão
      if (this.metadata && this.metadata.events && this.metadata.events.length > 0) {
        // Tentar inferir dimensões dos eventos
        const maxX = Math.max(...this.metadata.events.map(e => e.x || 0));
        const maxY = Math.max(...this.metadata.events.map(e => e.y || 0));
        this.screenWidth = Math.max(maxX + 100, 1920);
        this.screenHeight = Math.max(maxY + 100, 1080);
      }
    }

    const analyzer = new ZoomAnalyzer(this.metadata, this.screenWidth, this.screenHeight);
    const zoomRegions = analyzer.analyze();

    if (zoomRegions.length === 0) {
      // Sem cliques, apenas copiar vídeo
      return await this.copyVideo();
    }

    // Processar com zoom
    return await this.applyZoom(zoomRegions);
  }

  async copyVideo() {
    return new Promise((resolve, reject) => {
      const args = [
        '-i', this.inputVideoPath,
        '-c', 'copy',
        '-y',
        this.outputPath
      ];

      const ffmpeg = spawn('ffmpeg', args);

      ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('error') || output.includes('Error')) {
          console.error('FFmpeg error:', output);
        }
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg falhou com código ${code}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(error);
      });
    });
  }

  async applyZoom(zoomRegions) {
    return new Promise((resolve, reject) => {
      // Estratégia: usar zoompan para aplicar zoom suave nos momentos de clique
      // Para MVP, vamos aplicar zoom em cada região de clique
      
      // Construir filtro complexo
      let filterComplex = '';
      const segments = [];
      
      // Dividir vídeo em segmentos: normal -> zoom -> normal
      let currentTime = 0;
      
      zoomRegions.forEach((region, index) => {
        // Segmento antes do zoom (se houver)
        if (region.startTime > currentTime) {
          segments.push({
            start: currentTime,
            end: region.startTime,
            type: 'normal'
          });
        }
        
        // Segmento com zoom
        segments.push({
          start: region.startTime,
          end: region.endTime,
          type: 'zoom',
          region: region
        });
        
        currentTime = region.endTime;
      });
      
      // Último segmento (se houver)
      if (this.metadata.duration / 1000 > currentTime) {
        segments.push({
          start: currentTime,
          end: this.metadata.duration / 1000,
          type: 'normal'
        });
      }

      // Para MVP simplificado, vamos usar um filtro zoompan que detecta cliques
      // Versão mais simples: aplicar zoompan com expressão baseada em tempo
      const zoomExpression = this.buildZoomExpression(zoomRegions);
      
      const args = [
        '-i', this.inputVideoPath,
        '-vf', `zoompan=z='${zoomExpression}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '23',
        '-c:a', 'copy',
        '-y',
        this.outputPath
      ];

      const ffmpeg = spawn('ffmpeg', args);

      let errorOutput = '';
      
      ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();
        errorOutput += output;
        // FFmpeg escreve progresso no stderr
        if (output.includes('time=')) {
          // Parse progresso se necessário
        }
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log('Vídeo processado com sucesso');
          resolve();
        } else {
          console.error('FFmpeg error output:', errorOutput);
          reject(new Error(`FFmpeg falhou com código ${code}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(error);
      });
    });
  }

  buildZoomExpression(zoomRegions) {
    // Construir expressão para zoompan
    // Formato: if(condição, valor_se_verdadeiro, valor_se_falso)
    // Para múltiplos cliques, usar expressão aninhada
    
    if (zoomRegions.length === 0) {
      return '1';
    }

    let expression = '1';
    
    // Construir expressão reversa (do último para o primeiro)
    for (let i = zoomRegions.length - 1; i >= 0; i--) {
      const region = zoomRegions[i];
      expression = `if(between(t,${region.startTime},${region.endTime}),${region.zoomFactor},${expression})`;
    }
    
    return expression;
  }
}

module.exports = VideoProcessor;

