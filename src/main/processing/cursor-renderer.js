class CursorRenderer {
  constructor(metadata, videoWidth, videoHeight) {
    this.metadata = metadata;
    this.videoWidth = videoWidth;
    this.videoHeight = videoHeight;
    this.cursorSize = 24;
    this.smoothingFactor = 0.3;
  }

  getEvents() {
    if (this.metadata.version === 2) {
      return this.metadata.events || [];
    }
    return this.metadata.events || [];
  }

  getSessionInfo() {
    if (this.metadata.version === 2) {
      return this.metadata.session || {};
    }
    return {
      width: this.videoWidth,
      height: this.videoHeight,
      duration: this.metadata.duration
    };
  }

  smoothPath(events) {
    if (events.length < 2) return events;

    const smoothed = [];
    let prevX = events[0].x;
    let prevY = events[0].y;

    for (const event of events) {
      const targetX = event.x;
      const targetY = event.y;
      
      const smoothX = prevX + (targetX - prevX) * this.smoothingFactor;
      const smoothY = prevY + (targetY - prevY) * this.smoothingFactor;
      
      smoothed.push({
        t: event.t,
        type: event.type,
        x: Math.round(smoothX),
        y: Math.round(smoothY),
        button: event.button
      });
      
      prevX = smoothX;
      prevY = smoothY;
    }

    return smoothed;
  }

  interpolateToFps(events, targetFps = 60) {
    if (events.length < 2) return events;

    const session = this.getSessionInfo();
    const duration = session.duration || 0;
    const frameInterval = 1000 / targetFps;
    const interpolated = [];

    let eventIndex = 0;
    
    for (let t = 0; t < duration; t += frameInterval) {
      while (eventIndex < events.length - 1 && events[eventIndex + 1].t <= t) {
        eventIndex++;
      }

      const current = events[eventIndex];
      const next = events[eventIndex + 1] || current;

      if (current === next || current.t === next.t) {
        interpolated.push({ t, x: current.x, y: current.y });
        continue;
      }

      const progress = (t - current.t) / (next.t - current.t);
      const eased = this.easeOutQuad(Math.max(0, Math.min(1, progress)));

      interpolated.push({
        t,
        x: Math.round(current.x + (next.x - current.x) * eased),
        y: Math.round(current.y + (next.y - current.y) * eased)
      });
    }

    return interpolated;
  }

  easeOutQuad(t) {
    return 1 - (1 - t) * (1 - t);
  }

  generateCursorTrack() {
    const events = this.getEvents();
    const relevantEvents = events.filter(e => e.type === 'move' || e.type === 'click');
    
    if (relevantEvents.length === 0) return [];

    const smoothed = this.smoothPath(relevantEvents);
    return this.interpolateToFps(smoothed, 60);
  }

  buildCursorFilter(region = { x: 0, y: 0 }) {
    const events = this.getEvents();
    const moves = events.filter(e => e.type === 'move');
    if (moves.length === 0) return null;

    const keyframes = this.sampleKeyframes(moves, 15);
    const size = this.cursorSize;
    
    const lastKf = keyframes[keyframes.length - 1];
    let xExpr = String(Math.max(0, lastKf.x - region.x));
    let yExpr = String(Math.max(0, lastKf.y - region.y));

    for (let i = keyframes.length - 2; i >= 0; i--) {
      const kf = keyframes[i];
      const nextKf = keyframes[i + 1];
      const tSec = (nextKf.t / 1000).toFixed(2);
      
      const adjX = Math.max(0, kf.x - region.x);
      const adjY = Math.max(0, kf.y - region.y);
      
      xExpr = `if(lt(t,${tSec}),${adjX},${xExpr})`;
      yExpr = `if(lt(t,${tSec}),${adjY},${yExpr})`;
    }

    return `drawbox=x='${xExpr}':y='${yExpr}':w=${size}:h=${size}:color=white@0.9:t=fill`;
  }

  sampleKeyframes(track, maxKeyframes) {
    if (track.length <= maxKeyframes) return track;
    
    const step = Math.ceil(track.length / maxKeyframes);
    const sampled = [];
    
    for (let i = 0; i < track.length; i += step) {
      sampled.push(track[i]);
    }
    
    if (sampled[sampled.length - 1] !== track[track.length - 1]) {
      sampled.push(track[track.length - 1]);
    }
    
    return sampled;
  }

  getClickEvents() {
    const events = this.getEvents();
    const session = this.getSessionInfo();
    const region = session.region || { x: 0, y: 0 };
    
    return events.filter(e => e.type === 'click').map(click => ({
      t: click.t / 1000,
      x: click.x - region.x,
      y: click.y - region.y,
      button: click.button || 1
    }));
  }

  buildClickEffectFilter() {
    const clicks = this.getClickEvents();
    if (clicks.length === 0) return null;

    const filters = clicks.map(click => {
      const startT = click.t.toFixed(3);
      const endT = (click.t + 0.3).toFixed(3);
      const radius = 30;
      
      return `drawbox=x=${click.x - radius}:y=${click.y - radius}:w=${radius * 2}:h=${radius * 2}:color=yellow@0.5:t=3:enable='between(t,${startT},${endT})'`;
    });

    return filters.join(',');
  }
}

module.exports = CursorRenderer;
