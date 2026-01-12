import { chromium } from '@playwright/test';
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '../..');

test.describe('Recording Border Resize/Drag Interaction Tests', () => {
  let browser;
  let page;

  test.beforeAll(async () => {
    browser = await chromium.launch();
  });

  test.afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  test.beforeEach(async () => {
    page = await browser.newPage();
    await page.goto(`file://${path.join(projectRoot, 'src/renderer/recording-border.html')}`);
  });

  test.afterEach(async () => {
    if (page) {
      await page.close();
    }
  });

  test('recording box should have resize handles in the DOM', async () => {
    const resizeHandles = await page.locator('.resize-handle');
    await expect(resizeHandles).toHaveCount(8);
  });

  test('resize handles should have correct data-handle attributes', async () => {
    const handles = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];
    for (const handle of handles) {
      const element = await page.locator(`[data-handle="${handle}"]`);
      await expect(element).toHaveCount(1);
    }
  });

  test('move handle should exist in the DOM', async () => {
    const moveHandle = await page.locator('#moveHandle');
    await expect(moveHandle).toHaveCount(1);
  });

  test('size info element should exist', async () => {
    const sizeInfo = await page.locator('#sizeInfo');
    await expect(sizeInfo).toHaveCount(1);
  });

  test('recording box should exist in the DOM', async () => {
    const recordingBox = await page.locator('#recordingBox');
    await expect(recordingBox).toHaveCount(1);
  });

  test('resize handles should have hidden class initially', async () => {
    const resizeHandles = await page.locator('.resize-handle');
    const count = await resizeHandles.count();
    for (let i = 0; i < count; i++) {
      await expect(resizeHandles.nth(i)).toHaveClass(/hidden/);
    }
  });

  test('move handle should have hidden class initially', async () => {
    const moveHandle = await page.locator('#moveHandle');
    await expect(moveHandle).toHaveClass(/hidden/);
  });

  test('corner resize handles should have correct cursor styles', async () => {
    const cursorMap = {
      'nw': 'nwse-resize',
      'ne': 'nesw-resize',
      'sw': 'nesw-resize',
      'se': 'nwse-resize'
    };

    for (const [handle, cursor] of Object.entries(cursorMap)) {
      const element = await page.locator(`[data-handle="${handle}"]`);
      await expect(element).toHaveCSS('cursor', cursor);
    }
  });

  test('edge resize handles should have correct cursor styles', async () => {
    const cursorMap = {
      'n': 'ns-resize',
      's': 'ns-resize',
      'w': 'ew-resize',
      'e': 'ew-resize'
    };

    for (const [handle, cursor] of Object.entries(cursorMap)) {
      const element = await page.locator(`[data-handle="${handle}"]`);
      await expect(element).toHaveCSS('cursor', cursor);
    }
  });

  test('move handle should have move cursor', async () => {
    const moveHandle = await page.locator('#moveHandle');
    await expect(moveHandle).toHaveCSS('cursor', 'move');
  });

  test('size info should be initially invisible (opacity 0)', async () => {
    const sizeInfo = await page.locator('#sizeInfo');
    await expect(sizeInfo).toHaveCSS('opacity', '0');
  });
});
