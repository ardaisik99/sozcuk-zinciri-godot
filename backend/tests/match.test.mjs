import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatch, joinMatch, startMatch, sendMessage, advanceTime, leaveMatch, continueRound,
  publicMatch, nextAlarm, normalizeAnswer, COUNTDOWN_MS, TURN_MS, MATCH_MS,
  MESSAGE_HISTORY_LIMIT, PUBLIC_MESSAGE_LIMIT, RECENT_MESSAGE_LIMIT,
} from '../src/match.mjs';
import { DEMO_CHAINS, parseBank, pickChain } from '../src/chains.mjs';

// Public rules fixtures, deliberately separate from the production secret bank.
const TEST_CHAIN = { id: 'test', words: ['ÇORBA', 'KAŞIK', 'OYUN', 'HAVA', 'DURUM'], answers: ['ÇORBA', 'KAŞIĞI', 'OYUNU', 'HAVASI', 'DURUMU'], links: ['Çorba kaşığı', 'Kaşık oyunu', 'Oyun havası', 'Hava durumu'] };
const RECORD_CHAIN = { id: 'record', words: ['OKUL', 'ZİL', 'SES', 'KAYIT', 'CİHAZ'], answers: ['OKUL', 'ZİLİ', 'SESİ', 'KAYDI', 'CİHAZI'], links: ['Okul zili', 'Zil sesi', 'Ses kaydı', 'Kayıt cihazı'] };

const host = { id: 'host-id', name: 'Arda', code: 'AR2K7P' };
const guest = { id: 'guest-id', name: 'Gökçen', code: 'GK8M3R' };
const outsider = { id: 'other-id', name: 'Deniz', code: 'DN4S9T' };
const CREATED = 1_000;
const START = CREATED + COUNTDOWN_MS;
let messageId = 0;

function waiting(chain = TEST_CHAIN) {
  return createMatch({ roomCode: 'ABC123', host, chain, now: CREATED });
}
function running(chain = TEST_CHAIN) {
  const match = waiting(chain);
  assert.equal(joinMatch(match, guest, CREATED).ok, true);
  assert.equal(startMatch(match, host.id, CREATED).ok, true);
  assert.equal(advanceTime(match, START).ok, true);
  return match;
}
function send(match, playerId, text, now = START + 1, extra = {}) {
  return sendMessage(match, { playerId, text, turnId: match.turnId, messageId: `test-${++messageId}`, ...extra }, now);
}
const score = (match, id) => match.players.find(player => player.id === id).score;
const target = match => match.chain[match.activeIndex].answer;

test('public demo bank has three valid offline examples and no shared mutable records', () => {
  assert.equal(DEMO_CHAINS.length, 3);
  assert.equal(new Set(DEMO_CHAINS.map(chain => chain.id)).size, 3);
  for (const chain of DEMO_CHAINS) {
    assert.equal(chain.words.length, 5);
    assert.equal(chain.answers.length, 5);
    assert.equal(chain.links.length, 4);
    assert.equal(chain.answers[0], chain.words[0]);
    for (let index = 1; index < 5; index++) {
      assert.equal(chain.answers[index], normalizeAnswer(chain.links[index - 1].split(' ').at(-1)), chain.id);
      assert.equal(normalizeAnswer(chain.answers[index]), chain.answers[index]);
    }
    assert.equal(Object.isFrozen(chain.words), true);
    const match = waiting(chain);
    match.chain[1].stem = 'CHANGED';
    assert.notEqual(chain.words[1], 'CHANGED');
  }
  assert.equal(pickChain(() => 0).id, 'demo_01');
  assert.equal(pickChain(() => 0.99999).id, 'demo_03');
  for (const bad of [1, -0.1, NaN, Infinity]) assert.throws(() => pickChain(() => bad), RangeError);
});

