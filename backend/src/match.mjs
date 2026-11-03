// Synchronous, server-authoritative match rules. No network, timers, or client state.
export const COUNTDOWN_MS = 3_000;
export const TURN_MS = 20_000;
export const MATCH_MS = 180_000;
export const CORRECT_SCORE = 100;
export const MESSAGE_LIMIT = 160;
export const MESSAGE_HISTORY_LIMIT = 100;
export const PUBLIC_MESSAGE_LIMIT = 60;
export const RECENT_MESSAGE_LIMIT = 128;

const copy = value => JSON.parse(JSON.stringify(value));
const lettersOnly = /^[A-Za-zÇĞİÖŞÜçğıöşü]+$/u;
const controls = /[\u0000-\u001f\u007f-\u009f]/u;
export const normalizeAnswer = value => String(value).normalize('NFC').trim().toLocaleUpperCase('tr-TR');
const validTime = now => {
  if (!Number.isFinite(now) || now < 0) throw new TypeError('now must be a nonnegative server timestamp.');
  return Math.trunc(now);
};
const failure = (reason, changed = false) => ({ ok: false, reason, changed });
const member = (match, id) => match.players.find(player => player.id === id);
const opponent = (match, id) => match.players.find(player => player.id !== id);

function playerRecord(player) {
  if (!player || typeof player.id !== 'string' || !player.id || typeof player.name !== 'string' || !player.name.trim() || typeof player.code !== 'string' || !player.code) throw new TypeError('Player id, name and public code are required.');
  if (player.name.length > 18 || controls.test(player.name)) throw new TypeError('Invalid player name.');
  return { id: player.id, name: player.name.trim(), code: player.code, score: 0, responseMs: 0, connected: true };
}

function addMessage(match, { playerId = null, name = 'Oyun', text, kind = 'system', at, clientMessageId }) {
  match.messageCounter += 1;
  const message = { id: String(match.messageCounter), playerId, name, text, kind, at };
  if (clientMessageId) message.clientMessageId = clientMessageId;
  match.messages.push(message);
  if (match.messages.length > MESSAGE_HISTORY_LIMIT) match.messages.splice(0, match.messages.length - MESSAGE_HISTORY_LIMIT);
  return message;
}

function finish(match, reason, at, winnerId = undefined) {
  if (match.phase === 'finished') return;
  match.phase = 'finished';
  match.finishedAt = at;
  match.endReason = reason;
  match.activePlayerId = null;
  match.deadlineAt = null;
  match.turnId += 1;
  match.tieBreak = null;
  if (winnerId !== undefined) match.winnerId = winnerId;
  else {
    const [left, right] = match.players;
    match.winnerId = !left || !right || left.score === right.score ? null : left.score > right.score ? left.id : right.id;
    if (left && right && left.score === right.score && left.score > 0 && (left.responseMs || 0) !== (right.responseMs || 0)) {
      match.winnerId = (left.responseMs || 0) < (right.responseMs || 0) ? left.id : right.id;
      match.tieBreak = 'speed';
    }
  }
  const winner = member(match, match.winnerId);
  addMessage(match, { text: winner ? `${winner.name} kazandı!` : reason === 'room_closed' ? 'Oda kapatıldı.' : 'Karşılaşma berabere tamamlandı.', at });
}

export function createMatch({ roomCode, host, chain, now }) {
  const at = validTime(now);
  if (typeof roomCode !== 'string' || !roomCode) throw new TypeError('A room code is required.');
  if (!chain || !Array.isArray(chain.words) || chain.words.length !== 5 || !Array.isArray(chain.answers) || chain.answers.length !== 5) throw new TypeError('An exact five-word chain is required.');
  if (chain.answers[0] !== chain.words[0] || [...chain.words, ...chain.answers].some(word => typeof word !== 'string' || !word || normalizeAnswer(word) !== word || !lettersOnly.test(word))) throw new TypeError('Chain stems and answers must be uppercase Turkish words.');
  const player = playerRecord(host);
  return {
    version: 1,
    roomCode,
    hostId: player.id,
    players: [player],
    phase: 'waiting',
    chain: chain.words.map((stem, index) => ({ stem, answer: chain.answers[index], first: chain.answers[index][0], length: chain.answers[index].length, status: index === 0 ? 'solved' : 'hidden' })),
    activeIndex: 1,
    activePlayerId: null,
    startingPlayerIndex: 0,
    createdAt: at,
    startedAt: null,
    matchEndsAt: null,
    deadlineAt: null,
    turnId: 0,
    consecutiveTimeouts: 0,
    finishedAt: null,
    winnerId: null,
    endReason: null,
    tieBreak: null,
    lastCorrect: null,
    messageCounter: 0,
    recentMessageIds: [],
    messages: [],
  };
}

