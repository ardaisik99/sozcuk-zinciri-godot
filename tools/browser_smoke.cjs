/* Smoke-test the actual Godot web export, with an installed Chrome browser. */
const fs = require('node:fs');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = path.resolve(__dirname, '../output');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const results = [];
  try {
    for (const [name, viewport, mobile] of [
      ['web-desktop', { width: 1100, height: 900 }, false],
      ['web-mobile', { width: 390, height: 844 }, true]
    ]) {
      const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile,
        deviceScaleFactor: mobile ? 2 : 1 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      const response = await page.goto(process.env.GAME_URL || 'http://localhost:8060', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !document.querySelector('#loading'), { timeout: 60000 });
      await page.waitForTimeout(1200);
      const geometry = await page.locator('#canvas').evaluate(canvas => ({
        width: canvas.width, height: canvas.height,
        cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight,
        innerWidth, innerHeight, dpr: devicePixelRatio,
        visualHeight: visualViewport?.height,
        keyboardInset: window.__zincirKeyboardInset
      }));
      await page.screenshot({ path: path.join(output, name + '.png') });
      if (response.status() !== 200) errors.push('HTTP ' + response.status());
      if (Math.abs(geometry.height / geometry.dpr - geometry.cssHeight) > 1) errors.push('Framebuffer/CSS height mismatch');
      results.push({ name, geometry, errors });
      await context.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(output, 'web-smoke.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  if (results.some(result => result.errors.length)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