test('production bank parsing fails closed without a valid secret and validates five-word records', () => {
  assert.throws(() => parseBank(undefined), /private_chain_bank_missing/);
  for (const value of ['{broken', '[]', '{}', JSON.stringify([{ ...TEST_CHAIN, answers: ['X'] }]), JSON.stringify([TEST_CHAIN, TEST_CHAIN])]) assert.throws(() => parseBank(value), /invalid_chain_bank/);
  const parsed = parseBank(JSON.stringify([TEST_CHAIN]));
  assert.equal(parsed.length, 1);
  assert.equal(pickChain(() => 0, parsed).id, 'test');
  assert.equal(Object.isFrozen(parsed), true);
});

test('creation validates authoritative setup and starts with only the first word public', () => {
  const match = waiting();
  assert.equal(match.phase, 'waiting');
  assert.equal(match.turnId, 0);
  assert.equal(match.activeIndex, 1);
  assert.equal(nextAlarm(match), null);
  assert.equal(publicMatch(match, CREATED).chain[0].stem, 'ÇORBA');
  assert.throws(() => createMatch({ roomCode: 'X', host, chain: { words: ['A'], answers: ['A'] }, now: CREATED }), TypeError);
  assert.throws(() => createMatch({ roomCode: 'X', host, chain: TEST_CHAIN, now: NaN }), TypeError);
});

test('room membership is two players maximum, duplicate reconnect cannot reset score', () => {
  const match = waiting();
  assert.equal(joinMatch(match, guest, CREATED).ok, true);
  assert.equal(joinMatch(match, outsider, CREATED).reason, 'room_full');
  match.players[1].score = 100;
  match.players[1].connected = false;
  const rejoin = joinMatch(match, { ...guest, score: 999999 }, CREATED);
  assert.equal(rejoin.ok, true);
  assert.equal(rejoin.duplicate, true);
  assert.equal(score(match, guest.id), 100);
  assert.equal(match.players[1].connected, true);
  assert.equal(match.players.length, 2);
});

test('only the host can start, exactly two connected players are required', () => {
  const match = waiting();
  assert.equal(startMatch(match, guest.id, CREATED).reason, 'host_only');
  assert.equal(startMatch(match, host.id, CREATED).reason, 'need_two_players');
  joinMatch(match, guest, CREATED);
  match.players[1].connected = false;
  assert.equal(startMatch(match, host.id, CREATED).reason, 'player_disconnected');
  match.players[1].connected = true;
  assert.equal(startMatch(match, host.id, CREATED).ok, true);
  assert.equal(startMatch(match, host.id, CREATED).reason, 'match_started');
  assert.equal(joinMatch(match, outsider, CREATED).reason, 'match_started');
});

test('three-second synchronized countdown is real, no early guess can score', () => {
  const match = waiting();
  joinMatch(match, guest, CREATED);
  startMatch(match, host.id, CREATED);
  assert.equal(match.deadlineAt, START);
  assert.equal(nextAlarm(match), START);
  assert.equal(match.matchEndsAt, START + MATCH_MS);
  assert.equal(match.startedAt, null, 'A planned countdown must not count as a played match.');
  const early = send(match, host.id, 'KAŞIĞI', START - 1);
  assert.equal(early.reason, 'not_playing');
  assert.equal(score(match, host.id), 0);
  assert.equal(match.phase, 'countdown');
  advanceTime(match, START);
  assert.equal(match.phase, 'playing');
  assert.equal(match.startedAt, START);
  assert.equal(match.activePlayerId, host.id);
  assert.equal(match.deadlineAt, START + TURN_MS);
});

test('wrong single-word guesses turn red but preserve the same 30-second budget', () => {
  const match = running();
  const turn = match.turnId;
  const deadline = match.deadlineAt;
  for (const [index, text] of ['YANLIŞ', 'KAŞIK', 'AŞIĞI'].entries()) {
    const result = send(match, host.id, text, START + index + 1);
    assert.equal(result.kind, 'wrong');
    assert.equal(match.messages.at(-1).kind, 'wrong');
    assert.equal(match.turnId, turn);
    assert.equal(match.deadlineAt, deadline);
    assert.equal(match.activeIndex, 1);
    assert.equal(score(match, host.id), 0);
  }
});

