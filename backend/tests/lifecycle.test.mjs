// Exercise the actual production actors with a deterministic clock, real SQLite
// and a small Cloudflare runtime boundary adapter. No lifecycle rules are copied.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { DEMO_CHAINS } from '../src/chains.mjs';

const runtimeHook = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return {
      url: 'data:text/javascript,export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }',
      shortCircuit: true,
    };
    return nextResolve(specifier, context);
  },
});
const { GameRoom } = await import('../src/room.mjs');
const { Directory } = await import('../src/directory.mjs');
runtimeHook.deregister();

const originalAutoResponse = globalThis.WebSocketRequestResponsePair;
globalThis.WebSocketRequestResponsePair = class {
  constructor(request, response) { this.request = request; this.response = response; }
};
after(() => {
  if (originalAutoResponse === undefined) delete globalThis.WebSocketRequestResponsePair;
  else globalThis.WebSocketRequestResponsePair = originalAutoResponse;
});

const clone = value => value === undefined ? undefined : structuredClone(value);
const BASE = 1_000_000;
const WAIT_TTL = 600_000;
const GRACE = 30_000;
const HISTORY_TTL = 86_400_000;
const host = { id: 'host', code: '1001', name: 'Arda' };
const guest = { id: 'guest', code: '1002', name: 'Gökçen' };
const CODE = 'ABC234';

function roomContext(values = new Map()) {
  const context = {
    values,
    sockets: [],
    alarmAt: null,
    scheduled: [],
    deletedAlarms: 0,
    ready: Promise.resolve(),
    blockConcurrencyWhile(run) { this.ready = Promise.resolve(run()); return this.ready; },
    setWebSocketAutoResponse() {},
    getWebSockets(id) { return this.sockets.filter(socket => socket.readyState !== 3 && (!id || socket.playerId === id)); },
    addSocket(playerId, now) {
      const socket = {
        playerId,
        readyState: 1,
        sent: [],
        closeCalls: 0,
        attachment: { id: playerId, rateStart: now, count: 0 },
        send(message) { this.sent.push(message); },
        close() { this.readyState = 3; this.closeCalls += 1; },
        deserializeAttachment() { return clone(this.attachment); },
        serializeAttachment(value) { this.attachment = clone(value); },
      };
      this.sockets.push(socket);
      return socket;
    },
  };
  context.storage = {
    async get(key) { return clone(values.get(key)); },
    async put(key, value) {
      if (typeof key === 'string') values.set(key, clone(value));
      else for (const [name, item] of Object.entries(key)) values.set(name, clone(item));
    },
    async setAlarm(at) { context.alarmAt = at; context.scheduled.push(at); },
    async deleteAlarm() { context.alarmAt = null; context.deletedAlarms += 1; },
  };
  return context;
}

function sqliteDirectory(t) {
  const database = new DatabaseSync(':memory:');
  t.after(() => database.close());
  const context = {
    getWebSockets() { return []; },
    setWebSocketAutoResponse() {},
    storage: {
      sql: {
        exec(query, ...params) {
          const statement = database.prepare(query);
          const rows = statement.columns().length ? statement.all(...params) : (statement.run(...params), []);
          return { toArray: () => rows };
        },
      },
      transactionSync(run) {
        database.exec('BEGIN');
        try { const result = run(); database.exec('COMMIT'); return result; }
        catch (error) { database.exec('ROLLBACK'); throw error; }
      },
    },
  };
  const directory = new Directory(context, {});
  for (const player of [host, guest]) directory.sql.exec('INSERT INTO users(id,code,name,token_hash,created_at) VALUES(?,?,?,?,?)', player.id, Number(player.code), player.name, `fixture-hash-${player.id}`, BASE);
  return directory;
}

