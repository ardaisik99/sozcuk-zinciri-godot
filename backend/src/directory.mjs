import {DurableObject} from 'cloudflare:workers';
import {digest,displayName,fail,json,publicProfile,accountProfile,randomToken,newRoomCode} from './common.mjs';

const PRODUCTS=[
  {id:'hint_pack_2',title:'2 İpucu',kind:'hint',quantity:2,goldPrice:25,purchasable:true},
  {id:'letter_pack_4',title:'4 Harf',kind:'letter',quantity:4,goldPrice:60,purchasable:true},
  {id:'hint_pack_10',title:'10 İpucu',kind:'hint',quantity:10,purchasable:false,reason:'billing_not_configured'},
  {id:'letter_pack_25',title:'25 Harf',kind:'letter',quantity:25,purchasable:false,reason:'billing_not_configured'},
  {id:'gold_500',title:'500 Altın',kind:'gold',quantity:500,purchasable:false,reason:'billing_not_configured'},
  {id:'gold_1500',title:'1500 Altın',kind:'gold',quantity:1500,purchasable:false,reason:'billing_not_configured'},
  {id:'remove_ads',title:'Reklamları Kaldır',kind:'remove_ads',quantity:1,purchasable:false,reason:'billing_not_configured'}
];
const validRequest=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id);