test('active-player conversation is neutral and inactive players cannot send any messages', () => {
  const match = running();
  const turn = match.turnId;
  const deadline = match.deadlineAt;
  for (const text of ['naber lan', 'merhaba!', '<b>selam</b>']) assert.equal(send(match, host.id, text).kind, 'chat');
  const history=match.messages.length;
  for(const text of ['KAŞIĞI','naber lan','merhaba!'])assert.equal(send(match, guest.id, text).reason, 'not_your_turn');
  assert.equal(match.messages.length,history);
  assert.equal(match.turnId, turn);
  assert.equal(match.deadlineAt, deadline);
  assert.deepEqual(match.players.map(player => player.score), [0, 0]);
});

test('natural inflected answer awards once, switches player, exposes exact stem transition', () => {
  const match = running();
  const oldTurn = match.turnId;
  const result = send(match, host.id, 'kaşığı', START + 10);
  assert.deepEqual({ kind: result.kind, answer: result.answer, stem: result.stem, index: result.index }, { kind: 'correct', answer: 'KAŞIĞI', stem: 'KAŞIK', index: 1 });
  assert.equal(score(match, host.id), 100);
  assert.equal(match.activePlayerId, guest.id);
  assert.equal(match.activeIndex, 2);
  assert.equal(match.turnId, oldTurn + 1);
  assert.equal(match.deadlineAt, START + 10 + TURN_MS);
  assert.deepEqual(match.lastCorrect, { answer: 'KAŞIĞI', stem: 'KAŞIK', index: 1, at: START + 10, playerId: host.id, turnId: oldTurn });
  const publicCell = publicMatch(match, START + 10).chain[1];
  assert.deepEqual(publicCell, { stem: 'KAŞIK', answer: 'KAŞIĞI', first: 'K', length: 5, status: 'solved' });
});

test('Turkish NFC normalization accepts dotted/dotless letters and decomposed marks', () => {
  assert.equal(normalizeAnswer('ışığı'), 'IŞIĞI');
  assert.equal(normalizeAnswer('şiir'), 'ŞİİR');
  const match = running();
  assert.equal(send(match, host.id, ' kas\u0327ıg\u0306ı ').kind, 'correct');
});

test('duplicate message IDs and stale turn messages cannot award twice or hit a later word', () => {
  const match = running();
  const oldTurn = match.turnId;
  assert.equal(send(match, host.id, 'KAŞIĞI', START + 1, { messageId: 'same' }).kind, 'correct');
  assert.equal(publicMatch(match, START + 1).messages.at(-1).clientMessageId, 'same');
  const history = match.messages.length;
  const duplicate = send(match, host.id, 'KAŞIĞI', START + 2, { messageId: 'same', turnId: oldTurn });
  assert.equal(duplicate.duplicate, true);
  assert.equal(match.messages.length, history);
  assert.equal(match.messages.filter(message => message.clientMessageId === 'same').length, 1);
  assert.equal(score(match, host.id), 100);
  assert.equal(send(match, guest.id, 'OYUNU', START + 2, { turnId: oldTurn }).reason, 'stale_turn');
  assert.equal(match.activeIndex, 2);
  assert.equal(score(match, guest.id), 0);
});

test('deadline boundary is exclusive and a late message advances the clock before validation', () => {
  const match = running();
  const deadline = match.deadlineAt;
  const turn = match.turnId;
  const late = send(match, host.id, 'KAŞIĞI', deadline, { turnId: turn });
  assert.equal(late.reason, 'not_your_turn');
  assert.equal(late.changed, true);
  assert.equal(match.activePlayerId, guest.id);
  assert.equal(score(match, host.id), 0);
  assert.equal(match.activeIndex, 1);
  assert.equal(send(match, guest.id, 'KAŞIĞI', deadline).kind, 'correct');
  assert.equal(score(match, guest.id), 100);
});