async function fixture(t, { playing = false, reportFailure = null,jokerFailure=null } = {}) {
  const clock = { now: BASE };
  t.mock.method(Date, 'now', () => clock.now);
  const directory = sqliteDirectory(t);
  const reportCalls = [];
  const releases = [];
  let jokerCalls=0;
  const rpc = {
    seenQuestions:(...args)=>directory.seenQuestions(...args),
    markQuestions:(...args)=>directory.markQuestions(...args),
    chargeJoker:(...args)=>{
      jokerCalls++;
      if(jokerFailure==='before-commit'&&jokerCalls===1)throw new Error('Debit temporarily unavailable');
      const result=directory.chargeJoker(...args);
      if(jokerFailure==='after-commit'&&jokerCalls===1)throw new Error('Debit acknowledgement lost');
      return result;
    },
    reserveRoom: (...args) => directory.reserveRoom(...args),
    releaseRoom: (...args) => { releases.push(args); return directory.releaseRoom(...args); },
    finishMatch: (...args) => {
      reportCalls.push({ at: clock.now, played: args[3] });
      if (reportFailure === 'before-commit' && reportCalls.length === 1) throw new Error('Fixture directory unavailable.');
      const result = directory.finishMatch(...args);
      if (reportFailure === 'after-commit' && reportCalls.length === 1) throw new Error('Fixture acknowledgement lost.');
      return result;
    },
  };
  const env = { CHAIN_BANK: JSON.stringify(DEMO_CHAINS), DIRECTORY: { getByName: () => rpc } };
  const context = roomContext();
  const room = new GameRoom(context, env);
  await context.ready;
  directory.reserveRoom(host.id, CODE);
  assert.equal((await room.initialize(CODE, host)).ok, true);
  // A real upgrade performs precisely this presence handoff. Socket transport
  // itself is covered by integration.test.mjs against the running Wrangler DO.
  const hostSocket = context.addSocket(host.id, clock.now);
  room.match.players[0].connected = true;
  delete room.disconnected[host.id];
  await room.save();
  let guestSocket;
  if (playing) {
    directory.reserveRoom(guest.id, CODE);
    assert.equal((await room.join(guest)).ok, true);
    guestSocket = context.addSocket(guest.id, clock.now);
    room.match.players.find(player => player.id === guest.id).connected = true;
    delete room.disconnected[guest.id];
    room.match.startingPlayerIndex = 0;
    await room.webSocketMessage(hostSocket, JSON.stringify({ type: 'start' }));
    clock.now = room.match.deadlineAt;
    await room.alarm();
    assert.equal(room.match.phase, 'playing');
  }
  return { room, context, directory, env, clock, hostSocket, guestSocket, reportCalls, releases };
}

const profile = (directory, id) => directory.one('SELECT played,wins,active_room FROM users WHERE id=?', id);
const completed = directory => directory.one('SELECT COUNT(*) AS count FROM completed').count;

test('a connected waiting host expires once at ten minutes and never enters an immediate alarm loop', async t => {
  const f = await fixture(t);
  f.clock.now = BASE + WAIT_TTL - 1;
  await f.room.alarm();
  assert.equal(f.room.match.phase, 'waiting');
  assert.ok(f.context.alarmAt >= BASE + WAIT_TTL && f.context.alarmAt <= BASE + WAIT_TTL + 5);
  f.clock.now = f.context.alarmAt;
  await f.room.alarm();
  assert.equal(f.room.match.phase, 'finished');
  assert.equal(f.room.match.endReason, 'room_closed');
  assert.equal(f.room.match.finishedAt, BASE + WAIT_TTL);
  assert.equal(f.reportCalls.length, 1);
  assert.equal(f.reportCalls[0].played, false);
  assert.equal(profile(f.directory, host.id).played, 0);
  assert.equal(profile(f.directory, host.id).active_room, null);
  assert.equal(f.context.alarmAt, BASE + WAIT_TTL + HISTORY_TTL);
  assert.equal((await f.room.status(host.id)).phase, 'finished');
  assert.equal((await f.room.join(guest)).reason, 'room_closed');
  await f.room.alarm();
  assert.equal(f.reportCalls.length, 1);
  assert.equal(completed(f.directory), 1);
  assert.ok(f.context.alarmAt > f.clock.now + 60_000, 'A finished waiting room must not schedule now+5ms repeatedly.');
});

for(const loss of ['before-commit','after-commit'])test(`pending joker survives ${loss} failure and actor restart without a second charge`,async t=>{
  const f=await fixture(t,{playing:true,jokerFailure:loss});
  const id=f.room.match.activePlayerId,socket=id===host.id?f.hostSocket:f.guestSocket;
  const command={type:'joker',kind:'letter',requestId:'durable-joker',turnId:f.room.match.turnId};
  await assert.rejects(()=>f.room.webSocketMessage(socket,JSON.stringify(command)));
  const persisted=await f.context.storage.get('match');
  assert.equal(persisted.pendingJoker.requestId,'durable-joker');
  assert.equal(persisted.chain[persisted.activeIndex].revealed.length,0);
  assert.equal(f.directory.wallet(id).gold,loss==='after-commit'?80:100);
  const replacement=new GameRoom(f.context,f.env);await f.context.ready;f.clock.now+=20;
  await replacement.alarm();
  assert.equal(f.directory.wallet(id).gold,80);
  assert.equal(replacement.match.chain[replacement.match.activeIndex].revealed.length,1);
  assert.equal(replacement.match.players.find(p=>p.id===id).jokers.letterUsed,1);
  assert.equal((await f.context.storage.get('match')).pendingJoker,null);
  await replacement.webSocketMessage(socket,JSON.stringify(command));
  assert.equal(f.directory.wallet(id).gold,80);
  assert.equal(replacement.match.players.find(p=>p.id===id).jokers.letterUsed,1);
  assert.equal(socket.sent.some(raw=>JSON.parse(raw).state?.question?.revealed?.length===1),true);
});