export function joinMatch(match, player, now) {
  const changed = advanceTime(match, now).changed;
  let record;
  try { record = playerRecord(player); } catch { return failure('invalid_player', changed); }
  const existing = member(match, record.id);
  if (existing) {
    const reconnected = !existing.connected || existing.name !== record.name || existing.code !== record.code;
    existing.connected = true;
    existing.name = record.name;
    existing.code = record.code;
    return { ok: true, duplicate: true, changed: changed || reconnected };
  }
  if (match.phase !== 'waiting') return failure('match_started', changed);
  if (match.players.length >= 2) return failure('room_full', changed);
  match.players.push(record);
  addMessage(match, { text: `${record.name} odaya katıldı.`, at: validTime(now) });
  return { ok: true, changed: true };
}

export function startMatch(match, playerId, now) {
  const changed = advanceTime(match, now).changed;
  if (playerId !== match.hostId) return failure('host_only', changed);
  if (match.phase !== 'waiting') return failure('match_started', changed);
  if (match.players.length !== 2) return failure('need_two_players', changed);
  if (match.players.some(player => !player.connected)) return failure('player_disconnected', changed);
  const at = validTime(now);
  match.phase = 'countdown';
  match.deadlineAt = at + COUNTDOWN_MS;
  match.startedAt = null;
  match.matchEndsAt = match.deadlineAt + MATCH_MS;
  match.turnId += 1;
  addMessage(match, { text: 'Hazır olun! Karşılaşma 3 saniye sonra başlıyor.', at });
  return { ok: true, changed: true };
}

export function advanceTime(match, now) {
  const at = validTime(now);
  let changed = false;
  if (match.phase === 'countdown' && at >= match.deadlineAt) {
    const began = match.deadlineAt;
    match.phase = 'playing';
    match.startedAt = began;
    match.activePlayerId = match.players[match.startingPlayerIndex === 1 ? 1 : 0].id;
    match.deadlineAt = began + TURN_MS;
    match.turnId += 1;
    changed = true;
    addMessage(match, { text: `${member(match, match.activePlayerId).name} başlıyor. Tek kelimeyle tahmin et, cümleyle sohbet et.`, at: began });
  }
  // Walk deadline events chronologically. An alarm firing late never grants
  // extra seconds, and duplicate alarms cannot repeat a timeout or a score.
  while (match.phase === 'playing') {
    const next = Math.min(match.deadlineAt, match.matchEndsAt);
    if (at < next) break;
    if (match.matchEndsAt <= match.deadlineAt) {
      finish(match, 'time_limit', match.matchEndsAt);
      changed = true;
      break;
    }
    const ended = match.deadlineAt;
    const timedOut = member(match, match.activePlayerId);
    match.consecutiveTimeouts += 1;
    addMessage(match, { text: `${timedOut.name} için süre doldu.`, at: ended });
    if (match.consecutiveTimeouts >= 2) {
      const cell = match.chain[match.activeIndex];
      cell.status = 'skipped';
      addMessage(match, { text: `Kelime açıldı: ${cell.answer} → ${cell.stem}.`, at: ended });
      match.activeIndex += 1;
      match.consecutiveTimeouts = 0;
      if (match.activeIndex >= match.chain.length) {
        finish(match, 'chain_complete', ended);
        changed = true;
        break;
      }
    }
    match.activePlayerId = opponent(match, timedOut.id).id;
    match.deadlineAt = ended + TURN_MS;
    match.turnId += 1;
    changed = true;
  }
  return { ok: true, changed };
}

