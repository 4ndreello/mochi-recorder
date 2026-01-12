import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const FFmpegManager = require('../../../src/main/utils/ffmpeg-manager')
const { FFmpegStartupError, FATAL_ERROR_PATTERNS } = require('../../../src/main/utils/ffmpeg-manager')

describe('FFmpegManager', () => {
  describe('detectFatalError()', () => {
    describe('should detect known fatal errors', () => {
      it('should detect "outside the screen size" error', () => {
        const output = '[x11grab @ 0x3027c240] Capture area 1362x724 at position 5.11 outside the screen size 1366x768'
        
        const result = FFmpegManager.detectFatalError(output)
        
        expect(result).toBe('Capture area is outside screen bounds')
      })

      it('should detect "Invalid argument" error', () => {
        const output = 'Error opening input: Invalid argument'
        
        const result = FFmpegManager.detectFatalError(output)
        
        expect(result).toBe('Invalid FFmpeg argument')
      })

      it('should detect "not divisible by 2" error', () => {
        const output = 'width not divisible by 2 (801x600)'
        
        const result = FFmpegManager.detectFatalError(output)
        
        expect(result).toBe('Video dimensions must be even numbers')
      })

      it('should detect "No such file or directory" error', () => {
        const output = '/dev/video0: No such file or directory'
        
        const result = FFmpegManager.detectFatalError(output)
        
        expect(result).toBe('File or device not found')
      })

      it('should detect "Permission denied" error', () => {
        const output = 'Permission denied accessing /dev/dri'
        
        const result = FFmpegManager.detectFatalError(output)
        
        expect(result).toBe('Permission denied')
      })

      it('should detect "Device or resource busy" error', () => {
        const output = 'Device or resource busy'
        
        const result = FFmpegManager.detectFatalError(output)
        
        expect(result).toBe('Device is busy')
      })

      it('should detect "Cannot open display" error', () => {
        const output = 'Cannot open display :0'
        
        const result = FFmpegManager.detectFatalError(output)
        
        expect(result).toBe('Cannot open X11 display')
      })

      it('should detect "Connection refused" error', () => {
        const output = 'Connection refused'
        
        const result = FFmpegManager.detectFatalError(output)
        
        expect(result).toBe('Connection refused')
      })
    })

    describe('should not detect false positives', () => {
      it('should return null for normal progress output', () => {
        const output = 'frame=  100 fps=30 q=23.0 size=    1024kB time=00:00:03.33 bitrate=2516.4kbits/s speed=1.0x'
        
        const result = FFmpegManager.detectFatalError(output)
        
        expect(result).toBeNull()
      })

      it('should return null for FFmpeg version info', () => {
        const output = 'ffmpeg version N-71064-gd5e603ddc0-static https://johnvansickle.com/ffmpeg/'
        
        const result = FFmpegManager.detectFatalError(output)
        
        expect(result).toBeNull()
      })

      it('should return null for codec info', () => {
        const output = 'Stream #0:0: Video: h264 (libx264), yuv420p, 1920x1080, q=2-31, 30 fps'
        
        const result = FFmpegManager.detectFatalError(output)
        
        expect(result).toBeNull()
      })

      it('should return null for empty string', () => {
        const result = FFmpegManager.detectFatalError('')
        
        expect(result).toBeNull()
      })
    })

    describe('case insensitivity', () => {
      it('should detect errors regardless of case', () => {
        const outputs = [
          'OUTSIDE THE SCREEN SIZE',
          'Outside The Screen Size',
          'INVALID ARGUMENT',
          'invalid argument',
        ]

        outputs.forEach(output => {
          const result = FFmpegManager.detectFatalError(output)
          expect(result).not.toBeNull()
        })
      })
    })
  })

  describe('FFmpegStartupError', () => {
    it('should be an instance of Error', () => {
      const error = new FFmpegStartupError('Test error')
      
      expect(error).toBeInstanceOf(Error)
    })

    it('should have correct name property', () => {
      const error = new FFmpegStartupError('Test error')
      
      expect(error.name).toBe('FFmpegStartupError')
    })

    it('should store ffmpegOutput', () => {
      const error = new FFmpegStartupError('Test error', 'some ffmpeg output')
      
      expect(error.ffmpegOutput).toBe('some ffmpeg output')
    })

    it('should have empty ffmpegOutput by default', () => {
      const error = new FFmpegStartupError('Test error')
      
      expect(error.ffmpegOutput).toBe('')
    })
  })

  describe('FATAL_ERROR_PATTERNS', () => {
    it('should export all expected patterns', () => {
      expect(FATAL_ERROR_PATTERNS).toBeDefined()
      expect(Array.isArray(FATAL_ERROR_PATTERNS)).toBe(true)
      expect(FATAL_ERROR_PATTERNS.length).toBeGreaterThan(0)
    })

    it('each pattern should have pattern and message properties', () => {
      FATAL_ERROR_PATTERNS.forEach(({ pattern, message }) => {
        expect(pattern).toBeInstanceOf(RegExp)
        expect(typeof message).toBe('string')
        expect(message.length).toBeGreaterThan(0)
      })
    })
  })

  describe('constructor', () => {
    it('should initialize with default label', () => {
      const manager = new FFmpegManager()
      
      expect(manager.label).toBe('FFmpeg')
      expect(manager.isRunning).toBe(false)
      expect(manager.errorOutput).toBe('')
      expect(manager.process).toBeNull()
    })

    it('should initialize with custom label', () => {
      const manager = new FFmpegManager('Recording')
      
      expect(manager.label).toBe('Recording')
    })
  })

  describe('isActive()', () => {
    it('should return false when not running', () => {
      const manager = new FFmpegManager()
      
      expect(manager.isActive()).toBe(false)
    })
  })

  describe('getErrorOutput()', () => {
    it('should return empty string initially', () => {
      const manager = new FFmpegManager()
      
      expect(manager.getErrorOutput()).toBe('')
    })
  })
})
