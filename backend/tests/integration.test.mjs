// Opt-in real Workers/Durable Objects integration. No fake sockets or UI state.
// ONLINE_API_URL=http://127.0.0.1:8787 node --test tests/integration.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DEMO_CHAINS, parseBank } from '../src/chains.mjs';

const configured = process.env.ONLINE_API_URL;
const base = configured?.replace(/\/$/u, '');
const local = configured && ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(configured).hostname);
// A different documentation-only address per local run avoids consuming the
// developer's ten-per-hour account limit. Production never receives this header.
const fixtureIP = `2001:db8:${randomBytes(2).toString('hex')}::${randomBytes(2).toString('hex')}`;
const clients = [];
const WS_WAIT_MS = local ? 8_000 : 12_000;
let suiteSignal;

async function api(path, { method = 'GET', token, body, raw, headers = {} } = {}) {
  const requestHeaders = { ...headers };
  if (token) requestHeaders.Authorization = `Bearer ${token}`;
  if (body !== undefined || raw !== undefined) requestHeaders['Content-Type'] ??= 'application/json';
  if (local) requestHeaders['CF-Connecting-IP'] = fixtureIP;
  const timeout = AbortSignal.timeout(8_000);
  const signal = suiteSignal ? AbortSignal.any([suiteSignal, timeout]) : timeout;
  const response = await fetch(base + path, { method, headers: requestHeaders, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)), signal });
  let data;
  try { data = await response.json(); } catch { throw new Error(`Non-JSON API response for ${path}.`); }
  return { status: response.status, data };
}

async function register(name) {
  const result = await api('/v1/register', { method: 'POST', body: { name } });
  assert.equal(result.status, 200, 'Account creation should succeed.');
  assert.equal(result.data.ok, true);
  assert.ok(typeof result.data.token === 'string' && /^[a-f0-9]{64}$/u.test(result.data.token), 'Registration must supply a valid device credential.');
  assert.match(result.data.profile.code, /^\d{4,12}$/u);
  // Never log, stringify in an assertion, or use the secret in a test title.
  return { token: result.data.token, profile: result.data.profile };
}

const wsURL = (path, account) => {
  const url = new URL(base + path);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('token', account.token);
  return url.href;
};

class SocketClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.history = [];
    this.waiters = new Set();
    this.state = null;
    this.closed = false;
    this.closedPromise = new Promise(resolve => { this.onClosed = resolve; });
    this.socket.addEventListener('message', event => {
      if (typeof event.data !== 'string' || event.data === 'pong') return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'state') this.state = message.state;
      const index = this.history.push(message) - 1;
      for (const waiter of [...this.waiters]) if (index >= waiter.after && waiter.predicate(message)) {
        clearTimeout(waiter.timer);
        this.waiters.delete(waiter);
        waiter.resolve(message);
      }
    });
    this.socket.addEventListener('close', event => {
      this.closed = true;
      this.closeCode = event.code;
      this.onClosed(event.code);
      for (const waiter of this.waiters) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error('Room socket closed before the expected event.'));
      }
      this.waiters.clear();
    });
  }
  static async open(url) {
    const client = new SocketClient(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket connection timed out.')), WS_WAIT_MS);
      client.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      client.socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WebSocket connection failed.')); }, { once: true });
    });
    clients.push(client);
    return client;
  }
  mark() { return this.history.length; }
  send(message) { this.socket.send(JSON.stringify(message)); }
  wait(predicate, after = 0, timeout = WS_WAIT_MS) {
    const prior = this.history.slice(after).find(predicate);
    if (prior) return Promise.resolve(prior);
    if (this.closed) return Promise.reject(new Error('Expected event on an already closed socket.'));
    return new Promise((resolve, reject) => {
      const waiter = { predicate, after, resolve, reject };
      waiter.timer = setTimeout(() => { this.waiters.delete(waiter); reject(new Error('Expected WebSocket event was not received.')); }, timeout);
      this.waiters.add(waiter);
    });
  }
  async waitState(predicate = () => true, after = 0) { return (await this.wait(message => message.type === 'state' && predicate(message.state), after)).state; }
  async close() {
    if (!this.closed) this.socket.close(1000, 'Integration cleanup');
    await Promise.race([this.closedPromise, new Promise(resolve => { const timer = setTimeout(resolve, 1_000); timer.unref(); })]);
  }
}