export function sendMessage(match, { playerId, text, turnId, messageId } = {}, now) {
  const changed = advanceTime(match, now).changed;
  const player = member(match, playerId);
  if (!player) return failure('not_player', changed);
  if (typeof messageId !== 'string' || !messageId || messageId.length > 128 || controls.test(messageId)) return failure('invalid_message_id', changed);
  const prior = match.recentMessageIds.find(entry => entry.playerId === playerId && entry.messageId === messageId);
  if (prior) return { ok: true, duplicate: true, changed };
  if (!Number.isInteger(turnId) || turnId !== match.turnId) return failure('stale_turn', changed);
  if (typeof text !== 'string' || controls.test(text)) return failure('invalid_text', changed);
  const clean = text.trim().normalize('NFC');
  if (!clean || clean.length > MESSAGE_LIMIT) return failure('invalid_text', changed);
  const at = validTime(now);
  let kind = 'chat';
  let resolution = {};
  if (match.phase === 'playing' && match.activePlayerId === playerId && lettersOnly.test(clean)) {
    const cell = match.chain[match.activeIndex];
    if (normalizeAnswer(clean) === cell.answer) {
      kind = 'correct';
      const index = match.activeIndex;
      cell.status = 'solved';
      player.score += CORRECT_SCORE;
      player.responseMs = (player.responseMs || 0) + Math.max(0, at - (match.deadlineAt - TURN_MS));
      match.consecutiveTimeouts = 0;
      match.lastCorrect = { answer: cell.answer, stem: cell.stem, index, at, playerId, turnId: match.turnId };
      resolution = { answer: cell.answer, stem: cell.stem, index };
      match.activeIndex += 1;
    } else kind = 'wrong';
  }
  const message = addMessage(match, { playerId, name: player.name, text: clean, kind, at, clientMessageId: messageId });
  match.recentMessageIds.push({ playerId, messageId });
  if (match.recentMessageIds.length > RECENT_MESSAGE_LIMIT) match.recentMessageIds.splice(0, match.recentMessageIds.length - RECENT_MESSAGE_LIMIT);
  if (kind === 'correct') {
    if (match.activeIndex >= match.chain.length) finish(match, 'chain_complete', at);
    else {
      match.activePlayerId = opponent(match, playerId).id;
      match.deadlineAt = at + TURN_MS;
      match.turnId += 1;
    }
  }
  return { ok: true, changed: true, kind, correct: kind === 'correct', messageId: message.id, ...resolution };
}

export function leaveMatch(match, playerId, now) {
  const changed = advanceTime(match, now).changed;
  const player = member(match, playerId);
  if (!player) return failure('not_player', changed);
  player.connected = false;
  const at = validTime(now);
  if (match.phase === 'playing') {
    finish(match, 'forfeit', at, opponent(match, playerId)?.id ?? null);
  } else if (match.phase === 'waiting' || match.phase === 'countdown') {
    if (playerId === match.hostId) finish(match, 'room_closed', at, null);
    else {
      match.players = match.players.filter(item => item.id !== playerId);
      match.phase = 'waiting';
      match.deadlineAt = null;
      match.startedAt = null;
      match.matchEndsAt = null;
      match.activePlayerId = null;
      match.turnId += 1;
      addMessage(match, { text: `${player.name} odadan ayrıldı.`, at });
    }
  }
  return { ok: true, changed: true };
}

export function nextAlarm(match) {
  if (match.phase === 'countdown') return match.deadlineAt;
  if (match.phase === 'playing') return Math.min(match.deadlineAt, match.matchEndsAt);
  return null;
}

// Projection only: callers advance and persist the authoritative state first.
// Hidden stems are answers in disguise, so omit BOTH keys until disclosed.
export function publicMatch(match, now) {
  return {
    roomCode: match.roomCode,
    players: match.players.map(({ id, name, code, score, responseMs = 0, connected }) => ({ id, name, code, score, responseMs, connected })),
    phase: match.phase,
    activePlayerId: match.activePlayerId,
    deadlineAt: match.deadlineAt,
    serverNow: validTime(now),
    turnId: match.turnId,
    chain: match.chain.map(cell => cell.status === 'hidden'
      ? { first: cell.first, length: cell.length, status: 'hidden' }
      : { stem: cell.stem, answer: cell.answer, first: cell.stem[0], length: cell.stem.length, status: cell.status }),
    activeIndex: match.activeIndex,
    messages: copy(match.messages.slice(-PUBLIC_MESSAGE_LIMIT)),
    winnerId: match.winnerId,
    endReason: match.endReason,
    tieBreak: match.tieBreak || null,
    lastCorrect: match.lastCorrect ? copy(match.lastCorrect) : null,
  };
}
