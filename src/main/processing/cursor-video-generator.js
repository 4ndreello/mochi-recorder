const { createCanvas } = require('canvas');
const { spawn } = require('child_process');
const path = require('path');

const TARGET_FPS = 120;
const MOTION_BLUR_SAMPLES = 8;
const SYNC_ADJUSTMENT_MS = 0;
const FFMPEG_STARTUP_COMPENSATION_MS = 0;

class CursorVideoGenerator {
  constructor(metadata, width, height) {
    this.metadata = metadata;
    this.width = width;
    this.height = height;
    this.fps = TARGET_FPS;
    this.cursorSize = 20;
    this.cursorColor = 'white';
    this.cursorShadowColor = 'rgba(0,0,0,0.3)';
    this.clickRippleColor = 'rgba(255,255,0,0.6)';
    
    this.motionBlurEnabled = true;
    this.motionBlurSamples = MOTION_BLUR_SAMPLES;
    this.onProgress = null;
  }

  setProgressCallback(callback) {
    this.onProgress = callback;
  }

  getEvents() {
    return this.metadata.events || [];
  }

  getSessionInfo() {
    if (this.metadata.version === 2) {
      return this.metadata.session || {};
    }
    return { duration: this.metadata.duration || 0 };
  }

  getRegion() {
    const session = this.getSessionInfo();
    return session.region || { x: 0, y: 0 };
  }

  getVideoStartOffset() {
    const session = this.getSessionInfo();
    return session.videoStartOffset || 0;
  }

  interpolatePosition(events, timeMs) {
    if (events.length === 0) return { x: 0, y: 0 };
    if (events.length === 1) return { x: events[0].x, y: events[0].y };

    let before = events[0];
    let after = events[events.length - 1];

    for (let i = 0; i < events.length - 1; i++) {
      if (events[i].t <= timeMs && events[i + 1].t >= timeMs) {
        before = events[i];
        after = events[i + 1];
        break;
      }
      if (events[i].t <= timeMs) {
        before = events[i];
      }
    }

    if (before.t === after.t) {
      return { x: before.x, y: before.y };
    }

    const progress = (timeMs - before.t) / (after.t - before.t);
    const eased = this.easeOutCubic(Math.max(0, Math.min(1, progress)));

    return {
      x: before.x + (after.x - before.x) * eased,
      y: before.y + (after.y - before.y) * eased
    };
  }

  easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    
    return 0.5 * (
      (2 * p1) +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  }

  findEventIndices(events, timeMs) {
    let i1 = 0;
    for (let i = 0; i < events.length - 1; i++) {
      if (events[i].t <= timeMs && events[i + 1].t >= timeMs) {
        i1 = i;
        break;
      }
      if (events[i].t <= timeMs) {
        i1 = i;
      }
    }
    
    const i0 = Math.max(0, i1 - 1);
    const i2 = Math.min(events.length - 1, i1 + 1);
    const i3 = Math.min(events.length - 1, i1 + 2);
    
    return { i0, i1, i2, i3 };
  }

  interpolatePositionSpline(events, timeMs) {
    if (events.length === 0) return { x: 0, y: 0 };
    if (events.length === 1) return { x: events[0].x, y: events[0].y };
    
    const { i0, i1, i2, i3 } = this.findEventIndices(events, timeMs);
    
    const p0 = events[i0];
    const p1 = events[i1];
    const p2 = events[i2];
    const p3 = events[i3];
    
    if (p1.t === p2.t) {
      return { x: p1.x, y: p1.y };
    }
    
    const t = Math.max(0, Math.min(1, (timeMs - p1.t) / (p2.t - p1.t)));
    
    return {
      x: this.catmullRom(p0.x, p1.x, p2.x, p3.x, t),
      y: this.catmullRom(p0.y, p1.y, p2.y, p3.y, t)
    };
  }

  isClickActive(timeMs, clicks) {
    for (const click of clicks) {
      const clickStart = click.t;
      const clickEnd = click.t + 300;
      if (timeMs >= clickStart && timeMs <= clickEnd) {
        const progress = (timeMs - clickStart) / 300;
        return { active: true, progress, x: click.x, y: click.y };
      }
    }
    return { active: false };
  }

  findExactPosition(events, timeMs) {
    if (events.length === 0) return { x: 0, y: 0 };
    
    let closest = events[0];
    for (const event of events) {
      if (event.t <= timeMs) {
        closest = event;
      } else {
        break;
      }
    }
    return { x: closest.x, y: closest.y };
  }

  drawSimpleCursor(ctx, moves, region, currentTimeMs) {
    const pos = this.findExactPosition(moves, currentTimeMs);
    const screenX = pos.x - region.x;
    const screenY = pos.y - region.y;
    this.drawCursor(ctx, screenX, screenY, 1.0, 1.0);
    return { x: screenX, y: screenY };
  }

