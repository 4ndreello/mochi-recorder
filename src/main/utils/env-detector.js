const { execSync } = require('child_process');

async function detectEnvironment() {
  try {
    // Verificar variável de ambiente XDG_SESSION_TYPE
    const sessionType = process.env.XDG_SESSION_TYPE;
    
    if (sessionType === 'wayland') {
      return 'wayland';
    } else if (sessionType === 'x11') {
      return 'x11';
    }

    // Fallback: tentar detectar via loginctl
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
      // Ignorar erro
    }

    // Fallback final: assumir X11 (mais comum)
    return 'x11';
  } catch (error) {
    console.warn('Erro ao detectar ambiente, assumindo X11:', error);
    return 'x11';
  }
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
    // pactl get-default-sink não disponível em versões antigas
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
    console.warn('Erro ao detectar monitor de áudio:', e);
  }
  
  return 'default';
}

function getSystemMicrophone() {
  // Tentar obter o microfone padrão via pactl
  try {
    const defaultSource = execSync('pactl get-default-source', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    
    // Verificar se não é um monitor (queremos entrada real, não loopback)
    if (defaultSource && !defaultSource.includes('.monitor')) {
      return defaultSource;
    }
  } catch (e) {
    // pactl get-default-source não disponível em versões antigas
  }

  // Fallback: listar sources e encontrar um que não seja monitor
  try {
    const output = execSync('pactl list sources short', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    
    const lines = output.trim().split('\n');
    
    // Primeiro, procurar por fontes ativas que não são monitors
    for (const line of lines) {
      if (!line.includes('.monitor') && !line.includes('SUSPENDED')) {
        const parts = line.split('\t');
        if (parts[1]) {
          return parts[1];
        }
      }
    }
    
    // Fallback: qualquer fonte que não seja monitor
    for (const line of lines) {
      if (!line.includes('.monitor')) {
        const parts = line.split('\t');
        if (parts[1]) {
          return parts[1];
        }
      }
    }
  } catch (e) {
    console.warn('Erro ao detectar microfone:', e);
  }
  
  return null; // Retornar null se não encontrar microfone
}

module.exports = { detectEnvironment, getSystemAudioMonitor, getSystemMicrophone };

