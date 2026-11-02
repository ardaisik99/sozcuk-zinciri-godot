// The lightweight web edition uses the same content and economy as Godot.
export const START_GOLD = 100;
export const LETTER_COST = 20;
export const HINT_COST = 15;
export const LEVEL_GOLD = 40;
export const LEVEL_SCORE = 100;
export const SAVE_KEY = 'sozcuk_zinciri_v1';
export const ANSWER_SCHEMA = 2;

export function normalizeTurkish(value) {
  return String(value ?? '').trim().replaceAll('i', 'İ').replaceAll('ı', 'I')
    .toLocaleUpperCase('tr-TR').replace(/\s+/gu, '');
}

const clone = value => JSON.parse(JSON.stringify(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, fallback = 0, max = 99999999) => {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.max(0, Math.min(max, Math.trunc(number))) : fallback;
};
const storageDefault = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const validLevel = level => object(level) && typeof level.id === 'string' && level.id
  && Array.isArray(level.words) && level.words.length >= 4 && level.words.length <= 5
  && level.words.every(word => typeof word === 'string' && word && normalizeTurkish(word) === word)
  && Array.isArray(level.answers) && level.answers.length === level.words.length
  && level.answers.every(word => typeof word === 'string' && word && normalizeTurkish(word) === word)
  && level.answers[0] === level.words[0]
  && Array.isArray(level.definitions) && level.definitions.length === level.words.length
  && Array.isArray(level.links) && level.links.length === level.words.length - 1;

export class ZincirState {
  static START_GOLD = START_GOLD;
  static LETTER_COST = LETTER_COST;
  static HINT_COST = HINT_COST;
  static LEVEL_GOLD = LEVEL_GOLD;
  static LEVEL_SCORE = LEVEL_SCORE;

  constructor(content, storage = storageDefault()) {
    this.storage = storage;
    this.levels = (Array.isArray(content?.levels) ? content.levels : []).filter(validLevel).map(clone);
    this.tutorial = validLevel(content?.tutorial) ? clone(content.tutorial) : {};
    this.lastSaveOk = true;
    this._defaults();
    this.loadLocal();
  }

  _defaults() {
    this.profileName = '';
    this.gold = START_GOLD;
    this.score = 0;
    this.completed = [];
    this.tutorialDone = false;
    this.settings = { sound: true, haptics: true };
    this.progress = {};
    this.currentLevel = {};
    this.activeIndex = 1;
    this.revealed = {};
    this.hintUsed = {};
  }

  setProfile(value) {
    const name = String(value ?? '').trim();
    if (name.length < 2 || name.length > 18 || /[\u0000-\u001f\u007f]/u.test(name)) return false;
    this.profileName = name;
    this.saveLocal();
    return true;
  }

  findLevel(id) {
    return id === 'tutorial' ? this.tutorial : this.levels.find(level => level.id === id) ?? {};
  }

  beginLevel(id) {
    const level = this.findLevel(id);
    if (!level?.words) return false;
    this.currentLevel = clone(level);
    this.activeIndex = 1;
    this.revealed = {};
    this.hintUsed = {};
    const entry = this.progress[id];
    if (object(entry) && entry.activeIndex >= 1 && entry.activeIndex < level.words.length) {
      this.activeIndex = entry.activeIndex;
      this.revealed = clone(entry.revealed ?? {});
      this.hintUsed = clone(entry.hintUsed ?? {});
    }
    this.saveLocal();
    return true;
  }

  isComplete() {
    return Boolean(this.currentLevel.words && this.activeIndex >= this.currentLevel.words.length);
  }

  currentWord() {
    return this.answerWord();
  }

  answerWord(wordIndex = -1) {
    const index = wordIndex < 0 ? this.activeIndex : wordIndex;
    return this.currentLevel.answers?.[index] ?? '';
  }

  stemWord(wordIndex = -1) {
    const index = wordIndex < 0 ? this.activeIndex : wordIndex;
    return this.currentLevel.words?.[index] ?? '';
  }

  currentDefinition() {
    return this.currentLevel.definitions?.[this.activeIndex] ?? '';
  }

  visibleLetters(wordIndex = -1) {
    const index = wordIndex < 0 ? this.activeIndex : wordIndex;
    const word = index < this.activeIndex ? this.stemWord(index) : this.answerWord(index);
    if (!word) return [];
    const positions = this.revealed[String(index)] ?? [];
    return [...word].map((letter, position) => index < this.activeIndex || position === 0 || positions.includes(position) ? letter : '');
  }

  submitGuess(value) {
    if (!this.currentLevel.words || this.isComplete()) return { ok: false, complete: this.isComplete(), reason: 'inactive', rewardGold: 0, rewardScore: 0 };
    const word = this.currentWord();
    const guess = normalizeTurkish(value);
    const shown = this.visibleLetters();
    const hidden = [...word].filter((_, index) => !shown[index]).join('');
    if (guess !== word && word[0] + guess !== word && guess !== hidden) {
      return { ok: false, complete: false, reason: 'incorrect', word: '', rewardGold: 0, rewardScore: 0 };
    }
    const solvedIndex = this.activeIndex;
    const stem = this.stemWord();
    this.activeIndex += 1;
    let rewardGold = 0;
    let rewardScore = 0;
    if (this.isComplete()) {
      const id = this.currentLevel.id;
      if (id === 'tutorial') this.tutorialDone = true;
      else if (!this.completed.includes(id)) {
        this.completed.push(id);
        rewardGold = LEVEL_GOLD;
        rewardScore = LEVEL_SCORE;
        this.gold += rewardGold;
        this.score += rewardScore;
      }
    }
    this.saveLocal();
    return { ok: true, complete: this.isComplete(), reason: '', word, stem, solvedIndex, rewardGold, rewardScore };
  }

  revealLetter() {
    if (!this.currentLevel.words || this.isComplete()) return { ok: false, reason: 'inactive' };
    const word = this.currentWord();
    const shown = this.visibleLetters();
    const hidden = [...word].map((_, i) => i).filter(i => i > 0 && !shown[i]);
    if (!hidden.length) return { ok: false, reason: 'all_revealed' };
    if (this.gold < LETTER_COST) return { ok: false, reason: 'insufficient_gold' };
    const index = hidden[Math.floor(Math.random() * hidden.length)];
    const key = String(this.activeIndex);
    if (!Array.isArray(this.revealed[key])) this.revealed[key] = [];
    this.revealed[key].push(index);
    this.gold -= LETTER_COST;
    this.saveLocal();
    return { ok: true, reason: '', index, letter: word[index] };
  }

  buyHint() {
    if (!this.currentLevel.words || this.isComplete()) return { ok: false, reason: 'inactive', text: '' };
    const key = String(this.activeIndex);
    if (!this.hintUsed[key]) {
      if (this.gold < HINT_COST) return { ok: false, reason: 'insufficient_gold', text: '' };
      this.hintUsed[key] = true;
      this.gold -= HINT_COST;
      this.saveLocal();
    }
    return { ok: true, reason: '', text: this.currentDefinition() };
  }

  _storeCurrent() {
    if (this.currentLevel.id) this.progress[this.currentLevel.id] = {
      answerSchema: ANSWER_SCHEMA,
      activeIndex: this.activeIndex,
      revealed: clone(this.revealed),
      hintUsed: clone(this.hintUsed),
    };
  }

  saveLocal() {
    this._storeCurrent();
    if (!this.storage) { this.lastSaveOk = false; return false; }
    const record = JSON.stringify({ version: 1, profileName: this.profileName, gold: this.gold,
      score: this.score, completed: this.completed, tutorialDone: this.tutorialDone,
      settings: this.settings, progress: this.progress });
    try {
      const previous = this.storage.getItem(SAVE_KEY);
      // localStorage.setItem is atomic; preserve the previous valid snapshot too.
      if (this._parse(previous)) {
        try { this.storage.setItem(SAVE_KEY + '.bak', previous); } catch { /* Primary remains usable if quota is tight. */ }
      }
      this.storage.setItem(SAVE_KEY, record);
      this.lastSaveOk = true;
    } catch { this.lastSaveOk = false; }
    return this.lastSaveOk;
  }

  _parse(value) {
    try { const data = JSON.parse(value); return object(data) && data.version === 1 ? data : null; }
    catch { return null; }
  }

  loadLocal() {
    if (!this.storage) return false;
    let data;
    try { data = this._parse(this.storage.getItem(SAVE_KEY)) ?? this._parse(this.storage.getItem(SAVE_KEY + '.bak')); }
    catch { return false; }
    if (!data) return false;
    this.currentLevel = {};
    this.activeIndex = 1;
    this.revealed = {};
    this.hintUsed = {};
    this.profileName = String(data.profileName ?? '').trim().slice(0, 18);
    this.gold = integer(data.gold, START_GOLD);
    this.score = integer(data.score);
    this.tutorialDone = data.tutorialDone === true;
    this.completed = Array.isArray(data.completed) ? [...new Set(data.completed.filter(id => id !== 'tutorial' && this.findLevel(id).words))] : [];
    if (object(data.settings)) this.settings = { sound: data.settings.sound !== false, haptics: data.settings.haptics !== false };
    this.progress = {};
    let migrated = false;
    if (object(data.progress)) for (const [id, entry] of Object.entries(data.progress)) {
      const level = this.findLevel(id);
      if (!level.words || !object(entry)) continue;
      const activeIndex = Math.max(1, integer(entry.activeIndex, 1, level.words.length));
      const revealed = {};
      const hintUsed = {};
      const legacy = entry.answerSchema !== ANSWER_SCHEMA;
      if (legacy) migrated = true;
      for (let index = 1; index < level.words.length; index++) {
        const positions = entry.revealed?.[String(index)];
        const oldWord = legacy ? level.words[index] : level.answers[index];
        const paidPositions = Array.isArray(positions) ? [...new Set(positions.filter(position => Number.isInteger(position) && position > 0 && position < oldWord.length))] : [];
        revealed[String(index)] = paidPositions.filter(position => {
          if (!legacy || oldWord[position] === level.answers[index][position]) return true;
          this.gold = Math.min(99999999, this.gold + LETTER_COST);
          return false;
        });
        hintUsed[String(index)] = entry.hintUsed?.[String(index)] === true;
      }
      this.progress[id] = { answerSchema: ANSWER_SCHEMA, activeIndex, revealed, hintUsed };
    }
    // Commit refunds together with the schema marker before another reload.
    if (migrated) this.saveLocal();
    return true;
  }

  resetProgress() {
    this._defaults();
    return this.saveLocal();
  }
}

export default ZincirState;
