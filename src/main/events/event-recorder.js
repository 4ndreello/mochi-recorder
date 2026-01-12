const fs = require('fs').promises;

class EventRecorder {
  constructor(metadataPath) {
    this.metadataPath = metadataPath;
    this.events = [];
    this.startTime = Date.now();
    this.videoStartOffset = 0;
    this.session = {
      width: 1920,
      height: 1080,
      fps: 30,
      region: null
    };
  }

  setSession({ width, height, fps, region }) {
    if (width) this.session.width = width;
    if (height) this.session.height = height;
    if (fps) this.session.fps = fps;
    if (region) this.session.region = region;
  }

  setVideoStartOffset(offsetMs) {
    this.videoStartOffset = offsetMs;
    console.log(`[EventRecorder] Video start offset set to ${offsetMs}ms`);
  }

  record(event, relativeTime) {
    this.events.push({
      t: relativeTime,
      type: event.type,
      x: event.x,
      y: event.y,
      button: event.button
    });
  }

  async finish() {
    const adjustedEvents = this.events
      .map(e => ({ ...e, t: e.t - this.videoStartOffset }))
      .filter(e => e.t >= 0);

    const metadata = {
      version: 2,
      session: {
        ...this.session,
        startTime: this.startTime,
        endTime: Date.now(),
        duration: Date.now() - this.startTime - this.videoStartOffset,
        videoStartOffset: this.videoStartOffset
      },
      stats: {
        eventCount: adjustedEvents.length,
        mousedowns: adjustedEvents.filter(e => e.type === 'mousedown').length,
        mouseups: adjustedEvents.filter(e => e.type === 'mouseup').length,
        drags: adjustedEvents.filter(e => e.type === 'drag').length,
        moves: adjustedEvents.filter(e => e.type === 'move').length
      },
      events: adjustedEvents
    };

    try {
      await fs.writeFile(
        this.metadataPath,
        JSON.stringify(metadata),
        'utf-8'
      );
      console.log(`[EventRecorder] Metadata saved: ${adjustedEvents.length} events`);
      return metadata;
    } catch (error) {
      console.error('[EventRecorder] Error saving metadata:', error);
      throw error;
    }
  }

  getEvents() {
    return this.events;
  }
}

module.exports = EventRecorder;

