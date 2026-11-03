/* Real two-device browser flow against the configured Worker. No production account is reused. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const GAME_URL = process.env.GAME_URL || 'http://localhost:8060';
const API_URL = process.env.API_URL || 'http://127.0.0.1:8787';
const ONLINE_KEY = 'sozcuk_zinciri_online_v1';
const output = path.resolve(__dirname, '../output');
const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../backend/private/chains.json'), 'utf8'));
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
  const contexts = [], pages = [], states = new Map(), frameCounts = new Map(), apiCounts = new Map(), errors = [], apiErrors = [];
  let checks = 0;
  let expectingClosedRoom = false;
  const check = (condition, message) => { checks++; assert.ok(condition, message); };
  const t = (page, id) => page.getByTestId('online-' + id);
  const record = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), ONLINE_KEY);
  const state = page => states.get(page);
  async function waitState(page, predicate, description, timeout = 7000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (predicate(state(page))) return state(page); await page.waitForTimeout(50); }
    throw new Error('Timed out: ' + description);
  }
  async function enterOnline(page) {
    await page.locator('[data-action="online"]').click();
    await page.locator('main[data-online-view="hub"], main[data-online-view="room"]').waitFor({ state: 'visible' });
  }
  async function send(page, text) {
    await t(page, 'chat-input').fill(text);
    await t(page, 'chat-input').press('Enter');
    await page.waitForFunction(() => {
      const input = document.querySelector('[data-testid="online-chat-input"]'), button = document.querySelector('[data-testid="online-send"]');
      return input && input.value === '' && button && !button.disabled;
    }, null, { timeout: 5000 });
  }
  async function bounds(page, label) {
    const geometry = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
    check(geometry.width <= geometry.viewport + 1, label + ' should fit without horizontal overflow: ' + JSON.stringify(geometry));
  }
  try {
    check((await (await fetch(API_URL + '/health')).json()).ok, 'The real Worker should be healthy.');
    for (const name of ['Deniz QA', 'Ece QA']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      contexts.push(context);
      if (['localhost', '127.0.0.1', '[::1]'].includes(new URL(API_URL).hostname)) {
        const fixtureIp = `2001:db8:${(Date.now() % 65535).toString(16)}:${contexts.length}::1`;
        await context.route(API_URL + '/**', route => route.continue({ headers: { ...route.request().headers(), 'CF-Connecting-IP': fixtureIp } }));
      }
      await context.addInitScript(name => { if (!localStorage.getItem('sozcuk_zinciri_v1')) localStorage.setItem('sozcuk_zinciri_v1', JSON.stringify({ version: 1, profileName: name, tutorialDone: true, gold: 100, score: 0, completed: [], progress: {}, settings: { sound: false, haptics: false } })); }, name);
      const page = await context.newPage(); pages.push(page); frameCounts.set(page, 0); apiCounts.set(page, 0);
      page.on('pageerror', error => errors.push(error.message.replace(/token=[^&\s]+/gu, 'token=[redacted]')));
      page.on('console', message => { if (message.type() === 'error' && !(expectingClosedRoom && message.text().includes('400'))) errors.push(message.text().replace(/token=[^&\s]+/gu, 'token=[redacted]')); });
      page.on('request', request => { if (request.url().startsWith(API_URL)) apiCounts.set(page, apiCounts.get(page) + 1); });
      page.on('requestfailed', request => { if (request.url().startsWith(API_URL)) apiErrors.push({ path: new URL(request.url()).pathname, failure: request.failure()?.errorText }); });
      page.on('response', async response => {
        if (response.url().startsWith(API_URL) && !response.ok()) {
          let body = {}; try { body = await response.json(); } catch {}
          apiErrors.push({ path: new URL(response.url()).pathname, status: response.status(), reason: body.reason });
        }
      });
      page.on('websocket', socket => socket.on('framereceived', frame => {
        let message; try { message = JSON.parse(String(frame.payload)); } catch { return; }
        if (message.type === 'state') { states.set(page, message.state); frameCounts.set(page, frameCounts.get(page) + 1); }
      }));
      await page.goto(GAME_URL, { waitUntil: 'networkidle' });
      check(apiCounts.get(page) === 0, 'Offline home should make no account/social requests.');
      await enterOnline(page);
      await page.locator('main[data-online-view="hub"]').waitFor({ state: 'visible' });
      check((await t(page, 'my-code').innerText()).startsWith('#'), 'Each name-only account should receive a public friend code.');
      await bounds(page, 'Online hub');
    }
    const [a, b] = pages;
    const profiles = [(await record(a)).profile, (await record(b)).profile];
    check(profiles[0].id !== profiles[1].id && profiles[0].code !== profiles[1].code, 'Two devices should own distinct server accounts.');
    const pageFor = id => profiles[0].id === id ? a : b;
    const bCode = await t(b, 'my-code').innerText();
    await t(a, 'friend-code').fill(bCode);
    await t(a, 'add-friend').click();
    await b.locator('[data-online-action="social-tab"][data-tab="incoming"]').click();
    await t(b, 'accept-friend').waitFor({ state: 'visible' });
    check(await b.locator('[data-oz="social-list"]').innerText().then(text => text.includes(profiles[0].name)), 'Friend requests should arrive live through directory events.');
    await t(b, 'accept-friend').click();
    await a.locator('[data-oz="social-list"]').getByText(profiles[1].name).waitFor({ state: 'visible' });
    check(await t(a, 'invite-friend').count() === 1, 'Accepted friends should expose a room invitation action.');
    await a.locator('#toast.visible').waitFor({ state: 'hidden' });
    await a.screenshot({ path: path.join(output, 'online-friends-mobile.png'), fullPage: true });
    await t(a, 'invite-friend').click();
    await a.locator('main[data-online-view="room"]').waitFor({ state: 'visible' });
    const roomCode = (await t(a, 'room-code').innerText()).trim();
    check(/^[A-Z2-9]{6}$/u.test(roomCode), 'Created room should use a six-character share code.');
    await b.locator('[data-online-action="social-tab"][data-tab="invites"]').click();
    await b.locator('[data-testid="online-invite"] [data-online-action="accept-invite"]').click();
    await waitState(a, value => value?.players.length === 2 && value.players.every(player => player.connected), 'Both room players connected');
    await t(a, 'start').waitFor({ state: 'visible' });
    check(await t(a, 'start').isEnabled(), 'The host should be able to start when both players join.');
    await send(b, 'naber lan');
    check(await b.locator('[data-kind="chat"]').innerText().then(text => text.includes('naber lan')), 'Normal multiword conversation should remain neutral chat.');
    check(await t(b, 'chat-input').inputValue() === '' && await t(b, 'send').isEnabled(), 'Acknowledged chat should clear the composer and allow another message.');
    await a.locator('#toast.visible').waitFor({ state: 'hidden' });
    await a.screenshot({ path: path.join(output, 'online-lobby-mobile.png'), fullPage: true });
    await t(a, 'start').click();
    await waitState(a, value => value?.phase === 'countdown', 'Synchronized countdown');
    check(await a.locator('[data-oz="countdown"]').isVisible(), 'Both clients should show the shared three-second start countdown.');
    await waitState(a, value => value?.phase === 'playing', 'Playing after countdown');
    await waitState(b, value => value?.phase === 'playing', 'Second player playing');
    let current = state(a);
    check(current.chain.length === 5 && current.chain.slice(current.activeIndex).every(cell => cell.status === 'hidden' && !('answer' in cell) && !('stem' in cell)), 'Unsolved cells must contain only public masks, never secret answers or stems.');
    const chain = fixture.find(item => item.words[0] === current.chain[0].stem);
    check(Boolean(chain), 'The Node-only QA fixture should identify the private test chain.');
    let active = pageFor(current.activePlayerId), inactive = active === a ? b : a;
    const playerId = current.activePlayerId, deadline = current.deadlineAt;
    await send(active, 'YANLIS');
    await send(active, 'OLMADI');
    check(state(a).activePlayerId === playerId && state(a).deadlineAt === deadline, 'Multiple wrong attempts should preserve the active turn and its server deadline.');
    check(await active.locator('[data-kind="wrong"]').count() === 2, 'Wrong single-word attempts should render as red-struck guesses.');
    check(await active.locator('[data-kind="wrong"] .oz-message-text>span:last-child').first().evaluate(el => getComputedStyle(el).textDecorationLine.includes('line-through')), 'A wrong guess should have a real strike-through style.');
    await send(inactive, 'MERHABA');
    check(await inactive.locator('[data-kind="chat"]').last().innerText().then(text => text.includes('MERHABA')), 'An inactive player’s single word should remain ordinary chat.');
    await active.setViewportSize({ width: 320, height: 300 });
    await t(active, 'chat-input').focus();
    await active.waitForTimeout(150);
    const inputNode = await t(active, 'chat-input').elementHandle();
    await send(inactive, 'ben de buradayım');
    check(await inputNode.evaluate(input => input.isConnected && input === document.activeElement), 'Room snapshots must preserve the focused native chat input.');
    const keyboardBounds = await active.evaluate(() => {
      const input = document.querySelector('[data-testid="online-chat-input"]').getBoundingClientRect();
      const word = document.querySelector('[data-testid="online-active-word"]').getBoundingClientRect();
      return { inputTop: input.top, inputBottom: input.bottom, wordTop: word.top, wordBottom: word.bottom, height: innerHeight };
    });
    check(keyboardBounds.inputTop >= 0 && keyboardBounds.inputBottom <= keyboardBounds.height + 1 && keyboardBounds.wordTop >= 0 && keyboardBounds.wordBottom <= keyboardBounds.height + 1, 'The active word and composer should both remain visible above a mobile keyboard: ' + JSON.stringify(keyboardBounds));
    await bounds(active, 'Keyboard-sized room');
    await active.setViewportSize({ width: 390, height: 844 });
    const frames = frameCounts.get(active), requests = apiCounts.get(active), secondsBefore = Number(await active.locator('[data-oz="timer"]').innerText());
    await active.waitForTimeout(1200);
    check(frameCounts.get(active) === frames && apiCounts.get(active) === requests, 'A ticking turn should not create per-second socket snapshots or REST polling.');
    check(Number(await active.locator('[data-oz="timer"]').innerText()) < secondsBefore, 'The timer should advance locally between server events.');
    await active.screenshot({ path: path.join(output, 'online-playing-mobile.png'), fullPage: true });
    await send(active, chain.answers[current.activeIndex]);
    await waitState(a, value => value?.activeIndex === current.activeIndex + 1, 'Correct answer advanced chain');
    current = state(a);
    check(current.players.find(player => player.id === playerId).score === 100 && current.activePlayerId !== playerId, 'A correct answer should award 100 points and switch players.');
    check(await active.locator('[data-kind="correct"]').count() === 1, 'Correct answers should render with a green check.');
    check(await active.locator('[data-oz="last-correct"]').innerText() === `${chain.answers[current.activeIndex - 1]} → ${chain.words[current.activeIndex - 1]}`, 'The revealed inflected answer should briefly explain its stem without blocking the next turn.');
    const reloadPage = pageFor(playerId), beforeReload = await record(reloadPage);
    await reloadPage.reload({ waitUntil: 'networkidle' }); await enterOnline(reloadPage);
    await reloadPage.locator('[data-oz="connection"][data-status="connected"]').waitFor({ state: 'visible' });
    const restored = await record(reloadPage);
    check(restored.token === beforeReload.token && restored.profile.id === beforeReload.profile.id && restored.roomCode === roomCode, 'Refresh should preserve device identity and reconnect the same room.');
    while (state(a).phase === 'playing') {
      const turn = state(a); await send(pageFor(turn.activePlayerId), chain.answers[turn.activeIndex]);
      await waitState(a, value => value?.turnId !== turn.turnId || value?.phase === 'finished', 'Answer applied once');
    }
    const finished = state(a);
    check(finished.phase === 'finished' && finished.players.reduce((sum, player) => sum + player.score, 0) === 400, 'The five-cell shared chain should finish with four 100-point answers.');
    check(finished.tieBreak === 'speed' && finished.winnerId, 'Equal positive scores should use the server’s response-time tie-break.');
    await a.locator('[data-oz="result"]').waitFor({ state: 'visible' });
    check((await a.locator('[data-oz="result"]').innerText()).includes('Puanlar eşitti'), 'The result should explain a response-time tie-break.');
    await a.screenshot({ path: path.join(output, 'online-result-mobile.png'), fullPage: true });
    for (const page of pages) { await page.locator('[data-online-action="leave"]').first().click(); await page.locator('main[data-online-view="hub"]').waitFor({ state: 'visible' }); }
    await t(a, 'create-room').click();
    await a.locator('[data-testid="online-room-code"]').waitFor({ state: 'visible' });
    const secondCode = (await t(a, 'room-code').innerText()).trim();
    await t(b, 'join-code').fill(secondCode); await t(b, 'join-room').click();
    await waitState(a, value => value?.roomCode === secondCode && value.players.every(player => player.connected) && value.players.length === 2, 'Direct room-code join');
    check(secondCode !== roomCode, 'A fresh match should receive a new room code.');
    await t(a, 'start').click(); await waitState(a, value => value?.phase === 'countdown', 'Second countdown');
    await t(a, 'leave').click(); await t(a, 'stay').click();
    check(await a.locator('main[data-online-view="room"]').isVisible(), 'Canceling the leave confirmation should retain the active room.');
    await waitState(a, value => value?.phase === 'playing', 'Actual play before forfeit');
    await t(a, 'leave').click(); await t(a, 'confirm-leave').click();
    await waitState(b, value => value?.phase === 'finished' && value.endReason === 'forfeit', 'Explicit leave forfeited');
    check(state(b).winnerId === profiles[1].id, 'Deliberately leaving a started match should award the opponent.');
    for (const page of pages) check(await page.evaluate(() => JSON.parse(localStorage.getItem('sozcuk_zinciri_v1')).gold) === 100, 'Online scores should leave offline gold untouched.');
    expectingClosedRoom = true;
    await b.addInitScript(({ key, code }) => { const value = JSON.parse(localStorage.getItem(key)); value.roomCode = code; localStorage.setItem(key, JSON.stringify(value)); }, { key: ONLINE_KEY, code: secondCode });
    await b.reload({ waitUntil: 'networkidle' }); await enterOnline(b);
    await b.locator('main[data-online-view="hub"]').waitFor({ state: 'visible' });
    check((await record(b)).roomCode === '', 'A stale closed-room reservation should return to the social hub and clear its saved code.');
    check((await record(b)).profile.id === profiles[1].id, 'Closed-room recovery should preserve the device account.');
    expectingClosedRoom = false;
    check(errors.length === 0, 'No browser runtime errors: ' + errors.join('; '));
    const report = { checks, failures: 0, profiles: profiles.map(profile => ({ name: profile.name, code: profile.code })), roomCodes: [roomCode, secondCode], expectedApiErrors: apiErrors, consoleErrors: errors };
    fs.writeFileSync(path.join(output, 'online-browser-flow.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    for (let index = 0; index < pages.length; index++) {
      try { await pages[index].screenshot({ path: path.join(output, `online-failure-${index + 1}.png`), fullPage: true }); } catch {}
    }
    console.error(JSON.stringify({ checks, apiErrors, browserErrors: errors }));
    throw error;
  } finally { await Promise.all(contexts.map(context => context.close())); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