test('answer one millisecond before timeout wins; a duplicate old alarm does nothing', () => {
  const match = running();
  const oldDeadline = match.deadlineAt;
  assert.equal(send(match, host.id, 'KAŞIĞI', oldDeadline - 1).kind, 'correct');
  assert.equal(advanceTime(match, oldDeadline).changed, false);
  assert.equal(match.activeIndex, 2);
  assert.equal(match.activePlayerId, guest.id);
  assert.equal(score(match, host.id), 100);
});

test('one timeout hands the same hidden word to the opponent; the second reveals and skips', () => {
  const match = running();
  advanceTime(match, START + TURN_MS);
  assert.equal(match.activeIndex, 1);
  assert.equal(match.activePlayerId, guest.id);
  assert.equal(publicMatch(match, START + TURN_MS).chain[1].status, 'hidden');
  advanceTime(match, START + 2 * TURN_MS);
  assert.equal(match.activeIndex, 2);
  assert.equal(match.activePlayerId, host.id);
  const skipped = publicMatch(match, START + 2 * TURN_MS).chain[1];
  assert.equal(skipped.status, 'skipped');
  assert.equal(skipped.answer, 'KAŞIĞI');
  assert.equal(skipped.stem, 'KAŞIK');
  assert.deepEqual(match.players.map(player => player.score), [0, 0]);
  assert.equal(advanceTime(match, START + 2 * TURN_MS).changed, false);
});

test('a correct answer resets consecutive timeout count for the next word', () => {
  const match = running();
  advanceTime(match, match.deadlineAt);
  send(match, guest.id, 'KAŞIĞI', START + TURN_MS + 1);
  assert.equal(match.consecutiveTimeouts, 0);
  advanceTime(match, match.deadlineAt);
  assert.equal(match.activeIndex, 2);
  assert.equal(match.consecutiveTimeouts, 1);
  assert.equal(match.chain[2].status, 'hidden');
});

test('late/retried alarms end an idle round deterministically without consuming a series round', () => {
  const match = running();
  advanceTime(match, START + 10 * TURN_MS);
  assert.equal(match.phase, 'round_end');
  assert.equal(match.finishedAt, null);
  assert.equal(match.roundEndedAt, START + 8 * TURN_MS);
  assert.equal(match.roundResult.reason, 'chain_complete');
  assert.equal(match.winnerId, null);
  assert.equal(nextAlarm(match), null);
  assert.equal(match.chain.slice(1).every(cell => cell.status === 'skipped'), true);
  const serialized = JSON.stringify(match);
  assert.equal(advanceTime(match, START + 11 * TURN_MS).changed, false);
  assert.equal(JSON.stringify(match), serialized);
});

test('four alternating correct answers with equal response time draw the round', () => {
  const match = running();
  for (let index = 1; index < 5; index++) assert.equal(send(match, match.activePlayerId, target(match), START + index).kind, 'correct');
  assert.equal(match.phase, 'round_end');
  assert.equal(match.roundResult.reason, 'chain_complete');
  assert.deepEqual(match.players.map(player => player.score), [200, 200]);
  assert.equal(match.winnerId, null);
  assert.equal(match.tieBreak, null);
  assert.deepEqual(match.players.map(player => player.responseMs), [2, 2]);
  assert.equal(match.activePlayerId, null);
  assert.equal(match.deadlineAt, null);
});

