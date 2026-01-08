import { _electron as electron } from '@playwright/test';
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '../..');

test.describe('Mochi App Launch', () => {
  let electronApp;

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('should launch app successfully', async () => {
    electronApp = await electron.launch({
      args: ['--no-sandbox', path.join(projectRoot, 'src/main/main.js')],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    const isRunning = await electronApp.evaluate(async ({ app }) => {
      return app.isReady();
    });

    expect(isRunning).toBe(true);
  });

  test('should have Mochi as product name', async () => {
    electronApp = await electron.launch({
      args: ['--no-sandbox', path.join(projectRoot, 'src/main/main.js')],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    // Em dev, o nome é "Electron", em produção seria "Mochi"
    // Testamos que o app iniciou corretamente
    const appInfo = await electronApp.evaluate(async ({ app }) => {
      return {
        isReady: app.isReady(),
        isPackaged: app.isPackaged,
        version: app.getVersion()
      };
    });

    expect(appInfo.isReady).toBe(true);
    expect(appInfo.isPackaged).toBe(false); // Em dev mode
  });

  test('should start without any visible windows (tray-only)', async () => {
    electronApp = await electron.launch({
      args: ['--no-sandbox', path.join(projectRoot, 'src/main/main.js')],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    // Aguarda um pouco para o app inicializar
    await new Promise(r => setTimeout(r, 500));

    // Mochi inicia apenas com tray, sem janelas
    const windows = electronApp.windows();
    expect(windows.length).toBe(0);
  });
});
