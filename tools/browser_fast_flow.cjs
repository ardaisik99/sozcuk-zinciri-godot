/* End-to-end checks for the lightweight web edition. Uses an isolated browser profile. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const URL = process.env.GAME_URL || 'http://localhost:8060';
const SAVE_KEY = 'sozcuk_zinciri_v1';
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
  const bootstrapProbes = [];
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
  async function editorialMascot(label) {
    const images = page.locator('img.mascot');
    check(await images.count() > 0, `${label} should display the editorial mascot.`);
    check(await images.evaluateAll(items => items.every(image => /\/assets\/mascot-editorial\.webp(?:\?|$)/u.test(image.src) && (!image.dataset.pose || image.dataset.pose === 'editorial') && image.decoding === 'async')), `${label} should reuse only the asynchronously decoded editorial illustration.`);
    check(await images.evaluateAll(items => items.every(image => getComputedStyle(image).animationName === 'none')), `${label} mascot art should remain static.`);
  }
  async function palette() {
    const expected = { ink: '#29364f', muted: '#78808c', cream: '#fff8ee', orange: '#fb7852', gold: '#ffca51', teal: '#2ba99e', mint: '#d9eee7', line: '#e5ded2' };
    const actual = await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, getComputedStyle(document.documentElement).getPropertyValue('--' + key).trim().toLowerCase()])), Object.keys(expected));
    check(JSON.stringify(actual) === JSON.stringify(expected), 'The exact v3 color palette should be restored.');
    check(await t('profile-name').evaluate(input => getComputedStyle(input).backgroundColor === 'rgb(255, 255, 255)'), 'The profile input should retain its original white background.');
  }
  async function probeLoader(reduceMotion) {
    const loaderContext = await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, reducedMotion: reduceMotion ? 'reduce' : 'no-preference' });
    // Observe the genuine parser-created intro; never delay requests, images,
    // decoding, or timers just to force the intro to stay onscreen.
    await loaderContext.addInitScript(() => {
      window.__qaIntro = { samples: [], readyAt: null };
      const snapshot = () => {
        const boot = document.querySelector('main[data-screen="loading"]');
        if (boot && window.__qaIntro.samples.length < 20) {
          const nodes = [boot, ...boot.querySelectorAll('*')];
          window.__qaIntro.samples.push({
            at: performance.now(),
            animations: nodes.map(node => getComputedStyle(node).animationName).filter(name => name !== 'none'),
            images: [...boot.querySelectorAll('img')].map(image => ({ src: image.getAttribute('src'), decoding: image.decoding })),
            runners: boot.querySelectorAll('[data-testid="mascot-runner"],.mascot-run,.run-streak').length,
            width: innerWidth,
            scroll: document.documentElement.scrollWidth,
          });
        }
        if (document.querySelector('main[data-screen="profile"]')) {
          window.__qaIntro.readyAt = performance.now();
          observer.disconnect();
        }
      };
      const observer = new MutationObserver(snapshot);
      observer.observe(document, { childList: true, subtree: true });
      addEventListener('DOMContentLoaded', snapshot, { once: true });
    });
    const loaderPage = await loaderContext.newPage();
    const requests = [];
    const loaderErrors = [];
    loaderPage.on('request', request => requests.push(request.url()));
    loaderPage.on('pageerror', error => loaderErrors.push(error.message));
    loaderPage.on('console', message => { if (message.type() === 'error') loaderErrors.push(message.text()); });
    try {
      await loaderPage.goto(URL, { waitUntil: 'domcontentloaded' });
      await loaderPage.locator('main[data-screen="profile"]').waitFor({ state: 'visible' });
      const intro = await loaderPage.evaluate(() => window.__qaIntro);
      check(intro.samples.length > 0, 'The real static intro should exist in the initial HTML.');
      check(intro.samples.every(sample => sample.animations.length === 0), 'Intro and its children should have no CSS animation.');
      check(intro.samples.every(sample => sample.runners === 0), 'The intro should contain no running sprite or speed-line UI.');
      check(intro.samples.every(sample => sample.images.length > 0 && sample.images.every(image => image.src === 'assets/mascot-editorial.webp' && image.decoding === 'async')), 'Intro should use only the static editorial image with asynchronous decoding.');
      check(intro.samples.every(sample => sample.scroll <= sample.width + 1), 'The static intro should fit a 320-pixel screen.');
      check(Number.isFinite(intro.readyAt), 'Profile should open directly after bootstrap content becomes ready.');
      const moduleSource = await loaderPage.evaluate(async () => {
        const module = document.querySelector('script[type="module"]');
        if (!module) throw new Error('No actual application module was declared.');
        if (!module.src) return { mode: 'inline', source: module.textContent };
        const response = await fetch(module.src);
        if (!response.ok) throw new Error(`Application module ${module.src}: HTTP ${response.status}`);
        return { mode: 'external', source: await response.text() };
      });
      const bootstrapStart = moduleSource.source.lastIndexOf('\nviewportChanged();');
      check(bootstrapStart >= 0, 'Readiness checks should inspect the actual inline or declared external application module.');
      const bootstrapSource = moduleSource.source.slice(bootstrapStart);
      check(/new\s+ZincirState\s*\(/u.test(bootstrapSource), 'The inspected bootstrap should contain the real game-state initialization.');
      check(!/\b(?:Image|decode|prepareEntryVisuals|warm)\b/u.test(bootstrapSource), 'Optional mascot artwork should never gate bootstrap or image decoding.');
      check(!/\b(?:delay|setTimeout|setInterval|requestAnimationFrame)\s*\(/u.test(bootstrapSource), 'Bootstrap should have no fake minimum loading delay.');
      check(await loaderPage.locator('link[rel="preload"]').evaluateAll(links => links.every(link => !/mascot-(?:run|think|cheer)/u.test(link.href))), 'No running sprite or old pose should be preloaded.');
      await loaderPage.waitForLoadState('networkidle');
      check(!requests.some(url => /\/assets\/mascot(?:-(?:run|think|cheer))?\.(?:png|webp)(?:\?|$)/u.test(url)), 'Static bootstrap should request no runner or former book/thinking/celebration pose.');
      check(loaderErrors.length === 0, `Static bootstrap should have no runtime or HTTP console errors: ${loaderErrors.join('; ')}`);
      bootstrapProbes.push({ reducedMotion: reduceMotion, sourceMode: moduleSource.mode, profileReadyMs: Math.round(intro.readyAt), staticIntroSamples: intro.samples.length, consoleErrors: loaderErrors, requestedFiles: requests });
    } finally {
      await loaderContext.close();
    }
  }
  async function probeOptionalImageReadiness() {
    const imageContext = await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
    const imagePage = await imageContext.newPage();
    const editorialRequest = /\/assets\/mascot-editorial\.webp(?:\?.*)?$/u;
    let release;
    let held = false;
    let released = false;
    const gate = new Promise(resolve => { release = resolve; });
    const imageErrors = [];
    imagePage.on('pageerror', error => imageErrors.push(error.message));
    imagePage.on('console', message => { if (message.type() === 'error') imageErrors.push(message.text()); });
    // This isolated regression probe holds only optional art. The real-intro
    // observations and the complete gameplay flow use untouched networking.
    await imagePage.route(editorialRequest, async route => {
      held = true;
      await gate;
      try { await route.continue(); } catch { /* Cleanup can cancel a pending request after a failed assertion. */ }
    });
    try {
      const imageRequested = imagePage.waitForRequest(editorialRequest);
      await imagePage.goto(URL, { waitUntil: 'domcontentloaded' });
      await imageRequested;
      await imagePage.locator('main[data-screen="profile"]').waitFor({ state: 'visible' });
      check(held && !released, 'Profile should open while the real optional editorial request remains held.');
      check(await imagePage.locator('main[data-screen="profile"] img.mascot').evaluate(image => !image.complete && image.naturalWidth === 0), 'Profile should render before its editorial illustration has loaded or decoded.');
      const name = imagePage.getByTestId('profile-name');
      await name.fill('Deniz');
      check(await name.inputValue() === 'Deniz' && await imagePage.getByTestId('profile-submit').isEnabled() && await name.evaluate(input => input.form.checkValidity()), 'Profile input and continue control should be usable while mascot art is pending.');
      const imageReady = imagePage.waitForResponse(response => editorialRequest.test(response.url()) && response.ok());
      released = true;
      release();
      await imageReady;
      await imagePage.waitForLoadState('networkidle');
      check(imageErrors.length === 0, `Optional-art readiness probe should have no runtime or HTTP console errors: ${imageErrors.join('; ')}`);
      bootstrapProbes.push({ optionalImageHeld: true, profileUsableBeforeImage: true, consoleErrors: imageErrors });
    } finally {
      release();
      await imageContext.close();
    }
  }
  try {
    await probeLoader(false);
    await probeLoader(true);
    await probeOptionalImageReadiness();
    await page.goto(URL, { waitUntil: 'networkidle' });
    await waitScreen('profile');
    const initialLoadPayloadBytes = await page.evaluate(() => [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')].reduce((sum, resource) => sum + (resource.encodedBodySize || 0), 0));
    const initialNetworkTransferBytes = await page.evaluate(() => [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')].reduce((sum, resource) => sum + (resource.transferSize || 0), 0));
    check(initialNetworkTransferBytes < 240000, `First-load transfer should remain below the 240 KB budget (actual ${initialNetworkTransferBytes}).`);
    const content = await page.evaluate(async () => (await fetch('data/levels.json')).json());
    const source = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/levels.json'), 'utf8'));
    check(content.levels.length === 40, 'Fast edition should expose all 40 levels.');
    check(JSON.stringify(content) === JSON.stringify(source), 'Fast web content should exactly match the Godot content.');
    await editorialMascot('Profile');
    await palette();
    await t('profile-name').fill('Gökçen');
    await t('profile-submit').click();
    await waitScreen('game');
    await editorialMascot('Tutorial');
    check(await page.locator('[data-testid="word-row"][data-mode="active"]').evaluate(row => getComputedStyle(row).backgroundColor === 'rgb(255, 255, 255)'), 'Active letter entry should retain its original white surface.');
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
    await editorialMascot('Win');
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(out, 'fast-web-win.png'), fullPage: true });
    let record = await save();
    check(record.tutorialDone && record.gold === 100 && record.score === 0, 'Tutorial should complete with start gold and no duplicate reward.');
    await t('win-primary').click();
    await waitScreen('home');
    check(await page.locator('#toast').evaluate(toast => !toast.classList.contains('visible')), 'Navigation should clear a stale word-completion toast.');
    await editorialMascot('Home');
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
    check(![...fetched].some(url => /\/assets\/mascot(?:-(?:run|think|cheer))?\.(?:png|webp)(?:\?|$)/u.test(url)), 'Every screen should avoid all former book/thinking/celebration/running mascot assets.');
    check(!/\bSZC\b/iu.test(await page.locator('body').innerText()), 'No stale SZC text should remain in the visible UI.');
    check(errors.length === 0, `Browser runtime errors: ${errors.join('; ')}`);
    const report = { checks, failures: 0, initialLoadPayloadBytes, initialNetworkTransferBytes, lastNavigationPayloadBytes: traffic, bootstrapProbes, criticalContrasts, consoleErrors: errors, requestedFiles: [...fetched] };
    fs.writeFileSync(path.join(out, 'fast-web-flow.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
