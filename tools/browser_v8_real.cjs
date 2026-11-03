/* Real v8 HTTP + WebSocket browser check. Answers remain only in the Node fixture. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),GAME=process.env.GAME_URL||'http://localhost:8060',API=process.env.API_URL||'http://127.0.0.1:8787';
const bank=JSON.parse(fs.readFileSync(path.join(root,'backend/private/chains.json'),'utf8'));
const localApi=['127.0.0.1','localhost'].includes(new URL(API).hostname),localGame=['127.0.0.1','localhost'].includes(new URL(GAME).hostname);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
let browser,checks=0;const errors=[],pages=[],contexts=[],states=new Map(),saved=[];
const check=(v,m)=>{checks++;assert.ok(v,m)},t=(p,id)=>p.getByTestId('online-'+id),s=p=>states.get(p);
const wait=async(p,fn,label,ms=16000)=>{const until=Date.now()+ms;while(Date.now()<until){if(fn(s(p)))return s(p);await p.waitForTimeout(60)}throw Error('Timed out: '+label+'; '+JSON.stringify({phase:s(p)?.phase,index:s(p)?.activeIndex}))};
const enterFriends=async p=>{await p.locator('[data-action="online"]').click();await t(p,'friends').click({timeout:10000}).catch(async e=>{console.log(await p.locator('main').innerText());throw e});await t(p,'create-room').waitFor()};
async function answer(p){const q=s(p).question,old=s(p).turnId,candidates=bank.filter(c=>c.prompt===q.prompt&&c.answer.length===q.length&&c.answer[0]===q.first&&(q.revealed||[]).every(r=>c.answer[r.index]===r.letter)&&(!q.hint||c.hint===q.hint));check(candidates.length>0,'Private Node fixture recognizes question');for(const c of candidates){if(s(p).turnId!==old)return;await t(p,'chat-input').fill(c.answer);await t(p,'chat-input').press('Enter');await p.waitForFunction(()=>document.querySelector('[data-testid="online-chat-input"]').value==='',null,{timeout:10000});await p.waitForTimeout(80);if(s(p).turnId!==old)return;}throw Error('No candidate accepted');}
(async()=>{try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:localApi&&localGame?['--disable-features=LocalNetworkAccessChecks']:[]});
 for(const[index,name]of ['Deniz QA','Ece QA'].entries()){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});contexts.push(context);
  await context.addInitScript(({name,index})=>localStorage.setItem('sozcuk_zinciri_v1',JSON.stringify({version:1,profileName:name,profileAvatar:index?'mascot-girl':'mascot-boy',tutorialDone:true,gold:100,score:0,completed:[],progress:{},settings:{sound:false,haptics:false}})),{name,index});
  const ip='2001:db8:'+((Date.now()+index)%65535).toString(16)+':abcd::1';
  if(localApi)await context.route(API+'/**',route=>route.continue({headers:{...route.request().headers(),'CF-Connecting-IP':ip}}));
  // Load current web source without modifying production docs or the running server.
  if(localGame)await context.route(GAME+'/**',async route=>{const url=new URL(route.request().url());let file=url.pathname==='/'?path.join(root,'web/index.html'):path.join(root,url.pathname.startsWith('/assets/')||url.pathname.startsWith('/data/')?url.pathname.slice(1):'web/'+url.pathname.slice(1));if(!fs.existsSync(file)){await route.continue();return;}let body=fs.readFileSync(file);if(file.endsWith(path.join('web','index.html')))body=Buffer.from(body.toString().replace('{"baseUrl":""}',JSON.stringify({baseUrl:API})));await route.fulfill({body,contentType:mime[path.extname(file)]||'application/octet-stream'});});
  const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&r.request().resourceType()==='image')errors.push('Missing image: '+new URL(r.url()).pathname)});page.on('console',m=>{if(m.type()==='error')console.log('console',m.text().replace(/token=[^& ]+/g,'token=REDACTED'))});page.on('requestfailed',r=>console.log('requestfailed',new URL(r.url()).pathname,r.failure()?.errorText));page.on('response',async r=>{if(r.url().startsWith(API)&&r.status()>=400)console.log('apierror',new URL(r.url()).pathname,r.status(),await r.text())});page.on('websocket',ws=>ws.on('framereceived',frame=>{try{const msg=JSON.parse(String(frame.payload));if(msg.type==='state')states.set(page,msg.state)}catch{}}));await page.goto(GAME,{waitUntil:'networkidle'});await enterFriends(page);saved.push(await page.evaluate(()=>JSON.parse(localStorage.getItem('sozcuk_zinciri_online_v1'))));
 }
 const[a,b]=pages;const owner=id=>saved[0].profile.id===id?a:b;
 check(saved[0].profile.avatar==='mascot-boy'&&saved[1].profile.avatar==='mascot-girl','Both mascot profiles registered on real server');
 await t(a,'create-room').click();const code=(await t(a,'room-code').innerText()).trim();await t(b,'join-code').fill(code);await t(b,'join-room').click();await wait(a,x=>x?.players.length===2&&x.players.every(p=>p.connected),'two playersconnected');await t(a,'start').click();await wait(a,x=>x?.phase==='playing','roundstarted');await wait(b,x=>x?.phase==='playing','guestround');
 check(s(a).questionsPerRound===6,'Actual server provides six questions');
 let active=owner(s(a).activePlayerId),inactive=active===a?b:a;
 check(await t(inactive,'chat-input').isDisabled(),'Real inactive client cannot type');
 const oldGold=s(active).players.find(p=>p.id===s(active).activePlayerId).gold;
 await t(active,'joker-hint').click();await wait(active,x=>!!x?.question?.hint,'hintack');await wait(inactive,x=>!!x?.question?.hint,'hintshared');
 check(s(active).players.find(p=>p.id===s(active).activePlayerId).gold===oldGold-15,'Hint charges real serverwallet15gold');
 check(await t(active,'joker-hint').isDisabled(),'Open hint prevents duplicatepurchase');
 await t(active,'joker-letter').click();await wait(active,x=>x?.question?.revealed?.length===1,'letterack');
 check(s(active).players.find(p=>p.id===s(active).activePlayerId).gold===oldGold-35,'Letter charges real serverwallet20gold');
 for(let index=0;index<6;index++){const current=s(a),turn=current.turnId;active=owner(current.activePlayerId);await answer(active);await wait(a,x=>x?.turnId!==turn,'nextquestion');await wait(b,x=>x?.turnId===s(a).turnId,'clientsagree');}
 check(s(a).phase==='playing'&&s(a).suddenDeath,'Allsixcorrect advances to suddendeath instead of unfairloss');
 check(s(a).players.every(p=>p.score===300),'Both players scored threecorrectanswers');
 check(s(a).review.length===6,'Allsixanswerreviews preserved');
 check(new Set(s(a).review.map(q=>q.questionId)).size===6,'Noquestion repeated withinfirstsix');
 active=owner(s(a).activePlayerId);const timeoutTurn=s(a).turnId;
 console.log('Six correct: fair3–3. Waiting one real30secturn toverify sudden-death missedanswer.');
 await wait(a,x=>x?.turnId!==timeoutTurn,'realtimeout',38000);await wait(b,x=>x?.turnId===s(a).turnId,'timeoutboth');
 check(s(a).phase==='playing','Firstsudden-deathmiss does not end beforeequalreply');
 const missed=s(a).review.at(-1);check(missed.status==='skipped'&&missed.answer,'Timeout reveals missedanswer');
 active=owner(s(a).activePlayerId);const expectedWinner=s(a).activePlayerId;await answer(active);await wait(a,x=>x?.phase==='round_end','roundwinner');await wait(b,x=>x?.phase==='round_end','guestresult');
 check(s(a).roundResult.winnerId===expectedWinner,'Equal-replycorrectwins sudden-death');
 for(const p of pages){const text=await p.locator('[data-oz="result"]').innerText();check(text.includes(missed.answer),'Bothresultsshowmissedanswer');check(text.includes(s(a).lastCorrect.answer),'Bothresultsshowfinalcorrectanswer');}
 await a.screenshot({path:path.join(root,'output/v8-web-real-round-result.png')});
 await t(a,'continue').click();await wait(a,x=>x?.continueReady?.includes(saved[0].profile.id),'hostcontinue');check(s(a).phase==='round_end','Singlecontinuewaitsforotherplayer');await t(b,'continue').click();await wait(a,x=>x?.phase==='playing','secondround');await wait(b,x=>x?.phase==='playing','secondroundguest');
 const oldIDs=new Set(s(a).review.map(q=>q.questionId));await answer(owner(s(a).activePlayerId));await wait(a,x=>x?.review.length>8,'secondroundanswer');check(!oldIDs.has(s(a).review.at(-1).questionId),'Newroundquestionneverrepeatsfirst');
 await a.screenshot({path:path.join(root,'output/v8-web-real-playing.png')});
 // Ending via explicitleave exercises persistedhistory without another longround.
 await t(a,'back').click();await t(a,'confirm-leave').click();await wait(b,x=>x?.phase==='finished','forfeitfinish');await t(b,'back').click();await b.locator('[data-action="history"]').click();await b.locator('.oz-history-card').waitFor();check((await b.locator('.oz-history-card').first().innerText()).includes('Deniz QA'),'Completedmatchpersistedinhistory');await b.locator('.oz-history-card summary').first().click();check((await b.locator('.oz-history-card').first().innerText()).includes(missed.answer),'Persistedhistorykeepsmissedanswer');
 check(errors.length===0,'NobrowserJSerrors');fs.writeFileSync(path.join(root,'output/v8-web-real-report.json'),JSON.stringify({checks,errors,type:localGame?'real-local-http-websocket-two-clients':'production-http-websocket-two-clients',artworkFallback:false},null,2));console.log('Webv8 realAPI: '+checks+'checkspassed.');
 }finally{if(browser)await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
