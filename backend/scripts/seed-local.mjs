import {readFile,writeFile} from 'node:fs/promises';
import {parseBank} from '../src/chains.mjs';
const path=new URL('../private/chains.json',import.meta.url);
const bank=parseBank(await readFile(path,'utf8'));
// dotenv preserves backslashes in double-quoted values. Single-quote the JSON
// itself so the runtime receives valid JSON rather than escaped JSON source.
const value=JSON.stringify(bank).replaceAll("'",'\\u0027');
await writeFile(new URL('../.dev.vars',import.meta.url),"CHAIN_BANK='"+value+"'\n",'utf8');
console.log(`Local private bank ready: ${bank.length} chains. Values are not logged.`);
