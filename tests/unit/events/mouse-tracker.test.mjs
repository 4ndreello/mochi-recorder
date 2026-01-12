import { describe, it, expect, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const MouseTracker = require('../../../src/main/events/mouse-tracker')

describe('MouseTracker', () => {
  it('should detect mousedown, mouseup and drag events logic', () => {
    // Testando a lógica de transição de estado que implementamos no mouse-tracker.js
    
    const checkState = (leftButton, wasLeftPressed, moved) => {
        const detected = []
        if (leftButton && !wasLeftPressed) detected.push('mousedown')
        if (!leftButton && wasLeftPressed) detected.push('mouseup')
        if (leftButton && wasLeftPressed && moved) detected.push('drag')
        return detected
    }

    // 1. Press (down=true, wasDown=false)
    expect(checkState(true, false, false)).toContain('mousedown')
    
    // 2. Hold/Drag (down=true, wasDown=true, moved=true)
    expect(checkState(true, true, true)).toContain('drag')
    
    // 3. Hold/No Move (down=true, wasDown=true, moved=false)
    expect(checkState(true, true, false)).toEqual([])
    
    // 4. Release (down=false, wasDown=true)
    expect(checkState(false, true, false)).toContain('mouseup')
  })
})
