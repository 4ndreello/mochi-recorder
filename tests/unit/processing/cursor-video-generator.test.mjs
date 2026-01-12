import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

vi.mock('canvas', () => ({
  createCanvas: vi.fn(() => ({
    getContext: vi.fn(() => ({})),
    toBuffer: vi.fn(() => Buffer.alloc(0))
  })),
  loadImage: vi.fn(() => Promise.resolve({}))
}))

vi.mock('fs', () => ({
  readFileSync: vi.fn(() => '<svg></svg>'),
  existsSync: vi.fn(() => true)
}))

vi.mock('../../../src/main/utils/binary-resolver', () => ({
  getFFmpegPath: vi.fn(() => '/usr/bin/ffmpeg')
}))

const CursorVideoGenerator = require('../../../src/main/processing/cursor-video-generator')

describe('CursorVideoGenerator', () => {
  let generator

  beforeEach(() => {
    generator = new CursorVideoGenerator({ events: [], session: { duration: 1000 } }, 1920, 1080)
  })

  describe('isHoldActive()', () => {
    it('should return inactive when no mousedowns exist', () => {
      const result = generator.isHoldActive(500, [], [])
      expect(result.active).toBe(false)
    })

    it('should return inactive when mousedown is after current time', () => {
      const mousedowns = [{ t: 600, x: 100, y: 100 }]
      const result = generator.isHoldActive(500, mousedowns, [])
      expect(result.active).toBe(false)
    })

    it('should return active when button is held (mousedown before, no mouseup)', () => {
      const mousedowns = [{ t: 200, x: 100, y: 100 }]
      const mouseups = []
      const result = generator.isHoldActive(500, mousedowns, mouseups)
      
      expect(result.active).toBe(true)
      expect(result.startTime).toBe(200)
      expect(result.duration).toBe(300)
      expect(result.x).toBe(100)
      expect(result.y).toBe(100)
    })

    it('should return inactive when button was released before current time', () => {
      const mousedowns = [{ t: 200, x: 100, y: 100 }]
      const mouseups = [{ t: 400, x: 100, y: 100 }]
      const result = generator.isHoldActive(500, mousedowns, mouseups)
      
      expect(result.active).toBe(false)
    })

    it('should return active when mouseup is after current time', () => {
      const mousedowns = [{ t: 200, x: 100, y: 100 }]
      const mouseups = [{ t: 600, x: 100, y: 100 }]
      const result = generator.isHoldActive(500, mousedowns, mouseups)
      
      expect(result.active).toBe(true)
      expect(result.duration).toBe(300)
    })

    it('should handle multiple click cycles correctly', () => {
      const mousedowns = [
        { t: 100, x: 50, y: 50 },
        { t: 400, x: 200, y: 200 }
      ]
      const mouseups = [
        { t: 200, x: 50, y: 50 },
        { t: 600, x: 200, y: 200 }
      ]

      const result1 = generator.isHoldActive(150, mousedowns, mouseups)
      expect(result1.active).toBe(true)
      expect(result1.x).toBe(50)

      const result2 = generator.isHoldActive(300, mousedowns, mouseups)
      expect(result2.active).toBe(false)

      const result3 = generator.isHoldActive(500, mousedowns, mouseups)
      expect(result3.active).toBe(true)
      expect(result3.x).toBe(200)
    })
  })
})
