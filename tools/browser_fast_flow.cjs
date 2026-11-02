/* End-to-end checks for the lightweight web edition. Uses an isolated browser profile. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const URL = process.env.GAME_URL || 'http://localhost:8060';
const SAVE_KEY = 'sozcuk_zinciri_v1';
const captureLoader = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::|\/)/u.test(URL);
const out = path.resolve(__dirname, '../output');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await context.addInitScript(() => {
    window.__qaMorphModes = [];
    const observe = () => new MutationObserver(records => {
      for (const record of records) {
        const row = record.target;
        if (row.matches?.('[data-testid="word-row"]') && ['revealing', 'morphing'].includes(row.dataset.mode)) {
          window.__qaMorphModes.push({ mode: row.dataset.mode, index: Number(row.dataset.index), text: [...row.querySelectorAll('[data-testid="letter-cell"]')].map(cell => cell.textContent).join('') });
        }
      }
    }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['data-mode'] });
    if (document.body) observe(); else addEventListener('DOMContentLoaded', observe, { once: true });
  });
  const page = await context.newPage();
  const errors = [];
  const fetched = new Set();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => fetched.add(r.url()));
  let checks = 0;
  const criticalContrasts = [];
  const check = (condition, message) => { checks++; assert.ok(condition, message); };
  const t = name => page.getByTestId(name);
  const screen = name => page.locator(`main[data-screen="${name}"]`);
  const save = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
  async function waitScreen(name) { await screen(name).waitFor({ state: 'visible', timeout: 10000 }); }
  const answer = (level, index) => level.answers[index];
  async function settleTransition() { await page.waitForFunction(() => !document.querySelector('main[data-transitioning="true"]'), null, { timeout: 5000 }); }
  async function submit(value) { await t('word-input').fill(value); await t('word-input').press('Enter'); await settleTransition(); }
  async function inspectTransition(answerText, stem, index, originalInput = null) {
    await page.locator('main[data-transitioning="true"]').waitFor({ state: 'visible' });
    check(await screen('game').getAttribute('aria-busy') === 'true', 'Accepted-answer animation should mark the game busy.');
    const revealing = page.locator(`[data-testid="word-row"][data-index="${index}"][data-mode="revealing"]`);
    await revealing.waitFor({ state: 'visible' });
    check((await revealing.getByTestId('letter-cell').allTextContents()).join('') === answerText, `Animation should first display full answer ${answerText}.`);
    if (originalInput) check(await originalInput.evaluate(input => input.isConnected && input === document.activeElement), 'Answer animation should retain the focused native input.');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.waitForFunction(({ index, stem }) => window.__qaMorphModes.some(mode => mode.mode === 'morphing' && mode.index === index && mode.text === stem), { index, stem }, { timeout: 5000 });
    check(await page.evaluate(({ index, stem }) => window.__qaMorphModes.some(mode => mode.mode === 'morphing' && mode.index === index && mode.text === stem), { index, stem }), `Morphing stage should display the exact stem ${stem}.`);
    await settleTransition();
    const solved = page.locator(`[data-testid="word-row"][data-index="${index}"][data-mode="solved"]`);
    check((await solved.getByTestId('letter-cell').allTextContents()).join('') === stem, `Solved row should become stem ${stem}.`);
  }
  async function reloadHome() { await page.reload({ waitUntil: 'networkidle' }); await waitScreen('home'); }
  async function layout(label) {
    const geometry = await page.evaluate(() => {
      const main = document.querySelector('main[data-screen]').getBoundingClientRect();
      return { viewport: innerWidth, document: document.documentElement.scrollWidth, left: main.left, right: main.right };
    });
    check(geometry.document <= geometry.viewport + 1 && geometry.left >= -1 && geometry.right <= geometry.viewport + 1, `${label}: horizontal overflow ${JSON.stringify(geometry)}`);
  }
  async function contrast(testId) {
    const colors = await t(testId).evaluate(el => { const css = getComputedStyle(el); return { foreground: css.color, background: css.backgroundColor }; });
    const luminance = color => {
      const channels = color.match(/[\d.]+/gu).slice(0, 3).map(Number).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const foreground = luminance(colors.foreground), background = luminance(colors.background);
    const ratio = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    criticalContrasts.push({ testId, ...colors, ratio: Math.round(ratio * 100) / 100 });
    check(ratio >= 4.5, `Critical control ${testId} should retain readable label contrast (${ratio.toFixed(2)}).`);
  }
  async function probeLoader(reduceMotion) {
    const loaderContext = await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, reducedMotion: reduceMotion ? 'reduce' : 'no-preference' });
    const loaderPage = await loaderContext.newPage();
    let release;
    let imageRequested;
    const gate = new Promise(resolve => { release = resolve; });
    const seen = new Promise(resolve => { imageRequested = resolve; });
    await loaderPage.route('**/assets/mascot-cheer.webp', async route => {
      imageRequested();
      await gate;
      // Complete a known real image immediately after the gate. The full flow below
      // separately fetches deployed assets; this probe isolates bootstrap readiness.
      try { await route.fulfill({ path: path.resolve(__dirname, '../assets/mascot-cheer.webp'), contentType: 'image/webp' }); } catch { /* Context cleanup may cancel a held request. */ }
    });
    try {
      const opened = Date.now();
      await loaderPage.goto(URL, { waitUntil: 'commit' });
      await loaderPage.locator('main.boot[data-screen="loading"]').waitFor({ state: 'visible' });
      await Promise.race([seen, new Promise((_, reject) => setTimeout(() => reject(new Error('Expected selected entry-pose bootstrap request.')), 15000))]);
      const runner = loaderPage.getByTestId('mascot-runner');
      check(await runner.isVisible(), 'The actual loading screen should display the running mascot while a bootstrap image is delayed.');
      check(await runner.evaluate(el => getComputedStyle(el).backgroundImage.includes('mascot-run.webp')), 'Loading should use the real eight-frame mascot atlas.');
      const progress = await loaderPage.locator('#boot-progress').evaluate(el => ({ value: Number(el.getAttribute('aria-valuenow') ?? el.value), max: Number(el.getAttribute('aria-valuemax') ?? el.max) }));
      check(progress.value >= 1 && progress.value < progress.max, 'Bootstrap progress should reflect completed work while the entry image remains pending.');
      if (!reduceMotion && captureLoader) await loaderPage.screenshot({ path: path.join(out, 'fast-web-loading-frame1.png') });
      const before = await runner.evaluate(el => getComputedStyle(el).backgroundPosition);
      await loaderPage.waitForTimeout(140);
      const after = await runner.evaluate(el => getComputedStyle(el).backgroundPosition);
      if (!reduceMotion && captureLoader) await loaderPage.screenshot({ path: path.join(out, 'fast-web-loading-frame2.png') });
      if (reduceMotion) {
        check(before === after, 'Reduced motion should keep the loading mascot on a static frame.');
      } else {
        check(before !== after, 'The loading mascot should visibly advance through running frames.');
        await loaderPage.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, value: true });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        check(await runner.evaluate(el => getComputedStyle(el).animationPlayState.split(',').every(state => state.trim() === 'paused')), 'The runner should pause when document visibility becomes hidden.');
        const paused = await runner.evaluate(el => getComputedStyle(el).backgroundPosition);
        await loaderPage.waitForTimeout(120);
        check(await runner.evaluate((el, position) => getComputedStyle(el).backgroundPosition === position, paused), 'Hidden loading animation should not keep advancing.');
        await loaderPage.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
        check(await runner.evaluate(el => getComputedStyle(el).animationPlayState.split(',').some(state => state.trim() === 'running')), 'The runner should resume when the document becomes visible.');
      }
      const loaderBounds = await loaderPage.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      check(loaderBounds.scroll <= loaderBounds.width + 1, 'The loader should fit a 320-pixel screen.');
      if (!reduceMotion && captureLoader) {
        await loaderPage.waitForTimeout(Math.max(0, 800 - (Date.now() - opened)));
        await loaderPage.screenshot({ path: path.join(out, 'fast-web-loading.png') });
      }
      const released = Date.now();
      release();
      await loaderPage.locator('main[data-screen="profile"]').waitFor({ state: 'visible' });
      check(Date.now() - released < 500, 'Ready bootstrap work should open profile promptly without a minimum loading timer.');
      const remaining = loaderPage.getByTestId('mascot-runner');
      check(await remaining.count() === 0 || await remaining.evaluate(el => getComputedStyle(el).animationPlayState === 'paused'), 'The running sprite should stop when the loader is removed or hidden.');
    } finally {
      release();
      await loaderContext.close();
    }
  }
  try {
    await probeLoader(false);
    await probeLoader(true);
    await page.goto(URL, { waitUntil: 'networkidle' });
    await waitScreen('profile');
    const initialLoadPayloadBytes = await page.evaluate(() => [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')].reduce((sum, resource) => sum + (resource.encodedBodySize || 0), 0));
    const initialNetworkTransferBytes = await page.evaluate(() => [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')].reduce((sum, resource) => sum + (resource.transferSize || 0), 0));
    check(initialNetworkTransferBytes < 240000, `First-load transfer should remain below the 240 KB budget (actual ${initialNetworkTransferBytes}).`);
    const content = await page.evaluate(async () => (await fetch('data/levels.json')).json());
    const source = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/levels.json'), 'utf8'));
    check(content.levels.length === 40, 'Fast edition should expose all 40 levels.');
    check(JSON.stringify(content) === JSON.stringify(source), 'Fast web content should exactly match the Godot content.');
    check(await page.locator('img[data-pose="cheer"]').count() > 0, 'Profile should display the joyful mascot pose.');
    await t('profile-name').fill('Gökçen');
    await t('profile-submit').click();
    await waitScreen('game');
    check(await page.locator('img[data-pose="think"]').count() > 0, 'Tutorial should display the thinking mascot pose.');
    await submit('KAŞIK');
    check((await save()).progress.tutorial.activeIndex === 1, 'Bare stem should be rejected when the expected compound answer is KAŞIĞI.');
    await t('word-input').fill('');
    const active = page.locator('[data-testid="word-row"][data-mode="active"]');
    const cell = await active.getByTestId('letter-cell').nth(1).boundingBox();
    await page.touchscreen.tap(cell.x + cell.width / 2, cell.y + cell.height / 2);
    check(await t('word-input').evaluate(input => document.activeElement === input && input instanceof HTMLInputElement), 'Tapping a letter tile should directly focus a native input.');
    const originalInput = await t('word-input').elementHandle();
    await page.keyboard.insertText(answer(content.tutorial, 1).slice(1).toLocaleLowerCase('tr-TR'));
    check(await originalInput.evaluate(input => input.isConnected && input === document.activeElement), 'Typing must retain the same focused native input.');
    await page.keyboard.press('Enter');
    await inspectTransition('KAŞIĞI', 'KAŞIK', 1, originalInput);
    check((await save()).progress.tutorial.activeIndex === 2, 'Repeated Enter during animation should not skip a word.');
    await page.reload({ waitUntil: 'networkidle' });
    await waitScreen('game');
    check((await save()).progress.tutorial.activeIndex === 2, 'Reload should resume the unfinished tutorial.');
    await submit(answer(content.tutorial, 2).slice(1));
    await submit(answer(content.tutorial, 3).slice(1));
    await waitScreen('win');
    check(await page.locator('img[data-pose="cheer"]').count() > 0, 'Winning should display the celebrating mascot pose.');
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(out, 'fast-web-win.png'), fullPage: true });
    let record = await save();
    check(record.tutorialDone && record.gold === 100 && record.score === 0, 'Tutorial should complete with start gold and no duplicate reward.');
    await t('win-primary').click();
    await waitScreen('home');
    check(await page.locator('#toast').evaluate(toast => !toast.classList.contains('visible')), 'Navigation should clear a stale word-completion toast.');
    check(await page.locator('img[src*="mascot.webp"]').count() > 0, 'Home logo and hero should use the droplet mascot.');
    check(await page.locator('img').evaluateAll(images => images.every(image => !/hero\.(?:png|webp)/iu.test(image.src))), 'Visible UI should contain no old SZC hero asset.');
    await layout('390 home');
    await contrast('home-play');
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(out, 'fast-web-mobile.png'), fullPage: true });
    await t('home-play').click();
    await waitScreen('game');
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(out, 'fast-web-game.png'), fullPage: true });
    for (const control of ['submit-guess', 'hint', 'reveal-letter']) await contrast(control);
    const level = content.levels[0];
    await submit('ZZZZZZ');
    record = await save();
    check(record.progress[level.id].activeIndex === 1 && record.gold === 100, 'Wrong answer should preserve gold and active word.');
    const draft = answer(level, 1).slice(1, 3);
    await t('word-input').fill(draft);
    await t('hint').click();
    check((await save()).gold === 85, 'First hint should cost 15 gold.');
    check((await t('word-input').inputValue()).toLocaleUpperCase('tr-TR') === draft, 'Hint should preserve a partially typed answer.');
    await t('hint').click();
    check((await save()).gold === 85, 'Repeating a hint should not charge again.');
    await t('reveal-letter').click();
    record = await save();
    check(record.gold === 65, 'Letter joker should cost 20 gold.');
    const cells = await active.getByTestId('letter-cell').allTextContents();
    check(cells[1].trim() === answer(level, 1)[1] && cells[2].trim() === answer(level, 1)[2], 'Joker should preserve previously typed letters in their original cells.');
    const shown = record.progress[level.id].revealed['1'];
    const hidden = [...answer(level, 1)].filter((_, i) => i > 0 && !shown.includes(i)).join('');
    await submit(hidden);
    for (const word of level.answers.slice(2)) await submit(word.slice(1));
    await waitScreen('win');
    record = await save();
    check(record.gold === 105 && record.score === 100 && record.completed.includes(level.id), 'First real level should pay exactly 40 gold and 100 score.');
    await reloadHome();
    await t('nav-levels').click();
    await waitScreen('levels');
    await page.locator(`[data-level-id="${level.id}"]`).getByRole('button').click();
    await waitScreen('game');
    for (const word of level.answers.slice(1)) await submit(word);
    await waitScreen('win');
    record = await save();
    check(record.gold === 105 && record.score === 100, 'Replaying a level should not duplicate its reward.');
    await reloadHome();
    await t('nav-levels').click();
    await waitScreen('levels');
    await page.locator('[data-level-id="doga_01"]').getByRole('button').click();
    await waitScreen('game');
    await t('word-input').fill('UYU');
    await t('word-input').press('Enter');
    await page.locator('main[data-transitioning="true"]').waitFor({ state: 'visible' });
    await t('back-home').click();
    await waitScreen('home');
    await page.waitForTimeout(1100);
    check(await screen('home').isVisible(), 'Leaving during animation should cancel delayed rendering and retain home.');
    check((await save()).progress.doga_01.activeIndex === 2, 'Leaving an accepted-answer animation should preserve exactly one solved word.');
    await t('nav-levels').click();
    await waitScreen('levels');
    await page.locator('[data-level-id="doga_01"]').getByRole('button').click();
    await waitScreen('game');
    const glassInput = await t('word-input').elementHandle();
    await t('word-input').fill('BARDAĞI');
    await t('word-input').press('Enter');
    await inspectTransition('BARDAĞI', 'BARDAK', 2, glassInput);
    check((await save()).progress.doga_01.activeIndex === 3, 'BARDAĞI → BARDAK transition and repeated Enter should advance once.');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reducedStart = Date.now();
    await submit('ALTLIĞI');
    await waitScreen('win');
    check(Date.now() - reducedStart < 700, 'Reduced-motion preference should shorten the accepted-answer effect.');
    record = await save();
    check(record.gold === 145 && record.score === 200, 'Interrupted/reduced-motion flows should award each finished level once.');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await reloadHome();
    await t('nav-party').click();
    await waitScreen('party');
    const beforeParty = await screen('party').innerText();
    await t('party-next').click();
    check((await screen('party').innerText()) !== beforeParty, 'Party next-chain action should change the displayed chain.');
    record = await save();
    check(record.gold === 145 && record.score === 200, 'Party mode should preserve gold and progress.');
    for (const width of [320, 360, 390, 1100]) {
      await page.setViewportSize({ width, height: width > 500 ? 900 : 568 });
      await reloadHome();
      await layout(`${width} home`);
      await t('nav-levels').click();
      await waitScreen('levels');
      await layout(`${width} levels`);
      await t('back-home').first().click();
      await waitScreen('home');
      await t('home-play').click();
      await waitScreen('game');
      await layout(`${width} game`);
    }
    await page.setViewportSize({ width: 390, height: 300 });
    await t('word-input').focus();
    await page.waitForTimeout(250);
    const focusVisible = await t('word-input').evaluate(input => {
      const rect = input.getBoundingClientRect();
      return document.activeElement === input && rect.top >= 0 && rect.bottom <= innerHeight + 1;
    });
    check(focusVisible, 'Native input should remain visible in a keyboard-sized viewport.');
    await page.setViewportSize({ width: 1100, height: 900 });
    await reloadHome();
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(out, 'fast-web-desktop.png'), fullPage: true });
    const traffic = await page.evaluate(() => [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')].reduce((sum, resource) => sum + (resource.encodedBodySize || 0), 0));
    check(![...fetched].some(url => /\.(wasm|pck)(?:\?|$)/u.test(url)), 'Lightweight public build should not request Godot runtime files.');
    check(![...fetched].some(url => /\/assets\/hero\.(?:png|webp)(?:\?|$)/iu.test(url)), 'Updated game should never request old SZC artwork.');
    check(!/\bSZC\b/iu.test(await page.locator('body').innerText()), 'No stale SZC text should remain in the visible UI.');
    check(errors.length === 0, `Browser runtime errors: ${errors.join('; ')}`);
    const report = { checks, failures: 0, initialLoadPayloadBytes, initialNetworkTransferBytes, lastNavigationPayloadBytes: traffic, criticalContrasts, consoleErrors: errors, requestedFiles: [...fetched] };
    fs.writeFileSync(path.join(out, 'fast-web-flow.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
