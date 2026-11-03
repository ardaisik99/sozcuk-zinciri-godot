import {DurableObject} from 'cloudflare:workers';
import {fail} from './common.mjs';
import {createMatch,joinMatch,startMatch,sendMessage,advanceTime,leaveMatch,publicMatch,nextAlarm} from './match.mjs';
import {pickChain,parseBank} from './chains.mjs';

const GRACE=30000,WAIT_TTL=600000,HISTORY_TTL=86400000;
export class GameRoom extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);this.serial=Promise.resolve();this.match=null;this.disconnected={};this.reported=false;this.purged=false;
    ctx.blockConcurrencyWhile(async()=>{
      this.match=await ctx.storage.get('match')||null;
      this.disconnected=await ctx.storage.get('disconnected')||{};
      this.reported=await ctx.storage.get('reported')||false;
      this.purged=await ctx.storage.get('purged')||false;
    });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
  }
  run(fn){const job=this.serial.then(fn);this.serial=job.catch(()=>{});return job;}
  connected(id){return this.ctx.getWebSockets(id).some(ws=>ws.readyState===1);}
  async initialize(code,host) {return this.run(async()=>{
    if(this.match)return {ok:false,reason:'room_exists'};
    this.match=createMatch({roomCode:code,host,chain:pickChain(Math.random,parseBank(this.env.CHAIN_BANK)),now:Date.now()});
    this.match.startingPlayerIndex=crypto.getRandomValues(new Uint8Array(1))[0]%2;
    this.match.players[0].connected=false;this.disconnected[host.id]=Date.now();
    await this.save();return {ok:true,roomCode:code};
  });}
  async status(id) {return this.run(async()=>{
    if(!this.match)return {ok:false,reason:'room_not_found'};
    await this.advance();
    const isMember=this.match.players.some(p=>p.id===id);
    return {ok:true,phase:this.match.phase,member:isMember,hostId:isMember?this.match.hostId:null};
  });}
  async join(player) {return this.run(async()=>{
    if(!this.match)return {ok:false,reason:'room_not_found'};
    await this.advance();if(this.match.phase==='finished')return {ok:false,reason:'room_closed'};
    // Advancing can expire and release this guest's previous reservation.
    // Reserve again after expiry before admitting them to a live room.
    const reservation=await this.env.DIRECTORY.getByName('accounts-v1').reserveRoom(player.id,this.match.roomCode);
    if(!reservation.ok)return reservation;
    const result=joinMatch(this.match,player,Date.now());
    if(result.ok){
      const p=this.match.players.find(p=>p.id===player.id);p.connected=this.connected(player.id);
      if(!p.connected)this.disconnected[player.id]??=Date.now();
      await this.save();this.broadcast();
    }
    return result.ok?{ok:true,roomCode:this.match.roomCode}:result;
  });}
  async advance() {
    if(!this.match)return;
    const now=Date.now();let changed=false;
    // Process the earliest cutoff at its actual server timestamp. A delayed
    // alarm must not run several turns past an already expired reconnect grace.
    const cutoffs=Object.entries(this.disconnected).map(([id,at])=>({id,at:at+GRACE}));
    if(this.match.phase==='waiting')cutoffs.push({id:this.match.hostId,at:this.match.createdAt+WAIT_TTL,force:true});
    cutoffs.sort((a,b)=>a.at-b.at);
    for(const cutoff of cutoffs){
      if(this.match.phase==='finished')break;
      if(now<cutoff.at||(!cutoff.force&&this.connected(cutoff.id)))continue;
      leaveMatch(this.match,cutoff.id,cutoff.at);delete this.disconnected[cutoff.id];
      await this.env.DIRECTORY.getByName('accounts-v1').releaseRoom(cutoff.id,this.match.roomCode);changed=true;
    }
    changed=advanceTime(this.match,now).changed||changed;
    if(changed){await this.save();this.broadcast();}
  }
  async save() {
    if(this.match.phase==='finished'&&!this.reported){
      try {
        await this.env.DIRECTORY.getByName('accounts-v1').finishMatch(this.match.roomCode,this.match.players,this.match.winnerId,this.match.startedAt!==null&&this.match.players.length===2);
        this.reported=true;
      }catch{/* Persist the result and retry with the room alarm. */}
    }
    await this.ctx.storage.put({match:this.match,disconnected:this.disconnected,reported:this.reported,purged:this.purged});
    const deadlines=[];
    const engine=nextAlarm(this.match);if(engine)deadlines.push(engine);
    if(this.match.phase==='waiting')deadlines.push(this.match.createdAt+WAIT_TTL);
    if(this.match.phase!=='finished')for(const [id,at] of Object.entries(this.disconnected))if(!this.connected(id))deadlines.push(at+GRACE);
    if(this.match.phase==='finished'){
      if(!this.reported)deadlines.push(Date.now()+15000);
      if(!this.purged)deadlines.push((this.match.finishedAt||Date.now())+HISTORY_TTL);
    }
    if(deadlines.length)await this.ctx.storage.setAlarm(Math.max(Date.now()+5,Math.min(...deadlines)));
    else await this.ctx.storage.deleteAlarm();
  }
  snapshot(){return JSON.stringify({type:'state',state:publicMatch(this.match,Date.now())});}
  broadcast(){if(!this.match)return;const data=this.snapshot();for(const ws of this.ctx.getWebSockets())try{ws.send(data);}catch{}}
  error(ws,reason){try{ws.send(JSON.stringify({type:'error',reason}));ws.send(this.snapshot());}catch{}}
  async fetch(request) {return this.run(async()=>{
    if(request.headers.get('upgrade')?.toLowerCase()!=='websocket')return fail('websocket_required',426);
    if(!this.match)return fail('room_not_found',404);
    await this.advance();
    const id=request.headers.get('X-Player-Id'),player=this.match.players.find(p=>p.id===id);
    if(!player)return fail('not_player',403);
    // A refreshed tab replaces its prior socket; an old close cannot mark the
    // replacement disconnected because close handlers check live sockets.
    for(const old of this.ctx.getWebSockets(id))try{old.close(4001,'Replaced');}catch{}
    const [client,server]=Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server,[id]);server.serializeAttachment({id,rateStart:Date.now(),count:0});
    player.connected=true;delete this.disconnected[id];
    await this.save();this.broadcast();
    return new Response(null,{status:101,webSocket:client});
  });}
  async webSocketMessage(ws,raw) {return this.run(async()=>{
    if(!this.match)return;
    if(typeof raw!=='string'||raw.length>2048){this.error(ws,'invalid_body');return;}
    const session=ws.deserializeAttachment();if(!session)return;
    let message;try{message=JSON.parse(raw);}catch{this.error(ws,'invalid_body');return;}
    if(!message||typeof message!=='object'){this.error(ws,'invalid_body');return;}
    const now=Date.now();
    if(now-session.rateStart>=10000){session.rateStart=now;session.count=0;}
    if(++session.count>12){this.error(ws,'rate_limited');return;}
    ws.serializeAttachment(session);
    await this.advance();let result;
    if(message.type==='start')result=startMatch(this.match,session.id,now);
    else if(message.type==='chat')result=sendMessage(this.match,{playerId:session.id,text:message.text,messageId:message.messageId,turnId:message.turnId},now);
    else if(message.type==='leave'){
      result=leaveMatch(this.match,session.id,now);delete this.disconnected[session.id];
      await this.env.DIRECTORY.getByName('accounts-v1').releaseRoom(session.id,this.match.roomCode);
    } else {this.error(ws,'invalid_action');return;}
    if(result.changed)await this.save();
    if(!result.ok)this.error(ws,result.reason);
    else this.broadcast();
    if(message.type==='leave')try{ws.close(1000,'Left room');}catch{}
  });}
  async webSocketClose(ws,code) {return this.run(async()=>{
    const session=ws.deserializeAttachment();try{ws.close(code===1006?1000:code,'Closed');}catch{}
    if(!session||!this.match||this.match.phase==='finished'||this.connected(session.id))return;
    const player=this.match.players.find(p=>p.id===session.id);if(!player)return;
    player.connected=false;this.disconnected[session.id]??=Date.now();
    await this.save();this.broadcast();
  });}
  async webSocketError(ws){return this.webSocketClose(ws,1011);}
  async alarm() {return this.run(async()=>{
    if(!this.match)return;
    await this.advance();
    if(this.match.phase==='finished'&&Date.now()>=(this.match.finishedAt||0)+HISTORY_TTL){
      this.match.messages=[];this.match.recentMessageIds=[];this.purged=true;
      for(const ws of this.ctx.getWebSockets())try{ws.close(1000,'Room expired');}catch{}
    }
    await this.save();
  });}
}
