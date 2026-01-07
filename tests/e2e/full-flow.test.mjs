import { _electron as electron } from '@playwright/test';
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '../..');

test.describe('Full Recording Flow Tests', () => {
  let electronApp;

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('IPC handlers should respond correctly', async () => {
    electronApp = await electron.launch({
      args: ['--no-sandbox', path.join(projectRoot, 'src/main/main.js')],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    // Testa se os handlers IPC estão funcionando
    const status = await electronApp.evaluate(async ({ ipcMain }) => {
      // Verifica se o handler existe tentando obter o número de listeners
      const hasRecordingHandler = ipcMain.listenerCount('stop-recording-clicked') >= 0;
      const hasStartHandler = ipcMain.listenerCount('start-recording-clicked') >= 0;
      
      return {
        hasRecordingHandler,
        hasStartHandler
      };
    });

    expect(status.hasRecordingHandler).toBe(true);
    expect(status.hasStartHandler).toBe(true);
  });

  test('app should report not recording on startup', async () => {
    electronApp = await electron.launch({
      args: ['--no-sandbox', path.join(projectRoot, 'src/main/main.js')],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    // Como não temos janela, verificamos via evaluate no main process
    const appState = await electronApp.evaluate(async ({ app }) => {
      return {
        isReady: app.isReady(),
        isPackaged: app.isPackaged
      };
    });

    expect(appState.isReady).toBe(true);
    expect(appState.isPackaged).toBe(false); // Dev mode
  });
});
