import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Data URL keeps the browser ES module usable without changing package metadata.
const source = await readFile(new URL('../web/state.js', import.meta.url), 'utf8');
const { ZincirState, normalizeTurkish, SAVE_KEY } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const content = JSON.parse(await readFile(new URL('../data/levels.json', import.meta.url), 'utf8'));
const expectedAnswers = {
  "tutorial": "ÇAY|KAŞIĞI|OYUNU|HAVASI",
  "mutfak_01": "KAHVE|FİNCANI|TAKIMI|ÇANTASI",
  "mutfak_02": "EKMEK|FIRINI|KAPISI|KOLU|SAATİ",
  "mutfak_03": "YEMEK|MASASI|ÖRTÜSÜ|DESENİ",
  "mutfak_04": "MEYVE|SUYU|BARDAĞI|ALTLIĞI",
  "mutfak_05": "SÜT|ŞİŞESİ|KAPAĞI|RESMİ|ÇERÇEVESİ",
  "mutfak_06": "BALIK|ÇORBASI|KAŞIĞI|OYUNU",
  "mutfak_07": "MUTFAK|DOLABI|KAPAĞI|RESMİ",
  "mutfak_08": "TATLI|KAŞIĞI|OYUNU|HAVASI",
  "spor_01": "FUTBOL|SAHASI|ÇİZGİSİ|FİLM",
  "spor_02": "BASKETBOL|TOPU|SEPETİ|ÖRGÜSÜ",
  "spor_03": "SPOR|AYAKKABISI|BAĞCIĞI|UCU",
  "spor_04": "TENİS|KORTU|KAPISI|KOLU",
  "spor_05": "YÜZME|HAVUZU|SUYU|SAATİ",
  "spor_06": "GOLF|TOPU|OYUNU|KURALI",
  "spor_07": "FUTBOL|TAKIMI|OYUNU|HAVASI",
  "spor_08": "SPOR|ÇANTASI|ASKISI|KANCASI",
  "yasam_01": "EV|KAPISI|KOLU|SAATİ",
  "yasam_02": "DUVAR|SAATİ|KULESİ|KAPISI",
  "yasam_03": "OKUL|ÇANTASI|CEBİ|TELEFONU",
  "yasam_04": "DİŞ|FIRÇASI|KILI|KÖKÜ",
  "yasam_05": "EL|ÇANTASI|ASKISI|KANCASI",
  "yasam_06": "KAPI|ZİLİ|SESİ|KAYDI",
  "yasam_07": "YATAK|ODASI|KAPISI|KOLU|SAATİ",
  "yasam_08": "MASA|LAMBASI|IŞIĞI|HIZI",
  "doga_01": "YAĞMUR|SUYU|BARDAĞI|ALTLIĞI",
  "doga_02": "ORMAN|YOLU|KENARI|TAŞI",
  "doga_03": "DENİZ|SUYU|KENARI|ÇİZGİSİ",
  "doga_04": "ÇAM|AĞACI|KABUĞU|RENGİ",
  "doga_05": "GÜL|BAHÇESİ|KAPISI|KOLU",
  "doga_06": "DAĞ|KEÇİSİ|SÜTÜ|ŞİŞESİ",
  "doga_07": "GÜNEŞ|IŞIĞI|KAYNAĞI|SUYU",
  "doga_08": "YAPRAK|DAMARI|YOLU|HARİTASI",
  "kultur_01": "KİTAP|KAPAĞI|RESMİ|SERGİSİ",
  "kultur_02": "SANAT|GALERİSİ|KAPISI|KOLU",
  "kultur_03": "SİNEMA|SALONU|KAPISI|KOLU",
  "kultur_04": "TİYATRO|OYUNU|YAZARI|EVİ",
  "kultur_05": "MÜZİK|ALETİ|KUTUSU|KAPAĞI",
  "kultur_06": "HALK|OYUNU|HAVASI|DURUMU",
  "kultur_07": "ŞİİR|KİTABI|KAPAĞI|RESMİ",
  "kultur_08": "ÖYKÜ|KİTABI|FUARI|ALANI"
};
const store = new Map();
const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
let checks = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const solve = state => { let result; while (!state.isComplete()) { result = state.submitGuess(state.currentWord()); assert.equal(result.ok, true); } return result; };

