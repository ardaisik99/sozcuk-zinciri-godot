const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'output');
const levels = JSON.parse(fs.readFileSync(path.join(root, 'data/levels.json'), 'utf8'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const products = [{ id: 'hint_pack_2', title: 'İpucu ikilisi', kind: 'hint', quantity: 2, goldPrice: 25, purchasable: true }, { id: 'letter_pack_4', title: 'Harf paketi', kind: 'letter', quantity: 4, goldPrice: 60, purchasable: true }, { id: 'gold_500', title: '500 altın', kind: 'gold', quantity: 500, purchasable: false }, { id: 'remove_ads', title: 'Reklamları kaldır', kind: 'remove_ads', purchasable: false }];
let profile = { id: 'me', name: 'Deniz', code: '1465', avatar: 'mascot-girl', wins: 1, played: 2, gold: 100, inventory: { hint: 0, letter: 0 } }, polls = 0, buyCount = 0;
let base, browser, server, checks = 0, roomSocket, live;
const check = (value, message) => { checks++; assert.ok(value, message); };
const review = [{ prompt: 'SU', answer: 'BARDAĞI', stem: 'BARDAK', status: 'correct', roundNumber: 1 }, { prompt: 'BARDAK', answer: 'ALTI', stem: 'ALT', status: 'skipped', roundNumber: 1 }];
const sendState = () => roomSocket.send(JSON.stringify({ type: 'state', state: { ...live, serverNow: Date.now() } }));
const serverFactory = () => http.createServer(async (req, res) => {
 const url = new URL(req.url, base || 'http://127.0.0.1');
 if (url.pathname.startsWith('/v1/')) {
  let body = ''; for await (const chunk of req) body += chunk; body = body ? JSON.parse(body) : {};
  let response = { ok: true };
  if (url.pathname === '/v1/register') { profile = { ...profile, name: body.name, avatar: body.avatar }; response = { ok: true, profile, token: 'test-token' }; }
  else if (url.pathname === '/v1/me') response.profile = profile;
  else if (url.pathname === '/v1/profile') { profile = { ...profile, ...body }; response.profile = profile; }
  else if (url.pathname === '/v1/friends') Object.assign(response, { friends: [], incoming: [], outgoing: [], invites: [] });
  else if (url.pathname === '/v1/shop') Object.assign(response, { gold: profile.gold, inventory: profile.inventory, removeAds: false, products });
  else if (url.pathname === '/v1/shop/buy') { buyCount++; profile.gold -= 25; profile.inventory.hint += 2; response.profile = profile; }
  else if (url.pathname === '/v1/history') response.history = [{ roomCode: 'ABC123', opponent: { name: 'Kelime Botu', avatar: 'mascot-boy', isBot: true }, score: [2, 1], result: 'win', finishedAt: Date.now(), review }];
  else if (url.pathname === '/v1/matchmaking/join') { polls = 0; Object.assign(response, { status: 'waiting', botAfterAt: Date.now() + 1000 }); }
  else if (url.pathname === '/v1/matchmaking') { polls++; Object.assign(response, { status: 'matched', roomCode: 'ABC123' }); }
  else if (url.pathname === '/v1/matchmaking/cancel') response.status = 'idle';
  else if (/\/v1\/rooms\/ABC123\/join/.test(url.pathname)) response.roomCode = 'ABC123';
  else { res.writeHead(404); res.end(JSON.stringify({ ok: false, reason: 'not_found' })); return; }
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(response)); return;
 }
 let file = url.pathname === '/' ? path.join(root, 'web/index.html') : path.join(root, url.pathname.startsWith('/assets/') || url.pathname.startsWith('/data/') ? url.pathname.slice(1) : 'web/' + url.pathname.slice(1));
 if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
 let content = fs.readFileSync(file); if (file.endsWith(path.join('web', 'index.html'))) content = Buffer.from(content.toString().replace('{"baseUrl":""}', JSON.stringify({ baseUrl: base })));
 res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(content);
});
(async () => {
 try {
  fs.mkdirSync(output, { recursive: true }); server = serverFactory(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = []; const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.on('response', response => { if (response.status() >= 400 && response.request().resourceType() === 'image') errors.push('Missing image: '+new URL(response.url()).pathname); });
  await context.routeWebSocket('**/ws/**', socket => {
   if (socket.url().includes('/rooms/')) {
    roomSocket = socket;
    live = { roomCode: 'ABC123', phase: 'playing', players: [{ ...profile, score: 300, roundWins: 0, connected: true, jokers: { hintUsed: 0, letterUsed: 0, hintLimit: 2, letterLimit: 4 } }, { id: 'bot', name: 'Kelime Botu', code: '', avatar: 'mascot-boy', isBot: true, connected: true, score: 300, roundWins: 0 }], activePlayerId: 'me', activeIndex: 1, questionNumber: 6, questionsPerRound: 6, suddenDeath: false, question: { prompt: 'SU', first: 'B', length: 7, revealed: [], hint: null }, chain: [], deadlineAt: Date.now() + 30000, turnId: 1, roundNumber: 1, messages: [], review: [] };
    sendState();
    socket.onMessage(raw => { const msg = JSON.parse(String(raw)); if (msg.type === 'joker') { const me = live.players[0]; if (msg.kind === 'hint') { me.jokers.hintUsed++; live.question.hint = 'İçecek koymaya yarayan kap.'; } else { me.jokers.letterUsed++; live.question.revealed = [{ index: 2, letter: 'R' }]; } sendState(); } });
   } else socket.send(JSON.stringify({ type: 'ready' }));
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  check(await page.locator('.avatar-choice').count() === 2, 'Onboarding offers two mascot avatars');
  await page.getByTestId('profile-name').fill('Deniz'); await page.locator('[data-avatar="mascot-girl"]').click();
  check(await page.getByTestId('profile-name').inputValue() === 'Deniz', 'Avatar selection preserves entered name');
  await page.screenshot({path:path.join(output,'v8-web-profile.png')});
  await page.getByTestId('profile-submit').click();
  check(await page.locator('.tutorial-tip [data-pose="teacher"]').count() === 1, 'Interactive tutorial uses teacher mascot');
  await page.screenshot({path:path.join(output,'v8-web-tutorial.png')});
  for (let i = 1; i < levels.tutorial.answers.length; i++) { await page.getByTestId('word-input').fill(levels.tutorial.answers[i].slice(1)); await page.getByTestId('submit-guess').click(); if (i + 1 < levels.tutorial.answers.length) await page.waitForTimeout(1000); }
  await page.getByTestId('win-primary').waitFor(); await page.getByTestId('win-primary').click();
  check(await page.locator('.home-profile strong').innerText() === 'Deniz', 'Home upperleft displays player name');
  check((await page.locator('.home-profile img').getAttribute('src')).includes('mascot-girl'), 'Chosen avatar displays on home');
  check(await page.locator('[data-action="friends"]').count() === 1, 'Friends accessible from home');
  check(await page.locator('[data-action="friends"]').evaluate(element => element.getBoundingClientRect().bottom < innerHeight), 'Home friends shortcut visible without scrolling');
  check(await page.locator('[data-action="history"]').count() === 1, 'History accessible from home');
  check(await page.locator('[data-action="shop"]').count() === 1, 'Shop accessible from home');
  check(await page.locator('.mode-card.online img[src*="lock"]').count() === 0, 'Online card has no lock');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sozcuk_zinciri_v1')));
  check(saved.profileAvatar === 'mascot-girl' && saved.tutorialDone, 'Avatar and progress persist together');
  await page.screenshot({path:path.join(output,'v8-web-home.png')});
  await page.locator('[data-action="online"]').click(); await page.getByTestId('online-random').waitFor({timeout:8000}).catch(async error=>{console.log(await page.locator('main').innerText());console.log(errors);throw error});
  await page.screenshot({path:path.join(output,'v8-web-chooser.png')});
  check(await page.getByTestId('online-friends').count() === 1, 'Online entry chooses friend or random');
  await page.locator('[data-online-action="shop"]').click(); await page.getByTestId('online-shop-product').first().waitFor();
  await page.screenshot({path:path.join(output,'v8-web-shop.png')});
  check(await page.getByTestId('online-shop-product').count() === 4, 'Catalog renders server products');
  check(await page.locator('[data-product="gold_500"]').isDisabled(), 'Unconfigured paid currency cannot charge');
  check(await page.locator('[data-product="remove_ads"]').isDisabled(), 'Unconfigured ad removal cannot charge');
  await page.locator('[data-product="hint_pack_2"]').click(); await page.waitForFunction(() => document.querySelector('.oz-shop-wallet h2')?.textContent === '75 altın');
  check(buyCount === 1 && profile.inventory.hint === 2, 'Gold purchase is server backed and exactly once');
  await page.getByTestId('online-back').click(); await page.locator('[data-online-action="history"]').click(); await page.getByTestId('online-history').waitFor();
  check(await page.locator('.oz-history-heading .oz-bot-tag').count() === 1, 'History labels bot opponents');
  await page.locator('.oz-history-card summary').click();
  check((await page.locator('.oz-review').innerText()).includes('ALTI'), 'History includes missed final answer');
  await page.getByTestId('online-back').click(); await page.getByTestId('online-random').click(); await page.locator('[data-online-view="queue"]').waitFor();
  check((await page.locator('.oz-queue').innerText()).includes('bot'), 'Queue clearly discloses fallback bot');
  await page.getByTestId('online-chat-input').waitFor(); await page.waitForFunction(() => !document.querySelector('[data-testid="online-chat-input"]').disabled);
  check(polls === 1, 'Queue polling attaches matched room');
  check((await page.getByTestId('online-active-word').innerText()).replace(/\s+/g, '').includes('SU→B______'), 'Question strip shows server masked answer');
  check((await page.locator('[data-oz="round-info"]').innerText()).includes('6 / 6'), 'Six question progress displays');
  check((await page.locator('[data-oz="scoreboard"]').innerText()).includes('BOT'), 'In-match opponent is explicitly labeled bot');
  check((await page.locator('.oz-series small').innerText()).includes('3 – 3'), 'Round correct count appears alongside series score');
  check((await page.getByTestId('online-joker-hint').innerText()).includes('2/2'), 'Each player begins with two hint rights');
  check((await page.getByTestId('online-joker-letter').innerText()).includes('4/4'), 'Each player begins with four letter rights');
  await page.getByTestId('online-joker-hint').click(); await page.locator('[data-oz="hint-text"]').waitFor({ state: 'visible' });
  check((await page.getByTestId('online-joker-hint').innerText()).includes('1/2'), 'Hint acknowledgement updates remaining rights');
  check(await page.getByTestId('online-joker-hint').isDisabled(), 'Already open hint cannot be bought twice for same question');
  await page.getByTestId('online-joker-letter').click(); await page.waitForFunction(() => document.querySelector('[data-testid="online-active-word"]').textContent.includes('B_R'));
  check((await page.getByTestId('online-joker-letter').innerText()).includes('3/4'), 'Revealed letter updates mask and allowance');
  live.suddenDeath = true; live.questionNumber = 7; sendState(); await page.waitForFunction(() => document.querySelector('[data-oz="round-info"]').textContent.includes('UZATMA'));
  check((await page.locator('[data-oz="round-info"]').innerText()).includes('eşit cevap hakkı'), 'Sudden death communicates equal attempts');
  live.activePlayerId = 'bot'; live.turnId++; sendState(); await page.waitForFunction(() => document.querySelector('[data-testid="online-chat-input"]').disabled);
  check(await page.getByTestId('online-send').isDisabled(), 'Inactive player cannot send');
  check(await page.getByTestId('online-joker-letter').isDisabled(), 'Inactive player cannot use joker');
  const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, input: document.querySelector('[data-testid="online-chat-input"]').getBoundingClientRect().bottom }));
  check(layout.scroll <= layout.width + 1 && layout.input <= 844, 'Mobile battle fits viewport');
  await page.screenshot({ path: path.join(output, 'v8-web-mock-playing.png') });
  await page.setViewportSize({ width: 320, height: 360 }); await page.waitForTimeout(150);
  check(await page.evaluate(() => document.querySelector('[data-testid="online-chat-input"]').getBoundingClientRect().bottom <= innerHeight), 'Composer stays visible with small keyboard viewport');
  await page.setViewportSize({ width: 390, height: 844 });
  live.phase = 'finished'; live.winnerId = 'me'; live.endReason = 'series_complete'; live.players[0].roundWins = 2; live.players[1].roundWins = 1; live.review = review; live.lastCorrect = { answer: 'OYUNU', stem: 'OYUN', at: Date.now() }; sendState();
  await page.locator('[data-oz="result"]').waitFor({ state: 'visible' });
  check((await page.locator('[data-oz="result"]').innerText()).includes('ALTI'), 'Final result reveals missed answer');
  check((await page.locator('[data-oz="result"]').innerText()).includes('OYUNU'), 'Final correct answer remains visible after match ends');
  await page.screenshot({ path: path.join(output, 'v8-web-mock-result.png') });
  check(errors.length === 0, 'No browser JS errors: ' + errors.join('; '));
  fs.writeFileSync(path.join(output, 'v8-web-mock-report.json'), JSON.stringify({ checks, errors, type: 'mock-api-ui-regression', artworkFallback: false }, null, 2));
  console.log(`Web v8 UI fixtures: ${checks} checks passed; no browser errors.`);
 } finally { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