test('a delayed alarm applies disconnect grace at its original cutoff before later timeout skips', async t => {
  const f = await fixture(t, { playing: true });
  const playStart = f.clock.now;
  await f.room.webSocketClose(f.hostSocket, 1000);
  assert.equal(f.room.disconnected[host.id], playStart);
  f.clock.now = playStart + 200_000;
  await f.room.alarm();
  assert.equal(f.room.match.phase, 'finished');
  assert.equal(f.room.match.endReason, 'forfeit');
  assert.equal(f.room.match.winnerId, guest.id);
  assert.equal(f.room.match.finishedAt, playStart + GRACE);
  assert.equal(f.room.match.activeIndex, 1, 'A late callback must not reveal four words before honoring the earlier disconnect.');
  assert.equal(f.room.match.chain[1].status, 'unanswered', 'The active unanswered question is revealed when a player forfeits.');
  assert.equal(f.room.match.chain.slice(2).every(cell => cell.status === 'hidden'), true, 'Queued future answers must stay private.');
  assert.equal(profile(f.directory, host.id).played, 1);
  assert.equal(profile(f.directory, guest.id).wins, 1);
  assert.equal(f.reportCalls.length, 1);
});

test('a failed result report persists pending status, retries on alarm, and credits statistics once', async t => {
  const f = await fixture(t, { playing: true, reportFailure: 'before-commit' });
  f.clock.now += 1_000;
  await f.room.webSocketMessage(f.hostSocket, JSON.stringify({ type: 'leave' }));
  assert.equal(f.room.match.phase, 'finished');
  assert.equal(f.room.reported, false);
  assert.equal(await f.context.storage.get('reported'), false);
  assert.equal(profile(f.directory, guest.id).played, 0);
  assert.equal(f.context.alarmAt, f.clock.now + 15_000);
  f.clock.now = f.context.alarmAt;
  await f.room.alarm();
  assert.equal(f.room.reported, true);
  assert.equal(await f.context.storage.get('reported'), true);
  assert.equal(profile(f.directory, host.id).played, 1);
  assert.equal(profile(f.directory, guest.id).played, 1);
  assert.equal(profile(f.directory, guest.id).wins, 1);
  assert.equal(f.reportCalls.length, 2);
  assert.equal(completed(f.directory), 1);
  await f.room.alarm();
  assert.equal(f.reportCalls.length, 2);
  assert.equal(profile(f.directory, guest.id).wins, 1);
});

test('lost result acknowledgement plus actor restart cannot double-credit committed SQLite statistics', async t => {
  const f = await fixture(t, { playing: true, reportFailure: 'after-commit' });
  f.clock.now += 1_000;
  await f.room.webSocketMessage(f.hostSocket, JSON.stringify({ type: 'leave' }));
  assert.equal(f.room.reported, false);
  assert.equal(profile(f.directory, guest.id).wins, 1);
  const restoredContext = roomContext(f.context.values);
  const restoredRoom = new GameRoom(restoredContext, f.env);
  await restoredContext.ready;
  assert.equal(restoredRoom.reported, false);
  f.clock.now += 15_000;
  await restoredRoom.alarm();
  assert.equal(restoredRoom.reported, true);
  assert.equal(f.reportCalls.length, 2);
  assert.equal(completed(f.directory), 1);
  assert.equal(profile(f.directory, host.id).played, 1);
  assert.equal(profile(f.directory, guest.id).played, 1);
  assert.equal(profile(f.directory, guest.id).wins, 1);
});

test('history expiry closes sockets, purges messages and deletes its alarm after reporting', async t => {
  const f = await fixture(t, { playing: true });
  await f.room.webSocketMessage(f.hostSocket, JSON.stringify({ type: 'leave' }));
  assert.ok(f.room.match.messages.length > 0);
  f.clock.now = f.room.match.finishedAt + HISTORY_TTL;
  await f.room.alarm();
  assert.equal(f.room.purged, true);
  assert.deepEqual(f.room.match.messages, []);
  assert.deepEqual(f.room.match.recentMessageIds, []);
  assert.equal(f.guestSocket.readyState, 3);
  assert.equal(f.context.alarmAt, null);
  assert.equal(f.reportCalls.length, 1);
  await f.room.alarm();
  assert.equal(f.context.alarmAt, null);
  assert.equal(profile(f.directory, guest.id).wins, 1);
});

test('rejoining an expired disconnected guest preserves the fresh room reservation', async t => {
  const f = await fixture(t);
  f.directory.reserveRoom(guest.id, CODE);
  assert.equal((await f.room.join(guest)).ok, true);
  assert.equal(f.room.disconnected[guest.id], BASE);
  f.clock.now = BASE + GRACE + 1;
  // The REST adapter reserves before calling room.join. room.join must not let
  // expiry of the old membership erase the reservation for the successful join.
  assert.equal(f.directory.reserveRoom(guest.id, CODE).ok, true);
  assert.equal((await f.room.join(guest)).ok, true);
  assert.equal(f.room.match.players.length, 2);
  assert.equal(f.room.match.players.some(player => player.id === guest.id), true);
  assert.equal(profile(f.directory, guest.id).active_room, CODE);
  assert.equal(profile(f.directory, guest.id).played, 0);
});
