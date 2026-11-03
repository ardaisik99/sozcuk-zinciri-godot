import {ZincirState, normalizeTurkish} from './state.js';

const app = document.querySelector('#app');
const toastEl = document.querySelector('#toast');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = (name, cls='') => `<img class="icon ${cls}" src="assets/icons/${name}.svg" alt="" aria-hidden="true" width="28" height="28">`;
const btn = (text, action, cls='', attrs='') => `<button type="button" class="btn ${cls}" data-action="${action}" ${attrs}>${text}</button>`;
const tag = (text, cls='') => `<span class="tag ${cls}">${text}</span>`;
const mascot = (cls='', alt='Gazetesindeki kelime bulmacasını çözen mavi damla maskot') => `<img class="mascot ${cls}" data-pose="editorial" src="assets/mascot-editorial.webp" alt="${alt}" width="512" height="512" decoding="async">`;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let state, screen='loading', category='Tümü', partyLevel, partyCount=0, lastResult={}, toastTimer, audio;
let transitioning=false, transitionToken=0, onlineScreen=null, onlineOpenToken=0;

function toast(text, good=false) {
  clearTimeout(toastTimer); toastEl.textContent=text;
  toastEl.className=`visible${good?' success':''}`;
  toastTimer=setTimeout(()=>{toastEl.className='';},2600);
}
function sound(kind='tap') {
  if(!state.settings.sound)return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if(audio.state==='suspended')audio.resume();
    const oscillator=audio.createOscillator(), gain=audio.createGain();
    oscillator.frequency.value={tap:520,good:880,bad:180,win:1046}[kind];
    gain.gain.setValueAtTime(.075,audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.16);
    oscillator.connect(gain);gain.connect(audio.destination);
    oscillator.start();oscillator.stop(audio.currentTime+.17);
  } catch { /* Audio is optional; gameplay continues if the device disables it. */ }
}
function bar(title='', back=false) {
  return `<header class="topbar">${back?`<button type="button" class="icon-btn" data-action="home" data-testid="back-home" aria-label="Ana menü">${icon('back')}</button>`:''}<div class="brand">${!back?mascot('brand-mascot',''):''}<span class="${back?'bar-title':''}">${title?esc(title):'SÖZCÜK<br>ZİNCİRİ'}</span></div><div class="coins" aria-label="${state.gold} altın">${icon('coin')}<span data-testid="gold">${state.gold}</span></div>${!back?`<button type="button" class="icon-btn" data-action="settings" aria-label="Oyuncu ve ayarlar">${icon('settings')}</button>`:''}</header>`;
}
function setScreen(name, html, cls='', keepScroll=false) {
  if(onlineScreen){onlineScreen.destroy();onlineScreen=null;}
  onlineOpenToken++;
	transitionToken++;transitioning=false;
	clearTimeout(toastTimer);toastEl.className='';
  screen=name;document.body.classList.remove('is-typing');
  app.innerHTML=`<main class="${cls}" data-screen="${name}">${html}</main>`;
  if(!keepScroll)window.scrollTo(0,0);
}
function nextLevel() {return state.levels.find(l=>!state.completed.includes(l.id)&&available(l));}
function available(level) {
  const entries=state.levels.filter(l=>l.category===level.category), i=entries.findIndex(l=>l.id===level.id);
  return i===0||state.completed.includes(entries[i-1]?.id)||state.completed.includes(level.id);
}
function categoryIcon(c) {return ({Mutfak:'chef',Spor:'ball','Doğa':'leaf','Kültür':'book'})[c]||'chain';}