test('equal positive scores use total server-measured correct response time as speed tie-break', () => {
  const match = running();
  let now = START;
  for (const delay of [10, 20, 10, 20]) {
    now += delay;
    assert.equal(send(match, match.activePlayerId, target(match), now).kind, 'correct');
  }
  assert.deepEqual(match.players.map(player => player.score), [200, 200]);
  assert.deepEqual(match.players.map(player => player.responseMs), [20, 40]);
  assert.equal(match.roundResult.winnerId, host.id);
  assert.equal(match.tieBreak, 'speed');
  const view = publicMatch(match, now);
  assert.equal(view.tieBreak, 'speed');
  assert.deepEqual(view.players.map(player => player.responseMs), [20, 40]);
});

test('winner is the higher score; a skipped opportunity cannot produce points', () => {
  const match = running();
  let now = START + 1;
  for (let index = 1; index < 5; index++) {
    if (match.activePlayerId !== host.id) {
      now = match.deadlineAt;
      advanceTime(match, now);
    }
    now += 1;
    assert.equal(send(match, host.id, target(match), now).kind, 'correct');
  }
  assert.equal(match.roundResult.winnerId, host.id);
  assert.deepEqual(match.players.map(player => player.score), [400, 0]);
});

test('hard lifetime deadline finishes before any later turn event', () => {
  const match = running();
  match.matchEndsAt = START + 5_000;
  assert.equal(nextAlarm(match), START + 5_000);
  advanceTime(match, START + 50_000);
  assert.equal(match.roundResult.reason, 'time_limit');
  assert.equal(match.roundEndedAt, START + 5_000);
  assert.equal(match.winnerId, null);
  assert.equal(match.chain[1].status, 'hidden');
});

test('explicit leave during play forfeits immediately even if the leaver was ahead', () => {
  const match = running();
  send(match, host.id, 'KAŞIĞI', START + 1);
  assert.equal(leaveMatch(match, outsider.id, START + 2).reason, 'not_player');
  assert.equal(leaveMatch(match, host.id, START + 2).ok, true);
  assert.equal(match.endReason, 'forfeit');
  assert.equal(match.winnerId, guest.id);
  assert.equal(score(match, host.id), 100);
  leaveMatch(match, guest.id, START + 3);
  assert.equal(match.winnerId, guest.id);
});

test('guest leaving countdown returns lobby to waiting; host leaving closes it without a win', () => {
  const match = waiting();
  joinMatch(match, guest, CREATED);
  startMatch(match, host.id, CREATED);
  leaveMatch(match, guest.id, START - 1);
  assert.equal(match.phase, 'waiting');
  assert.equal(match.players.length, 1);
  assert.equal(nextAlarm(match), null);
  assert.equal(match.matchEndsAt, null);
  joinMatch(match, outsider, START - 1);
  assert.equal(startMatch(match, host.id, START - 1).ok, true);
  leaveMatch(match, host.id, START - 1);
  assert.equal(match.endReason, 'room_closed');
  assert.equal(match.winnerId, null);
  assert.equal(match.startedAt, null, 'Host departure during countdown must not create played/win stats.');
});

test('reconnection preserves current timer, score and word while restoring presence', () => {
  const match = running();
  send(match, host.id, 'KAŞIĞI', START + 1);
  match.players[0].connected = false;
  const deadline = match.deadlineAt;
  const turn = match.turnId;
  joinMatch(match, { ...host, score: 0 }, START + 100);
  assert.equal(match.players[0].connected, true);
  assert.equal(score(match, host.id), 100);
  assert.equal(match.activeIndex, 2);
  assert.equal(match.deadlineAt, deadline);
  assert.equal(match.turnId, turn);
});