async function rejectedSocket(path, account) {
  const socket = new WebSocket(wsURL(path, account));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('Unauthorized WebSocket rejection timed out.')); }, 5_000);
    socket.addEventListener('error', () => { clearTimeout(timer); resolve(true); }, { once: true });
    socket.addEventListener('open', () => { clearTimeout(timer); socket.close(); resolve(false); }, { once: true });
  });
}

function chat(client, player, text, extra = {}) {
  const message = { type: 'chat', text, messageId: randomUUID(), turnId: client.state.turnId, ...extra };
  client.send(message);
  return message;
}

function hiddenProjection(state) {
  assert.equal(state.chain.length, 5);
  assert.equal('token' in state, false);
  assert.equal('recentMessageIds' in state, false);
  assert.equal('answers' in state, false);
  for (const cell of state.chain) if (cell.status === 'hidden') {
    assert.deepEqual(Object.keys(cell).sort(), ['first', 'length', 'status']);
    assert.equal(cell.first.length, 1);
    assert.equal(Number.isInteger(cell.length), true);
  }
}

async function configuredBank() {
  if (process.env.ONLINE_CHAIN_BANK) return parseBank(process.env.ONLINE_CHAIN_BANK);
  try { return parseBank(await readFile(new URL('../private/chains.json', import.meta.url), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return DEMO_CHAINS; throw error; }
}

test('real Durable Objects: device accounts, social graph and authoritative two-player WebSockets', { skip: !configured, timeout: local ? 55_000 : 180_000 }, async t => {
  suiteSignal = t.signal;
  const bank = await configuredBank();
  const stage = async (name, run) => {
    let failed = false;
    await t.test(name, async () => {
      try { await run(); } catch (error) { failed = true; throw error; }
    });
    if (failed || t.signal.aborted) throw new Error(`Integration stopped after failed stage: ${name}.`);
  };
  let host, guest, outsider, roomCode, hostSocket, guestSocket, firstScorer, winner;
  try {
    await stage('registration, auth, persistent identity and name validation', async () => {
      assert.equal((await api('/health')).data.ok, true);
      for (const name of ['', 'A', '<script>', 'a'.repeat(19), 'Deniz\nB']) {
        assert.equal((await api('/v1/register', { method: 'POST', body: { name } })).data.reason, 'invalid_name');
      }
      assert.equal((await api('/v1/register', { method: 'POST', raw: '{bad' })).status, 400);
      host = await register('Arda QA');
      guest = await register('Gökçen QA');
      outsider = await register('Deniz QA');
      assert.equal(new Set([host.profile.code, guest.profile.code, outsider.profile.code]).size, 3);
      assert.equal((await api('/v1/me')).status, 401);
      assert.equal((await api('/v1/me', { token: '0'.repeat(64) })).status, 401);
      const before = await api('/v1/me', { token: host.token });
      assert.equal(before.data.profile.id, host.profile.id);
      assert.equal(before.data.profile.code, host.profile.code);
      assert.equal(before.data.profile.played, 0);
      assert.equal('token' in before.data.profile, false);
      assert.equal((await api('/v1/profile', { method: 'POST', token: host.token, body: { name: '<b>Arda</b>' } })).data.reason, 'invalid_name');
      const rename = await api('/v1/profile', { method: 'POST', token: host.token, body: { name: 'Çağrı QA' } });
      assert.equal(rename.data.profile.id, host.profile.id);
      assert.equal(rename.data.profile.code, host.profile.code);
      assert.equal(rename.data.profile.name, 'Çağrı QA');
      host.profile = rename.data.profile;
    });

    await stage('friend requests require recipient acceptance and notify real social sockets', async () => {
      const hostSocial = await SocketClient.open(wsURL('/ws/lobby', host));
      const guestSocial = await SocketClient.open(wsURL('/ws/lobby', guest));
      await hostSocial.wait(message => message.type === 'ready');
      await guestSocial.wait(message => message.type === 'ready');
      assert.equal((await api('/v1/friends/request', { method: 'POST', token: host.token, body: { code: host.profile.code } })).data.reason, 'cannot_add_self');
      const mark = guestSocial.mark();
      assert.equal((await api('/v1/friends/request', { method: 'POST', token: host.token, body: { code: `#${guest.profile.code}` } })).data.ok, true);
      await guestSocial.wait(message => message.type === 'social', mark);
      const hostList = (await api('/v1/friends', { token: host.token })).data;
      const guestList = (await api('/v1/friends', { token: guest.token })).data;
      assert.equal(hostList.outgoing.some(profile => profile.id === guest.profile.id), true);
      assert.equal(guestList.incoming.some(profile => profile.id === host.profile.id), true);
      assert.equal((await api('/v1/friends/respond', { method: 'POST', token: host.token, body: { userId: guest.profile.id, accept: true } })).data.reason, 'request_not_found');
      assert.equal((await api('/v1/friends/respond', { method: 'POST', token: outsider.token, body: { userId: host.profile.id, accept: true } })).data.reason, 'request_not_found');
      assert.equal((await api('/v1/friends/respond', { method: 'POST', token: guest.token, body: { userId: host.profile.id, accept: true } })).data.ok, true);
      assert.equal((await api('/v1/friends', { token: host.token })).data.friends.some(profile => profile.id === guest.profile.id), true);
      assert.equal((await api('/v1/friends', { token: guest.token })).data.friends.some(profile => profile.id === host.profile.id), true);
      await hostSocial.close();
      await guestSocial.close();
    });

    await stage('room ownership, retry recovery, invitations and third-player rejection', async () => {
      const created = await api('/v1/rooms', { method: 'POST', token: host.token, body: {} });
      assert.equal(created.data.ok, true, `Room creation should succeed (${created.data.reason || 'no reason'}).`);
      roomCode = created.data.roomCode;
      assert.match(roomCode, /^[A-HJ-NP-Z2-9]{6}$/u);
      assert.equal((await api('/v1/rooms', { method: 'POST', token: host.token, body: {} })).data.roomCode, roomCode);
      assert.equal((await api(`/v1/rooms/${roomCode}/invite`, { method: 'POST', token: outsider.token, body: { userId: guest.profile.id } })).status, 403);
      assert.equal((await api(`/v1/rooms/${roomCode}/invite`, { method: 'POST', token: host.token, body: { userId: guest.profile.id } })).data.ok, true);
      assert.equal((await api('/v1/friends', { token: guest.token })).data.invites.some(invite => invite.roomCode === roomCode && invite.from.id === host.profile.id), true);
      assert.equal((await api(`/v1/rooms/${roomCode}/join`, { method: 'POST', token: guest.token, body: {} })).data.ok, true);
      assert.equal((await api(`/v1/rooms/${roomCode}/join`, { method: 'POST', token: outsider.token, body: {} })).data.reason, 'room_full');
      assert.equal((await api('/v1/me', { token: outsider.token })).data.activeRoom, null);
      const otherRoom = (await api('/v1/rooms', { method: 'POST', token: outsider.token, body: {} })).data.roomCode;
      assert.equal((await api(`/v1/rooms/${otherRoom}/join`, { method: 'POST', token: host.token, body: {} })).data.reason, 'already_in_room');
      assert.equal(await rejectedSocket(`/ws/rooms/${roomCode}`, outsider), true);
      assert.equal(await rejectedSocket(`/ws/rooms/${roomCode}`, { token: '0'.repeat(64) }), true);
      const extra = await SocketClient.open(wsURL(`/ws/rooms/${otherRoom}`, outsider));
      await extra.waitState();
      extra.send({ type: 'leave' });
      await extra.closedPromise;
      assert.equal((await api('/v1/me', { token: outsider.token })).data.profile.played, 0);
    });

    await stage('two actual room sockets share a hidden snapshot and only host can start', async () => {
      [hostSocket, guestSocket] = await Promise.all([
        SocketClient.open(wsURL(`/ws/rooms/${roomCode}`, host)),
        SocketClient.open(wsURL(`/ws/rooms/${roomCode}`, guest)),
      ]);
      const states = await Promise.all([hostSocket.waitState(state => state.players.length === 2 && state.players.every(player => player.connected)), guestSocket.waitState(state => state.players.length === 2 && state.players.every(player => player.connected))]);
      for (const state of states) hiddenProjection(state);
      assert.equal(states[0].phase, 'waiting');
      assert.equal(states[0].roomCode, states[1].roomCode);
      const mark = guestSocket.mark();
      guestSocket.send({ type: 'start' });
      await guestSocket.wait(message => message.type === 'error' && message.reason === 'host_only', mark);
      assert.equal(guestSocket.state.phase, 'waiting');
      hostSocket.send({ type: 'start' });
      const countdown = await Promise.all([hostSocket.waitState(state => state.phase === 'countdown'), guestSocket.waitState(state => state.phase === 'countdown')]);
      assert.equal(countdown[0].deadlineAt, countdown[1].deadlineAt);
      assert.ok(countdown[0].deadlineAt > countdown[0].serverNow);
      const playing = await Promise.all([hostSocket.waitState(state => state.phase === 'playing'), guestSocket.waitState(state => state.phase === 'playing')]);
      assert.equal(playing[0].deadlineAt, playing[1].deadlineAt);
      assert.equal(playing[0].activePlayerId, playing[1].activePlayerId);
      assert.equal(playing[0].turnId, playing[1].turnId);
      assert.equal(playing[0].deadlineAt - playing[0].serverNow <= 30_000, true);
    });

    await stage('active-only chat, red wrong guesses, checked correct answer and race guards are authoritative', async () => {
      const initial = hostSocket.state;
      const eligible = bank.filter(chain => chain.words[0] === initial.chain[0].stem && chain.answers.every((answer, index) => index === 0 || answer[0] === initial.chain[index].first && answer.length === initial.chain[index].length));
      assert.equal(eligible.length, 1, 'The configured private test bank should identify the server-selected chain.');
      const chain = eligible[0];
      const activeHost = initial.activePlayerId === host.profile.id;
      const active = activeHost ? hostSocket : guestSocket;
      const inactive = activeHost ? guestSocket : hostSocket;
      firstScorer = activeHost ? host : guest;
      winner = activeHost ? guest : host;
      const deadline = initial.deadlineAt;
      const turn = initial.turnId;
      let mark = active.mark();
      chat(inactive, winner, chain.answers[1]);
      await inactive.wait(message => message.type === 'error' && message.reason === 'not_your_turn');
      assert.equal(active.state.players.every(player => player.score === 0), true);
      assert.equal(active.state.messages.some(message => message.playerId === winner.profile.id), false);
      mark = active.mark();
      chat(active, firstScorer, 'naber lan');
      await active.waitState(state => state.messages.at(-1)?.text === 'naber lan' && state.messages.at(-1)?.kind === 'chat', mark);
      mark = active.mark();
      chat(active, firstScorer, chain.words[1]);
      const wrong = await active.waitState(state => state.messages.at(-1)?.kind === 'wrong', mark);
      assert.equal(wrong.deadlineAt, deadline);
      assert.equal(wrong.turnId, turn);
      assert.equal(wrong.activeIndex, 1);
      mark = active.mark();
      const correctCommand = chat(active, firstScorer, chain.answers[1].toLocaleLowerCase('tr-TR'));
      const solved = await active.waitState(state => state.activeIndex === 2 && state.messages.some(message => message.kind === 'correct'), mark);
      assert.equal(solved.messages.at(-1).clientMessageId, correctCommand.messageId);
      assert.equal(solved.players.find(player => player.id === firstScorer.profile.id).score, 100);
      assert.equal(solved.players.find(player => player.id === firstScorer.profile.id).responseMs >= 0, true);
      assert.equal(solved.activePlayerId, winner.profile.id);
      assert.equal(solved.lastCorrect.answer, chain.answers[1]);
      assert.equal(solved.lastCorrect.stem, chain.words[1]);
      assert.equal(solved.chain[1].stem, chain.words[1]);
      assert.equal(solved.chain[1].length, chain.words[1].length);
      hiddenProjection(solved);
      const peerSolved = await inactive.waitState(state => state.activeIndex === 2);
      assert.equal(peerSolved.turnId, solved.turnId);
      const publicMessageId = solved.messages.at(-1).id;
      mark = active.mark();
      active.send(correctCommand);
      const repeated = await active.waitState(state => state.activeIndex === 2, mark);
      assert.equal(repeated.players.find(player => player.id === firstScorer.profile.id).score, 100);
      assert.equal(repeated.messages.at(-1).id, publicMessageId);
      mark = inactive.mark();
      chat(inactive, winner, chain.answers[2], { turnId: turn });
      await inactive.wait(message => message.type === 'error' && message.reason === 'stale_turn', mark);
      assert.equal(inactive.state.activeIndex, 2);
    });

    await stage('disconnect, REST room recovery and socket replacement preserve score and timer', async () => {
      const scorerIsHost = firstScorer.profile.id === host.profile.id;
      const old = scorerIsHost ? hostSocket : guestSocket;
      const peer = scorerIsHost ? guestSocket : hostSocket;
      const before = peer.state;
      const peerMark = peer.mark();
      await old.close();
      await peer.waitState(state => state.players.find(player => player.id === firstScorer.profile.id).connected === false, peerMark);
      assert.equal((await api('/v1/me', { token: firstScorer.token })).data.activeRoom, roomCode);
      assert.equal((await api('/v1/rooms', { method: 'POST', token: firstScorer.token, body: {} })).data.roomCode, roomCode);
      const reconnect = await SocketClient.open(wsURL(`/ws/rooms/${roomCode}`, firstScorer));
      const state = await reconnect.waitState(state => state.players.every(player => player.connected));
      assert.equal(state.activeIndex, before.activeIndex);
      assert.equal(state.turnId, before.turnId);
      assert.equal(state.deadlineAt, before.deadlineAt);
      assert.equal(state.players.find(player => player.id === firstScorer.profile.id).score, 100);
      const replace = await SocketClient.open(wsURL(`/ws/rooms/${roomCode}`, firstScorer));
      const replaced = await replace.waitState(state => state.players.every(player => player.connected));
      await reconnect.closedPromise;
      assert.equal(reconnect.closeCode, 4001);
      assert.equal(replaced.deadlineAt, before.deadlineAt);
      assert.equal(replaced.players.find(player => player.id === firstScorer.profile.id).connected, true);
      if (scorerIsHost) hostSocket = replace; else guestSocket = replace;
    });

    await stage('explicit forfeit overrides score, persists one result and closed-room retries cannot duplicate stats', async () => {
      const loserSocket = firstScorer.profile.id === host.profile.id ? hostSocket : guestSocket;
      const winnerSocket = firstScorer.profile.id === host.profile.id ? guestSocket : hostSocket;
      const mark = winnerSocket.mark();
      loserSocket.send({ type: 'leave' });
      const ended = await winnerSocket.waitState(state => state.phase === 'finished', mark);
      assert.equal(ended.endReason, 'forfeit');
      assert.equal(ended.winnerId, winner.profile.id);
      assert.equal(ended.tieBreak, null);
      assert.equal(ended.players.find(player => player.id === firstScorer.profile.id).score, 100);
      for (const account of [host, guest]) {
        const current = (await api('/v1/me', { token: account.token })).data;
        assert.equal(current.activeRoom, null);
        assert.equal(current.profile.played, 1);
        assert.equal(current.profile.wins, account.profile.id === winner.profile.id ? 1 : 0);
      }
      winnerSocket.send({ type: 'leave' });
      await winnerSocket.closedPromise;
      assert.equal((await api(`/v1/rooms/${roomCode}/join`, { method: 'POST', token: winner.token, body: {} })).data.reason, 'room_closed');
      for (const account of [host, guest]) assert.equal((await api('/v1/me', { token: account.token })).data.profile.played, 1);
    });

    await stage('leaving a new countdown does not count an unplayed match and social cleanup persists', async () => {
      const next = (await api('/v1/rooms', { method: 'POST', token: host.token, body: {} })).data.roomCode;
      assert.notEqual(next, roomCode);
      assert.equal((await api(`/v1/rooms/${next}/join`, { method: 'POST', token: guest.token, body: {} })).data.ok, true);
      const a = await SocketClient.open(wsURL(`/ws/rooms/${next}`, host));
      const b = await SocketClient.open(wsURL(`/ws/rooms/${next}`, guest));
      await a.waitState(state => state.players.every(player => player.connected));
      await b.waitState(state => state.players.every(player => player.connected));
      a.send({ type: 'start' });
      await b.waitState(state => state.phase === 'countdown');
      a.send({ type: 'leave' });
      const closed = await b.waitState(state => state.phase === 'finished');
      assert.equal(closed.endReason, 'room_closed');
      for (const account of [host, guest]) assert.equal((await api('/v1/me', { token: account.token })).data.profile.played, 1);
      assert.equal((await api('/v1/friends/remove', { method: 'POST', token: host.token, body: { userId: guest.profile.id } })).data.ok, true);
      assert.equal((await api('/v1/friends', { token: host.token })).data.friends.length, 0);
      const after = (await api('/v1/friends', { token: guest.token })).data;
      assert.equal(after.friends.length, 0);
      assert.equal(after.invites.some(invite => invite.from.id === host.profile.id), false);
    });
  } finally {
    await Promise.allSettled(clients.map(client => client.close()));
    suiteSignal = undefined;
  }
});
