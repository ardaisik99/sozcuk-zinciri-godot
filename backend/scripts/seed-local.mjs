import {readFile,writeFile} from 'node:fs/promises';
import {parseBank} from '../src/chains.mjs';
const path=new URL('../private/chains.json',import.meta.url);
const bank=parseBank(await readFile(path,'utf8'));
// dotenv preserves backslashes in double-quoted values. Single-quote the JSON
// itself so the runtime receives valid JSON rather than escaped JSON source.
const value=JSON.stringify(bank).replaceAll("'",'\\u0027');
const chunks=[];let part='',bytes=0;
for(const char of value){const n=Buffer.byteLength(char);if(bytes+n>4000){chunks.push(part);part='';bytes=0;}part+=char;bytes+=n;}
if(part)chunks.push(part);
if(chunks.length>32)throw new Error('private_bank_too_large');
let vars=chunks.map((part,i)=>`CHAIN_BANK_${String(i+1).padStart(2,'0')}='${part}'`).join('\n')+'\n';
try{const legacy=JSON.stringify(JSON.parse(await readFile(new URL('../private/legacy-question-ids.json',import.meta.url),'utf8'))).replaceAll("'",'\\u0027');vars+=`LEGACY_QUESTION_IDS='${legacy}'\n`;}catch(error){if(error.code!=='ENOENT')throw error;}
await writeFile(new URL('../.dev.vars',import.meta.url),vars,'utf8');
console.log(`Local private bank ready: ${bank.length} entries. Values are not logged.`);