test('invalid, oversized, control-character and unauthorized messages do not enter history', () => {
  const match = running();
  const history = match.messages.length;
  for (const text of ['', '   ', 'a'.repeat(161), 'a\nb', 'a\u0085b', { text: 'KAŞIĞI' }]) assert.equal(send(match, host.id, text).reason, 'invalid_text');
  assert.equal(send(match, outsider.id, 'KAŞIĞI').reason, 'not_player');
  assert.equal(send(match, host.id, 'KAŞIĞI', START + 1, { messageId: '' }).reason, 'invalid_message_id');
  assert.equal(send(match, host.id, 'KAŞIĞI', START + 1, { turnId: undefined }).reason, 'stale_turn');
  assert.equal(match.messages.length, history);
  assert.equal(send(match, host.id, 'a'.repeat(160)).kind, 'wrong');
  assert.equal(match.activeIndex, 1);
});

test('public snapshots never contain hidden stems, answers, bank metadata or mutable references', () => {
  const match = running(RECORD_CHAIN);
  const view = publicMatch(match, START);
  assert.equal(view.serverNow, START);
  assert.equal('recentMessageIds' in view, false);
  assert.equal('hostId' in view, false);
  for (let index = 1; index < 5; index++) {
    assert.deepEqual(Object.keys(view.chain[index]).sort(), ['first', 'length', 'status']);
    assert.equal(view.chain[index].length, match.chain[index].answer.length);
  }
  view.players[0].name = 'CHANGED';
  view.chain[0].stem = 'CHANGED';
  assert.equal(match.players[0].name, 'Arda');
  assert.equal(match.chain[0].stem, 'OKUL');
  send(match, host.id, 'ZİLİ');
  const solved = publicMatch(match, START + 1);
  solved.lastCorrect.answer = 'CHANGED';
  assert.equal(match.lastCorrect.answer, 'ZİLİ');
  assert.equal('answer' in solved.chain[2], false);
});

test('chat history and recent idempotency state are bounded, public history keeps latest 60', () => {
  const match = running();
  for (let i = 0; i < 150; i++) assert.equal(send(match, host.id, `sohbet ${i}`).kind, 'chat');
  assert.equal(match.messages.length, MESSAGE_HISTORY_LIMIT);
  assert.equal(match.recentMessageIds.length, RECENT_MESSAGE_LIMIT);
  const view = publicMatch(match, START + 1);
  assert.equal(view.messages.length, PUBLIC_MESSAGE_LIMIT);
  assert.equal(view.messages.at(-1).text, 'sohbet 149');
  assert.equal(view.messages[0].text, 'sohbet 90');
  assert.equal(match.activeIndex, 1);
});

test('persisted JSON state resumes a pending turn and the configurable starter deterministically', () => {
  const created = waiting();
  joinMatch(created, guest, CREATED);
  created.startingPlayerIndex = 1;
  startMatch(created, host.id, CREATED);
  const match = JSON.parse(JSON.stringify(created));
  advanceTime(match, START);
  assert.equal(match.activePlayerId, guest.id);
  send(match, guest.id, 'KAŞIĞI', START + 1);
  const restored = JSON.parse(JSON.stringify(match));
  advanceTime(restored, restored.deadlineAt);
  assert.equal(score(restored, guest.id), 100);
  assert.equal(restored.activeIndex, 2);
  assert.equal(restored.activePlayerId, guest.id);
  assert.equal(restored.consecutiveTimeouts, 1);
});

function decisiveRound(match,winnerId) {
  if(match.phase==='countdown')advanceTime(match,match.deadlineAt);
  let now=match.roundStartedAt;
  while(match.phase==='playing'){
    now+=match.activePlayerId===winnerId?10:100;
    assert.equal(send(match,match.activePlayerId,target(match),now).kind,'correct');
  }
  assert.equal(match.roundResult.winnerId,winnerId);
  return now;
}
function readyBoth(match,chain=RECORD_CHAIN) {
  const now=match.roundEndedAt+1;
  assert.equal(continueRound(match,host.id,chain,now).ok,true);
  assert.equal(continueRound(match,guest.id,chain,now+1).ok,true);
  assert.equal(match.phase,'countdown');
  return now+1;
}

