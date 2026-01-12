import { describe, it, expect, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// Mock child_process BEFORE requiring env-detector
vi.mock('child_process', () => ({
  execSync: vi.fn()
}))

const { execSync } = require('child_process')
const envDetector = require('../../../src/main/utils/env-detector')

describe('env-detector', () => {
  describe('detectAudioBackend()', () => {
    it('should return pulse if ffmpeg supports pulse and pactl succeeds', () => {
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (cmd.includes('-formats')) return ' D A  pulse           PulseAudio input device'
        if (cmd.includes('pactl info')) return 'Server String: /run/user/1000/pulse/native'
        return ''
      })

      const result = envDetector.detectAudioBackend('/usr/bin/ffmpeg')
      expect(result).toBe('pulse')
    })

    it('should fall back to alsa if pulse is supported but PulseAudio is not running', () => {
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (cmd.includes('-formats')) return ' D A  pulse           PulseAudio input device\n D A  alsa            ALSA audio output'
        if (cmd.includes('pactl info')) throw new Error('Connection refused')
        return ''
      })

      const result = envDetector.detectAudioBackend('/usr/bin/ffmpeg')
      expect(result).toBe('alsa')
    })

    it('should fall back to alsa if pulse is not supported but alsa is', () => {
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (cmd.includes('-formats')) return ' D A  alsa            ALSA audio output'
        return ''
      })

      const result = envDetector.detectAudioBackend('/usr/bin/ffmpeg')
      expect(result).toBe('alsa')
    })

    it('should return null if neither pulse nor alsa are supported', () => {
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (cmd.includes('-formats')) return ' D A  oss             OSS audio output'
        return ''
      })

      const result = envDetector.detectAudioBackend('/usr/bin/ffmpeg')
      expect(result).toBeNull()
    })
  })

  describe('getSystemMicrophoneALSA()', () => {
    it('should return default if present in arecord -L', () => {
      vi.mocked(execSync).mockReturnValue('null\n    Discard all samples (playback) or generate zero samples (capture)\ndefault\n    Default Audio Device')
      
      const result = envDetector.getSystemMicrophoneALSA()
      expect(result).toBe('default')
    })

    it('should return hardware device if default is not present', () => {
      vi.mocked(execSync).mockReturnValue('sysdefault:CARD=PCH\n    HDA Intel PCH, Default Audio Device\nhw:CARD=PCH,DEV=0\n    HDA Intel PCH, ALC269VC Analog\n    Direct hardware device without any conversions')
      
      const result = envDetector.getSystemMicrophoneALSA()
      expect(result).toBe('hw:0,0') // Parses hw:\d+,\d+
    })
  })
})