// Indexed account/social data is separate from room actors: chat never queries it.
export class Directory extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);
    this.sql=ctx.storage.sql;this.queueSerial=Promise.resolve();
    for(const statement of [
      'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, code INTEGER UNIQUE NOT NULL, name TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, wins INTEGER NOT NULL DEFAULT 0, played INTEGER NOT NULL DEFAULT 0, active_room TEXT, created_at INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS friends (a TEXT NOT NULL,b TEXT NOT NULL,requester TEXT NOT NULL,accepted INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(a,b))',
      'CREATE TABLE IF NOT EXISTS invites (user_id TEXT NOT NULL,room_code TEXT NOT NULL,from_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,room_code))',
      'CREATE TABLE IF NOT EXISTS rates (key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS completed (room_code TEXT PRIMARY KEY,at INTEGER NOT NULL)',
      'CREATE INDEX IF NOT EXISTS friends_b ON friends(b)',
      'CREATE INDEX IF NOT EXISTS invites_user ON invites(user_id,created_at)',
      'CREATE TABLE IF NOT EXISTS seen_questions (user_id TEXT NOT NULL,question_id TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(user_id,question_id))',
      'CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,result TEXT NOT NULL,at INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS match_history (user_id TEXT NOT NULL,room_code TEXT NOT NULL,data TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(user_id,room_code))',
      'CREATE INDEX IF NOT EXISTS match_history_user_at ON match_history(user_id,at DESC)',
      'CREATE TABLE IF NOT EXISTS matchmaking (user_id TEXT PRIMARY KEY,created_at INTEGER NOT NULL,bot_after INTEGER NOT NULL,status TEXT NOT NULL,room_code TEXT)'
    ])this.sql.exec(statement);
    this.sql.exec('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL)');
    const columns=new Set(this.sql.exec('PRAGMA table_info(users)').toArray().map(c=>c.name));
    for(const [name,definition] of [['avatar',"TEXT NOT NULL DEFAULT 'mascot-boy'"],['gold','INTEGER NOT NULL DEFAULT 100'],['hints','INTEGER NOT NULL DEFAULT 0'],['letters','INTEGER NOT NULL DEFAULT 0'],['remove_ads','INTEGER NOT NULL DEFAULT 0']])if(!columns.has(name))this.sql.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
    // Earlier releases did not retain a per-account question ledger. Conservatively
    // exclude their entire private bank for existing players, exactly once.
    if(env.LEGACY_QUESTION_IDS&&!this.one('SELECT key FROM metadata WHERE key=?','legacy_seen_v8')){
      let ids;try{ids=JSON.parse(env.LEGACY_QUESTION_IDS);}catch{throw new Error('invalid_legacy_question_ids');}
      if(!Array.isArray(ids)||ids.length>2000||ids.some(id=>typeof id!=='string'||!/^[A-ZÇĞİÖŞÜ]+\|[A-ZÇĞİÖŞÜ]+$/u.test(id)))throw new Error('invalid_legacy_question_ids');
      ctx.storage.transactionSync(()=>{
        for(const user of this.sql.exec('SELECT id FROM users WHERE played>0').toArray())for(const id of ids)this.sql.exec('INSERT OR IGNORE INTO seen_questions(user_id,question_id,at) VALUES(?,?,?)',user.id,id,Date.now());
        this.sql.exec('INSERT INTO metadata(key,value) VALUES(?,?)','legacy_seen_v8','complete');
      });
    }
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
  async register(name,ipHash,limit=10,avatar='mascot-boy') {
    name=displayName(name);if(!name)return {ok:false,reason:'invalid_name'};
    if(!this.rate('register:'+ipHash,limit,3600000))return {ok:false,reason:'rate_limited'};
    const token=randomToken(),tokenHash=await digest(token),id=crypto.randomUUID(),now=Date.now();
    let code=1000+(crypto.getRandomValues(new Uint32Array(1))[0]%9000);
    for(let i=0;i<24&&this.one('SELECT id FROM users WHERE code=?',code);i++)code=1000+(crypto.getRandomValues(new Uint32Array(1))[0]%9000);
    if(this.one('SELECT id FROM users WHERE code=?',code))code=Math.max(10000,Number(this.one('SELECT MAX(code) AS code FROM users').code||0)+1);
    avatar=avatar==='mascot-girl'?'mascot-girl':'mascot-boy';
    this.sql.exec('INSERT INTO users(id,code,name,token_hash,created_at,avatar) VALUES(?,?,?,?,?,?)',id,code,name,tokenHash,now,avatar);
    return {ok:true,token,profile:accountProfile(this.one('SELECT * FROM users WHERE id=?',id))};
  }
  async authenticate(token) {
    if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return null;
    const row=this.one('SELECT * FROM users WHERE token_hash=?',await digest(token));
    return row?{...accountProfile(row),activeRoom:row.active_room||null}:null;
  }
  rename(id,value,avatar) {
    const name=displayName(value);if(!name)return {ok:false,reason:'invalid_name'};
    if(avatar!==undefined&&!['mascot-boy','mascot-girl'].includes(avatar))return {ok:false,reason:'invalid_avatar'};
    this.sql.exec('UPDATE users SET name=? WHERE id=?',name,id);
    if(avatar!==undefined)this.sql.exec('UPDATE users SET avatar=? WHERE id=?',avatar,id);
    return {ok:true,profile:accountProfile(this.one('SELECT * FROM users WHERE id=?',id))};
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
  finishMatch(code,players,winnerId,played,details=null) {
    this.ctx.storage.transactionSync(()=>{
      const done=this.one('SELECT room_code FROM completed WHERE room_code=?',code);
      if(done)return;
      this.sql.exec('INSERT INTO completed(room_code,at) VALUES(?,?)',code,Date.now());
      for(const p of players){
        this.sql.exec('UPDATE users SET active_room=CASE WHEN active_room=? THEN NULL ELSE active_room END,played=played+?,wins=wins+? WHERE id=?',code,played?1:0,played&&p.id===winnerId?1:0,p.id);
        if(played&&this.one('SELECT id FROM users WHERE id=?',p.id)){
          const opponent=players.find(other=>other.id!==p.id),finishedAt=details?.finishedAt||Date.now();
          const history={roomCode:code,opponent:opponent?{id:opponent.id,name:opponent.name,code:opponent.code,avatar:opponent.avatar||'mascot-boy',isBot:!!opponent.isBot}:null,rounds:details?.rounds||[],score:[p.roundWins||0,opponent?.roundWins||0],result:winnerId===p.id?'win':winnerId?'loss':'draw',finishedAt,review:details?.review||[],endReason:details?.endReason||'finished'};
          this.sql.exec('INSERT OR IGNORE INTO match_history(user_id,room_code,data,at) VALUES(?,?,?,?)',p.id,code,JSON.stringify(history),finishedAt);
          this.sql.exec('DELETE FROM match_history WHERE user_id=? AND room_code NOT IN (SELECT room_code FROM match_history WHERE user_id=? ORDER BY at DESC LIMIT 50)',p.id,p.id);
          if(details?.endReason==='series_complete')this.sql.exec('UPDATE users SET gold=gold+? WHERE id=?',p.id===winnerId?60:30,p.id);
        }
      }
      this.sql.exec('DELETE FROM invites WHERE room_code=?',code);
      this.sql.exec('DELETE FROM matchmaking WHERE room_code=?',code);
    });
    this.notify(players.map(p=>p.id));return {ok:true};
  }
  history(id){return {ok:true,history:this.sql.exec('SELECT data FROM match_history WHERE user_id=? ORDER BY at DESC LIMIT 50',id).toArray().map(r=>JSON.parse(r.data))};}
  seenQuestions(ids){const result=new Set();for(const id of ids.filter(id=>!id.startsWith('bot:')))for(const row of this.sql.exec('SELECT question_id FROM seen_questions WHERE user_id=?',id).toArray())result.add(row.question_id);return [...result];}
  markQuestions(ids,questions){this.ctx.storage.transactionSync(()=>{for(const id of ids.filter(id=>!id.startsWith('bot:')))for(const question of questions)this.sql.exec('INSERT OR IGNORE INTO seen_questions(user_id,question_id,at) VALUES(?,?,?)',id,question,Date.now());});return {ok:true};}
  wallet(id){const row=this.one('SELECT * FROM users WHERE id=?',id);return row?{ok:true,...accountProfile(row)}:{ok:false,reason:'unauthorized'};}
  shop(id,options={}){const wallet=this.wallet(id);return wallet.ok?{ok:true,gold:wallet.gold,inventory:wallet.inventory,removeAds:wallet.removeAds,products:PRODUCTS.map(p=>p.goldPrice?{...p}:{...p,purchasable:!!options.billingEnabled&&(p.kind!=='remove_ads'||!!options.adsEnabled),reason:!options.billingEnabled?'billing_not_configured':p.kind==='remove_ads'&&!options.adsEnabled?'ads_not_enabled':null}),currency:'gold',billingEnabled:!!options.billingEnabled}:wallet;}
  buy(id,productId,requestId){
    if(!validRequest(requestId))return {ok:false,reason:'invalid_message_id'};
    const product=PRODUCTS.find(p=>p.id===productId);if(!product)return {ok:false,reason:'product_not_found'};
    if(!product.purchasable)return {ok:false,reason:'billing_not_configured'};
    return this.ctx.storage.transactionSync(()=>{
      const key=`shop:${id}:${requestId}`,prior=this.one('SELECT result FROM transactions WHERE id=?',key);if(prior)return {...JSON.parse(prior.result),duplicate:true};
      const wallet=this.wallet(id);if(!wallet.ok)return wallet;if(wallet.gold<product.goldPrice)return {ok:false,reason:'not_enough_gold'};
      const column=product.kind==='hint'?'hints':'letters';this.sql.exec(`UPDATE users SET gold=gold-?,${column}=${column}+? WHERE id=?`,product.goldPrice,product.quantity,id);
      const result={ok:true,profile:this.wallet(id),productId};this.sql.exec('INSERT INTO transactions(id,user_id,result,at) VALUES(?,?,?,?)',key,id,JSON.stringify(result),Date.now());return result;
    });
  }
  chargeJoker(id,roomCode,kind,requestId){
    if(!['hint','letter'].includes(kind)||!validRequest(requestId))return {ok:false,reason:'invalid_joker'};
    return this.ctx.storage.transactionSync(()=>{
      const key=`joker:${roomCode}:${id}:${requestId}`,prior=this.one('SELECT result FROM transactions WHERE id=?',key);if(prior)return {...JSON.parse(prior.result),duplicate:true};
      const row=this.one('SELECT * FROM users WHERE id=?',id);if(!row)return {ok:false,reason:'unauthorized'};if(row.active_room!==roomCode)return {ok:false,reason:'not_player'};
      const column=kind==='hint'?'hints':'letters',price=kind==='hint'?15:20;
      if(row[column]>0)this.sql.exec(`UPDATE users SET ${column}=${column}-1 WHERE id=?`,id);
      else{if(row.gold<price)return {ok:false,reason:'not_enough_gold'};this.sql.exec('UPDATE users SET gold=gold-? WHERE id=?',price,id);}
      const wallet=this.wallet(id),result={ok:true,gold:wallet.gold,inventory:wallet.inventory};this.sql.exec('INSERT INTO transactions(id,user_id,result,at) VALUES(?,?,?,?)',key,id,JSON.stringify(result),Date.now());return result;
    });
  }
  claimGooglePurchase(verified){
    const {accountId,productId,purchaseTokenHash,consumed}=verified||{};
    const quantity=verified?.quantity??1;
    if(typeof accountId!=='string'||typeof purchaseTokenHash!=='string'||!/^[a-f0-9]{64}$/.test(purchaseTokenHash))return {ok:false,reason:'invalid_purchase'};
    const product=PRODUCTS.find(p=>p.id===productId&&!p.goldPrice);if(!product)return {ok:false,reason:'product_not_found'};
    if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100||(product.kind==='remove_ads'&&quantity!==1))return {ok:false,reason:'invalid_purchase_quantity'};
    return this.ctx.storage.transactionSync(()=>{
      const key=`google:${purchaseTokenHash}`,prior=this.one('SELECT result FROM transactions WHERE id=?',key);
      if(prior){const previous=JSON.parse(prior.result);return previous.accountId===accountId&&previous.productId===productId?{ok:true,duplicate:true,profile:this.wallet(accountId),productId}:{ok:false,reason:'purchase_already_claimed'};}
      if(consumed)return {ok:false,reason:'purchase_already_consumed'};
      const wallet=this.wallet(accountId);if(!wallet.ok)return wallet;
      if(product.kind==='remove_ads')this.sql.exec('UPDATE users SET remove_ads=1 WHERE id=?',accountId);
      else{const column=product.kind==='gold'?'gold':product.kind==='hint'?'hints':'letters';this.sql.exec(`UPDATE users SET ${column}=${column}+? WHERE id=?`,product.quantity*quantity,accountId);}
      const stored={ok:true,accountId,productId,grant:{kind:product.kind,quantity:product.quantity*quantity}};
      this.sql.exec('INSERT INTO transactions(id,user_id,result,at) VALUES(?,?,?,?)',key,accountId,JSON.stringify(stored),Date.now());
      return {ok:true,profile:this.wallet(accountId),productId};
    });
  }
  queueRun(run){const job=this.queueSerial.then(run);this.queueSerial=job.catch(()=>{});return job;}
  queueState(id){const row=this.one('SELECT * FROM matchmaking WHERE user_id=?',id);if(!row)return {ok:true,status:'idle'};if(row.status==='matched')return {ok:true,status:'matched',roomCode:row.room_code};return {ok:true,status:'waiting',botAfterAt:row.bot_after};}
  queueNotify(id){const state=this.queueState(id);for(const ws of this.ctx.getWebSockets(id))try{ws.send(JSON.stringify({type:'matchmaking',...state}));}catch{}}
  async queueAlarm(){const next=this.one("SELECT MIN(bot_after) AS at FROM matchmaking WHERE status='waiting'")?.at;if(next)await this.ctx.storage.setAlarm(Math.max(Date.now()+5,next));else await this.ctx.storage.deleteAlarm();}
  async matchQueued(id,otherId=null){
    const first=this.one('SELECT * FROM users WHERE id=?',id);if(!first)return {ok:false,reason:'unauthorized'};
    const code=newRoomCode(),host={...accountProfile(first),activeRoom:first.active_room};
    const second=otherId?this.one('SELECT * FROM users WHERE id=?',otherId):null;
    const guest=second?accountProfile(second):{id:`bot:${code}`,name:'Damla',code:'BOT',avatar:Math.random()<0.5?'mascot-boy':'mascot-girl',isBot:true,gold:0};
    this.ctx.storage.transactionSync(()=>{
      for(const p of [host,guest].filter(p=>!p.isBot)){this.sql.exec('UPDATE users SET active_room=? WHERE id=?',code,p.id);this.sql.exec("UPDATE matchmaking SET status='pairing',room_code=? WHERE user_id=?",code,p.id);}
    });
    try {
      const room=this.env.ROOMS.getByName(code),created=await room.initialize(code,host,{randomMatch:true});if(!created.ok)throw Object.assign(new Error(created.reason),{reason:created.reason});
      const joined=await room.join(guest);if(!joined.ok)throw Object.assign(new Error(joined.reason),{reason:joined.reason});
      for(const p of [host,guest].filter(p=>!p.isBot)){this.sql.exec("UPDATE matchmaking SET status='matched',room_code=? WHERE user_id=?",code,p.id);this.queueNotify(p.id);}
      return {ok:true,status:'matched',roomCode:code};
    }catch(error){for(const p of [host,guest].filter(p=>!p.isBot)){this.releaseRoom(p.id,code);this.sql.exec('DELETE FROM matchmaking WHERE user_id=?',p.id);this.queueNotify(p.id);}return {ok:false,reason:error.reason||'service_unavailable'};}
  }
  async joinQueue(id){return this.queueRun(async()=>{
    const state=this.queueState(id);if(state.status!=='idle')return state;
    const row=this.one('SELECT * FROM users WHERE id=?',id);if(!row)return {ok:false,reason:'unauthorized'};
    if(row.active_room){const status=await this.env.ROOMS.getByName(row.active_room).status(id);if(status.ok&&status.member&&status.phase!=='finished')return {ok:false,reason:'already_in_room',roomCode:row.active_room};this.releaseRoom(id,row.active_room);}
    if(!this.rate('queue:'+id,10,60000))return {ok:false,reason:'rate_limited'};
    const now=Date.now();this.sql.exec("INSERT INTO matchmaking(user_id,created_at,bot_after,status) VALUES(?,?,?,'waiting')",id,now,now+12000);
    const other=this.one("SELECT user_id FROM matchmaking WHERE user_id<>? AND status='waiting' ORDER BY created_at LIMIT 1",id);
    const result=other?await this.matchQueued(other.user_id,id):this.queueState(id);await this.queueAlarm();return result;
  });}
  async cancelQueue(id){return this.queueRun(async()=>{const state=this.queueState(id);if(state.status==='matched')return state;this.sql.exec("DELETE FROM matchmaking WHERE user_id=? AND status='waiting'",id);await this.queueAlarm();return {ok:true,status:'idle'};});}
  async alarm(){return this.queueRun(async()=>{for(const row of this.sql.exec("SELECT user_id FROM matchmaking WHERE status='waiting' AND bot_after<=? ORDER BY created_at LIMIT 20",Date.now()).toArray())await this.matchQueued(row.user_id);await this.queueAlarm();});}
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
