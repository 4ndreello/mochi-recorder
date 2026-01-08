const fs = require('fs').promises;
const { execSync } = require('child_process');
const ZoomAnalyzer = require('./zoom-analyzer');
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
    try {
      await fs.access(this.inputVideoPath);
    } catch (error) {
      throw new Error(`Video file not found or invalid: ${this.inputVideoPath}`);
    }

    await this.loadMetadata();
    
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

    const analyzer = new ZoomAnalyzer(this.metadata, this.screenWidth, this.screenHeight);
    const zoomRegions = analyzer.analyze();

    if (zoomRegions.length === 0) {
      return await this.copyVideo();
    }

    return await this.applyZoom(zoomRegions);
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

  async applyZoom(zoomRegions) {
    const zoomExpression = this.buildZoomExpression(zoomRegions);
    const hasAudio = await this.hasAudioStream();
    
    const args = [
      '-i', this.inputVideoPath,
      '-vf', `zoompan=z='${zoomExpression}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23'
    ];

    if (hasAudio) {
      args.push('-c:a', 'copy');
    } else {
      args.push('-an');
    }

    args.push('-y', this.outputPath);

    return this.ffmpegManager.run(args);
  }

  buildZoomExpression(zoomRegions) {
    if (zoomRegions.length === 0) {
      return '1';
    }

    let expression = '1';
    
    for (let i = zoomRegions.length - 1; i >= 0; i--) {
      const region = zoomRegions[i];
      expression = `if(between(t,${region.startTime},${region.endTime}),${region.zoomFactor},${expression})`;
    }
    
    return expression;
  }
}

module.exports = VideoProcessor;
