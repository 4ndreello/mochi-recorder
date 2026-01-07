import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const ZoomAnalyzer = require('../../../src/main/processing/zoom-analyzer')

describe('ZoomAnalyzer', () => {
  const screenWidth = 1920
  const screenHeight = 1080

  describe('analyze()', () => {
    it('should return empty array when no click events', () => {
      const metadata = { events: [] }
      const analyzer = new ZoomAnalyzer(metadata, screenWidth, screenHeight)
      
      const regions = analyzer.analyze()
      
      expect(regions).toEqual([])
    })

    it('should create zoom region for a single click', () => {
      const metadata = {
        events: [
          { type: 'click', x: 500, y: 400, relativeTime: 1000 }
        ]
      }
      const analyzer = new ZoomAnalyzer(metadata, screenWidth, screenHeight)
      
      const regions = analyzer.analyze()
      
      expect(regions).toHaveLength(1)
      expect(regions[0]).toMatchObject({
        startTime: 1,
        duration: 2,
        endTime: 3,
        clickX: 500,
        clickY: 400,
        zoomFactor: 2.0,
        width: 400,
        height: 300
      })
    })

    it('should filter only click events from metadata', () => {
      const metadata = {
        events: [
          { type: 'move', x: 100, y: 100, relativeTime: 500 },
          { type: 'click', x: 500, y: 400, relativeTime: 1000 },
          { type: 'scroll', x: 200, y: 200, relativeTime: 1500 }
        ]
      }
      const analyzer = new ZoomAnalyzer(metadata, screenWidth, screenHeight)
      
      const regions = analyzer.analyze()
      
      expect(regions).toHaveLength(1)
      expect(regions[0].clickX).toBe(500)
    })

    it('should handle multiple clicks', () => {
      const metadata = {
        events: [
          { type: 'click', x: 100, y: 100, relativeTime: 1000 },
          { type: 'click', x: 800, y: 600, relativeTime: 5000 },
          { type: 'click', x: 1500, y: 900, relativeTime: 10000 }
        ]
      }
      const analyzer = new ZoomAnalyzer(metadata, screenWidth, screenHeight)
      
      const regions = analyzer.analyze()
      
      expect(regions).toHaveLength(3)
      expect(regions[0].startTime).toBe(1)
      expect(regions[1].startTime).toBe(5)
      expect(regions[2].startTime).toBe(10)
    })
  })

  describe('edge cases - screen boundaries', () => {
    it('should clamp zoom region to left edge when click is near left', () => {
      const metadata = {
        events: [
          { type: 'click', x: 50, y: 500, relativeTime: 1000 }
        ]
      }
      const analyzer = new ZoomAnalyzer(metadata, screenWidth, screenHeight)
      
      const regions = analyzer.analyze()
      
      expect(regions[0].x).toBe(0)
    })

    it('should clamp zoom region to top edge when click is near top', () => {
      const metadata = {
        events: [
          { type: 'click', x: 500, y: 50, relativeTime: 1000 }
        ]
      }
      const analyzer = new ZoomAnalyzer(metadata, screenWidth, screenHeight)
      
      const regions = analyzer.analyze()
      
      expect(regions[0].y).toBe(0)
    })

    it('should clamp zoom region to right edge when click is near right', () => {
      const metadata = {
        events: [
          { type: 'click', x: 1900, y: 500, relativeTime: 1000 }
        ]
      }
      const analyzer = new ZoomAnalyzer(metadata, screenWidth, screenHeight)
      
      const regions = analyzer.analyze()
      
      expect(regions[0].x + regions[0].width).toBeLessThanOrEqual(screenWidth)
    })

    it('should clamp zoom region to bottom edge when click is near bottom', () => {
      const metadata = {
        events: [
          { type: 'click', x: 500, y: 1050, relativeTime: 1000 }
        ]
      }
      const analyzer = new ZoomAnalyzer(metadata, screenWidth, screenHeight)
      
      const regions = analyzer.analyze()
      
      expect(regions[0].y + regions[0].height).toBeLessThanOrEqual(screenHeight)
    })

    it('should handle click at corner (0,0)', () => {
      const metadata = {
        events: [
          { type: 'click', x: 0, y: 0, relativeTime: 1000 }
        ]
      }
      const analyzer = new ZoomAnalyzer(metadata, screenWidth, screenHeight)
      
      const regions = analyzer.analyze()
      
      expect(regions[0].x).toBe(0)
      expect(regions[0].y).toBe(0)
    })

    it('should handle click at bottom-right corner', () => {
      const metadata = {
        events: [
          { type: 'click', x: screenWidth, y: screenHeight, relativeTime: 1000 }
        ]
      }
      const analyzer = new ZoomAnalyzer(metadata, screenWidth, screenHeight)
      
      const regions = analyzer.analyze()
      
      expect(regions[0].x + regions[0].width).toBeLessThanOrEqual(screenWidth)
      expect(regions[0].y + regions[0].height).toBeLessThanOrEqual(screenHeight)
    })
  })

  describe('getZoomRegions()', () => {
    it('should return empty before analyze is called', () => {
      const metadata = { events: [{ type: 'click', x: 100, y: 100, relativeTime: 1000 }] }
      const analyzer = new ZoomAnalyzer(metadata, screenWidth, screenHeight)
      
      expect(analyzer.getZoomRegions()).toEqual([])
    })

    it('should return regions after analyze is called', () => {
      const metadata = { events: [{ type: 'click', x: 100, y: 100, relativeTime: 1000 }] }
      const analyzer = new ZoomAnalyzer(metadata, screenWidth, screenHeight)
      
      analyzer.analyze()
      
      expect(analyzer.getZoomRegions()).toHaveLength(1)
    })
  })

  describe('generateFFmpegFilters()', () => {
    it('should return null when no zoom regions', () => {
      const metadata = { events: [] }
      const analyzer = new ZoomAnalyzer(metadata, screenWidth, screenHeight)
      analyzer.analyze()
      
      const filters = analyzer.generateFFmpegFilters()
      
      expect(filters).toBeNull()
    })

    it('should generate filter string when zoom regions exist', () => {
      const metadata = {
        events: [
          { type: 'click', x: 500, y: 400, relativeTime: 1000 }
        ]
      }
      const analyzer = new ZoomAnalyzer(metadata, screenWidth, screenHeight)
      analyzer.analyze()
      
      const filters = analyzer.generateFFmpegFilters()
      
      expect(filters).toBeTruthy()
      expect(typeof filters).toBe('string')
      expect(filters).toContain('crop=')
      expect(filters).toContain('scale=')
    })
  })

  describe('generateSimpleZoomFilter()', () => {
    it('should include timing information in filter', () => {
      const metadata = {
        events: [
          { type: 'click', x: 500, y: 400, relativeTime: 2000 }
        ]
      }
      const analyzer = new ZoomAnalyzer(metadata, screenWidth, screenHeight)
      analyzer.analyze()
      
      const filter = analyzer.generateSimpleZoomFilter()
      
      expect(filter).toContain('between(t,2,4)')
    })

    it('should generate separate filters for multiple clicks', () => {
      const metadata = {
        events: [
          { type: 'click', x: 500, y: 400, relativeTime: 1000 },
          { type: 'click', x: 800, y: 600, relativeTime: 5000 }
        ]
      }
      const analyzer = new ZoomAnalyzer(metadata, screenWidth, screenHeight)
      analyzer.analyze()
      
      const filter = analyzer.generateSimpleZoomFilter()
      
      expect(filter).toContain('[v0]')
      expect(filter).toContain('[v1]')
      expect(filter).toContain(';')
    })
  })
})
