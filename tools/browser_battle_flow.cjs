/* Real two-device battle-screen regression. The private bank stays in Node. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const URL=process.env.GAME_URL||'http://localhost:8060',API=process.env.API_URL||'http://127.0.0.1:8787';
const bank=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../backend/private/chains.json'),'utf8'));
const output=path.resolve(__dirname,'../output');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await playwright.chromium.launch({channel:'chrome',headless:true}),contexts=[],pages=[],states=new Map(),errors=[];
 let checks=0;const check=(v,m)=>{checks++;assert.ok(v,m)},t=(p,id)=>p.getByTestId('online-'+id),state=p=>states.get(p);
 const wait=async(p,predicate,label)=>{await p.waitForFunction(()=>true);const until=Date.now()+15000;while(Date.now()<until){if(predicate(state(p)))return state(p);await p.waitForTimeout(50)}throw Error('Timed out: '+label)};
 const send=async(p,text)=>{await t(p,'chat-input').fill(text);await t(p,'chat-input').press('Enter');await p.waitForFunction(()=>document.querySelector('[data-testid="online-chat-input"]').value==='',null,{timeout:10000})};
 const enter=async p=>{await p.locator('[data-action="online"]').click();await p.locator('main[data-online-view="hub"]').waitFor()};
 try{
  for(const name of ['Deniz Tur','Ece Tur']){
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});contexts.push(context);
   if(['127.0.0.1','localhost'].includes(new globalThis.URL(API).hostname)){
    const ip='2001:db8:'+(Date.now()%65535).toString(16)+':'+contexts.length+'::1';
    await context.route(API+'/**',r=>r.continue({headers:{...r.request().headers(),'CF-Connecting-IP':ip}}));
   }
   await context.addInitScript(name=>localStorage.setItem('sozcuk_zinciri_v1',JSON.stringify({version:1,profileName:name,tutorialDone:true,gold:100,score:0,completed:[],progress:{},settings:{sound:false,haptics:false}})),name);
   const page=await context.newPage();pages.push(page);
   page.on('pageerror',e=>errors.push(e.message.replace(/token=[^&\s]+/g,'token=[redacted]')));
   page.on('console',m=>{if(m.type()==='error')errors.push(m.text().replace(/token=[^&\s]+/g,'token=[redacted]'))});
   page.on('websocket',socket=>socket.on('framereceived',frame=>{try{const m=JSON.parse(String(frame.payload));if(m.type==='state')states.set(page,m.state)}catch{}}));
   await page.goto(URL,{waitUntil:'networkidle'});await enter(page);
  }
  const[a,b]=pages,records=await Promise.all(pages.map(p=>p.evaluate(()=>JSON.parse(localStorage.getItem('sozcuk_zinciri_online_v1'))))),profiles=records.map(r=>r.profile);
  const pageFor=id=>profiles[0].id===id?a:b;
  async function create(){
   await t(a,'create-room').click();await t(a,'room-code').waitFor();const code=(await t(a,'room-code').innerText()).trim();
   await t(b,'join-code').fill(code);await t(b,'join-room').click();
   await wait(a,s=>s?.roomCode===code&&s.players.length===2&&s.players.every(p=>p.connected),'two connected players');
   await t(a,'start').click();await wait(a,s=>s?.phase==='playing','first round');await wait(b,s=>s?.phase==='playing','guest round');return code;
  }
  async function finishRound(winnerId){
   let round=state(a).roundNumber;
   while(state(a).phase==='playing'){
    const current=state(a),chain=bank.find(c=>c.words[0]===current.chain[0].stem);check(Boolean(chain),'Server chain identified only in Node');
    const active=pageFor(current.activePlayerId);
    await active.waitForTimeout(current.activePlayerId===winnerId?60:750);
    await send(active,chain.answers[current.activeIndex]);
    await wait(a,s=>s?.turnId!==current.turnId||s?.phase!=='playing','accepted answer');
    await wait(b,s=>s?.turnId===state(a).turnId,'both clients agree');
   }
   const result=state(a);check(result.phase==='round_end'||result.phase==='finished','Chain resolves into round/series result');
   check((result.roundResult?.winnerId||result.winnerId)===winnerId,'Chosen faster player wins round '+round);
   return result;
  }
  async function continueRound(){
   const before=state(a).roundNumber;await t(a,'continue').click();
   await wait(a,s=>s?.phase==='round_end'&&s.continueReady?.includes(profiles[0].id),'first continuation ready');
   check(await t(a,'continue').isDisabled(),'One continue waits for the opponent');
   check(state(a).roundNumber===before,'One player cannot start the next round alone');
   await t(b,'continue').click();await wait(a,s=>s?.phase==='playing','next round countdown completed');await wait(b,s=>s?.phase==='playing','other player next round');
  }
  const code=await create();let current=state(a),active=pageFor(current.activePlayerId),inactive=active===a?b:a;
  check(current.deadlineAt-current.serverNow>27000&&current.deadlineAt-current.serverNow<=30000,'Turns are 30 seconds');
  check(await t(inactive,'chat-input').isDisabled()&&await t(inactive,'send').isDisabled(),'Inactive player cannot type or submit');
  const prompt=await t(active,'active-word').innerText();check(/\S+\s*→\s*[A-ZÇĞİÖŞÜ]_+/u.test(prompt),'Question strip uses STEM → B_____ format');
  check(await active.locator('.oz-letter-grid').count()===0,'The question is a single line instead of tile cells');
  await send(active,'YANLIS');check(await active.locator('[data-kind="wrong"] .oz-answer').evaluate(el=>getComputedStyle(el).textDecorationLine.includes('line-through')),'Wrong answer has red strike-through');
  await active.screenshot({path:path.join(output,'battle-playing-mobile.png')});
  await active.setViewportSize({width:320,height:300});await t(active,'chat-input').focus();await active.waitForTimeout(100);
  const geometry=await active.evaluate(()=>{const a=document.querySelector('[data-testid="online-active-word"]').getBoundingClientRect(),b=document.querySelector('[data-testid="online-chat-input"]').getBoundingClientRect();return{qtop:a.top,qbottom:a.bottom,itop:b.top,ibottom:b.bottom,height:innerHeight,width:innerWidth,scroll:document.documentElement.scrollWidth}});
  check(geometry.qtop>=0&&geometry.qbottom<=geometry.height&&geometry.itop>=0&&geometry.ibottom<=geometry.height+1&&geometry.scroll<=geometry.width+1,'Question and composer remain visible with mobile keyboard: '+JSON.stringify(geometry));
  await active.screenshot({path:path.join(output,'battle-keyboard-mobile.png')});await active.setViewportSize({width:390,height:844});
  await finishRound(profiles[0].id);check(state(a).phase==='round_end'&&state(a).players[0].roundWins===1,'First chain ends at 1–0 with continuation');
  await a.screenshot({path:path.join(output,'battle-round-result.png')});await continueRound();await finishRound(profiles[0].id);
  check(state(a).phase==='finished'&&state(a).players[0].roundWins===2&&state(a).players[1].roundWins===0,'Series ends immediately at 2–0');
  check(await t(a,'continue').count()===0,'Final match has no further round continuation');await a.screenshot({path:path.join(output,'battle-final-2-0.png')});
  for(const p of pages){await p.locator('[data-online-action="leave"]').first().click();await p.locator('main[data-online-view="hub"]').waitFor()}
  await create();await finishRound(profiles[0].id);await continueRound();await finishRound(profiles[1].id);
  check(state(a).phase==='round_end'&&state(a).players.every(p=>p.roundWins===1),'A 1–1 series continues into the third round');
  await continueRound();await finishRound(profiles[0].id);
  check(state(a).phase==='finished'&&state(a).players[0].roundWins===2&&state(a).players[1].roundWins===1,'Third round ends the series at 2–1');
  await a.screenshot({path:path.join(output,'battle-final-2-1.png')});
  check(errors.length===0,'Browser runtime errors: '+errors.join(';'));
  const report={checks,failures:0,roomCode:code,consoleErrors:errors};fs.writeFileSync(path.join(output,'battle-browser-flow.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await Promise.all(contexts.map(c=>c.close()));await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