equal(normalizeTurkish(' çiğ köfte '), 'ÇİĞKÖFTE');
equal(normalizeTurkish('ışık istanbul'), 'IŞIKİSTANBUL');
const state = new ZincirState(content, storage);
equal(state.levels.length, 40);
equal(state.gold, 100);
equal(state.setProfile(' '), false);
equal(state.setProfile('Deniz'), true);
equal(state.beginLevel('missing'), false);
equal(state.beginLevel('tutorial'), true);
equal(state.currentWord(), 'KAŞIĞI');
equal(state.stemWord(), 'KAŞIK');
equal(state.visibleLetters(), ['K', '', '', '', '', '']);
equal(state.submitGuess('kaşık').ok, false);
const first = state.submitGuess('aşığı');
equal([first.ok, first.word, first.stem, first.solvedIndex], [true, 'KAŞIĞI', 'KAŞIK', 1]);
equal(state.visibleLetters(1).join(''), 'KAŞIK');
equal(state.submitGuess('oyunu').ok, true);
equal(state.submitGuess('avası').complete, true);
equal(state.tutorialDone, true);
equal([state.gold, state.score], [100, 0]);
state.beginLevel('mutfak_01');
equal(state.submitGuess('yanlış').ok, false);
equal(state.activeIndex, 1);
equal(state.buyHint().ok, true);
equal(state.gold, 85);
state.buyHint();
equal(state.gold, 85);
const letter = state.revealLetter();
equal(letter.ok && letter.index > 0, true);
equal(state.gold, 65);
const restored = new ZincirState(content, storage);
equal([restored.profileName, restored.gold, restored.tutorialDone], ['Deniz', 65, true]);
restored.beginLevel('mutfak_01');
equal(restored.visibleLetters(), state.visibleLetters());
restored.buyHint();
equal(restored.gold, 65);
const shown = restored.visibleLetters();
const hidden = [...restored.currentWord()].filter((_, i) => !shown[i]).join('');
equal(restored.submitGuess(hidden).ok, true);
const resumed = new ZincirState(content, storage);
resumed.beginLevel('mutfak_01');
equal(resumed.activeIndex, 2);
const reward = solve(resumed);
equal([reward.rewardGold, reward.rewardScore, resumed.gold, resumed.score], [40, 100, 105, 100]);
equal(resumed.submitGuess('ÇANTA').ok, false);
resumed.beginLevel('mutfak_01');
const replay = solve(resumed);
equal([replay.rewardGold, replay.rewardScore, resumed.gold, resumed.score], [0, 0, 105, 100]);
resumed.beginLevel('mutfak_02');
resumed.gold = 19;
equal(resumed.revealLetter().reason, 'insufficient_gold');
equal(resumed.gold, 19);
resumed.gold = 14;
equal(resumed.buyHint().reason, 'insufficient_gold');
equal(resumed.gold, 14);
resumed.gold = 1000;
while (resumed.revealLetter().ok) { /* Reveal every remaining position. */ }
const spentGold = resumed.gold;
equal(resumed.revealLetter().reason, 'all_revealed');
equal(resumed.gold, spentGold);
store.set(SAVE_KEY, '{broken');
const recovered = new ZincirState(content, storage);
equal(recovered.profileName, 'Deniz');
recovered.resetProgress();
equal([recovered.profileName, recovered.gold, recovered.score, recovered.completed, recovered.tutorialDone], ['', 100, 0, [], false]);
const noStorage = new ZincirState(content, null);
noStorage.setProfile('Deniz');
equal(noStorage.lastSaveOk, false);
equal(noStorage.profileName, 'Deniz');
const every = new ZincirState(content, { getItem: () => null, setItem() {} });
for (const level of every.levels) {
  equal(level.answers, expectedAnswers[level.id].split('|'), level.id + ' expected inflected forms');
  equal(every.beginLevel(level.id), true);
  while (!every.isComplete()) {
    const index = every.activeIndex;
    const answer = every.answerWord();
    const stem = every.stemWord();
    if (answer !== stem) equal(every.submitGuess(stem).ok, false, level.id + ' bare stem rejected');
    const solved = every.submitGuess(answer.toLocaleLowerCase('tr-TR'));
    equal([solved.ok, solved.word, solved.stem, solved.solvedIndex], [true, answer, stem, index]);
    equal(every.visibleLetters(index).join(''), stem);
  }
}
equal([every.gold, every.score, every.completed.length], [1700, 4000, 40]);
equal(content.tutorial.answers, expectedAnswers.tutorial.split('|'));
const forms = new ZincirState(content, { getItem: () => null, setItem() {} });
forms.beginLevel('mutfak_04');
forms.submitGuess('suyu');
equal(forms.currentWord(), 'BARDAĞI');
equal(forms.visibleLetters().length, 7);
equal(forms.submitGuess('bardak').ok, false);
const bardak = forms.submitGuess('ardağı');
equal([bardak.word, bardak.stem, bardak.solvedIndex], ['BARDAĞI', 'BARDAK', 2]);
forms.beginLevel('yasam_06');
forms.submitGuess('zili');
forms.submitGuess('sesi');
equal(forms.currentWord(), 'KAYDI');
equal(forms.submitGuess('kayıt').ok, false);
const kayit = forms.submitGuess('aydı');
equal([kayit.word, kayit.stem, kayit.solvedIndex], ['KAYDI', 'KAYIT', 3]);

