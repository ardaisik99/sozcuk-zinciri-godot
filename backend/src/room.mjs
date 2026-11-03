import {DurableObject} from 'cloudflare:workers';
import {fail} from './common.mjs';
import {createMatch,joinMatch,startMatch,continueRound,sendMessage,advanceTime,leaveMatch,publicMatch,nextAlarm,installRoundQuestions,appendQuestions,validateJoker,applyJoker} from './match.mjs';
import {pickChain,parseBank,bankFromEnv,selectQuestions} from './chains.mjs';

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
  directory(){return this.env.DIRECTORY.getByName('accounts-v1');}
  connected(id){return !!this.match?.players.find(p=>p.id===id)?.isBot||this.ctx.getWebSockets(id).some(ws=>ws.readyState===1);}
  async questions(count=6,from=null){
    const ids=this.match?.players.filter(p=>!p.isBot).map(p=>p.id)||[];
    const seen=typeof this.directory().seenQuestions==='function'?await this.directory().seenQuestions(ids):[];
    const queued=this.match?.phase==='playing'?(this.match.chain||[]).map(c=>c.questionId).filter(Boolean):[];
    return selectQuestions(bankFromEnv(this.env),[...seen,...(this.match?.usedQuestionIds||[]),...queued],count,Math.random,from);
  }
  async initialize(code,host,options={}) {return this.run(async()=>{
    if(this.match)return {ok:false,reason:'room_exists'};
    const seen=typeof this.directory().seenQuestions==='function'?await this.directory().seenQuestions([host.id]):[];
    const questions=selectQuestions(bankFromEnv(this.env),seen,6);
    if(questions.length<6)return {ok:false,reason:'bank_exhausted'};
    this.match=createMatch({roomCode:code,host,chain:{questions},now:Date.now()});
    this.match.randomMatch=!!options.randomMatch;
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
    if(this.match.version>=3&&this.match.phase==='waiting'&&!this.match.players.some(p=>p.id===player.id)){
      const ids=[...this.match.players.filter(p=>!p.isBot).map(p=>p.id),...(!player.isBot?[player.id]:[])];
      const seen=typeof this.directory().seenQuestions==='function'?await this.directory().seenQuestions(ids):[];
      if(selectQuestions(bankFromEnv(this.env),seen,6).length<6)return {ok:false,reason:'bank_exhausted'};
    }
    // Advancing can expire and release this guest's previous reservation.
    // Reserve again after expiry before admitting them to a live room.
    const reservation=player.isBot?{ok:true}:await this.directory().reserveRoom(player.id,this.match.roomCode);
    if(!reservation.ok)return reservation;
    const result=joinMatch(this.match,player,Date.now());
    if(result.ok){
      const p=this.match.players.find(p=>p.id===player.id);p.connected=this.connected(player.id);
      if(!p.connected)this.disconnected[player.id]??=Date.now();
      if(this.match.randomMatch)await this.autoStart();
      await this.save();this.broadcast();
    }
    return result.ok?{ok:true,roomCode:this.match.roomCode}:result;
  });}
  async autoStart(){
    if(this.match.phase!=='waiting'||this.match.players.length!==2||this.match.players.some(p=>!p.connected))return;
    const questions=await this.questions();if(questions.length<6)return;
    installRoundQuestions(this.match,{questions});startMatch(this.match,this.match.hostId,Date.now());
  }
  async ensureQuestions(now){
    if(!this.match.needsQuestions)return false;
    const previous=this.match.chain[this.match.chain.length-1]?.stem;
    const questions=await this.questions(2,previous);
    appendQuestions(this.match,questions.length===2?questions:[],now);return true;
  }
  async recordServed(){
    if(this.match.version<3)return;
    const disclosed=(this.match.review||[]).map(q=>q.questionId);
    if(this.match.phase==='playing'&&this.match.chain[this.match.activeIndex])disclosed.push(this.match.chain[this.match.activeIndex].questionId);
    const fresh=[...new Set(disclosed.filter(Boolean))].filter(id=>!(this.match.recordedQuestionIds||[]).includes(id));
    if(fresh.length){if(typeof this.directory().markQuestions==='function')await this.directory().markQuestions(this.match.players.filter(p=>!p.isBot).map(p=>p.id),fresh);this.match.recordedQuestionIds.push(...fresh);for(const id of fresh)if(!this.match.usedQuestionIds.includes(id))this.match.usedQuestionIds.push(id);}
  }
  async resolvePendingJoker(){
    const pending=this.match?.pendingJoker;if(!pending)return null;
    const wallet=await this.directory().chargeJoker(pending.id,this.match.roomCode,pending.kind,pending.requestId);
    const result=wallet.ok?applyJoker(this.match,pending.id,pending.kind,pending.requestId,wallet,pending.at,()=>pending.random):wallet;
    this.match.pendingJoker=null;await this.save();this.broadcast();return result;
  }
  scheduleBot(){
    const m=this.match,bot=m.players.find(p=>p.isBot);
    if(!bot||m.phase!=='playing'||m.activePlayerId!==bot.id){m.botDueAt=null;m.botTurnId=null;return;}
    if(m.botTurnId===m.turnId)return;
    m.botTurnId=m.turnId;m.botAttempts=0;
    // A bot is deliberately fallible, never acts instantly and is visibly marked.
    const behavior=Math.random();m.botWillKnow=behavior<0.72;m.botWillGuess=behavior>=0.72&&behavior<0.90;
    m.botDueAt=Math.min(m.deadlineAt-50,Date.now()+3500+Math.floor(Math.random()*15000));
  }
  async botStep(now){
    const m=this.match,bot=m.players.find(p=>p.isBot);if(!bot)return false;
    if(m.phase==='round_end'&&m.continueReady.length===1&&!m.continueReady.includes(bot.id)){
      const questions=await this.questions();if(questions.length<6)return false;
      const result=continueRound(m,bot.id,{questions},now);return result.changed;
    }
    if(m.phase!=='playing'||m.activePlayerId!==bot.id||m.botTurnId!==m.turnId||!m.botDueAt||now<m.botDueAt||now>=m.deadlineAt)return false;
    const c=m.chain[m.activeIndex];if(!c)return false;
    let text=null;
    if(m.botWillKnow){if(m.botAttempts===0&&Math.random()<0.28){text=c.stem===c.answer?c.answer.slice(0,-1):c.stem;m.botAttempts++;m.botDueAt=Math.min(m.deadlineAt-50,now+2000+Math.floor(Math.random()*4500));}else{text=c.answer;m.botDueAt=null;}}
    else if(m.botWillGuess&&m.botAttempts===0){text=c.answer.length>4?c.answer.slice(0,-2):c.answer+'LAR';m.botAttempts++;m.botDueAt=null;}
    else m.botDueAt=null;
    if(text){sendMessage(m,{playerId:bot.id,text,turnId:m.turnId,messageId:crypto.randomUUID()},now);return true;}return false;
  }
  async advance() {
    if(!this.match)return;
    await this.resolvePendingJoker();
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
    if(await this.ensureQuestions(now))changed=true;
    this.scheduleBot();
    if(await this.botStep(now)){changed=true;await this.ensureQuestions(now);this.scheduleBot();}
    if(changed){await this.save();this.broadcast();}
  }
  async save() {
    await this.recordServed();this.scheduleBot();
    if(this.match.phase==='finished'&&!this.reported){
      try {
        await this.directory().finishMatch(this.match.roomCode,this.match.players,this.match.winnerId,this.match.startedAt!==null&&this.match.players.length===2,{finishedAt:this.match.finishedAt,endReason:this.match.endReason,rounds:this.match.roundResults||[],review:this.match.review||[]});
        this.reported=true;
      }catch{/* Persist the result and retry with the room alarm. */}
    }
    await this.ctx.storage.put({match:this.match,disconnected:this.disconnected,reported:this.reported,purged:this.purged});
    const deadlines=[];
    const engine=nextAlarm(this.match);if(engine)deadlines.push(engine);
    if(this.match.botDueAt)deadlines.push(this.match.botDueAt);
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
    if(this.match.randomMatch)await this.autoStart();
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
    if(message.type==='start'){
      if(this.match.version>=3&&this.match.phase==='waiting'&&session.id===this.match.hostId){const questions=await this.questions();if(questions.length<6){this.error(ws,'bank_exhausted');return;}installRoundQuestions(this.match,{questions});}
      result=startMatch(this.match,session.id,now);
    }
    else if(message.type==='continue'){
      if(this.match.version>=3){const questions=await this.questions();result=continueRound(this.match,session.id,{questions},now);if(result.ok)await this.botStep(now);}
      else{const bank=bankFromEnv(this.env),unseen=bank.filter(chain=>!(this.match.usedChainIds||[]).includes(chain.id));result=continueRound(this.match,session.id,pickChain(Math.random,unseen.length?unseen:bank),now);}
    }
    else if(message.type==='chat')result=sendMessage(this.match,{playerId:session.id,text:message.text,messageId:message.messageId,turnId:message.turnId},now);
    else if(message.type==='joker'){
      const requestId=message.requestId||message.messageId;
      result=validateJoker(this.match,session.id,message.kind,message.turnId,requestId,now);
      if(result.ok&&!result.duplicate){
        // Durable intent precedes the cross-actor debit. An actor restart or
        // lost acknowledgement resumes the SAME debit and exact letter reveal.
        this.match.pendingJoker={id:session.id,kind:message.kind,requestId,turnId:message.turnId,at:now,random:Math.random()};
        await this.ctx.storage.put('match',this.match);
        result=await this.resolvePendingJoker();
      }
    }
    else if(message.type==='leave'){
      result=leaveMatch(this.match,session.id,now);delete this.disconnected[session.id];
      await this.env.DIRECTORY.getByName('accounts-v1').releaseRoom(session.id,this.match.roomCode);
    } else {this.error(ws,'invalid_action');return;}
    if(await this.ensureQuestions(now))result.changed=true;
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
