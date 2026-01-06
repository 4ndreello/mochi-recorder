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

module.exports = { detectEnvironment };

