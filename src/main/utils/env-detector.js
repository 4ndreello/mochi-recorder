const { execSync } = require('child_process');

async function detectEnvironment() {
  try {
    // Check XDG_SESSION_TYPE environment variable
    const sessionType = process.env.XDG_SESSION_TYPE;
    
    if (sessionType === 'wayland') {
      return 'wayland';
    } else if (sessionType === 'x11') {
      return 'x11';
    }

    // Fallback: try to detect via loginctl
    try {
      const output = execSync('loginctl show-session $(loginctl | grep $(whoami) | awk \'{print $1}\') -p Type', { 
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      
      if (output.includes('wayland')) {
        return 'wayland';
      } else if (output.includes('x11')) {
        return 'x11';
      }
    } catch (e) {
      // Ignore error
    }

    // Final fallback: assume X11 (most common)
    return 'x11';
  } catch (error) {
    console.warn('Error detecting environment, assuming X11:', error);
    return 'x11';
  }
}

function detectAudioBackend(ffmpegPath) {
  if (!ffmpegPath) return 'pulse'; // Default to pulse if path unknown

  // Get FFmpeg formats once and reuse for all checks
  let formats = '';
  try {
    formats = execSync(`"${ffmpegPath}" -formats 2>&1`, { encoding: 'utf-8', timeout: 5000 });
  } catch (e) {
    console.warn('[EnvDetector] Error checking FFmpeg formats:', e.message);
    return null;
  }

  const hasPulse = formats.includes('pulse');
  const hasAlsa = formats.includes('alsa');

  // 1. Try PulseAudio first (preferred)
  if (hasPulse) {
    try {
      execSync('pactl info', { stdio: 'ignore', timeout: 2000 });
      console.log('[EnvDetector] Audio backend: pulse (supported by FFmpeg and running)');
      return 'pulse';
    } catch (e) {
      console.log('[EnvDetector] PulseAudio not running, checking alsa fallback');
    }
  }

  // 2. Fallback to ALSA
  if (hasAlsa) {
    console.log('[EnvDetector] Audio backend: alsa');
    return 'alsa';
  }

  console.warn('[EnvDetector] No suitable audio backend found in FFmpeg');
  return null;
}

function getSystemAudioMonitor() {
  try {
    const defaultSink = execSync('pactl get-default-sink', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    
    if (defaultSink) {
      return `${defaultSink}.monitor`;
    }
  } catch (e) {
    // pactl get-default-sink not available in older versions
  }

  try {
    const output = execSync('pactl list sources short', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    
    const lines = output.trim().split('\n');
    for (const line of lines) {
      if (line.includes('.monitor') && !line.includes('SUSPENDED')) {
        const parts = line.split('\t');
        if (parts[1]) {
          return parts[1];
        }
      }
    }
    
    for (const line of lines) {
      if (line.includes('.monitor')) {
        const parts = line.split('\t');
        if (parts[1]) {
          return parts[1];
        }
      }
    }
  } catch (e) {
    console.warn('Error detecting audio monitor:', e);
  }
  
  return 'default';
}

function getSystemAudioMonitorALSA() {
  // ALSA doesn't have a direct equivalent to Pulse's monitor
  // 'default' usually works or it might need a loopback device
  return 'default';
}

function getSystemMicrophone() {
  // Try to get default microphone via pactl
  try {
    const defaultSource = execSync('pactl get-default-source', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    
    // Check if it's not a monitor (we want real input, not loopback)
    if (defaultSource && !defaultSource.includes('.monitor')) {
      return defaultSource;
    }
  } catch (e) {
    // pactl get-default-source not available in older versions
  }

  // Fallback: list sources and find one that's not a monitor
  try {
    const output = execSync('pactl list sources short', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    
    const lines = output.trim().split('\n');
    
    // First, look for active sources that are not monitors
    for (const line of lines) {
      if (!line.includes('.monitor') && !line.includes('SUSPENDED')) {
        const parts = line.split('\t');
        if (parts[1]) {
          return parts[1];
        }
      }
    }
    
    // Fallback: any source that's not a monitor
    for (const line of lines) {
      if (!line.includes('.monitor')) {
        const parts = line.split('\t');
        if (parts[1]) {
          return parts[1];
        }
      }
    }
  } catch (e) {
    console.warn('Error detecting microphone:', e);
  }
  
  return null; // Return null if microphone not found
}

function getSystemMicrophoneALSA() {
  try {
    const output = execSync('arecord -L 2>/dev/null | head -20', { encoding: 'utf-8' });
    if (output.includes('default')) return 'default';
    
    const match = output.match(/hw:\d+,\d+/);
    if (match) return match[0];
  } catch (e) {}
  return 'default';
}

module.exports = { 
  detectEnvironment, 
  detectAudioBackend,
  getSystemAudioMonitor, 
  getSystemAudioMonitorALSA,
  getSystemMicrophone,
  getSystemMicrophoneALSA
};
