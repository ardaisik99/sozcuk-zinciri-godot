import {DurableObject} from 'cloudflare:workers';
import {digest,displayName,fail,json,publicProfile,randomToken} from './common.mjs';

// Indexed account/social data is separate from room actors: chat never queries it.
export class Directory extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);
    this.sql=ctx.storage.sql;
    for(const statement of [
      'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, code INTEGER UNIQUE NOT NULL, name TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, wins INTEGER NOT NULL DEFAULT 0, played INTEGER NOT NULL DEFAULT 0, active_room TEXT, created_at INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS friends (a TEXT NOT NULL,b TEXT NOT NULL,requester TEXT NOT NULL,accepted INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(a,b))',
      'CREATE TABLE IF NOT EXISTS invites (user_id TEXT NOT NULL,room_code TEXT NOT NULL,from_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,room_code))',
      'CREATE TABLE IF NOT EXISTS rates (key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS completed (room_code TEXT PRIMARY KEY,at INTEGER NOT NULL)',
      'CREATE INDEX IF NOT EXISTS friends_b ON friends(b)',
      'CREATE INDEX IF NOT EXISTS invites_user ON invites(user_id,created_at)'
    ])this.sql.exec(statement);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
  }
  one(query,...params){return this.sql.exec(query,...params).toArray()[0]||null;}
  rate(key,limit,period) {
    const now=Date.now(),slot=Math.floor(now/period),full=key+':'+slot;
    const row=this.one('SELECT count FROM rates WHERE key=?',full);
    if(row&&row.count>=limit)return false;
    this.sql.exec('INSERT INTO rates(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1',full,now+period*2);
    if(Math.random()<0.03)this.sql.exec('DELETE FROM rates WHERE expires<?',now);
    return true;
  }
  async register(name,ipHash,limit=10) {
    name=displayName(name);if(!name)return {ok:false,reason:'invalid_name'};
    if(!this.rate('register:'+ipHash,limit,3600000))return {ok:false,reason:'rate_limited'};
    const token=randomToken(),tokenHash=await digest(token),id=crypto.randomUUID(),now=Date.now();
    let code=1000+(crypto.getRandomValues(new Uint32Array(1))[0]%9000);
    for(let i=0;i<24&&this.one('SELECT id FROM users WHERE code=?',code);i++)code=1000+(crypto.getRandomValues(new Uint32Array(1))[0]%9000);
    if(this.one('SELECT id FROM users WHERE code=?',code))code=Math.max(10000,Number(this.one('SELECT MAX(code) AS code FROM users').code||0)+1);
    this.sql.exec('INSERT INTO users(id,code,name,token_hash,created_at) VALUES(?,?,?,?,?)',id,code,name,tokenHash,now);
    return {ok:true,token,profile:publicProfile(this.one('SELECT * FROM users WHERE id=?',id))};
  }
  async authenticate(token) {
    if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return null;
    const row=this.one('SELECT * FROM users WHERE token_hash=?',await digest(token));
    return row?{...publicProfile(row),activeRoom:row.active_room||null}:null;
  }
  rename(id,value) {
    const name=displayName(value);if(!name)return {ok:false,reason:'invalid_name'};
    this.sql.exec('UPDATE users SET name=? WHERE id=?',name,id);
    return {ok:true,profile:publicProfile(this.one('SELECT * FROM users WHERE id=?',id))};
  }
  notify(ids) {
    for(const id of new Set(ids))for(const ws of this.ctx.getWebSockets(id))try{ws.send(JSON.stringify({type:'social'}));}catch{}
  }
  friends(id) {
    const relations=this.sql.exec('SELECT * FROM friends WHERE a=? OR b=?',id,id).toArray();
    const result={ok:true,friends:[],incoming:[],outgoing:[],invites:[]};
    for(const link of relations){
      const other=publicProfile(this.one('SELECT * FROM users WHERE id=?',link.a===id?link.b:link.a));
      result[link.accepted?'friends':link.requester===id?'outgoing':'incoming'].push(other);
    }
    for(const invite of this.sql.exec('SELECT * FROM invites WHERE user_id=? AND created_at>? ORDER BY created_at DESC LIMIT 20',id,Date.now()-600000).toArray()){
      const from=this.one('SELECT * FROM users WHERE id=?',invite.from_id);
      if(from)result.invites.push({roomCode:invite.room_code,from:publicProfile(from),createdAt:invite.created_at});
    }
    return result;
  }
  requestFriend(id,value) {
    const code=String(value||'').trim().replace(/^#/,'');
    if(!/^\d{4,12}$/.test(code))return {ok:false,reason:'invalid_friend_code'};
    const other=this.one('SELECT * FROM users WHERE code=?',Number(code));
    if(!other)return {ok:false,reason:'player_not_found'};
    if(other.id===id)return {ok:false,reason:'cannot_add_self'};
    const pair=[id,other.id].sort();
    const existing=this.one('SELECT * FROM friends WHERE a=? AND b=?',...pair);
    if(existing)return {ok:true,already:true};
    if(!this.rate('friend:'+id,20,3600000))return {ok:false,reason:'rate_limited'};
    if([id,other.id].some(player=>this.one('SELECT COUNT(*) AS n FROM friends WHERE a=? OR b=?',player,player).n>=100))return {ok:false,reason:'friend_limit'};
    this.sql.exec('INSERT INTO friends(a,b,requester) VALUES(?,?,?)',...pair,id);
    this.notify([id,other.id]);return {ok:true};
  }
  respondFriend(id,otherId,accept) {
    if(typeof otherId!=='string'||typeof accept!=='boolean')return {ok:false,reason:'invalid_body'};
    const pair=[id,otherId].sort(),row=this.one('SELECT * FROM friends WHERE a=? AND b=?',...pair);
    if(!row||row.requester===id)return {ok:false,reason:'request_not_found'};
    if(accept)this.sql.exec('UPDATE friends SET accepted=1 WHERE a=? AND b=?',...pair);
    else this.sql.exec('DELETE FROM friends WHERE a=? AND b=?',...pair);
    this.notify([id,otherId]);return {ok:true};
  }
  removeFriend(id,otherId) {
    if(typeof otherId!=='string')return {ok:false,reason:'invalid_body'};
    this.sql.exec('DELETE FROM friends WHERE a=? AND b=?',...[id,otherId].sort());
    this.sql.exec('DELETE FROM invites WHERE (user_id=? AND from_id=?) OR (user_id=? AND from_id=?)',id,otherId,otherId,id);
    this.notify([id,otherId]);return {ok:true};
  }
  invite(id,otherId,roomCode) {
    if(typeof otherId!=='string')return {ok:false,reason:'invalid_body'};
    const row=this.one('SELECT * FROM friends WHERE a=? AND b=?',...[id,otherId].sort());
    if(!row?.accepted)return {ok:false,reason:'not_friends'};
    if(!this.rate('invite:'+id,15,60000))return {ok:false,reason:'rate_limited'};
    this.sql.exec('INSERT INTO invites(user_id,room_code,from_id,created_at) VALUES(?,?,?,?) ON CONFLICT(user_id,room_code) DO UPDATE SET created_at=excluded.created_at',otherId,roomCode,id,Date.now());
    this.notify([otherId]);return {ok:true};
  }
  reserveRoom(id,code) {
    const row=this.one('SELECT active_room FROM users WHERE id=?',id);
    if(!row)return {ok:false,reason:'unauthorized'};
    if(row.active_room&&row.active_room!==code)return {ok:false,reason:'already_in_room',roomCode:row.active_room};
    this.sql.exec('UPDATE users SET active_room=? WHERE id=?',code,id);return {ok:true};
  }
  releaseRoom(id,code){this.sql.exec('UPDATE users SET active_room=NULL WHERE id=? AND active_room=?',id,code);return {ok:true};}
  finishMatch(code,players,winnerId,played) {
    this.ctx.storage.transactionSync(()=>{
      const done=this.one('SELECT room_code FROM completed WHERE room_code=?',code);
      if(done)return;
      this.sql.exec('INSERT INTO completed(room_code,at) VALUES(?,?)',code,Date.now());
      for(const p of players){
        this.sql.exec('UPDATE users SET active_room=CASE WHEN active_room=? THEN NULL ELSE active_room END,played=played+?,wins=wins+? WHERE id=?',code,played?1:0,played&&p.id===winnerId?1:0,p.id);
      }
      this.sql.exec('DELETE FROM invites WHERE room_code=?',code);
    });
    this.notify(players.map(p=>p.id));return {ok:true};
  }
  async fetch(request) {
    if(request.headers.get('upgrade')?.toLowerCase()!=='websocket')return fail('websocket_required',426);
    const id=request.headers.get('X-Player-Id');
    if(!id||!this.one('SELECT id FROM users WHERE id=?',id))return fail('unauthorized',401);
    for(const old of this.ctx.getWebSockets(id))try{old.close(4001,'Replaced');}catch{}
    const [client,server]=Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server,[id]);server.serializeAttachment({id});
    server.send(JSON.stringify({type:'ready'}));
    return new Response(null,{status:101,webSocket:client});
  }
  webSocketMessage(ws,message) {
    // Only keepalive has meaning in a social socket; auto-response handles ping.
    if(typeof message!=='string'||message.length>64)ws.close(1008,'Invalid message');
  }
  webSocketClose(ws,code){try{ws.close(code===1006?1000:code,'Closed');}catch{}}
  webSocketError(ws){try{ws.close(1011,'Connection lost');}catch{}}
}
