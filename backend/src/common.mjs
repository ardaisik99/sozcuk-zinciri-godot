export const json = (data, status=200) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});
export const fail = (reason,status=400) => json({ok:false,reason},status);
export const publicProfile = row => ({id:row.id,code:String(row.code),name:row.name,wins:row.wins||0,played:row.played||0});
export const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
export async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
}
export function displayName(value) {
  if(typeof value !== 'string')return null;
  const name=value.trim().normalize('NFC');
  return name.length>=2&&name.length<=18&&!/[\p{C}<>]/u.test(name)?name:null;
}
export async function bodyJSON(request) {
  if(!request.headers.get('content-type')?.includes('application/json'))throw new Error('invalid_body');
  if(Number(request.headers.get('content-length'))>2048)throw new Error('message_too_long');
  const reader=request.body?.getReader(),chunks=[];let size=0;
  if(reader)while(true){
    const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;
    if(size>2048){await reader.cancel();throw new Error('message_too_long');}
    chunks.push(value);
  }
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new Error('invalid_body');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('invalid_body');
  return body;
}
export function authToken(request) {
  const value=request.headers.get('authorization')||'';
  return /^Bearer [a-f0-9]{64}$/.test(value)?value.slice(7):null;
}
export function roomCode(value) {
  const code=String(value||'').trim().toUpperCase();
  return /^[A-HJ-NP-Z2-9]{6}$/.test(code)?code:null;
}
export function newRoomCode() {
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(6)),v=>chars[v%chars.length]).join('');
}
