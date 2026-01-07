const fs = require('fs').promises;
const path = require('path');

class EventRecorder {
  constructor(metadataPath) {
    this.metadataPath = metadataPath;
    this.events = [];
    this.startTime = Date.now();
  }

  record(event, relativeTime) {
    this.events.push({
      ...event,
      relativeTime, // Time relative to recording start in ms
      absoluteTime: event.timestamp
    });
  }

  async finish() {
    const metadata = {
      startTime: this.startTime,
      endTime: Date.now(),
      duration: Date.now() - this.startTime,
      events: this.events,
      eventCount: this.events.length,
      clicks: this.events.filter(e => e.type === 'click').length
    };

    try {
      await fs.writeFile(
        this.metadataPath,
        JSON.stringify(metadata, null, 2),
        'utf-8'
      );
      console.log(`Metadata saved to: ${this.metadataPath}`);
      return metadata;
    } catch (error) {
      console.error('Error saving metadata:', error);
      throw error;
    }
  }

  getEvents() {
    return this.events;
  }
}

module.exports = EventRecorder;

