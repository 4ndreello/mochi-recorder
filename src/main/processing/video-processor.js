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
      console.warn('Error detecting video dimensions, using default:', error);
    }
    return { width: this.screenWidth, height: this.screenHeight };
  }

  async hasAudioStream() {
    try {
      const output = execSync(
        `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of json "${this.inputVideoPath}"`,
        { encoding: 'utf-8' }
      );
      const data = JSON.parse(output);
      return data.streams && data.streams.length > 0;
    } catch (error) {
      console.warn('Error detecting audio stream:', error);
      return false;
    }
  }

  async process() {
    // Check if video file exists and is valid
    const fs = require('fs').promises;
    try {
      await fs.access(this.inputVideoPath);
    } catch (error) {
      throw new Error(`Video file not found or invalid: ${this.inputVideoPath}`);
    }

    await this.loadMetadata();
    
    // Try to get dimensions, but continue even if it fails
    try {
      await this.getVideoDimensions();
    } catch (error) {
      console.warn('Could not get video dimensions, using default values');
      // If can't get, use metadata values or default
      if (this.metadata && this.metadata.events && this.metadata.events.length > 0) {
        // Try to infer dimensions from events
        const maxX = Math.max(...this.metadata.events.map(e => e.x || 0));
        const maxY = Math.max(...this.metadata.events.map(e => e.y || 0));
        this.screenWidth = Math.max(maxX + 100, 1920);
        this.screenHeight = Math.max(maxY + 100, 1080);
      }
    }

    const analyzer = new ZoomAnalyzer(this.metadata, this.screenWidth, this.screenHeight);
    const zoomRegions = analyzer.analyze();

    if (zoomRegions.length === 0) {
      // No clicks, just copy video
      return await this.copyVideo();
    }

    // Processar com zoom
    return await this.applyZoom(zoomRegions);
  }

  async copyVideo() {
    return new Promise(async (resolve, reject) => {
      const hasAudio = await this.hasAudioStream();
      
      const args = [
        '-i', this.inputVideoPath,
        '-c', 'copy'
      ];

      // If no audio stream, explicitly disable audio
      if (!hasAudio) {
        args.push('-an');
      }

      args.push('-y', this.outputPath);

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
          reject(new Error(`FFmpeg failed with code ${code}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(error);
      });
    });
  }

  async applyZoom(zoomRegions) {
    return new Promise(async (resolve, reject) => {
      // Strategy: use zoompan to apply smooth zoom at click moments
      // For MVP, we'll apply zoom to each click region
      
      // Build complex filter
      let filterComplex = '';
      const segments = [];
      
      // Split video into segments: normal -> zoom -> normal
      let currentTime = 0;
      
      zoomRegions.forEach((region, index) => {
        // Segment before zoom (if exists)
        if (region.startTime > currentTime) {
          segments.push({
            start: currentTime,
            end: region.startTime,
            type: 'normal'
          });
        }
        
        // Segment with zoom
        segments.push({
          start: region.startTime,
          end: region.endTime,
          type: 'zoom',
          region: region
        });
        
        currentTime = region.endTime;
      });
      
      // Last segment (if exists)
      if (this.metadata.duration / 1000 > currentTime) {
        segments.push({
          start: currentTime,
          end: this.metadata.duration / 1000,
          type: 'normal'
        });
      }

      // For simplified MVP, we'll use a zoompan filter that detects clicks
      // Simpler version: apply zoompan with time-based expression
      const zoomExpression = this.buildZoomExpression(zoomRegions);
      
      // Check if input has audio
      const hasAudio = await this.hasAudioStream();
      
      const args = [
        '-i', this.inputVideoPath,
        '-vf', `zoompan=z='${zoomExpression}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '23'
      ];

      // Only copy audio if it exists
      if (hasAudio) {
        args.push('-c:a', 'copy');
      } else {
        args.push('-an');
      }

      args.push('-y', this.outputPath);

      const ffmpeg = spawn('ffmpeg', args);

      let errorOutput = '';
      
      ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();
        errorOutput += output;
        // FFmpeg writes progress to stderr
        if (output.includes('time=')) {
          // Parse progress if needed
        }
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log('Video processed successfully');
          resolve();
        } else {
          console.error('FFmpeg error output:', errorOutput);
          reject(new Error(`FFmpeg failed with code ${code}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(error);
      });
    });
  }

  buildZoomExpression(zoomRegions) {
    // Build expression for zoompan
    // Format: if(condition, value_if_true, value_if_false)
    // For multiple clicks, use nested expression
    
    if (zoomRegions.length === 0) {
      return '1';
    }

    let expression = '1';
    
    // Build reverse expression (from last to first)
    for (let i = zoomRegions.length - 1; i >= 0; i--) {
      const region = zoomRegions[i];
      expression = `if(between(t,${region.startTime},${region.endTime}),${region.zoomFactor},${expression})`;
    }
    
    return expression;
  }
}

module.exports = VideoProcessor;

