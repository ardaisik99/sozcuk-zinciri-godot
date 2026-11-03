// Public demo fixtures already present in the offline game. Production answers
// come exclusively from the CHAIN_BANK secret, never from the public repository.
const lettersOnly = /^[A-ZÇĞİÖŞÜ]+$/u;
const upper = value => value.normalize('NFC').toLocaleUpperCase('tr-TR');
function immutableChain(value) {
  if (value && typeof value === 'object' && typeof value.prompt === 'string') {
    if ([value.prompt,value.answer,value.stem].some(word=>typeof word!=='string'||!lettersOnly.test(word)||upper(word)!==word)||typeof value.hint!=='string'||!value.hint.trim()) throw new TypeError('invalid_chain_bank');
    return Object.freeze({id:`${value.prompt}|${value.answer}`,prompt:value.prompt,answer:value.answer,stem:value.stem,hint:value.hint});
  }
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id || !Array.isArray(value.words) || value.words.length < 2 || value.words.length>100 || !Array.isArray(value.answers) || value.answers.length !== value.words.length || !Array.isArray(value.links) || value.links.length !== value.words.length-1) throw new TypeError('invalid_chain_bank');
  if ([...value.words, ...value.answers].some(word => typeof word !== 'string' || !lettersOnly.test(word) || upper(word) !== word) || value.words[0] !== value.answers[0] || value.links.some(link => typeof link !== 'string' || !link.trim())) throw new TypeError('invalid_chain_bank');
  return Object.freeze({ id: value.id, words: Object.freeze([...value.words]), answers: Object.freeze([...value.answers]), links: Object.freeze([...value.links]), ...(Array.isArray(value.hints)?{hints:Object.freeze([...value.hints])}:{}) });
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

export function bankFromEnv(env) {
  let chunks='';
  for(let i=1;i<=32;i++) {const part=env[`CHAIN_BANK_${String(i).padStart(2,'0')}`];if(typeof part==='string')chunks+=part;else if(chunks)break;}
  return parseBank(chunks||env.CHAIN_BANK);
}
export function flattenBank(bank) {
  const unique=new Map();
  for(const item of bank) {
    if(item.prompt)unique.set(item.id,item);
    else for(let i=1;i<item.words.length;i++) {
      const prompt=item.words[i-1],answer=item.answers[i],id=`${prompt}|${answer}`;
      const hint=item.hints?.[i]||'Önceki kelimeyle anlamlı bir isim tamlaması oluşturan sözcüğü düşün.';
      if(!unique.has(id))unique.set(id,Object.freeze({id,prompt,answer,stem:item.words[i],hint}));
    }
  }
  return [...unique.values()];
}
// Find a complete connected path before committing to its first question.
// Bounded backtracking avoids a random dead end without unbounded graph work.
// If no path can be found, question.prompt explicitly marks a fresh chain;
// previously served pairs are never recycled as a fallback.
export function selectQuestions(bank,seen,count=6,random=Math.random,from=null) {
  const excluded=new Set(seen),pool=flattenBank(bank).filter(q=>!excluded.has(q.id)),result=[];
  if(count>0&&count<=6&&pool.length>=count){
    const shuffled=[...pool];
    for(let i=shuffled.length-1;i>0;i--){const j=Math.min(i,Math.floor(random()*(i+1)));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
    const adjacency=new Map();
    for(const q of shuffled){if(!adjacency.has(q.prompt))adjacency.set(q.prompt,[]);adjacency.get(q.prompt).push(q);}
    let remaining=1000;
    const path=[],used=new Set();
    function find(stem){
      if(path.length===count)return [...path];
      if(remaining<=0)return null;
      for(const q of adjacency.get(stem)||[]){
        if(remaining<=0)break;
        if(used.has(q.id))continue;
        remaining--;path.push(q);used.add(q.id);
        const found=find(q.stem);if(found)return found;
        path.pop();used.delete(q.id);
      }
      return null;
    }
    // Sudden-death pairs first try to continue the currently displayed stem.
    const starts=[...new Set([...(from?[from]:[]),...adjacency.keys()])];
    for(const stem of starts){const found=find(stem);if(found)return found;if(remaining<=0)break;}
  }
  let stem=from;
  while(result.length<count&&pool.length) {
    const linked=stem?pool.filter(q=>q.prompt===stem):pool;
    const candidates=linked.length?linked:pool;
    const q=candidates[Math.min(candidates.length-1,Math.floor(random()*candidates.length))];
    result.push(q);pool.splice(pool.findIndex(p=>p.id===q.id),1);stem=q.stem;
  }
  return result;
}
