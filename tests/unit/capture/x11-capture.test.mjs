import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const X11Capture = require('../../../src/main/capture/x11-capture')
const { RegionOutOfBoundsError } = require('../../../src/main/capture/x11-capture')

describe('X11Capture', () => {
  describe('validateAndClampRegion()', () => {
    const screenBounds = { width: 1920, height: 1080 }

    describe('valid regions - no clamping needed', () => {
      it('should return region unchanged when fully inside screen', () => {
        const region = { x: 100, y: 100, width: 800, height: 600 }
        
        const result = X11Capture.validateAndClampRegion(region, screenBounds)
        
        expect(result.x).toBe(100)
        expect(result.y).toBe(100)
        expect(result.width).toBe(800)
        expect(result.height).toBe(600)
        expect(result.wasClamped).toBe(false)
      })

      it('should return region at origin unchanged', () => {
        const region = { x: 0, y: 0, width: 1920, height: 1080 }
        
        const result = X11Capture.validateAndClampRegion(region, screenBounds)
        
        expect(result.x).toBe(0)
        expect(result.y).toBe(0)
        expect(result.width).toBe(1920)
        expect(result.height).toBe(1080)
        expect(result.wasClamped).toBe(false)
      })
    })

    describe('clamping width/height overflow', () => {
      it('should clamp width when region exceeds right edge', () => {
        const region = { x: 1800, y: 100, width: 200, height: 600 }
        
        const result = X11Capture.validateAndClampRegion(region, screenBounds)
        
        expect(result.x).toBe(1800)
        expect(result.width).toBe(120)
        expect(result.wasClamped).toBe(true)
      })

      it('should clamp height when region exceeds bottom edge', () => {
        const region = { x: 100, y: 900, width: 800, height: 300 }
        
        const result = X11Capture.validateAndClampRegion(region, screenBounds)
        
        expect(result.y).toBe(900)
        expect(result.height).toBe(180)
        expect(result.wasClamped).toBe(true)
      })

      it('should clamp both width and height when exceeding both edges', () => {
        const region = { x: 1800, y: 1000, width: 200, height: 200 }
        
        const result = X11Capture.validateAndClampRegion(region, screenBounds)
        
        expect(result.width).toBe(120)
        expect(result.height).toBe(80)
        expect(result.wasClamped).toBe(true)
      })
    })

    describe('clamping negative coordinates', () => {
      it('should clamp negative x to 0 and reduce width', () => {
        const region = { x: -50, y: 100, width: 200, height: 600 }
        
        const result = X11Capture.validateAndClampRegion(region, screenBounds)
        
        expect(result.x).toBe(0)
        expect(result.width).toBe(150)
        expect(result.wasClamped).toBe(true)
      })

      it('should clamp negative y to 0 and reduce height', () => {
        const region = { x: 100, y: -30, width: 800, height: 600 }
        
        const result = X11Capture.validateAndClampRegion(region, screenBounds)
        
        expect(result.y).toBe(0)
        expect(result.height).toBe(570)
        expect(result.wasClamped).toBe(true)
      })
    })

    describe('even dimension enforcement', () => {
      it('should make odd width even by subtracting 1', () => {
        const region = { x: 0, y: 0, width: 801, height: 600 }
        
        const result = X11Capture.validateAndClampRegion(region, screenBounds)
        
        expect(result.width).toBe(800)
      })

      it('should make odd height even by subtracting 1', () => {
        const region = { x: 0, y: 0, width: 800, height: 601 }
        
        const result = X11Capture.validateAndClampRegion(region, screenBounds)
        
        expect(result.height).toBe(600)
      })

      it('should make clamped odd dimensions even', () => {
        const region = { x: 1800, y: 1000, width: 200, height: 200 }
        
        const result = X11Capture.validateAndClampRegion(region, screenBounds)
        
        expect(result.width % 2).toBe(0)
        expect(result.height % 2).toBe(0)
      })
    })

    describe('error cases - RegionOutOfBoundsError', () => {
      it('should throw when region starts beyond screen width', () => {
        const region = { x: 2000, y: 100, width: 200, height: 200 }
        
        expect(() => {
          X11Capture.validateAndClampRegion(region, screenBounds)
        }).toThrow(RegionOutOfBoundsError)
      })

      it('should throw when region starts beyond screen height', () => {
        const region = { x: 100, y: 1200, width: 200, height: 200 }
        
        expect(() => {
          X11Capture.validateAndClampRegion(region, screenBounds)
        }).toThrow(RegionOutOfBoundsError)
      })

      it('should throw when region ends before screen starts (negative)', () => {
        const region = { x: -300, y: -300, width: 100, height: 100 }
        
        expect(() => {
          X11Capture.validateAndClampRegion(region, screenBounds)
        }).toThrow(RegionOutOfBoundsError)
      })

      it('should throw when region or screenBounds is null', () => {
        expect(() => {
          X11Capture.validateAndClampRegion(null, screenBounds)
        }).toThrow(RegionOutOfBoundsError)

        expect(() => {
          X11Capture.validateAndClampRegion({ x: 0, y: 0, width: 100, height: 100 }, null)
        }).toThrow(RegionOutOfBoundsError)
      })

      it('should include details in error', () => {
        const region = { x: 2000, y: 100, width: 200, height: 200 }
        
        try {
          X11Capture.validateAndClampRegion(region, screenBounds)
          expect.fail('Should have thrown')
        } catch (error) {
          expect(error.details).toBeDefined()
          expect(error.details.region).toEqual(region)
          expect(error.details.screenBounds).toEqual(screenBounds)
        }
      })
    })

    describe('edge case - real bug scenario from logs', () => {
      it('should handle the exact scenario from user logs: 1362x724 at 5,11 on 1366x768 screen', () => {
        const screenBounds = { width: 1366, height: 768 }
        const region = { x: 5, y: 11, width: 1362, height: 724 }
        
        const result = X11Capture.validateAndClampRegion(region, screenBounds)
        
        expect(result.x + result.width).toBeLessThanOrEqual(screenBounds.width)
        expect(result.y + result.height).toBeLessThanOrEqual(screenBounds.height)
        expect(result.width % 2).toBe(0)
        expect(result.height % 2).toBe(0)
      })

      it('should clamp region that overflows by 1 pixel', () => {
        const screenBounds = { width: 1366, height: 768 }
        const region = { x: 5, y: 11, width: 1362, height: 758 }
        
        const result = X11Capture.validateAndClampRegion(region, screenBounds)
        
        expect(result.x + result.width).toBeLessThanOrEqual(1366)
        expect(result.y + result.height).toBeLessThanOrEqual(768)
        expect(result.wasClamped).toBe(true)
      })
    })
  })
})
