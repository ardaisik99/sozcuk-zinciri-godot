// Public demo fixtures already present in the offline game. Production answers
// come exclusively from the CHAIN_BANK secret, never from the public repository.
const lettersOnly = /^[A-ZÇĞİÖŞÜ]+$/u;
const upper = value => value.normalize('NFC').toLocaleUpperCase('tr-TR');
function immutableChain(value) {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id || !Array.isArray(value.words) || value.words.length !== 5 || !Array.isArray(value.answers) || value.answers.length !== 5 || !Array.isArray(value.links) || value.links.length !== 4) throw new TypeError('invalid_chain_bank');
  if ([...value.words, ...value.answers].some(word => typeof word !== 'string' || !lettersOnly.test(word) || upper(word) !== word) || value.words[0] !== value.answers[0] || value.links.some(link => typeof link !== 'string' || !link.trim())) throw new TypeError('invalid_chain_bank');
  return Object.freeze({ id: value.id, words: Object.freeze([...value.words]), answers: Object.freeze([...value.answers]), links: Object.freeze([...value.links]) });
}
const demo = (id, words, answers, links) => immutableChain({ id, words: words.split('|'), answers: answers.split('|'), links: links.split('|') });

export const DEMO_CHAINS = Object.freeze([
  demo('demo_01', 'EKMEK|FIRIN|KAPI|KOL|SAAT', 'EKMEK|FIRINI|KAPISI|KOLU|SAATİ', 'Ekmek fırını|Fırın kapısı|Kapı kolu|Kol saati'),
  demo('demo_02', 'SÜT|ŞİŞE|KAPAK|RESİM|ÇERÇEVE', 'SÜT|ŞİŞESİ|KAPAĞI|RESMİ|ÇERÇEVESİ', 'Süt şişesi|Şişe kapağı|Kapak resmi|Resim çerçevesi'),
  demo('demo_03', 'YATAK|ODA|KAPI|KOL|SAAT', 'YATAK|ODASI|KAPISI|KOLU|SAATİ', 'Yatak odası|Oda kapısı|Kapı kolu|Kol saati'),
]);

export function parseBank(secretJSON) {
  if (typeof secretJSON !== 'string' || !secretJSON.trim()) throw new TypeError('private_chain_bank_missing');
  let source;
  try { source = JSON.parse(secretJSON); } catch { throw new TypeError('invalid_chain_bank'); }
  if (!Array.isArray(source) || source.length === 0) throw new TypeError('invalid_chain_bank');
  const bank = source.map(immutableChain);
  if (new Set(bank.map(chain => chain.id)).size !== bank.length) throw new TypeError('invalid_chain_bank');
  return Object.freeze(bank);
}

export function pickChain(random = Math.random, bank = DEMO_CHAINS) {
  if (!Array.isArray(bank) || bank.length === 0) throw new TypeError('invalid_chain_bank');
  const value = Number(random());
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('random must return a number in [0, 1).');
  return bank[Math.floor(value * bank.length)];
}