function profile() {
  setScreen('profile',`<div class="stack">${mascot('profile-mascot','Gazetesiyle seni karşılayan mavi damla')}${tag('KELİME KULÜBÜNE HOŞ GELDİN')}<h1>Sana ne diyelim?</h1><p>Bir isim seç, birlikte kelimelerin peşine düşelim.</p><form id="profile-form" class="stack"><label class="hidden" for="profile-name">Oyuncu adın</label><input class="name-input" id="profile-name" data-testid="profile-name" name="player" maxlength="18" minlength="2" placeholder="Oyuncu adın" autocomplete="off" required><button class="btn full" data-testid="profile-submit" type="submit">HADİ BAŞLAYALIM →</button></form><div class="coin-note">${icon('coin')}İlk 100 altının bizden!</div></div>`,'profile');
}
function home() {
  const next=nextLevel();
  setScreen('home',`${bar()}<div class="stack"><div class="welcome"><h2>Merhaba, ${esc(state.profileName)}!</h2><p class="muted">Bugün hangi kelimeye bağlanıyoruz?</p></div><section class="hero panel outlined"><div>${tag('HER KELİME BİR BAŞLANGIÇ')}<h1>Bağlantıyı bul.<br>Zinciri tamamla!</h1><p>Bir kelime, yeni bir bağlantı. Sıradakini birlikte bulalım!</p><div class="mini-chain"><div>${tag('ÇAY → K · · · · ·')}<p>Tamlamayı yaz.<br>Köküyle devam et.</p></div>${mascot('mini-mascot','')}</div>${btn(state.completed.length?'MACERAYA DEVAM →':'MACERAYA BAŞLA →','play','full','data-testid="home-play"')}</div>${mascot('home-mascot')}</section><section class="journey panel"><div class="row spread"><div class="row">${icon('trophy')}<span class="eyebrow">KELİME YOLCULUĞUN</span></div><span class="muted small">${state.completed.length} / ${state.levels.length}</span></div><div class="progress"><i style="width:${state.completed.length/state.levels.length*100}%"></i></div><div class="row spread"><span class="muted small">${state.score} puan</span>${btn('Bölümler →','levels','soft small','data-testid="nav-levels"')}</div></section><div class="eyebrow">OYUN ALANIN</div><div class="mode-grid">${modeCard('party','party','Parti zamanı!','Ekranı ortaya koy. Zincirler açığa çıksın.','PARTİ MODU →','party','data-testid="nav-party"')}${modeCard('explore','chef','Bir kategori seç','Mutfak, spor, doğa… Kendi rotanı çiz.','KEŞFET →','levels')}${modeCard('online','lock','Karşılıklı 1v1','30 saniyelik sıralar, canlı sohbet ve arkadaşların.','KELİME SAVAŞI →','online')}</div><div class="footnote">${icon('spark')}<span>Acele yok, süre yok. Sadece sen ve kelimeler.</span></div></div>`);
}
function modeCard(cls,ico,title,desc,label,action,attrs='') {
  return `<section class="mode-card panel ${cls}"><div class="row">${icon(ico)}<h3>${title}</h3></div><p>${desc}</p>${btn(label,action,'white small',attrs)}</section>`;
}
function levels() {
  const categories=['Tümü',...new Set(state.levels.map(l=>l.category))];
  setScreen('levels',`${bar('Bölümler',true)}<div class="stack"><h1>Kendi rotanı çiz.</h1><p class="muted">Her kategorinin ilk bölümü açık. Zincirleri çöz, yenilerini keşfet.</p><nav class="tabs" aria-label="Kategoriler">${categories.map(c=>btn(esc(c),'category',c===category?'gold':'white',`data-category="${esc(c)}" aria-pressed="${c===category}"`)).join('')}</nav><div class="level-grid">${state.levels.filter(l=>category==='Tümü'||l.category===category).map(l=>{const done=state.completed.includes(l.id),open=available(l);return `<article class="level-card panel ${done?'done':!open?'locked':''}" data-level-id="${l.id}"><div class="row spread"><div class="row">${icon(categoryIcon(l.category))}<span class="category">${esc(l.category)}</span></div>${icon(done?'check':open?'spark':'lock')}</div><h3>${esc(l.title)}</h3><p class="small muted">${l.words.length} kelime · İlk kelime: ${esc(l.words[0])}</p>${btn(done?'TEKRAR OYNA':open?'ZİNCİRİ ÇÖZ →':'ÖNCEKİ BÖLÜMÜ TAMAMLA','level',done?'mint':'gold',`data-id="${l.id}" ${!open?'disabled':''}`)}</article>`;}).join('')}</div></div>`);
}
function startLevel(id) {if(state.beginLevel(id))game();}

