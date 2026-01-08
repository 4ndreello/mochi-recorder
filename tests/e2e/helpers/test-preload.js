// Este script é injetado no main process para expor funções de teste
const { ipcMain, BrowserWindow } = require('electron');

function setupTestHelpers() {
  // Handler para abrir area selector programaticamente
  ipcMain.handle('__test__:open-area-selector', async () => {
    const AreaSelector = require('../../../src/main/ui/area-selector.js');
    const selector = new AreaSelector();
    
    return new Promise((resolve) => {
      selector.create((region) => {
        resolve({ region, closed: false });
      });
      selector.show();
      
      // Armazena referência global para cleanup
      global.__testAreaSelector = selector;
      
      // Resolve após janelas estarem prontas
      setTimeout(() => {
        resolve({ opened: true, windowCount: BrowserWindow.getAllWindows().length });
      }, 500);
    });
  });

  // Handler para abrir recording overlay
  ipcMain.handle('__test__:open-recording-overlay', async (event, region) => {
    const RecordingOverlay = require('../../../src/main/ui/recording-overlay.js');
    const overlay = new RecordingOverlay();
    
    return new Promise((resolve) => {
      overlay.create(region || { x: 100, y: 100, width: 800, height: 600 }, () => {
        resolve({ ready: true });
      });
      overlay.show();
      global.__testOverlay = overlay;
    });
  });

  // Handler para cleanup
  ipcMain.handle('__test__:cleanup', async () => {
    if (global.__testAreaSelector) {
      global.__testAreaSelector.close();
      global.__testAreaSelector = null;
    }
    if (global.__testOverlay) {
      global.__testOverlay.close();
      global.__testOverlay = null;
    }
    return { cleaned: true };
  });

  // Handler para obter contagem de janelas
  ipcMain.handle('__test__:window-count', async () => {
    return BrowserWindow.getAllWindows().length;
  });

  console.log('[TEST] Test helpers initialized');
}

module.exports = { setupTestHelpers };
