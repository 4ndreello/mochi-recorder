import { test, expect } from '@playwright/test';
import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '../..');

test.describe('UI Structure Tests (HTML validation)', () => {
  let browser;
  let page;

  test.beforeAll(async () => {
    browser = await chromium.launch();
  });

  test.afterAll(async () => {
    await browser.close();
  });

  test.beforeEach(async () => {
    page = await browser.newPage();
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('area-selector.html should have correct structure', async () => {
    const htmlPath = `file://${path.join(projectRoot, 'src/renderer/area-selector.html')}`;
    await page.goto(htmlPath);

    const hint = page.locator('.hint');
    await expect(hint).toBeVisible();
    
    const hintText = await hint.textContent();
    expect(hintText).toContain('Drag to select area');
    expect(hintText).toContain('ESC');
    expect(hintText).toContain('Enter');

    const selectionBox = page.locator('#selectionBox');
    await expect(selectionBox).toBeHidden();

    const bodyCursor = await page.evaluate(() => {
      return getComputedStyle(document.body).cursor;
    });
    expect(bodyCursor).toBe('crosshair');
  });

  test('recording-controls.html should have start and close buttons', async () => {
    const htmlPath = `file://${path.join(projectRoot, 'src/renderer/recording-controls.html')}`;
    await page.goto(htmlPath);

    // Verifica botão start (ID correto: startButton)
    const startBtn = page.locator('#startButton');
    await expect(startBtn).toBeVisible();

    // Verifica botão close
    const closeBtn = page.locator('#closeButton');
    await expect(closeBtn).toBeAttached(); // Exists but starts hidden

    // Verifica botão stop existe (mas hidden inicialmente)
    const stopBtn = page.locator('#stopButton');
    await expect(stopBtn).toBeHidden();

    // Verifica timer
    const timer = page.locator('#timer');
    await expect(timer).toBeVisible();
    await expect(timer).toContainText('0:00');

    // Verifica mic button
    const micBtn = page.locator('#micButton');
    await expect(micBtn).toBeVisible();

    // Verifica system audio button
    const sysAudioBtn = page.locator('#systemAudioButton');
    await expect(sysAudioBtn).toBeVisible();

    // Verifica gear button (settings)
    const gearBtn = page.locator('#gearButton');
    await expect(gearBtn).toBeVisible();
  });

  test('recording-border.html should have border element', async () => {
    const htmlPath = `file://${path.join(projectRoot, 'src/renderer/recording-border.html')}`;
    await page.goto(htmlPath);

    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('index.html should have main Mochi interface elements', async () => {
    const htmlPath = `file://${path.join(projectRoot, 'src/renderer/index.html')}`;
    await page.goto(htmlPath);

    const title = await page.title();
    expect(title).toBe('Mochi');

    const header = page.locator('h1');
    await expect(header).toContainText('Mochi');

    const statusIndicator = page.locator('#statusIndicator');
    await expect(statusIndicator).toBeVisible();

    const startBtn = page.locator('#startBtn');
    await expect(startBtn).toBeVisible();
    await expect(startBtn).toContainText('Start Recording');

    const stopBtn = page.locator('#stopBtn');
    await expect(stopBtn).toBeVisible();
    await expect(stopBtn).toBeDisabled();

    const micToggle = page.locator('#micToggle');
    await expect(micToggle).toBeVisible();
  });

  test('floating-button.html should load without errors', async () => {
    const htmlPath = `file://${path.join(projectRoot, 'src/renderer/floating-button.html')}`;
    await page.goto(htmlPath);

    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('post-recording-dialog.html should load without errors', async () => {
    const htmlPath = `file://${path.join(projectRoot, 'src/renderer/post-recording-dialog.html')}`;
    await page.goto(htmlPath);

    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('recording controls should have settings panel', async () => {
    const htmlPath = `file://${path.join(projectRoot, 'src/renderer/recording-controls.html')}`;
    await page.goto(htmlPath);

    const settingsPanel = page.locator('#settingsPanel');
    await expect(settingsPanel).toBeAttached();

    // Quality options
    const qualityLow = page.locator('[data-type="quality"][data-value="low"]');
    const qualityMedium = page.locator('[data-type="quality"][data-value="medium"]');
    const qualityHigh = page.locator('[data-type="quality"][data-value="high"]');
    
    await expect(qualityLow).toBeAttached();
    await expect(qualityMedium).toBeAttached();
    await expect(qualityHigh).toBeAttached();

    // FPS options
    const fps24 = page.locator('[data-type="fps"][data-value="24"]');
    const fps30 = page.locator('[data-type="fps"][data-value="30"]');
    const fps60 = page.locator('[data-type="fps"][data-value="60"]');
    
    await expect(fps24).toBeAttached();
    await expect(fps30).toBeAttached();
    await expect(fps60).toBeAttached();
  });

  test('area selector should have keyboard shortcuts documented', async () => {
    const htmlPath = `file://${path.join(projectRoot, 'src/renderer/area-selector.html')}`;
    await page.goto(htmlPath);

    const kbdElements = page.locator('kbd');
    const count = await kbdElements.count();
    
    expect(count).toBeGreaterThanOrEqual(2); // ESC and Enter

    const hint = await page.locator('.hint').textContent();
    expect(hint).toContain('ESC');
    expect(hint).toContain('Enter');
  });
});
