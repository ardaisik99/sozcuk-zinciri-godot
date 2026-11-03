const ONLINE_SAVE_KEY = 'sozcuk_zinciri_online_v1';
const onlineEscape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const onlineIcon = name => `<img class="icon" src="assets/icons/${name}.svg" width="24" height="24" alt="" aria-hidden="true">`;
const onlineId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const onlineReasons = {
  invalid_name: 'İsmin 2 ile 18 karakter arasında olsun.', invalid_code: 'Arkadaş kodunu kontrol et.', invalid_friend_code: 'Arkadaş kodunu kontrol et.', user_not_found: 'Bu kodla bir oyuncu bulunamadı.', player_not_found: 'Bu kodla bir oyuncu bulunamadı.', not_found: 'Aradığın kayıt bulunamadı.',
  self_request: 'Bu senin kodun. Bir arkadaşının kodunu yaz.', cannot_add_self: 'Bu senin kodun. Bir arkadaşının kodunu yaz.', already_friends: 'Zaten arkadaşsınız.', request_not_found: 'Bu istek artık geçerli değil.',
  room_not_found: 'Bu oda bulunamadı. Kodu kontrol et veya yeni bir oda aç.', room_closed: 'Bu oda kapanmış. Yeni bir oda açabilirsin.', room_expired: 'Bu oda kapanmış. Yeni bir oda açabilirsin.', room_full: 'Bu odada iki oyuncu var. Başka bir oda açabilirsin.', already_in_room: 'Zaten açık bir odan var. Önce o odadan ayrıl.',
  room_finished: 'Bu karşılaşma sona erdi. Yeni bir oda açabilirsin.', not_host: 'Karşılaşmayı oda sahibi başlatabilir.', not_ready: 'Başlamak için iki oyuncunun da bağlanması gerekiyor.',
  not_enough_players: 'Arkadaşın bağlandığında başlayabilirsiniz.', need_two_players: 'Arkadaşın bağlandığında başlayabilirsiniz.', host_only: 'Karşılaşmayı oda sahibi başlatabilir.', player_disconnected: 'Arkadaşının yeniden bağlanması bekleniyor.', rate_limited: 'Biraz hızlı gidiyoruz. Kısa bir ara verip tekrar dene.', stale_turn: 'Sıra değişti. Güncel kelimeye bakıp tekrar gönder.',
  not_your_turn: 'Sıra rakibinde. Kendi sıranı bekle.', not_playing: 'Tur başlayınca cevap yazabilirsin.',
  message_too_long: 'Mesajın en fazla 160 karakter olabilir.', invalid_message: 'Bir kelime veya mesaj yaz.', invalid_text: 'Bir kelime veya mesaj yaz.', not_friend: 'Odaya davet etmek için önce arkadaş olun.', not_friends: 'Odaya davet etmek için önce arkadaş olun.',
  unauthorized: 'Oyuncu kartına erişilemedi. Yeniden bağlanalım.', invalid_token: 'Oyuncu kartına erişilemedi. Yeniden bağlanalım.', network: 'Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.',
};