function wordRow(word,index) {
  const mode=index<state.activeIndex?'solved':index===state.activeIndex?'active':'locked';
  word=mode==='solved'?state.stemWord(index):state.answerWord(index);
  const letters=state.visibleLetters(index);
  return `<article class="word-row" data-testid="word-row" data-mode="${mode}" data-index="${index}"><div class="word-meta"><span>${String(index+1).padStart(2,'0')}</span><span>${mode==='solved'?'TAMAMLANDI':mode==='active'?`SIRA SENDE · ${word.length} HARF`:`${word.length} HARF`}</span><span class="status">${icon(mode==='solved'?'check':mode==='active'?'arrow':'lock')}</span></div><div class="letter-entry"><div class="letter-cells" style="--letters:${word.length}">${letters.map((l,i)=>`<span class="word-tile ${l?'fixed':''}" data-testid="letter-cell" data-position="${i}">${l?esc(l):'·'}</span>`).join('')}</div>${mode==='active'?`<input class="word-input" data-testid="word-input" aria-label="Sıradaki kelimenin eksik harflerini yaz" maxlength="${word.length}" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go">`:''}</div></article>`;
}
function controls(tutorial) {
  const hinted=!!state.hintUsed[String(state.activeIndex)];
  return `<p class="feedback" role="status" data-testid="feedback">Yalnızca eksik harfleri yaz; ilk harf bizden.</p>${btn('KONTROL ET ✓','submit','full','data-testid="submit-guess"')}<div class="joker-row">${btn(icon('spark')+'Harf al · 20','reveal','gold',`data-testid="reveal-letter" ${tutorial?'disabled':''}`)}${btn(icon('bulb')+(hinted?'Tanım açık ✓':'İpucu · 15'),'hint','mint',`data-testid="hint" ${tutorial?'disabled':''}`)}</div>${hinted?`<p class="hint-box" data-testid="hint-text">${esc(state.currentDefinition())}</p>`:''}`;
}
function game({focus=false,draft=null,scroll=false}={}) {
  const l=state.currentLevel,tutorial=l.id==='tutorial';
  const tips=['','Çay kaşığı! K hazır; kutulara AŞIĞI yaz. KAŞIĞI, kısa bir hareketle KAŞIK olacak.','Şimdi kaşık oyunu! O hazır; YUNU yaz. OYUNU → OYUN olacak ve zincir devam edecek.','Son bağlantı: oyun havası. H hazır; AVASI yaz. Tamlamayı doğal hâliyle tamamla!'];
  let chain='';
  l.words.forEach((w,i)=>{if(i>0)chain+=`<div class="connector ${i<state.activeIndex?'done':''}">${icon('chain')}<span>${i<state.activeIndex?esc(l.links[i-1]):i===state.activeIndex?esc(state.stemWord(i-1))+' + '+state.answerWord(i)[0]+'…':''}</span></div>`;chain+=i===state.activeIndex?`<section class="active-group">${wordRow(w,i)}${controls(tutorial)}</section>`:wordRow(w,i);});
  setScreen('game',`${bar(tutorial?'Birlikte çözelim':l.category,true)}<section class="game-top"><div class="row spread">${tag(tutorial?'ALIŞTIRMA':'KELİME ZİNCİRİ')}<span class="small muted">${state.activeIndex} / ${l.words.length-1}</span></div><h1>${tutorial&&state.activeIndex===1?'İlk bağlantıyı kur.':'Zinciri devam ettir!'}</h1><div class="progress"><i style="width:${(state.activeIndex-1)/(l.words.length-1)*100}%"></i></div>${tutorial?`<div class="panel tutorial-tip mascot-tip">${mascot('tip-mascot','Gazetesindeki bulmacayı çözen maskot')}<p>${tips[state.activeIndex]}</p></div>`:`<div class="panel mascot-tip play-tip">${mascot('tip-mascot','')}<p>Ekleriyle tamamla, köküyle devam et. Haydi, birlikte bulalım!</p></div>`}</section><div class="chain">${chain}</div><p class="game-footer">${tutorial?'İlk harfler bizden. Gerisi sende!':'Bölüm ödülü: 40 altın + 100 puan'}</p>`,'narrow',scroll);
  const input=wordInput();
  if(draft)restoreDraft(draft);
  if(focus){input.focus({preventScroll:true});scrollActive();}
  else if(scroll)requestAnimationFrame(scrollActive);
}
function wordInput() {return app.querySelector('[data-testid="word-input"]');}
function entryMapping() {
  const input=wordInput(),entered=normalizeTurkish(input?.value||''), known=state.visibleLetters();
  const whole=entered.length===state.currentWord().length&&entered.startsWith(state.currentWord()[0]);
  let pointer=0;const map={};
  known.forEach((l,i)=>{if(l)return;if(whole)map[i]=entered[i];else if(pointer<entered.length)map[i]=entered[pointer++];});
  return {entered,known,map};
}
function paintInput() {
  if(transitioning)return;
  const {known,map}=entryMapping();
  app.querySelectorAll('[data-mode="active"] .word-tile').forEach((tile,i)=>{tile.textContent=known[i]||map[i]||'·';tile.classList.toggle('typed',!!map[i]);});
}
function draftByPosition() {return entryMapping().map;}
function restoreDraft(map) {
  wordInput().value=state.visibleLetters().map((l,i)=>l?'':map[i]||'').join('');paintInput();
}
function guess() {
  const {entered,known,map}=entryMapping();
  if(entered.length===state.currentWord().length)return entered;
  if(entered.length>known.filter(l=>!l).length)return entered;
  return known.map((l,i)=>l||map[i]||'').join('');
}
function scrollActive() {
  if(screen!=='game')return;
  const group=app.querySelector('.active-group');
  const target=group?.getBoundingClientRect().height<(window.visualViewport?.height||innerHeight)-25?group:app.querySelector('[data-mode="active"]');
  target?.scrollIntoView({block:'center',behavior:'instant'});
}
async function submit() {
  if(screen!=='game'||transitioning)return;
  const focused=document.activeElement===wordInput();
  const row=app.querySelector('[data-mode="active"]');
  const result=state.submitGuess(guess());
  if(result.ok){
    const token=++transitionToken;
    transitioning=true;
    const main=app.querySelector('main');main.dataset.transitioning='true';main.setAttribute('aria-busy','true');
    main.querySelectorAll('[data-testid="submit-guess"], [data-testid="reveal-letter"], [data-testid="hint"]').forEach(b=>b.disabled=true);
    sound(result.complete?'win':'good');
    if(state.settings.haptics&&navigator.vibrate)navigator.vibrate(30);
    await morphWord(row,result,token);
    if(token!==transitionToken||screen!=='game')return;
    transitioning=false;
    if(result.complete){lastResult=result;document.activeElement?.blur();win();}
    else {game({focus:focused,scroll:true});toast(`Bağlantı tamam! ${state.currentLevel.links[state.activeIndex-2]}`,true);}
  } else {
    sound('bad');const f=app.querySelector('.feedback');
    const entered=normalizeTurkish(wordInput()?.value||'');
    const bare=state.stemWord();
    f.textContent=entered===bare||entered===bare.slice(1)?'Tamlamadaki hâlini yaz; kelimenin eklerini de tamamla.':'Bu bağlantı olmadı. Bir daha dene; altının azalmaz.';
    f.classList.add('error');
    const row=app.querySelector('[data-mode="active"]');row.classList.remove('shake');void row.offsetWidth;row.classList.add('shake');
  }
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function morphWord(row,result,token) {
  const full=result.word, stem=result.stem;
  const cells=row.querySelector('.letter-cells');
  row.dataset.mode='revealing';
  row.querySelector('.word-meta span:nth-child(2)').textContent='BAĞLANTI TAMAM!';
  row.querySelectorAll('.word-tile').forEach((tile,i)=>{tile.textContent=full[i];tile.classList.add('fixed');});
  const feedback=app.querySelector('.feedback');
  feedback.className='feedback morph-feedback';
  feedback.innerHTML=`${esc(full)} <span aria-hidden="true">→</span> <strong>${esc(stem)}</strong><span class="morph-caption">Zincire ${esc(stem)} ile devam.</span>`;
  if(reducedMotion()){await delay(80);return;}
  row.classList.add('word-correct');
  await delay(230);
  if(token!==transitionToken)return;
  let prefix=0;while(prefix<Math.min(full.length,stem.length)&&full[prefix]===stem[prefix])prefix++;
  row.querySelectorAll('.word-tile').forEach((tile,i)=>{if(i>=prefix)tile.classList.add(i>=stem.length?'letter-leaving':'letter-changing');});
  await delay(200);
  if(token!==transitionToken)return;
  const before=[...cells.children].map(tile=>tile.getBoundingClientRect());
  cells.style.setProperty('--letters',stem.length);
  cells.innerHTML=[...stem].map((letter,i)=>`<span class="word-tile fixed" data-testid="letter-cell" data-position="${i}">${esc(letter)}</span>`).join('');
  row.dataset.mode='morphing';
  [...cells.children].forEach((tile,i)=>{
    const old=before[i], now=tile.getBoundingClientRect();
    if(old&&tile.animate)tile.animate([{transform:`translateX(${old.left-now.left}px) scaleX(${old.width/now.width})`,opacity:i>=prefix ? 0.5 : 1},{transform:'none',opacity:1}],{duration:210,easing:'cubic-bezier(.2,.8,.2,1)'});
  });
  row.classList.remove('word-correct');row.classList.add('word-settled');
  await delay(310);
}
function joker(kind) {
  if(screen!=='game'||transitioning)return;
  const draft=draftByPosition(),result=kind==='reveal'?state.revealLetter():state.buyHint();
  if(result.ok){sound();game({draft,scroll:true});toast(kind==='reveal'?'Bir harf açıldı. Bağlantı sana kaldı!':result.text,true);}
  else toast(result.reason==='insufficient_gold'?`${kind==='reveal'?20:15} altın gerekiyor.`:'Bu kelimede açılacak başka harf kalmadı.');
}
function win() {
  const l=state.currentLevel,tutorial=l.id==='tutorial',next=nextLevel();
  setScreen('win',`<div class="stack">${mascot('win-mascot','Bulmacasını tamamlayan mavi damla')}${tag('BAĞLANTILAR TAMAM!')}<h1>İşte bu, zincir sende!</h1><p>${tutorial?'Artık hazırsın! Tamlamayı yaz, kelimenin köküyle devam et. Kendi kelime yolculuğuna başlayabilirsin.':'Bir bağlantı daha keşfettin. Kelime yolculuğun büyümeye devam ediyor.'}</p><section class="panel summary">${l.words.map((w,i)=>`<h3>${esc(w)}</h3>${l.links[i]?`<p>↳ ${esc(l.links[i])}</p>`:''}`).join('')}</section>${!tutorial?`<div class="rewards"><span class="row">${icon('coin')}+${lastResult.rewardGold||0} altın</span><span class="score">+${lastResult.rewardScore||0} puan</span></div>${!lastResult.rewardGold?'<p class="muted small">Bu bölümün ödülünü daha önce aldın. Yeni ödüller için yeni zincirleri çöz.</p>':''}`:''}${btn(tutorial?'ANA MENÜYE →':next?'SIRADAKİ ZİNCİR →':'ANA MENÜYE →',tutorial||!next?'home':'play','full','data-testid="win-primary"')}${tutorial&&next?btn('İLK ZİNCİRİ ÇÖZ','play','white full'):!tutorial?btn('BÖLÜMLERE DÖN','levels','white full'):''}</div>`,'win');
}
function party(newChain=true) {
  if(newChain||!partyLevel){const choices=state.levels.filter(l=>l.id!==partyLevel?.id);partyLevel=choices[Math.floor(Math.random()*choices.length)];partyCount++;}
  setScreen('party',`${bar('Parti zamanı!',true)}<div class="stack"><div class="row spread">${tag('HEP BİRLİKTE OYNAYIN')}<span class="small muted">Zincir ${String(partyCount).padStart(2,'0')}</span></div><h1>Kelimeler masada.</h1><p>Sırayla bir kelime söyleyin, bağlantısını açıklayın. Yeni bir tur için zincire dokunun.</p><section class="panel outlined party-chain" data-action="party-next"><span class="eyebrow">${esc(partyLevel.category.toLocaleUpperCase('tr-TR'))}</span>${partyLevel.words.map((w,i)=>`${btn(esc(w),'party-next','full')}${partyLevel.links[i]?`<p class="party-link">↓ ${esc(partyLevel.links[i])}</p>`:''}`).join('')}</section>${btn('YENİ ZİNCİR ↻','party-next','full','data-testid="party-next"')}<p class="muted small">Parti modunda altın harcanmaz, ilerlemen değişmez. Telefonu arkadaşlarınla paylaşman yeterli.</p></div>`,'narrow');
}
function settings() {
  setScreen('settings',`${bar('Oyuncu kartın',true)}<div class="stack settings-stack"><section class="panel outlined settings-card"><h1>${esc(state.profileName)}</h1><p>${state.completed.length} bölüm · ${state.score} puan</p></section><div class="eyebrow">OYUN AYARLARI</div>${btn(`Sesler: ${state.settings.sound?'AÇIK':'KAPALI'}`,'sound','white full')}${btn(`Titreşim: ${state.settings.haptics?'AÇIK':'KAPALI'}`,'haptics','white full')}${btn('ÖĞRETİCİYİ TEKRAR OYNA','tutorial','gold full')}<p class="muted">İlerleme bu cihazda otomatik kaydedilir. Aynı tarayıcı ve adresle devam edebilirsin.</p><section class="panel rules"><strong>NASIL OYNANIR?</strong><p>İlk kelime açık. Sonraki kelimenin ilk harfi ve uzunluğu hazır. Kutulara dokun, eksik harfleri yaz ve kontrol et. Tamlamayı ekleriyle yaz: SU + BARDAĞI gibi. Cevap kısa bir animasyonla BARDAK olur; sıradaki bağlantıyı bu kökle kur.</p><br><p>Harf: 20 altın · Tanım ipucu: 15 altın<br>Yeni bölüm: +40 altın · +100 puan</p><br><span class="muted small">Sözcük Zinciri · Türkçe · v1.5</span></section></div>`,'narrow');
}
async function online() {
  setScreen('online',`${bar('Kelime Savaşı',true)}<div class="stack"><h1>Rakibin hazır mı?</h1><p role="status">Oyun alanı hazırlanıyor…</p></div>`,'narrow');
  const token=onlineOpenToken;
  try {
    // Load multiplayer only when requested: solo startup stays lightweight.
    if(!document.querySelector('link[data-online-style]')){
      const css=document.createElement('link');css.rel='stylesheet';css.href='online.css?v=7';css.dataset.onlineStyle='true';document.head.append(css);
    }
    const {OnlineScreen}=await import('./online.js?v=7');
    if(token!==onlineOpenToken||screen!=='online')return;
    let config={};try{config=JSON.parse(document.querySelector('#online-config')?.textContent||'{}');}catch{}
    onlineScreen=new OnlineScreen({app,name:state.profileName,onHome:home,toast,sound,baseUrl:config.baseUrl||''});
    await onlineScreen.open();
  } catch(error){
    if(token!==onlineOpenToken||screen!=='online')return;
    console.error(error);setScreen('online',`${bar('Kelime Savaşı',true)}<div class="stack"><h1>Bağlantı kurulamadı.</h1><p>Bağlantını kontrol edip tekrar dene.</p>${btn('TEKRAR DENE','online','full')}</div>`,'narrow');
  }
}

app.addEventListener('click',event=>{
  const target=event.target.closest('[data-action]');if(!target||target.disabled)return;
  const action=target.dataset.action;
  if(action==='home'&&screen==='game'&&!state.tutorialDone){toast('Birlikte üç kelimeyi bulalım. Çok az kaldı!');return;}
  if(action==='submit')return submit();
  if(action==='reveal'||action==='hint')return joker(action);
  sound();
  switch(action){
    case 'home':home();break;
    case 'play':{const next=nextLevel();next?startLevel(next.id):levels();break;}
    case 'levels':levels();break;
    case 'category':category=target.dataset.category;levels();break;
    case 'level':{const l=state.findLevel(target.dataset.id);if(l&&available(l))startLevel(l.id);break;}
    case 'party':party();break;
    case 'party-next':party();break;
    case 'settings':settings();break;
    case 'online':online();break;
    case 'tutorial':startLevel('tutorial');break;
    case 'sound':state.settings.sound=!state.settings.sound;state.saveLocal();settings();break;
    case 'haptics':state.settings.haptics=!state.settings.haptics;state.saveLocal();settings();break;
  }
});
app.addEventListener('submit',event=>{if(event.target.id!=='profile-form')return;event.preventDefault();const input=app.querySelector('#profile-name');if(state.setProfile(input.value)){input.blur();startLevel('tutorial');}else toast('En az 2 harften oluşan bir isim yaz.');});
app.addEventListener('beforeinput',event=>{if(transitioning&&event.target.matches('.word-input'))event.preventDefault();});
app.addEventListener('input',event=>{if(event.target.matches('.word-input')&&!event.isComposing&&!transitioning)paintInput();});
app.addEventListener('compositionend',event=>{if(event.target.matches('.word-input'))paintInput();});
app.addEventListener('keydown',event=>{if(event.target.matches('.word-input')&&event.key==='Enter'&&!event.isComposing){event.preventDefault();submit();}else if(event.key==='Escape'&&screen!=='online'&&state.profileName&&(state.tutorialDone||screen!=='game'))home();});
app.addEventListener('focusin',event=>{if(event.target.matches('input')){document.body.classList.add('is-typing');if(event.target.matches('.word-input'))requestAnimationFrame(scrollActive);}});
app.addEventListener('focusout',()=>{setTimeout(()=>{if(!document.activeElement?.matches('input'))document.body.classList.remove('is-typing');},80);});
function viewportChanged(){const vv=window.visualViewport;document.documentElement.style.setProperty('--vvh',`${vv?.height||innerHeight}px`);document.documentElement.style.setProperty('--keyboard-inset',`${Math.max(0,innerHeight-(vv?.height||innerHeight))}px`);if(document.activeElement?.matches('.word-input'))requestAnimationFrame(scrollActive);}
window.visualViewport?.addEventListener('resize',viewportChanged);window.addEventListener('resize',viewportChanged);
window.addEventListener('pagehide',()=>state?.saveLocal());


viewportChanged();
try {
	const embedded=document.querySelector('#game-content');
	let content;
	if(embedded)content=JSON.parse(embedded.textContent);
	else {const response=await fetch('data/levels.json');if(!response.ok)throw new Error(`Content ${response.status}`);content=await response.json();}
	state=new ZincirState(content);
  if(!state.profileName)profile();else if(!state.tutorialDone)startLevel('tutorial');else home();
}catch(error){console.error(error);app.innerHTML=`<main class="boot"><h1>Kelimeler yüklenemedi.</h1><p>Bağlantını kontrol edip yeniden dene.</p><button class="btn" onclick="location.reload()">YENİDEN DENE</button></main>`;}
