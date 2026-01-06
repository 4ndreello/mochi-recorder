class ZoomAnalyzer {
  constructor(metadata, screenWidth, screenHeight) {
    this.metadata = metadata;
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    this.zoomRegions = [];
  }

  analyze() {
    // Analisar eventos de clique e criar regiões de zoom
    const clicks = this.metadata.events.filter(e => e.type === 'click');
    
    this.zoomRegions = clicks.map((click, index) => {
      const startTime = click.relativeTime / 1000; // Converter para segundos
      const duration = 2; // 2 segundos de zoom por padrão
      const endTime = startTime + duration;
      
      // Calcular região de zoom (400x300px ao redor do clique)
      const zoomWidth = 400;
      const zoomHeight = 300;
      const zoomFactor = 2.0; // 200% de zoom
      
      // Garantir que a região não saia dos limites da tela
      let x = Math.max(0, Math.min(click.x - zoomWidth / 2, this.screenWidth - zoomWidth));
      let y = Math.max(0, Math.min(click.y - zoomHeight / 2, this.screenHeight - zoomHeight));
      
      // Ajustar se necessário
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

  // Gerar filtros FFmpeg para aplicar zoom
  generateFFmpegFilters() {
    if (this.zoomRegions.length === 0) {
      return null;
    }

    // Criar filtros complexos para aplicar zoom em diferentes momentos
    const filters = [];
    
    // Para cada região de zoom, criar um filtro de crop e scale
    this.zoomRegions.forEach((region, index) => {
      // Usar zoompan para transição suave
      const zoomFilter = `zoompan=z='if(between(t,${region.startTime},${region.endTime}),2,1)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${region.width}x${region.height}`;
      filters.push(zoomFilter);
    });

    // Simplificar: aplicar zoom global quando houver clique
    // Versão mais simples para MVP
    return this.generateSimpleZoomFilter();
  }

  generateSimpleZoomFilter() {
    // Gerar filtro que aplica zoom nos momentos de clique
    let filterComplex = '';
    
    this.zoomRegions.forEach((region, index) => {
      if (index > 0) {
        filterComplex += ';';
      }
      
      // Crop e scale para cada região
      const cropFilter = `crop=${region.width}:${region.height}:${region.x}:${region.y}`;
      const scaleFilter = `scale=${this.screenWidth}:${this.screenHeight}`;
      
      // Usar select e setpts para controlar timing
      filterComplex += `[0:v]select='between(t,${region.startTime},${region.endTime})',${cropFilter},${scaleFilter}[v${index}]`;
    });

    return filterComplex;
  }
}

module.exports = ZoomAnalyzer;