  drawCursor(ctx, x, y, alpha = 1.0, scale = 1.0) {
    ctx.save();
    ctx.globalAlpha = alpha;
    
    const size = this.cursorSize * scale;
    
    if (alpha >= 0.5) {
      ctx.shadowColor = this.cursorShadowColor;
      ctx.shadowBlur = 6 * alpha;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
    }

    ctx.fillStyle = this.cursorColor;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x + size * 0.4, y + size * 0.75);
    ctx.lineTo(x + size * 0.55, y + size * 1.1);
    ctx.lineTo(x + size * 0.75, y + size * 1.05);
    ctx.lineTo(x + size * 0.55, y + size * 0.7);
    ctx.lineTo(x + size * 0.85, y + size * 0.7);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(0,0,0,${alpha * 0.8})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    
    ctx.restore();
  }

  drawMotionBlurredCursor(ctx, moves, region, currentTimeMs, frameInterval) {
    if (!this.motionBlurEnabled) {
      const pos = this.interpolatePositionSpline(moves, currentTimeMs);
      const screenX = pos.x - region.x;
      const screenY = pos.y - region.y;
      this.drawCursor(ctx, screenX, screenY, 1.0, 1.0);
      return { x: screenX, y: screenY };
    }
    
    const samples = this.motionBlurSamples;
    const subFrameInterval = frameInterval / samples;
    const positions = [];
    
    for (let i = 0; i < samples; i++) {
      const sampleTime = currentTimeMs - (frameInterval * 0.5) + (subFrameInterval * i);
      const pos = this.interpolatePositionSpline(moves, sampleTime);
      positions.push({
        x: pos.x - region.x,
        y: pos.y - region.y
      });
    }
    
    const totalDistance = positions.reduce((sum, pos, i) => {
      if (i === 0) return 0;
      const prev = positions[i - 1];
      return sum + Math.sqrt(Math.pow(pos.x - prev.x, 2) + Math.pow(pos.y - prev.y, 2));
    }, 0);
    
    const isMovingFast = totalDistance > 5;
    
    if (isMovingFast) {
      for (let i = 0; i < samples - 1; i++) {
        const alpha = (i + 1) / samples * 0.15;
        const scale = 0.8 + (i / samples) * 0.2;
        this.drawCursor(ctx, positions[i].x, positions[i].y, alpha, scale);
      }
    }
    
    const finalPos = positions[positions.length - 1];
    this.drawCursor(ctx, finalPos.x, finalPos.y, 1.0, 1.0);
    
    return finalPos;
  }

  drawClickRipple(ctx, x, y, progress) {
    const maxRadius = 40;
    const radius = maxRadius * progress;
    const alpha = 1 - progress;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 220, 0, ${alpha * 0.8})`;
    ctx.lineWidth = 3 * (1 - progress * 0.5);
    ctx.stroke();
    ctx.restore();
  }

  async generate(outputPath) {
    const session = this.getSessionInfo();
    const duration = session.duration || 0;
    const region = this.getRegion();
    const events = this.getEvents();
    const moves = events.filter(e => e.type === 'move' || e.type === 'click');
    const clicks = events.filter(e => e.type === 'click');
    const videoStartOffset = this.getVideoStartOffset();

    if (moves.length === 0) {
      throw new Error('No mouse events to render');
    }

    const videoDuration = duration - videoStartOffset;
    const totalFrames = Math.ceil((videoDuration / 1000) * this.fps);
    const frameInterval = 1000 / this.fps;

    console.log(`[CursorVideoGenerator] Generating ${totalFrames} frames at ${this.fps}fps`);
    console.log(`[CursorVideoGenerator] Video size: ${this.width}x${this.height}, duration: ${(videoDuration/1000).toFixed(2)}s`);

    const canvas = createCanvas(this.width, this.height);
    const ctx = canvas.getContext('2d');

    const movPath = outputPath.replace('.webm', '.mov');
    
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-f', 'rawvideo',
        '-pix_fmt', 'rgba',
        '-s', `${this.width}x${this.height}`,
        '-r', String(this.fps),
        '-i', 'pipe:0',
        '-c:v', 'qtrle',
        movPath
      ]);

      ffmpeg.stderr.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('frame=')) {
          process.stdout.write(`\r[CursorVideoGenerator] ${msg.trim().split('\n').pop()}`);
        }
      });

      ffmpeg.on('error', reject);
      ffmpeg.on('close', (code) => {
        console.log('');
        if (code === 0) {
          console.log(`[CursorVideoGenerator] Done: ${movPath}`);
          resolve(movPath);
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      let frameCount = 0;
      let lastProgressReport = 0;
      
      const writeNextFrame = () => {
        if (frameCount >= totalFrames) {
          ffmpeg.stdin.end();
          return;
        }

        const frameTimeMs = frameCount * frameInterval;
        const eventTimeMs = frameTimeMs;
        
        ctx.clearRect(0, 0, this.width, this.height);

        const clickState = this.isClickActive(eventTimeMs, clicks);
        if (clickState.active) {
          const clickX = clickState.x - region.x;
          const clickY = clickState.y - region.y;
          this.drawClickRipple(ctx, clickX, clickY, clickState.progress);
        }

        this.drawSimpleCursor(ctx, moves, region, eventTimeMs);

        const buffer = canvas.toBuffer('raw');
        const canWrite = ffmpeg.stdin.write(buffer);
        
        frameCount++;

        const progressPercent = Math.floor((frameCount / totalFrames) * 100);
        if (this.onProgress && progressPercent !== lastProgressReport) {
          lastProgressReport = progressPercent;
          this.onProgress(progressPercent);
        }

        if (canWrite) {
          setImmediate(writeNextFrame);
        } else {
          ffmpeg.stdin.once('drain', writeNextFrame);
        }
      };

      writeNextFrame();
    });
  }
}

module.exports = CursorVideoGenerator;
