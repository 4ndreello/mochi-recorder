import { describe, it, expect } from 'vitest'

describe('env-detector', () => {
  describe('detectAudioBackend() - edge cases', () => {
    it('should return pulse as default if ffmpegPath is null', async () => {
      const { detectAudioBackend } = await import('../../../src/main/utils/env-detector.js')
      const result = detectAudioBackend(null)
      expect(result).toBe('pulse')
    })

    it('should return pulse as default if ffmpegPath is undefined', async () => {
      const { detectAudioBackend } = await import('../../../src/main/utils/env-detector.js')
      const result = detectAudioBackend(undefined)
      expect(result).toBe('pulse')
    })

    it('should return pulse as default if ffmpegPath is empty string', async () => {
      const { detectAudioBackend } = await import('../../../src/main/utils/env-detector.js')
      const result = detectAudioBackend('')
      expect(result).toBe('pulse')
    })
  })

  describe('getSystemAudioMonitorALSA()', () => {
    it('should return default', async () => {
      const { getSystemAudioMonitorALSA } = await import('../../../src/main/utils/env-detector.js')
      const result = getSystemAudioMonitorALSA()
      expect(result).toBe('default')
    })
  })

  describe('getSystemMicrophoneALSA()', () => {
    it('should return a string value', async () => {
      const { getSystemMicrophoneALSA } = await import('../../../src/main/utils/env-detector.js')
      const result = getSystemMicrophoneALSA()
      expect(typeof result).toBe('string')
    })
  })
})
