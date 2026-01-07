class ZoomAnalyzer {
  constructor(metadata, screenWidth, screenHeight) {
    this.metadata = metadata;
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    this.zoomRegions = [];
  }

  analyze() {
    // Analyze click events and create zoom regions
    const clicks = this.metadata.events.filter(e => e.type === 'click');
    
    this.zoomRegions = clicks.map((click, index) => {
      const startTime = click.relativeTime / 1000; // Convert to seconds
      const duration = 2; // 2 seconds of zoom by default
      const endTime = startTime + duration;
      
      // Calculate zoom region (400x300px around click)
      const zoomWidth = 400;
      const zoomHeight = 300;
      const zoomFactor = 2.0; // 200% de zoom
      
      // Ensure region doesn't go outside screen bounds
      let x = Math.max(0, Math.min(click.x - zoomWidth / 2, this.screenWidth - zoomWidth));
      let y = Math.max(0, Math.min(click.y - zoomHeight / 2, this.screenHeight - zoomHeight));
      
      // Adjust if necessary
      if (x + zoomWidth > this.screenWidth) {
        x = this.screenWidth - zoomWidth;
      }
      if (y + zoomHeight > this.screenHeight) {
        y = this.screenHeight - zoomHeight;
      }

      return {
        startTime,
        endTime,
        duration,
        x: Math.round(x),
        y: Math.round(y),
        width: zoomWidth,
        height: zoomHeight,
        zoomFactor,
        clickX: click.x,
        clickY: click.y
      };
    });

    return this.zoomRegions;
  }

  getZoomRegions() {
    return this.zoomRegions;
  }

  // Generate FFmpeg filters to apply zoom
  generateFFmpegFilters() {
    if (this.zoomRegions.length === 0) {
      return null;
    }

    // Create complex filters to apply zoom at different moments
    const filters = [];
    
    // For each zoom region, create a crop and scale filter
    this.zoomRegions.forEach((region, index) => {
      // Use zoompan for smooth transition
      const zoomFilter = `zoompan=z='if(between(t,${region.startTime},${region.endTime}),2,1)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${region.width}x${region.height}`;
      filters.push(zoomFilter);
    });

    // Simplify: apply global zoom when there's a click
    // Simpler version for MVP
    return this.generateSimpleZoomFilter();
  }

  generateSimpleZoomFilter() {
    // Generate filter that applies zoom at click moments
    let filterComplex = '';
    
    this.zoomRegions.forEach((region, index) => {
      if (index > 0) {
        filterComplex += ';';
      }
      
      // Crop and scale for each region
      const cropFilter = `crop=${region.width}:${region.height}:${region.x}:${region.y}`;
      const scaleFilter = `scale=${this.screenWidth}:${this.screenHeight}`;
      
      // Use select and setpts to control timing
      filterComplex += `[0:v]select='between(t,${region.startTime},${region.endTime})',${cropFilter},${scaleFilter}[v${index}]`;
    });

    return filterComplex;
  }
}

module.exports = ZoomAnalyzer;

