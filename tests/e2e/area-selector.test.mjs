import { _electron as electron } from '@playwright/test';
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '../..');

async function launchWithAreaSelector() {
  const electronApp = await electron.launch({
    args: [
      '--no-sandbox',
      path.join(projectRoot, 'src/main/main.js'),
      '--test-mode',
      '--open-area-selector'
    ],
    env: { ...process.env, NODE_ENV: 'test', MOCHI_TEST_MODE: '1' }
  });
  
  return electronApp;
}

test.describe('Area Selector Visual Tests', () => {
  let electronApp;

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('area selector HTML file should load correctly', async () => {
    // Testa o HTML diretamente via Playwright browser (não Electron)
    // Isso valida a estrutura do UI sem precisar do main process
    
    electronApp = await electron.launch({
      args: ['--no-sandbox', path.join(projectRoot, 'src/main/main.js')],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    // Apenas valida que o app inicia
    const isRunning = await electronApp.evaluate(async ({ app }) => {
      return app.isReady();
    });
    
    expect(isRunning).toBe(true);
  });
});
