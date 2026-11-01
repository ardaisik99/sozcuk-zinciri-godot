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
  const page = await context.newPage();
  const errors = [];
  const fetched = new Set();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => fetched.add(r.url()));
  let checks = 0;
  const check = (condition, message) => { checks++; assert.ok(condition, message); };
  const t = name => page.getByTestId(name);
  const screen = name => page.locator(`main[data-screen="${name}"]`);
  const save = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
  async function waitScreen(name) { await screen(name).waitFor({ state: 'visible', timeout: 10000 }); }
  async function submit(value) { await t('word-input').fill(value); await t('word-input').press('Enter'); }
  async function reloadHome() { await page.reload({ waitUntil: 'networkidle' }); await waitScreen('home'); }
  async function layout(label) {
    const geometry = await page.evaluate(() => {
      const main = document.querySelector('main[data-screen]').getBoundingClientRect();
      return { viewport: innerWidth, document: document.documentElement.scrollWidth, left: main.left, right: main.right };
    });
    check(geometry.document <= geometry.viewport + 1 && geometry.left >= -1 && geometry.right <= geometry.viewport + 1, `${label}: horizontal overflow ${JSON.stringify(geometry)}`);
  }
  try {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await waitScreen('profile');
    const initialLoadPayloadBytes = await page.evaluate(() => [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')].reduce((sum, resource) => sum + (resource.encodedBodySize || 0), 0));
    const content = await page.evaluate(async () => (await fetch('data/levels.json')).json());
    const source = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/levels.json'), 'utf8'));
    check(content.levels.length === 40, 'Fast edition should expose all 40 levels.');
    check(JSON.stringify(content) === JSON.stringify(source), 'Fast web content should exactly match the Godot content.');
    await t('profile-name').fill('Gökçen');
    await t('profile-submit').click();
    await waitScreen('game');
    const active = page.locator('[data-testid="word-row"][data-mode="active"]');
    const cell = await active.getByTestId('letter-cell').nth(1).boundingBox();
    await page.touchscreen.tap(cell.x + cell.width / 2, cell.y + cell.height / 2);
    check(await t('word-input').evaluate(input => document.activeElement === input && input instanceof HTMLInputElement), 'Tapping a letter tile should directly focus a native input.');
    const originalInput = await t('word-input').elementHandle();
    await page.keyboard.insertText('aşık');
    check(await originalInput.evaluate(input => input.isConnected && input === document.activeElement), 'Typing must retain the same focused native input.');
    await page.keyboard.press('Enter');
    check((await save()).progress.tutorial.activeIndex === 2, 'Tutorial suffix should advance to the next word.');
    await page.reload({ waitUntil: 'networkidle' });
    await waitScreen('game');
    check((await save()).progress.tutorial.activeIndex === 2, 'Reload should resume the unfinished tutorial.');
    await submit('yun');
    await submit('ava');
    await waitScreen('win');
    let record = await save();
    check(record.tutorialDone && record.gold === 100 && record.score === 0, 'Tutorial should complete with start gold and no duplicate reward.');
    await t('win-primary').click();
    await waitScreen('home');
    check(await page.locator('#toast').evaluate(toast => !toast.classList.contains('visible')), 'Navigation should clear a stale word-completion toast.');
    await layout('390 home');
    await page.screenshot({ path: path.join(out, 'fast-web-mobile.png'), fullPage: true });
    await t('home-play').click();
    await waitScreen('game');
    await page.screenshot({ path: path.join(out, 'fast-web-game.png'), fullPage: true });
    const level = content.levels[0];
    await submit('ZZZZZZ');
    record = await save();
    check(record.progress[level.id].activeIndex === 1 && record.gold === 100, 'Wrong answer should preserve gold and active word.');
    const draft = level.words[1].slice(1, 3);
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
    check(cells[1].trim() === level.words[1][1] && cells[2].trim() === level.words[1][2], 'Joker should preserve previously typed letters in their original cells.');
    const shown = record.progress[level.id].revealed['1'];
    const hidden = [...level.words[1]].filter((_, i) => i > 0 && !shown.includes(i)).join('');
    await submit(hidden);
    for (const word of level.words.slice(2)) await submit(word.slice(1));
    await waitScreen('win');
    record = await save();
    check(record.gold === 105 && record.score === 100 && record.completed.includes(level.id), 'First real level should pay exactly 40 gold and 100 score.');
    await reloadHome();
    await t('nav-levels').click();
    await waitScreen('levels');
    await page.locator(`[data-level-id="${level.id}"]`).getByRole('button').click();
    await waitScreen('game');
    for (const word of level.words.slice(1)) await submit(word);
    await waitScreen('win');
    record = await save();
    check(record.gold === 105 && record.score === 100, 'Replaying a level should not duplicate its reward.');
    await reloadHome();
    await t('nav-party').click();
    await waitScreen('party');
    const beforeParty = await screen('party').innerText();
    await t('party-next').click();
    check((await screen('party').innerText()) !== beforeParty, 'Party next-chain action should change the displayed chain.');
    record = await save();
    check(record.gold === 105 && record.score === 100, 'Party mode should preserve gold and progress.');
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
    await page.screenshot({ path: path.join(out, 'fast-web-desktop.png'), fullPage: true });
    const traffic = await page.evaluate(() => [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')].reduce((sum, resource) => sum + (resource.encodedBodySize || 0), 0));
    check(![...fetched].some(url => /\.(wasm|pck)(?:\?|$)/u.test(url)), 'Lightweight public build should not request Godot runtime files.');
    check(errors.length === 0, `Browser runtime errors: ${errors.join('; ')}`);
    const report = { checks, failures: 0, initialLoadPayloadBytes, lastNavigationPayloadBytes: traffic, consoleErrors: errors, requestedFiles: [...fetched] };
    fs.writeFileSync(path.join(out, 'fast-web-flow.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