export class OnlineScreen {
  constructor({ app, name = '', profileName = '', onHome = () => {}, toast = () => {}, sound = () => {}, baseUrl = '', config = {} } = {}) {
    this.app = app;
    this.name = String(name || profileName).trim();
    this.onHome = onHome; this.notify = toast; this.sound = sound;
    this.baseUrl = String(baseUrl || config.baseUrl || '').trim().replace(/\/+$/u, '');
    this.disposed = false; this.view = ''; this.state = null; this.connection = 'connecting';
    this.social = { friends: [], incoming: [], outgoing: [], invites: [] }; this.socialTab = 'friends';
    this.pending = null; this.busy = new Set(); this.requests = new Set(); this.timers = new Set();
    this.roomSocket = null; this.lobbySocket = null; this.roomGeneration = 0; this.lobbyGeneration = 0;
    this.roomAttempt = 0; this.lobbyAttempt = 0; this.clockOffset = 0; this.lastMessageIds = ''; this.finishedRoom = '';
    this.record = this._readRecord();
    this.token = this.record.token || ''; this.profile = this.record.profile || null; this.roomCode = this.record.roomCode || '';
    this.handleClick = event => this._click(event);
    this.handleSubmit = event => this._submit(event);
    this.handleKey = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); this._back(); } };
    this.handleFocus = event => {
      if (event?.type === 'focusout') this._later(() => this._positionComposer(), 120);
      else this._positionComposer();
    };
    this.handleVisibility = () => {
      if (document.hidden) { this._stopClock(); if (this.view === 'hub') this._closeLobby(); }
      else { this._tick(); this._startClock(); if (this.roomCode && this.view === 'room' && this.state?.phase !== 'finished' && this.connection !== 'replaced' && !this._socketOpen(this.roomSocket)) this._connectRoom(); else if (this.view === 'hub') this._connectLobby(); }
    };
    this.handlePageHide = () => this._persist();
  }

  open() {
    if (!this.app) throw new Error('OnlineScreen requires an app element.');
    this.app.addEventListener('click', this.handleClick);
    this.app.addEventListener('submit', this.handleSubmit);
    this.app.addEventListener('keydown', this.handleKey, true);
    this.app.addEventListener('focusin', this.handleFocus);
    this.app.addEventListener('focusout', this.handleFocus);
    window.addEventListener('resize', this.handleFocus);
    window.visualViewport?.addEventListener('resize', this.handleFocus);
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('pagehide', this.handlePageHide);
    if (!this._validBase()) { this._disabled(); return Promise.resolve(this); }
    this._loading('Oyuncu kartın hazırlanıyor…');
    this._bootstrap().catch(error => { if (!this.disposed) this._failure(error); });
    return Promise.resolve(this);
  }

  destroy() {
    if (this.disposed) return;
    this._persist(); this.disposed = true; this.roomGeneration++; this.lobbyGeneration++;
    this._stopClock(); this._closeSocket(this.roomSocket); this._closeSocket(this.lobbySocket);
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear(); for (const request of this.requests) request.abort(); this.requests.clear();
    this.app.removeEventListener('click', this.handleClick); this.app.removeEventListener('submit', this.handleSubmit);
    this.app.removeEventListener('keydown', this.handleKey, true); this.app.removeEventListener('focusin', this.handleFocus); this.app.removeEventListener('focusout', this.handleFocus);
    window.removeEventListener('resize', this.handleFocus); window.visualViewport?.removeEventListener('resize', this.handleFocus);
    document.removeEventListener('visibilitychange', this.handleVisibility); window.removeEventListener('pagehide', this.handlePageHide);
    this.dialog?.remove(); this.resolveDialog?.(false); this.resolveDialog = null;
  }

  _readRecord() {
    try { const value = JSON.parse(localStorage.getItem(ONLINE_SAVE_KEY)); return value && typeof value === 'object' && (!value.baseUrl || value.baseUrl === this.baseUrl) ? value : {}; } catch { return {}; }
  }

  _persist() {
    if (!this._validBase() || !this.token) return;
    try { localStorage.setItem(ONLINE_SAVE_KEY, JSON.stringify({ token: this.token, profile: this.profile, roomCode: this.state?.phase === 'finished' ? '' : this.roomCode, baseUrl: this.baseUrl })); } catch { /* A blocked storage area does not prevent this session from playing. */ }
  }

  _validBase() {
    try { const url = new URL(this.baseUrl); return !url.username && !url.password && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))); } catch { return false; }
  }

  _later(callback, delay) {
    const timer = setTimeout(() => { this.timers.delete(timer); if (!this.disposed) callback(); }, delay);
    this.timers.add(timer); return timer;
  }

  async _api(path, body) {
    const controller = new AbortController(); this.requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(this.baseUrl + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
      let payload; try { payload = await response.json(); } catch { payload = {}; }
      if (!response.ok || payload.ok === false) throw Object.assign(new Error('Online request failed'), { reason: payload.reason || 'network', status: response.status });
      return payload;
    } catch (error) { if (!error.reason) error.reason = 'network'; throw error; }
    finally { clearTimeout(timeout); this.requests.delete(controller); }
  }

  async _bootstrap() {
    if (this.token) {
      try { const result = await this._api('/v1/me'); this.profile = result.profile; if (!this.roomCode) this.roomCode = result.activeRoom || result.profile?.activeRoom || ''; }
      catch (error) { if (error.status !== 401) throw error; this.token = ''; this.profile = null; this.roomCode = ''; }
    }
    if (!this.token) {
      if (this.name.length < 2) { this._registration(); return; }
      await this._register(this.name);
    }
    if (this.disposed) return;
    this._persist();
    await this._refreshSocial();
    if (this.disposed) return;
    if (this.roomCode) {
      const code = this.roomCode;
      this._mountRoom();
      try { await this._api(`/v1/rooms/${encodeURIComponent(code)}/join`, {}); if (!this.disposed) this._connectRoom(); }
      catch (error) { if (this.disposed) return; this.roomCode = ''; this.state = null; this._persist(); this._mountHub(); this._toast(onlineReasons[error.reason] || 'Bu oda artık açık değil. Yeni bir oda açabilirsin.'); }
    } else this._mountHub();
  }

  async _register(name) {
    const result = await this._api('/v1/register', { name });
    if (this.disposed) return;
    this.token = result.token; this.profile = result.profile; this.name = result.profile.name; this._persist();
  }

  _header(title = 'Kelime Savaşı') {
    return `<header class="oz-header"><button type="button" class="icon-btn" data-online-action="back" data-testid="online-back" aria-label="Ana menüye dön">${onlineIcon('back')}</button><div><h1>${onlineEscape(title)}</h1><span class="oz-subtitle">Arkadaşınla aynı zincirde buluş.</span></div><span class="oz-live"><i></i>ÇEVRİM İÇİ</span></header>`;
  }

  _shell(body, view, title) {
    this.view = view;
    this.app.innerHTML = `<main class="oz-screen" data-screen="online" data-online-view="${view}">${this._header(title)}${body}</main>`;
    window.scrollTo(0, 0);
  }

  _button(text, action, classes = '', attributes = '') {
    return `<button type="button" class="btn ${classes}" data-online-action="${action}" ${attributes}>${text}</button>`;
  }

  _disabled() {
    this._shell(`<section class="oz-service panel"><img src="assets/mascot-editorial.webp" width="170" height="170" alt="Gazetesindeki bulmacayı çözen maskot"><span class="tag">ÇOK YAKINDA</span><h2>Birlikte çözmek daha güzel.</h2><p>Çevrim içi oyun sunucusu henüz etkin değil. Açıldığında burada oda kurup arkadaşlarınla kelime yarışına katılabileceksin.</p>${this._button('ANA MENÜYE DÖN →', 'back', 'full')}</section>`, 'disabled');
  }

  _loading(text) { this._shell(`<section class="oz-service panel" role="status">${onlineIcon('chain')}<h2>Bağlantıyı kuruyoruz.</h2><p>${onlineEscape(text)}</p></section>`, 'loading'); }

  _registration() {
    this._shell(`<section class="panel oz-registration"><span class="tag">KELİME ARKADAŞIN HAZIR MI?</span><h2>Sana ne diyelim?</h2><p>Yalnızca bir isim seç. Oyuncu kartın ve arkadaş kodun bu cihazda saklansın.</p><form data-online-form="register"><label for="oz-name">Oyuncu adın</label><input id="oz-name" class="oz-input" data-testid="online-name" name="name" maxlength="18" minlength="2" autocomplete="nickname" required>${this._button('OYUNCU KARTIMI OLUŞTUR →', 'register', 'full', 'data-testid="online-register"')}</form><p class="oz-note">Tarayıcı verilerini silersen bu oyuncu kartına erişimin kaybolur.</p></section>`, 'register');
  }

  _failure(error) {
    this._shell(`<section class="oz-service panel">${onlineIcon('chain')}<h2>Bağlantı biraz mola verdi.</h2><p>${onlineEscape(onlineReasons[error.reason] || onlineReasons.network)}</p>${this._button('TEKRAR DENE', 'retry', 'full')}${this._button('ANA MENÜYE DÖN', 'back', 'white full')}</section>`, 'error');
  }

  _mountHub() {
    if (this.disposed) return;
    this._stopClock(); this._closeRoom();
    const profile = this.profile;
    this._shell(`<section class="oz-profile panel"><div><span class="tag">OYUNCU KARTIN</span><h2>${onlineEscape(profile.name)}</h2><div class="oz-profile-stats"><span>${Number(profile.wins) || 0} galibiyet</span><span>${Number(profile.played) || 0} maç</span></div></div><div class="oz-code-card"><span>Arkadaş kodun</span><button type="button" data-online-action="copy-friend" class="oz-code" data-testid="online-my-code" aria-label="Arkadaş kodunu kopyala">#${onlineEscape(profile.code)}</button><small>Dokun, kopyala ve paylaş.</small></div></section><div class="oz-hub-grid"><section class="panel oz-room-card"><div class="oz-card-icon">${onlineIcon('flag')}</div><h2>Bir oda aç.</h2><p>Aynı zincir, sırayla gelen kelimeler. Her doğru cevap 100 puan!</p>${this._button('ODA OLUŞTUR →', 'create', 'full', 'data-testid="online-create-room"')}</section><section class="panel oz-room-card"><div class="oz-card-icon">${onlineIcon('chain')}</div><h2>Arkadaşına katıl.</h2><p>Arkadaşının gönderdiği altı karakterli oda kodunu yaz.</p><form class="oz-inline-form" data-online-form="join"><label class="hidden" for="oz-join">Oda kodu</label><input id="oz-join" class="oz-input oz-room-input" data-testid="online-join-code" name="code" maxlength="6" placeholder="ABC123" autocomplete="off" autocapitalize="characters" required><button type="submit" class="btn gold" data-testid="online-join-room">KATIL</button></form></section></div><section class="panel oz-social"><div class="oz-social-heading"><div><h2>Kelime arkadaşların</h2><p>Kodunu ekle, isteği kabul et, aynı odaya geç.</p></div>${this._button(onlineIcon('refresh'), 'refresh-friends', 'white small', 'aria-label="Arkadaş listesini yenile"')}</div><form class="oz-inline-form oz-add-form" data-online-form="friend"><label class="hidden" for="oz-friend">Arkadaş kodu</label><input id="oz-friend" class="oz-input" data-testid="online-friend-code" name="code" inputmode="numeric" maxlength="12" placeholder="#1465" autocomplete="off" required><button type="submit" class="btn mint" data-testid="online-add-friend">ARKADAŞ EKLE</button></form><nav class="oz-tabs" aria-label="Arkadaş listeleri" data-oz="social-tabs"></nav><div data-oz="social-list"></div></section>`, 'hub');
    this._updateSocial(); this._connectLobby();
  }

  _updateSocial() {
    if (this.view !== 'hub' || this.disposed) return;
    const tabs = this.app.querySelector('[data-oz="social-tabs"]');
    tabs.innerHTML = [['friends', 'Arkadaşlar'], ['incoming', 'İstekler'], ['invites', 'Davetler']].map(([key, label]) => this._button(`${label} <span>${this.social[key].length}</span>`, 'social-tab', this.socialTab === key ? 'gold small' : 'white small', `data-tab="${key}" aria-pressed="${this.socialTab === key}"`)).join('');
    const list = this.app.querySelector('[data-oz="social-list"]');
    const rows = this.social[this.socialTab];
    if (!rows.length) {
      const empty = { friends: 'İlk kelime arkadaşını ekle. Gelen istekler kabul edilince burada görünür.', incoming: 'Bekleyen arkadaşlık isteğin yok.', invites: 'Şimdilik bir oda daveti yok. Arkadaşların kodunla seni bulabilir.' };
      list.innerHTML = `<p class="oz-empty">${empty[this.socialTab]}</p>`;
    } else list.innerHTML = rows.map(item => {
      if (this.socialTab === 'invites') return `<article class="oz-person" data-testid="online-invite"><div class="oz-avatar">${onlineEscape(item.from.name[0] || '?')}</div><div class="oz-person-info"><strong>${onlineEscape(item.from.name)}</strong><span>${onlineEscape(item.roomCode)} odasına davet ediyor.</span></div>${this._button('KATIL →', 'accept-invite', 'gold small', `data-code="${onlineEscape(item.roomCode)}"`)}</article>`;
      const actions = this.socialTab === 'incoming' ? `${this._button(onlineIcon('check'), 'accept-friend', 'mint small', `data-user="${onlineEscape(item.id)}" aria-label="${onlineEscape(item.name)} arkadaşlık isteğini kabul et" data-testid="online-accept-friend"`)}${this._button(onlineIcon('close'), 'reject-friend', 'white small', `data-user="${onlineEscape(item.id)}" aria-label="Arkadaşlık isteğini reddet"`)}` : this._button('DAVET ET', 'invite-friend', 'mint small', `data-user="${onlineEscape(item.id)}" data-testid="online-invite-friend"`);
      return `<article class="oz-person"><div class="oz-avatar">${onlineEscape(item.name[0] || '?')}</div><div class="oz-person-info"><strong>${onlineEscape(item.name)}</strong><span>#${onlineEscape(item.code)}</span></div><div class="oz-person-actions">${actions}</div></article>`;
    }).join('');
    if (this.socialTab === 'incoming' && this.social.outgoing.length) list.insertAdjacentHTML('beforeend', `<div class="oz-outgoing"><h3>Gönderdiğin istekler</h3>${this.social.outgoing.map(item => `<p>${onlineEscape(item.name)} <span>#${onlineEscape(item.code)} · Yanıt bekleniyor</span></p>`).join('')}</div>`);
  }

  async _refreshSocial(fresh = false) {
    if (this.socialPromise) { if (fresh) this.socialDirty = true; return this.socialPromise; }
    this.socialPromise = this._api('/v1/friends').then(result => {
      if (this.disposed) return;
      for (const key of ['friends', 'incoming', 'outgoing', 'invites']) this.social[key] = Array.isArray(result[key]) ? result[key] : [];
      this._updateSocial(); this._updateRoomInvites();
    }).finally(() => {
      this.socialPromise = null;
      if (this.socialDirty && !this.disposed) { this.socialDirty = false; this._refreshSocial().catch(() => {}); }
    });
    return this.socialPromise;
  }

  _socketUrl(path) { const url = new URL(this.baseUrl + path); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.searchParams.set('token', this.token); return url.toString(); }
  _socketOpen(socket) { return socket?.readyState === WebSocket.OPEN; }
  _closeSocket(socket) { if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'screen changed'); }

  _connectLobby() {
    if (this.disposed || this.view !== 'hub' || document.hidden || this.lobbySocket?.readyState < WebSocket.CLOSING) return;
    const generation = ++this.lobbyGeneration;
    const socket = this.lobbySocket = new WebSocket(this._socketUrl('/ws/lobby'));
    socket.onmessage = event => {
      if (this.disposed || generation !== this.lobbyGeneration) return;
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'ready') { this.lobbyAttempt = 0; this._refreshSocial(true).catch(() => {}); }
      if (message.type === 'social') this._refreshSocial(true).catch(() => {});
    };
    socket.onclose = event => { if (event.code !== 4001 && !this.disposed && generation === this.lobbyGeneration && this.view === 'hub' && this.lobbyAttempt < 3) this._later(() => this._connectLobby(), Math.min(10000, 1000 * 2 ** this.lobbyAttempt++)); };
    socket.onerror = () => {};
  }

  _closeLobby() { this.lobbyGeneration++; this._closeSocket(this.lobbySocket); this.lobbySocket = null; }
  _closeRoom() { this.roomGeneration++; this._closeSocket(this.roomSocket); this.roomSocket = null; }

  async _enterRoom(code, create = false) {
    const result = create ? await this._api('/v1/rooms', {}) : await this._api(`/v1/rooms/${encodeURIComponent(code)}/join`, {});
    if (this.disposed) return;
    this.roomCode = String(result.roomCode).toUpperCase(); this.state = null; this.pending = null; this.finishedRoom = ''; this._persist();
    this._mountRoom(); this._connectRoom();
  }

  _mountRoom() {
    this._closeLobby(); this.connection = 'connecting'; this.lastMessageIds = '';
    this._shell(`<div class="oz-room-heading"><div><span class="oz-subtitle">ODA KODUN</span><button type="button" class="oz-room-code" data-online-action="copy-room" data-testid="online-room-code" aria-label="Oda kodunu kopyala">${onlineEscape(this.roomCode)}</button></div><span class="oz-connection" data-oz="connection" role="status">Bağlanıyor…</span></div><p class="oz-replaced" data-oz="replaced" hidden>Bu oda başka bir sekmede açık. ${this._button('BU SEKMEDE DEVAM ET', 'resume-room', 'white small')}</p><div class="oz-room-grid"><section class="oz-play"><section class="panel oz-lobby" data-oz="lobby"><span class="tag">ARKADAŞINLA BULUŞ</span><h2>Oda hazır. Sıra sizde!</h2><p>Bu kodu arkadaşına gönder. İkiniz de bağlandığınızda oda sahibi başlatabilir.</p><div class="oz-lobby-players" data-oz="lobby-players"></div><div data-oz="start-area"></div><details class="oz-invite-details"><summary>Bir arkadaşını davet et</summary><div data-oz="room-invites"></div></details></section><section class="oz-match" data-oz="match" hidden><div class="oz-scoreboard" data-oz="scoreboard"></div><div class="oz-countdown panel" data-oz="countdown" hidden><span>HAZIR MISINIZ?</span><strong data-oz="countdown-number" role="status">3</strong><p>Aynı zincir. Sırayla kelimeler.</p></div></section><section class="panel oz-result" data-oz="result" hidden></section></section><section class="panel oz-chat" aria-label="Oda sohbeti"><div class="oz-chat-heading"><h2>Sohbet & kelimeler</h2><span>Sıra sende olunca yaz</span></div><div class="oz-arena"><section class="oz-board" data-oz="board" hidden><div class="oz-current-word" data-oz="active-word" data-testid="online-active-word"></div><p class="oz-last-correct" data-oz="last-correct" role="status" hidden></p><p class="oz-round-info" data-oz="round-info"></p></section><ol class="oz-chat-history" data-oz="messages" data-testid="online-messages" role="log" aria-live="polite" aria-relevant="additions"></ol><div class="oz-turn-footer" data-oz="turn-footer" hidden><div class="oz-turn-row"><span class="oz-turn-avatar" data-oz="turn-avatar"></span><span class="oz-turn" data-oz="turn"></span><span class="oz-timer" data-oz="timer" aria-label="Kalan süre">30</span></div><div class="oz-timer-track"><i data-oz="timer-fill"></i></div></div></div><form class="oz-composer" data-online-form="chat"><label class="hidden" for="oz-chat">Cevabını yaz</label><input id="oz-chat" class="oz-input" data-testid="online-chat-input" name="message" maxlength="160" placeholder="Tur başlayınca yazabilirsin" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send" disabled><button type="submit" class="btn gold oz-send" data-testid="online-send" disabled>CEVAPLA</button></form></section></div><div class="oz-room-footer">${this._button('ODADAN AYRIL', 'leave', 'white small', 'data-testid="online-leave"')}<span>Her sıra: 30 saniye · 2 tur kazanan maçı alır</span></div>`, 'room', 'Kelime Savaşı');
    this._updateRoomInvites(); this._positionComposer();
  }

  _connectRoom() {
    if (this.disposed || this.view !== 'room' || !this.roomCode || this.roomSocket?.readyState < WebSocket.CLOSING) return;
    const generation = ++this.roomGeneration;
    this.connection = this.roomAttempt ? 'reconnecting' : 'connecting'; this._updateConnection();
    const socket = this.roomSocket = new WebSocket(this._socketUrl(`/ws/rooms/${encodeURIComponent(this.roomCode)}`));
    let firstSnapshot = true;
    socket.onopen = () => { if (generation !== this.roomGeneration || this.disposed) return; this.connection = 'syncing'; this._updateConnection(); };
    socket.onmessage = event => {
      if (generation !== this.roomGeneration || this.disposed) return;
      if (event.data === 'pong') return;
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'state' && message.state?.roomCode === this.roomCode && Array.isArray(message.state.players)) {
        this.roomAttempt = 0; this.connection = 'connected'; this.state = message.state;
        if (firstSnapshot && this.pending && !message.state.messages?.some(item => item.playerId === this.profile.id && item.clientMessageId === this.pending.id)) this.pending = null;
        firstSnapshot = false;
        if (Number.isFinite(message.state.serverNow)) this.clockOffset = message.state.serverNow - Date.now();
        this._updateRoom(); this._persist();
      } else if (message.type === 'error') {
        this.pending = null; this._updateConnection(); this._toast(onlineReasons[message.reason] || 'Mesaj iletilemedi. Tekrar dene.');
        if (message.reason === 'stale_turn') { this._closeRoom(); this._connectRoom(); }
      }
    };
    socket.onclose = event => {
      if (generation !== this.roomGeneration || this.disposed || this.view !== 'room') return;
      if (event.code === 4001) { this.connection = 'replaced'; this._updateConnection(); return; }
      if (this.state?.phase === 'finished') { this.connection = 'finished'; this._updateConnection(); return; }
      this.connection = 'reconnecting'; this._updateConnection();
      this._later(() => this._connectRoom(), Math.min(10000, 1000 * 2 ** this.roomAttempt++));
    };
    socket.onerror = () => {};
  }

  _canAnswer() {
    return this.state?.phase === 'playing' && this.state.activePlayerId === this.profile?.id && Number(this.state.deadlineAt || 0) > Date.now() + this.clockOffset;
  }

  _updateConnection() {
    if (this.view !== 'room') return;
    const status = this.app.querySelector('[data-oz="connection"]');
    status.textContent = ({ connected: 'Bağlı', connecting: 'Bağlanıyor…', syncing: 'Durum güncelleniyor…', reconnecting: 'Yeniden bağlanıyor…', replaced: 'Başka sekmede açık', finished: 'Karşılaşma bitti' })[this.connection];
    status.dataset.status = this.connection;
    const replaced = this.app.querySelector('[data-oz="replaced"]'); if (replaced) replaced.hidden = this.connection !== 'replaced';
    const input = this.app.querySelector('[data-testid="online-chat-input"]');
    const canAnswer = this.connection === 'connected' && this._canAnswer();
    if (input) {
      input.disabled = !canAnswer;
      input.placeholder = this.state?.phase === 'playing' ? canAnswer ? 'Cevabını yaz…' : 'Sıra rakibinde…' : this.state?.phase === 'round_end' ? 'Sonraki tur için devam et' : 'Tur başlayınca yazabilirsin';
    }
    const send = this.app.querySelector('[data-testid="online-send"]'); if (send) send.disabled = !canAnswer || Boolean(this.pending);
    const start = this.app.querySelector('[data-testid="online-start"]'); if (start && this.connection !== 'connected') start.disabled = true;
  }

  _updateRoom() {
    if (!this.state || this.view !== 'room' || this.disposed) return;
    const state = this.state, players = state.players, battle = state.phase !== 'waiting';
    const main = this.app.querySelector('.oz-screen');
    main.classList.toggle('oz-battle', battle); main.dataset.battlePhase = state.phase;
    this._updateConnection();
    this.app.querySelector('[data-oz="lobby"]').hidden = state.phase !== 'waiting';
    this.app.querySelector('[data-oz="match"]').hidden = !battle;
    this.app.querySelector('[data-oz="result"]').hidden = !['round_end', 'finished'].includes(state.phase);
    this.app.querySelector('[data-oz="countdown"]').hidden = state.phase !== 'countdown';
    this.app.querySelector('[data-oz="board"]').hidden = state.phase !== 'playing';
    this.app.querySelector('[data-oz="turn-footer"]').hidden = state.phase !== 'playing';
    this.app.querySelector('.oz-chat').hidden = ['round_end', 'finished', 'countdown'].includes(state.phase);
    if (state.phase === 'waiting') {
      this.app.querySelector('[data-oz="lobby-players"]').innerHTML = [0, 1].map(index => {
        const player = players[index];
        return player ? `<div class="oz-player-slot"><span class="oz-avatar">${onlineEscape(player.name[0] || '?')}</span><strong>${onlineEscape(player.name)}</strong><small>${player.id === this.profile.id ? 'Sen · ' : ''}${player.connected ? 'Hazır' : 'Bağlanıyor…'}</small></div>` : `<div class="oz-player-slot empty">${onlineIcon('profile')}<strong>Arkadaşın bekleniyor</strong><small>Oda koduyla katılabilir.</small></div>`;
      }).join('');
      const host = players[0]?.id === this.profile.id, ready = players.length === 2 && players.every(player => player.connected);
      this.app.querySelector('[data-oz="start-area"]').innerHTML = host ? this._button('HAZIRIZ, BAŞLAYALIM! →', 'start', 'full', `data-testid="online-start" ${!ready || this.connection !== 'connected' ? 'disabled' : ''}`) : '<p class="oz-waiting">Oda sahibi başlattığında birlikte başlayacaksınız.</p>';
    }
    const side = (player, index) => player ? `<div class="oz-battle-player ${player.id === state.activePlayerId ? 'active' : ''}"><span class="oz-battle-avatar side-${index}">${onlineEscape(player.name[0] || '?')}</span><strong>${onlineEscape(player.name)}</strong><small>#${onlineEscape(player.code)}${!player.connected ? ' · Bağlanıyor…' : ''}</small><span class="oz-round-points">${Number(player.score) || 0} puan</span></div>` : '';
    this.app.querySelector('[data-oz="scoreboard"]').innerHTML = `${side(players[0],0)}<div class="oz-series"><span>${Math.min(3,Number(state.roundNumber)||1)}. TUR / 3</span><strong data-testid="online-series-score">${Number(players[0]?.roundWins)||0}<i>–</i>${Number(players[1]?.roundWins)||0}</strong><small>2 tur kazanan alır</small></div>${side(players[1],1)}`;
    if (state.phase === 'playing') this._updateBoard();
    if (['round_end', 'finished'].includes(state.phase)) this._updateResult();
    this._updateMessages(); this._updateRoomInvites(); this._tick(); this._startClock(); this._positionComposer();
    if (this.pending && state.messages?.some(message => message.playerId === this.profile.id && message.clientMessageId === this.pending.id)) {
      const input = this.app.querySelector('[data-testid="online-chat-input"]');
      if (input.value === this.pending.text) input.value = '';
      this.pending = null; this._updateConnection();
    }
  }

  _updateBoard() {
    const state = this.state, chain = Array.isArray(state.chain) ? state.chain : [], index = Number(state.activeIndex) || 0;
    const active = chain[index], previous = chain[index - 1], player = state.players.find(item => item.id === state.activePlayerId);
    const mine = state.activePlayerId === this.profile.id;
    this.app.querySelector('[data-oz="turn"]').textContent = mine ? `${this.profile.name} · Sıra sende` : `${player?.name || 'Rakibin'} · Sıra rakibinde`;
    this.app.querySelector('[data-oz="turn"]').classList.toggle('mine', mine);
    this.app.querySelector('[data-oz="turn-avatar"]').textContent = player?.name?.[0] || '?';
    const length = Math.min(32, Math.max(1, Number(active?.length) || 1));
    this.app.querySelector('[data-oz="active-word"]').innerHTML = `<div class="oz-question"><span>${onlineEscape(previous?.stem || chain[0]?.stem || '')}</span><span class="oz-question-arrow" aria-hidden="true">→</span><span class="oz-question-mask">${onlineEscape(active?.first || '')}${'_'.repeat(Math.max(0,length-1))}</span></div>`;
    const caption = this.app.querySelector('[data-oz="last-correct"]'), correct = state.lastCorrect;
    caption.hidden = !correct || Date.now() + this.clockOffset - correct.at > 2800;
    if (correct) caption.textContent = `${correct.answer} → ${correct.stem}`;
    this.app.querySelector('[data-oz="round-info"]').textContent = `${index + 1} / ${chain.length} kelime`;
  }

  _updateMessages() {
    const messages = Array.isArray(this.state.messages) ? this.state.messages : [];
    const signature = `${this.state.phase}:` + messages.map(message => message.id).join('|');
    if (signature === this.lastMessageIds) return;
    this.lastMessageIds = signature;
    const list = this.app.querySelector('[data-oz="messages"]'), atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 50;
    list.innerHTML = messages.length ? messages.map(message => {
      const kind = ['wrong', 'correct', 'system'].includes(message.kind) ? message.kind : 'chat', mine = message.playerId === this.profile.id;
      const label = kind === 'wrong' ? 'Yanlış deneme' : kind === 'correct' ? 'Doğru cevap' : kind === 'system' ? 'Oda bilgisi' : 'Mesaj';
      if (kind === 'system') return `<li class="oz-message system" data-kind="system" data-testid="online-message"><div class="oz-message-text">${onlineEscape(message.text)}</div></li>`;
      const mark = kind === 'correct' ? '✓' : kind === 'wrong' ? '×' : '';
      return `<li class="oz-message ${kind} ${mine ? 'mine' : ''}" data-kind="${kind}" data-testid="online-message" aria-label="${label}"><span class="oz-message-avatar" aria-hidden="true">${onlineEscape(message.name?.[0] || '?')}</span><div class="oz-message-body"><span class="oz-message-name">${onlineEscape(message.name)}${mine ? ' · Sen' : ''}</span><div class="oz-message-text"><span class="oz-answer">${onlineEscape(message.text)}</span>${mark ? `<span class="oz-message-mark" aria-hidden="true">${mark}</span>` : ''}</div></div></li>`;
    }).join('') : '<li class="oz-chat-empty">Sıra sende olduğunda cevabını aşağıya yaz.</li>';
    if (atBottom || messages.at(-1)?.playerId === this.profile.id) list.scrollTop = list.scrollHeight;
  }

  _updateResult() {
    const state = this.state, between = state.phase === 'round_end', result = state.roundResult || {}, winnerId = between ? result.winnerId : state.winnerId;
    const winner = state.players.find(player => player.id === winnerId), ownReady = (state.continueReady || []).includes(this.profile.id);
    const title = between ? !winnerId ? 'Tur berabere!' : winnerId === this.profile.id ? 'Bu tur senin!' : `${winner?.name || 'Rakibin'} turu aldı!` : state.endReason === 'room_closed' ? 'Bu oda kapandı.' : !winnerId ? 'Karşılaşma tamamlandı.' : winnerId === this.profile.id ? 'Maçı kazandın!' : `${winner?.name || 'Rakibin'} kazandı!`;
    const reason = between ? !winnerId ? 'Bu tur yeniden oynanacak. İlk 2 turu kazanan maçı alır.' : (result.tieBreak === 'speed' ? 'Puanlar eşitti; daha hızlı doğru cevaplar turu belirledi.' : 'Bir zincir tamamlandı. Sıradaki tura geçelim.') : state.endReason === 'forfeit' ? 'Rakip ayrıldığı için karşılaşma sona erdi.' : 'İki turu kazanan oyuncu maçı aldı.';
    this.app.querySelector('[data-oz="result"]').innerHTML = `<span class="tag">${between ? `${state.roundNumber || 1}. TUR TAMAMLANDI` : 'MAÇ TAMAMLANDI'}</span><h2>${onlineEscape(title)}</h2><p>${onlineEscape(reason)}</p><div class="oz-result-scores">${state.players.map(player => `<div><span>${onlineEscape(player.name)}</span><strong>${Number(player.roundWins) || 0}</strong><small>tur</small></div>`).join('')}</div>${between ? this._button(ownReady ? 'RAKİBİN BEKLENİYOR…' : 'DEVAM ET →', 'continue', 'full', `data-testid="online-continue" ${ownReady || this.connection !== 'connected' ? 'disabled' : ''}`) : this._button('ARKADAŞLARA DÖN', 'leave', 'white full')}`;
    const input = this.app.querySelector('[data-testid="online-chat-input"]'); if (document.activeElement === input) input.blur();
    if (!between && this.finishedRoom !== this.roomCode) {
      this.finishedRoom = this.roomCode; this._persist();
      this._api('/v1/me').then(response => { if (!this.disposed) { this.profile = response.profile; this._persist(); } }).catch(() => {});
    }
  }

  _updateRoomInvites() {
    if (this.view !== 'room') return;
    const target = this.app.querySelector('[data-oz="room-invites"]'); if (!target) return;
    const full = this.state?.players.length >= 2;
    target.innerHTML = this.social.friends.length ? this.social.friends.map(friend => `<div class="oz-person"><span class="oz-person-info"><strong>${onlineEscape(friend.name)}</strong><small>#${onlineEscape(friend.code)}</small></span>${this._button('DAVET ET', 'invite-friend', 'mint small', `data-user="${onlineEscape(friend.id)}" ${full ? 'disabled' : ''}`)}</div>`).join('') : '<p class="oz-note">Henüz bir arkadaşın yok. Oda kodunu paylaşarak da birlikte oynayabilirsiniz.</p>';
  }

  _startClock() {
    if (this.clockTimer || this.disposed || document.hidden || !['countdown', 'playing'].includes(this.state?.phase)) return;
    this.clockTimer = setInterval(() => this._tick(), 100);
  }
  _stopClock() { if (this.clockTimer) clearInterval(this.clockTimer); this.clockTimer = null; }
  _tick() {
    if (this.disposed || this.view !== 'room' || !this.state) return;
    const remaining = Math.max(0, Number(this.state.deadlineAt || 0) - (Date.now() + this.clockOffset));
    const seconds = Math.ceil(remaining / 1000);
    const countdown = this.app.querySelector('[data-oz="countdown-number"]'); if (countdown && countdown.textContent !== String(seconds)) countdown.textContent = String(seconds);
    const timer = this.app.querySelector('[data-oz="timer"]'); if (timer) { timer.textContent = String(seconds); timer.classList.toggle('urgent', seconds <= 5); }
    const fill = this.app.querySelector('[data-oz="timer-fill"]'); if (fill) fill.style.transform = `scaleX(${Math.min(1, remaining / 30000)})`;
    const caption = this.app.querySelector('[data-oz="last-correct"]'); if (caption && this.state.lastCorrect && Date.now() + this.clockOffset - this.state.lastCorrect.at > 3500) caption.hidden = true;
    this._updateConnection();
    if (!['countdown', 'playing'].includes(this.state.phase)) this._stopClock();
  }

  _sendChat() {
    const input = this.app.querySelector('[data-testid="online-chat-input"]');
    const text = input?.value.trim(); if (!text || this.pending) return;
    if (!this._socketOpen(this.roomSocket) || this.connection !== 'connected' || !this.state) { this._toast('Bağlantı yenilenince mesajını gönderebilirsin.'); return; }
    if (!this._canAnswer()) { this._toast(onlineReasons.not_your_turn); return; }
    this.pending = { id: onlineId(), text, turnId: this.state.turnId };
    input.value = text;
    this.roomSocket.send(JSON.stringify({ type: 'chat', text, messageId: this.pending.id, turnId: this.pending.turnId }));
    this._updateConnection();
  }

  _positionComposer() {
    if (this.disposed || this.view !== 'room') return;
    const main = this.app.querySelector('.oz-screen'), visibleHeight = window.visualViewport?.height || innerHeight;
    main.style.setProperty('--oz-vh', `${visibleHeight}px`);
    const compact = this.state?.phase === 'playing' && visibleHeight < 500 && matchMedia('(max-width:759px)').matches;
    main.classList.toggle('oz-typing', compact);
    if (this.state?.phase !== 'waiting' && window.scrollY) window.scrollTo(0, 0);
  }

  async _askLeave() {
    if (this.resolveDialog) return false;
    return new Promise(resolve => {
      const dialog = this.dialog = document.createElement('dialog'); dialog.className = 'oz-leave-dialog';
      dialog.innerHTML = `<h2>Maçtan ayrılmak istiyor musun?</h2><p>Ayrılırsan karşılaşma rakibine yazılır. İstersen bu zinciri birlikte tamamlayın.</p>${this._button('OYUNDA KAL', 'cancel-leave', 'mint full', 'data-testid="online-stay"')}${this._button('AYRIL', 'confirm-leave', 'white full', 'data-testid="online-confirm-leave"')}`;
      this.app.append(dialog); this.resolveDialog = value => { this.resolveDialog = null; dialog.remove(); this.dialog = null; resolve(value); };
      dialog.addEventListener('cancel', event => { event.preventDefault(); this.resolveDialog?.(false); });
      dialog.showModal();
    });
  }

  async _leave(home = false) {
    if (['countdown', 'playing', 'round_end'].includes(this.state?.phase) && !await this._askLeave()) return;
    if (this._socketOpen(this.roomSocket)) this.roomSocket.send(JSON.stringify({ type: 'leave' }));
    this._closeRoom(); this._stopClock(); this.roomCode = ''; this.state = null; this.pending = null; this._persist();
    if (home) { this.destroy(); this.onHome(); }
    else { this._mountHub(); this._refreshSocial().catch(() => {}); }
  }

  _back() {
    if (this.resolveDialog) { this.resolveDialog(false); return; }
    if (this.roomCode && this.view === 'room') this._leave(true);
    else { this.destroy(); this.onHome(); }
  }

  _toast(text, good = false) { if (!this.disposed) this.notify(text, good); }

  async _busyAction(name, callback) {
    if (this.busy.has(name)) return;
    this.busy.add(name);
    try { await callback(); }
    catch (error) { if (!this.disposed) this._toast(onlineReasons[error.reason] || 'Bu işlem tamamlanamadı. Tekrar dene.'); }
    finally { this.busy.delete(name); }
  }

  _submit(event) {
    const form = event.target.closest('[data-online-form]'); if (!form) return;
    event.preventDefault(); event.stopPropagation();
    if (form.dataset.onlineForm === 'chat') { this._sendChat(); return; }
    const data = new FormData(form);
    if (form.dataset.onlineForm === 'register') this._doRegister(String(data.get('name') || ''));
    if (form.dataset.onlineForm === 'join') this._busyAction('join', () => this._enterRoom(String(data.get('code') || '').trim().toUpperCase()));
    if (form.dataset.onlineForm === 'friend') this._busyAction('friend', async () => { await this._api('/v1/friends/request', { code: String(data.get('code') || '').trim() }); if (this.disposed) return; form.querySelector('input').value = ''; this._toast('Arkadaşlık isteğin gönderildi.', true); await this._refreshSocial(true); });
  }

  _doRegister(name) { this._busyAction('register', async () => { await this._register(name.trim()); if (!this.disposed) { await this._refreshSocial(); this._mountHub(); } }); }

  _click(event) {
    const button = event.target.closest('[data-online-action]'); if (!button || button.disabled || this.disposed) return;
    const action = button.dataset.onlineAction;
    if (action === 'cancel-leave') { this.resolveDialog?.(false); return; }
    if (action === 'confirm-leave') { this.resolveDialog?.(true); return; }
    if (action === 'back') { this._back(); return; }
    if (action === 'leave') { this._leave(); return; }
    if (action === 'register') { const input = this.app.querySelector('[data-testid="online-name"]'); if (input.reportValidity()) this._doRegister(input.value); return; }
    if (action === 'retry') { this._loading('Yeniden bağlanılıyor…'); this._bootstrap().catch(error => { if (!this.disposed) this._failure(error); }); return; }
    if (action === 'social-tab') { this.socialTab = button.dataset.tab; this._updateSocial(); return; }
    if (action === 'copy-friend' || action === 'copy-room') {
      const value = action === 'copy-room' ? this.roomCode : `#${this.profile.code}`;
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(value).then(() => this._toast('Kod kopyalandı.', true)).catch(() => this._toast(`Kodun: ${value}`));
      else this._toast(`Kodun: ${value}`);
      return;
    }
    if (action === 'continue') { if (this.state?.phase === 'round_end' && !(this.state.continueReady || []).includes(this.profile.id) && this._socketOpen(this.roomSocket)) { button.disabled = true; this.roomSocket.send(JSON.stringify({ type: 'continue' })); } return; }
    if (action === 'start') { if (this._socketOpen(this.roomSocket)) this.roomSocket.send(JSON.stringify({ type: 'start' })); return; }
    if (action === 'resume-room') { this._closeRoom(); this._connectRoom(); return; }
    if (action === 'create') this._busyAction('create', () => this._enterRoom('', true));
    if (action === 'new-room') this._busyAction('create', async () => { await this._leave(); if (!this.disposed) await this._enterRoom('', true); });
    if (action === 'accept-invite') this._busyAction('join', () => this._enterRoom(button.dataset.code));
    if (action === 'refresh-friends') this._busyAction('social', () => this._refreshSocial(true));
    if (action === 'accept-friend' || action === 'reject-friend') this._busyAction('respond', async () => { await this._api('/v1/friends/respond', { userId: button.dataset.user, accept: action === 'accept-friend' }); await this._refreshSocial(true); });
    if (action === 'invite-friend') this._busyAction('invite', async () => {
      const userId = button.dataset.user;
      if (!this.roomCode) await this._enterRoom('', true);
      if (this.disposed) return;
      await this._api(`/v1/rooms/${encodeURIComponent(this.roomCode)}/invite`, { userId }); this._toast('Oda daveti arkadaşına gönderildi.', true);
    });
  }
}
