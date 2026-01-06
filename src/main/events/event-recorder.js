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
      relativeTime, // Tempo relativo ao início da gravação em ms
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
      console.log(`Metadata salva em: ${this.metadataPath}`);
      return metadata;
    } catch (error) {
      console.error('Erro ao salvar metadata:', error);
      throw error;
    }
  }

  getEvents() {
    return this.events;
  }
}

module.exports = EventRecorder;

