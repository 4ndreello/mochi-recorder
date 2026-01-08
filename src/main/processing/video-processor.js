const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const CursorVideoGenerator = require('./cursor-video-generator');
const FFmpegManager = require('../utils/ffmpeg-manager');

class VideoProcessor {
  constructor(inputVideoPath, metadataPath, outputPath) {
    this.inputVideoPath = inputVideoPath;
    this.metadataPath = metadataPath;
    this.outputPath = outputPath;
    this.metadata = null;
    this.screenWidth = 1920;
    this.screenHeight = 1080;
    this.ffmpegManager = new FFmpegManager("Processing");
    this.enableCursor = true;
    this.onProgress = null;
  }

  setProgressCallback(callback) {
    this.onProgress = callback;
  }

  emitProgress(stage, percent) {
    if (this.onProgress) {
      this.onProgress({ stage, percent });
    }
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

  async getVideoFps() {
    try {
      const output = execSync(
        `ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of json "${this.inputVideoPath}"`,
        { encoding: 'utf-8' }
      );
      const data = JSON.parse(output);
      if (data.streams && data.streams[0] && data.streams[0].r_frame_rate) {
        const [num, den] = data.streams[0].r_frame_rate.split('/').map(Number);
        const fps = den > 0 ? num / den : 30;
        console.log(`[VideoProcessor] Detected video FPS: ${fps}`);
        return fps;
      }
    } catch (error) {
      console.warn('Error detecting video FPS, using default:', error);
    }
    return 30;
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
    this.emitProgress('preparing', 0);
    
    try {
      await fs.access(this.inputVideoPath);
    } catch (error) {
      throw new Error(`Video file not found or invalid: ${this.inputVideoPath}`);
    }

    if (this.enableCursor) {
      await this.loadMetadata();
      this.emitProgress('preparing', 5);
      
      try {
        await this.getVideoDimensions();
      } catch (error) {
        console.warn('Could not get video dimensions, using default values');
        if (this.metadata && this.metadata.events && this.metadata.events.length > 0) {
          const maxX = Math.max(...this.metadata.events.map(e => e.x || 0));
          const maxY = Math.max(...this.metadata.events.map(e => e.y || 0));
          this.screenWidth = Math.max(maxX + 100, 1920);
          this.screenHeight = Math.max(maxY + 100, 1080);
        }
      }
    }

    this.emitProgress('preparing', 10);
    return await this.applyEffects();
  }

  async applyEffects() {
    const hasAudio = await this.hasAudioStream();
    const hasEvents = this.metadata && this.metadata.events && this.metadata.events.length > 0;

    if (!this.enableCursor || !hasEvents) {
      this.emitProgress('saving', 50);
      const result = await this.copyVideo();
      this.emitProgress('done', 100);
      return result;
    }

    const cursorVideoPath = this.inputVideoPath.replace('.mp4', '_cursor.mov');
    
    this.emitProgress('rendering', 10);
    console.log('[VideoProcessor] Generating cursor overlay video at 120fps...');
    
    const generator = new CursorVideoGenerator(
      this.metadata,
      this.screenWidth,
      this.screenHeight
    );
    
    generator.setProgressCallback((cursorPercent) => {
      const overallPercent = 10 + Math.floor(cursorPercent * 0.5);
      this.emitProgress('rendering', overallPercent);
    });
    
    await generator.generate(cursorVideoPath);

    this.emitProgress('compositing', 60);
    console.log('[VideoProcessor] Compositing final video (120fps cursor on base video)...');
    
    const args = [
      '-i', this.inputVideoPath,
      '-i', cursorVideoPath,
      '-filter_complex', '[0:v]fps=120[base];[base][1:v]overlay=0:0:format=auto[outv]',
      '-map', '[outv]',
      '-r', '60',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '20'
    ];

    if (hasAudio) {
      args.push('-map', '0:a', '-c:a', 'copy');
    }

    args.push('-y', this.outputPath);

    this.emitProgress('compositing', 70);
    await this.ffmpegManager.run(args);
    this.emitProgress('compositing', 95);

    await fs.unlink(cursorVideoPath).catch(() => {});
    
    this.emitProgress('done', 100);
    return this.outputPath;
  }

  async copyVideo() {
    const hasAudio = await this.hasAudioStream();
    
    const args = [
      '-i', this.inputVideoPath,
      '-c', 'copy'
    ];

    if (!hasAudio) {
      args.push('-an');
    }

    args.push('-y', this.outputPath);

    return this.ffmpegManager.run(args);
  }

}

module.exports = VideoProcessor;