// Prior saves used stem positions. Preserve same letters, refund changes once.
store.clear();
storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, profileName: 'Deniz', gold: 65, score: 100,
  completed: ['mutfak_01'], tutorialDone: true, settings: { sound: false, haptics: true }, progress: {
    tutorial: { activeIndex: 1, revealed: { 1: [1, 4, 4, 99, 0, -1, 2.5] }, hintUsed: { 1: true } },
    mutfak_04: { activeIndex: 2, revealed: { 2: [1, 5] }, hintUsed: { 2: true } },
    yasam_06: { activeIndex: 3, revealed: { 3: [1, 3, 4, 3] }, hintUsed: { 3: true } },
  } }));
const migrated = new ZincirState(content, storage);
equal([migrated.profileName, migrated.gold, migrated.score, migrated.completed, migrated.tutorialDone], ['Deniz', 145, 100, ['mutfak_01'], true]);
equal(migrated.settings.sound, false);
equal(migrated.progress.tutorial.revealed['1'], [1]);
equal(migrated.progress.mutfak_04.revealed['2'], [1]);
equal(migrated.progress.yasam_06.revealed['3'], [1]);
equal(migrated.progress.tutorial.answerSchema, 2);
equal(JSON.parse(storage.getItem(SAVE_KEY)).progress.yasam_06.answerSchema, 2);
equal(new ZincirState(content, storage).gold, 145, 'Migration refund must not repeat');
migrated.beginLevel('tutorial');
equal(migrated.buyHint().ok, true);
equal(migrated.gold, 145, 'Paid hint survives migration');
// Answer-only suffix positions beyond the old stem must survive future loads.
migrated.revealed['1'].push(5);
migrated.saveLocal();
const answerReload = new ZincirState(content, storage);
answerReload.beginLevel('tutorial');
equal(answerReload.visibleLetters()[5], 'I');
equal(answerReload.gold, 145);
console.log(`Web state: ${checks} checks, 0 failures.`);