test('two wins end the series 2-0 without opening a third round',()=>{
  const match=running();
  decisiveRound(match,host.id);
  assert.equal(match.phase,'round_end');
  assert.deepEqual(match.players.map(p=>p.roundWins),[1,0]);
  assert.equal(match.winnerId,null,'The first round does not decide the whole match.');
  const began=match.startedAt;
  readyBoth(match);
  assert.equal(match.roundNumber,2);
  assert.equal(match.startedAt,began,'Global played state must survive the next countdown.');
  decisiveRound(match,host.id);
  assert.equal(match.phase,'finished');
  assert.equal(match.endReason,'series_complete');
  assert.equal(match.winnerId,host.id);
  assert.deepEqual(match.players.map(p=>p.roundWins),[2,0]);
  assert.equal(continueRound(match,guest.id,TEST_CHAIN,match.finishedAt+1).reason,'not_round_end');
});

test('split first rounds continue into a third decisive round and finish 2-1',()=>{
  const match=running();
  decisiveRound(match,host.id);readyBoth(match);
  decisiveRound(match,guest.id);
  assert.equal(match.phase,'round_end');
  assert.deepEqual(match.players.map(p=>p.roundWins),[1,1]);
  readyBoth(match,TEST_CHAIN);
  assert.equal(match.roundNumber,3);
  decisiveRound(match,guest.id);
  assert.equal(match.phase,'finished');
  assert.equal(match.winnerId,guest.id);
  assert.deepEqual(match.players.map(p=>p.roundWins),[1,2]);
  assert.equal(publicMatch(match,match.finishedAt).maxRounds,3);
  assert.equal(publicMatch(match,match.finishedAt).winsToWin,2);
});

test('both players must continue; duplicate readiness cannot start a new round alone',()=>{
  const match=running();decisiveRound(match,host.id);
  const ended=match.roundEndedAt,turn=match.turnId,current=match.currentChainId;
  assert.equal(continueRound(match,outsider.id,RECORD_CHAIN,ended+1).reason,'not_player');
  assert.equal(continueRound(match,host.id,RECORD_CHAIN,ended+1).ok,true);
  assert.equal(match.phase,'round_end');
  assert.equal(match.deadlineAt,null);
  assert.equal(match.currentChainId,current,'Do not install the candidate until both players are ready.');
  assert.equal(match.usedChainIds.includes(RECORD_CHAIN.id),false);
  const duplicate=continueRound(match,host.id,RECORD_CHAIN,ended+2);
  assert.equal(duplicate.duplicate,true);
  assert.equal(duplicate.changed,false);
  assert.deepEqual(match.continueReady,[host.id]);
  assert.equal(match.turnId,turn);
  const restored=JSON.parse(JSON.stringify(match));
  assert.equal(continueRound(restored,guest.id,RECORD_CHAIN,ended+3).ok,true);
  assert.equal(restored.currentChainId,RECORD_CHAIN.id);
  assert.deepEqual(restored.usedChainIds,[TEST_CHAIN.id,RECORD_CHAIN.id]);
  assert.equal(restored.startingPlayerIndex,1);
  assert.deepEqual(restored.players.map(p=>p.score),[0,0]);
  assert.deepEqual(restored.players.map(p=>p.responseMs),[0,0]);
  assert.equal(restored.lastCorrect,null);
  assert.equal(restored.messages.length,1,'Only the new-round system notice remains.');
  assert.equal(continueRound(restored,guest.id,RECORD_CHAIN,ended+4).reason,'not_round_end');
});

test('drawn round repeats its ordinal without awarding a series win',()=>{
  const match=running();
  let now=START;
  while(match.phase==='playing'){
    now+=10;
    send(match,match.activePlayerId,target(match),now);
  }
  assert.equal(match.roundResult.winnerId,null);
  assert.deepEqual(match.players.map(p=>p.roundWins),[0,0]);
  readyBoth(match);
  assert.equal(match.roundNumber,1);
  decisiveRound(match,guest.id);
  assert.equal(match.phase,'round_end');
  assert.deepEqual(match.players.map(p=>p.roundWins),[0,1]);
});

