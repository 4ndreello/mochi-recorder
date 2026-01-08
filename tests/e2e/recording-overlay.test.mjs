import { _electron as electron } from '@playwright/test';
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '../..');

test.describe('Recording Overlay Visual Tests', () => {
  let electronApp;

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('app should initialize correctly for overlay tests', async () => {
    electronApp = await electron.launch({
      args: ['--no-sandbox', path.join(projectRoot, 'src/main/main.js')],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    const isRunning = await electronApp.evaluate(async ({ app }) => {
      return app.isReady();
    });
    
    expect(isRunning).toBe(true);
  });
});