test('messages are locked outside play and at exactly 30 seconds the old player loses write access',()=>{
  assert.equal(TURN_MS,30000);
  const match=running();
  const deadline=match.deadlineAt;
  assert.equal(deadline-START,30000);
  assert.equal(send(match,host.id,'naber lan',deadline-1).kind,'chat');
  const history=match.messages.length;
  assert.equal(send(match,guest.id,'naber lan',deadline-1).reason,'not_your_turn');
  assert.equal(match.messages.length,history);
  const late=send(match,host.id,'naber lan',deadline);
  assert.equal(late.reason,'not_your_turn');
  assert.equal(match.activePlayerId,guest.id);
  assert.equal(send(match,guest.id,'naber lan',deadline+1).kind,'chat');
  decisiveRound(match,host.id);
  for(const player of [host,guest])assert.equal(send(match,player.id,'selam',match.roundEndedAt+1).reason,'not_playing');
});

test('a second-round countdown or intermission leave forfeits the entire series',()=>{
  const match=running();decisiveRound(match,host.id);
  const copy=JSON.parse(JSON.stringify(match));
  leaveMatch(copy,host.id,copy.roundEndedAt+1);
  assert.equal(copy.phase,'finished');
  assert.equal(copy.winnerId,guest.id);
  assert.deepEqual(copy.players.map(p=>p.roundWins),[1,2]);
  const now=readyBoth(match);
  assert.notEqual(match.startedAt,null);
  leaveMatch(match,guest.id,now+1);
  assert.equal(match.phase,'finished');
  assert.equal(match.winnerId,host.id);
  assert.deepEqual(match.players.map(p=>p.roundWins),[2,0]);
});

test('continued rounds preserve idempotency and never expose a future private chain',()=>{
  const match=running();
  const id='old-round-answer';
  send(match,host.id,target(match),START+1,{messageId:id});
  let now=START+1;
  while(match.phase==='playing'){
    now+=match.activePlayerId===host.id?1:20;
    send(match,match.activePlayerId,target(match),now);
  }
  readyBoth(match);advanceTime(match,match.deadlineAt);
  const before=JSON.stringify(match);
  const result=send(match,host.id,'ZİLİ',match.roundStartedAt+1,{messageId:id});
  assert.equal(result.duplicate,true);
  assert.equal(JSON.stringify(match),before);
  const view=publicMatch(match,match.roundStartedAt);
  for(const key of ['currentChainId','usedChainIds','recentMessageIds'])assert.equal(key in view,false);
  for(const cell of view.chain.slice(1))assert.deepEqual(Object.keys(cell).sort(),['first','length','status']);
  view.continueReady.push(outsider.id);
  assert.deepEqual(match.continueReady,[]);
});

test('legacy active rooms upgrade once while completed rooms are never revived',()=>{
  const legacy=running();legacy.version=1;
  for(const key of ['roundNumber','roundResult','continueReady','roundEndedAt','roundStartedAt','usedChainIds'])delete legacy[key];
  for(const player of legacy.players)delete player.roundWins;
  legacy.deadlineAt=START+20000;legacy.matchEndsAt=START+180000;
  advanceTime(legacy,START+1);
  assert.equal(legacy.version,2);
  assert.equal(legacy.deadlineAt,START+30000);
  assert.equal(legacy.matchEndsAt,START+240000);
  advanceTime(legacy,START+2);
  assert.equal(legacy.deadlineAt,START+30000);
  const oldFinished={...legacy,version:1,phase:'finished',winnerId:host.id,finishedAt:START+10};
  advanceTime(oldFinished,START+1000000);
  assert.equal(oldFinished.phase,'finished');
  assert.equal(oldFinished.winnerId,host.id);
});
