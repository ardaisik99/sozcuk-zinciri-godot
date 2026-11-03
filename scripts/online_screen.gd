class_name ZincirOnlineScreen
extends VBoxContainer

signal return_home

const U = preload("res://scripts/ui.gd")
const OnlineClient = preload("res://scripts/online_client.gd")
const WordRow = preload("res://scripts/word_row.gd")
var client
var _client_override
var _player_name = ""
var _config_path = "res://config/online.json"
var _mode = ""
var _body: VBoxContainer
var _connection_label: Label
var _error_label: Label
var _name_input: LineEdit
var _code_label: Label
var _stats_label: Label
var _friend_input: LineEdit
var _join_input: LineEdit
var _social_list: VBoxContainer
var _social_signature = ""
var _phase_label: Label
var _clock_label: Label
var _turn_label: Label
var _scoreboard: HBoxContainer
var _score_signature = ""
var _chain_list: VBoxContainer
var _chain_signature = ""
var _last_correct_marker = ""
var _start_button: Button
var _room_invites: VBoxContainer
var _invite_signature = ""
var _messages_list: VBoxContainer
var _message_nodes: Dictionary = {}
var _chat_input: LineEdit
var _composer_clue: Label
var _send_button: Button
var _pending_message_id = ""
var _pending_text = ""
var _clock_tick = 0.0
var _busy = false
var _leave_prompt: PanelContainer
var _awaiting_first_snapshot = true
var _booting = false
var _retry_button: Button

class WrongGuessLabel extends Label:
	func _draw() -> void:
		var font = get_theme_font("font")
		var width = minf(size.x, font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, get_theme_font_size("font_size")).x)
		draw_line(Vector2(0, size.y * 0.53), Vector2(width, size.y * 0.53), Color("bc5542"), 2.0, true)

func setup(player_name: String, config_path: String = "res://config/online.json", supplied_client = null) -> void:
	_player_name = player_name
	_config_path = config_path
	_client_override = supplied_client

func _ready() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation", 18)
	var top = U.row(10)
	top.add_child(U.icon_button("back", request_home))
	var title = U.paragraph("Kelime Savaşı", 25, U.INK)
	title.add_theme_font_override("font", U.heading_font())
	top.add_child(title)
	add_child(top)
	_connection_label = U.paragraph("Bağlanıyor…", 14, U.MUTED)
	add_child(_connection_label)
	_error_label = U.paragraph("", 16, Color("bc5542"))
	_error_label.hide()
	add_child(_error_label)
	_body = U.column(18)
	add_child(_body)
	client = _client_override if _client_override != null else OnlineClient.new()
	add_child(client)
	client.changed.connect(_on_changed)
	client.error_occurred.connect(_on_error)
	client.connection_changed.connect(_on_connection)
	_boot.call_deferred()

func _boot() -> void:
	if _booting: return
	_booting = true
	await client.start(_player_name, _config_path)
	_booting = false
	if is_inside_tree(): _on_changed()

func _on_connection(value: String) -> void:
	if value in ["connecting", "reconnecting"]: _awaiting_first_snapshot = true
	var texts = {"connecting": "Bağlanıyor…", "connected": "Çevrimiçi", "reconnecting": "Bağlantı yenileniyor… 30 saniye içinde dönebilirsin.", "disconnected": "Bağlantı kesildi. Yeniden bağlanabilirsin.", "replaced": "Bu hesap başka bir pencerede açıldı.", "idle": ""}
	_connection_label.text = str(texts.get(value, "Bağlanıyor…"))
	if _mode == "room": _update_room()

func _on_changed() -> void:
	if not client.configured:
		if _mode != "activation":
			_clear_body("activation")
			var card = _card(U.MINT)
			card.add_child(_mascot(116))
			card.add_child(_heading("Birlikte oynamaya az kaldı.", 30))
			card.add_child(U.paragraph("Çevrimiçi oyun henüz açılmadı. Şimdilik tek kişilik zincirleri çözebilir veya aynı ekranda parti modunu oynayabilirsin.", 18, U.INK))
			card.add_child(U.button("ANA MENÜYE", U.ORANGE, _back))
		_connection_label.text = ""
		_error_label.hide()
		return
	if client.profile.is_empty():
		if _mode != "loading":
			_clear_body("loading")
			_body.add_child(U.paragraph("Oyuncu kartın hazırlanıyor…", 18, U.INK))
			_retry_button = U.button("YENİDEN DENE", U.YELLOW, _boot, 48)
			_body.add_child(_retry_button)
		_retry_button.disabled = _booting
		return
	if client.room_code.is_empty():
		if _mode != "lobby": _build_lobby()
		_update_lobby()
	else:
		if _mode != "room": _build_room()
		_update_room()

func _clear_body(mode: String) -> void:
	_mode = mode
	for child in _body.get_children():
		_body.remove_child(child)
		child.queue_free()
	_social_signature = ""
	_chain_signature = ""
	_invite_signature = ""
	_score_signature = ""
	_last_correct_marker = ""
	_message_nodes.clear()
	_pending_message_id = ""
	_pending_text = ""
	_chat_input = null
	_leave_prompt = null

func _heading(text: String, font_size: int = 24) -> Label:
	var label = U.paragraph(text, font_size, U.INK)
	label.add_theme_font_override("font", U.heading_font())
	return label

func _mascot(height: int) -> TextureRect:
	var image = TextureRect.new()
	image.texture = load("res://assets/mascot-editorial.png")
	image.custom_minimum_size = Vector2(height, height)
	image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	image.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return image

func _card(color: Color = U.PAPER) -> VBoxContainer:
	var panel = U.panel(color, 20)
	_body.add_child(panel)
	var column = U.column(12)
	panel.add_child(column)
	return column

func _make_input(placeholder: String, max_length: int = 18) -> LineEdit:
	var edit = LineEdit.new()
	edit.placeholder_text = placeholder
	edit.max_length = max_length
	edit.custom_minimum_size.y = 52
	edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	edit.add_theme_font_override("font", U.body_font())
	edit.add_theme_font_size_override("font_size", 20)
	edit.add_theme_color_override("font_color", U.INK)
	edit.add_theme_stylebox_override("normal", U.box(U.PAPER, 12, U.LINE, 2))
	edit.add_theme_stylebox_override("focus", U.box(U.PAPER, 12, U.TEAL, 2))
	edit.focus_entered.connect(func(): _ensure_input_visible.call_deferred(edit))
	return edit

func _build_lobby() -> void:
	_clear_body("lobby")
	var profile_card = _card(U.MINT)
	profile_card.add_child(_heading("Oyuncu kartın"))
	var code_row = U.row(10)
	_code_label = U.label("", 28, U.INK, true)
	_code_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	code_row.add_child(_code_label)
	var copy = U.button("KOPYALA", U.PAPER, func(): DisplayServer.clipboard_set("#" + str(client.profile.get("code", ""))), 42)
	copy.add_theme_font_size_override("font_size", 16)
	code_row.add_child(copy)
	profile_card.add_child(code_row)
	_name_input = _make_input("Oyuncu adın")
	_name_input.name = "OnlineProfileName"
	profile_card.add_child(_name_input)
	profile_card.add_child(U.button("ADI GÜNCELLE", U.PAPER, _rename, 48))
	_stats_label = U.paragraph("", 15, U.INK)
	profile_card.add_child(_stats_label)
	profile_card.add_child(U.paragraph("Bu profil bu cihazda saklanır. Cihaz verilerini silersen hesaba erişimin kaybolur. Arkadaş kodun bir giriş şifresi değildir.", 13))
	var friend_card = _card()
	friend_card.add_child(_heading("Arkadaşını bul"))
	_friend_input = _make_input("Arkadaş kodu: #1465", 16)
	_friend_input.name = "FriendCodeInput"
	_friend_input.text_submitted.connect(func(_text): _request_friend())
	friend_card.add_child(_friend_input)
	friend_card.add_child(U.button("İSTEK GÖNDER", U.YELLOW, _request_friend, 50))
	_social_list = U.column(12)
	friend_card.add_child(_social_list)
	var room_card = _card(Color("fff0c9"))
	room_card.add_child(_heading("Kelime yarışına katıl"))
	room_card.add_child(U.paragraph("Bir oda açıp kodunu paylaş veya arkadaşının altı karakterli oda kodunu gir.", 16, U.INK))
	room_card.add_child(U.button("ODA OLUŞTUR", U.ORANGE, _create_room))
	_join_input = _make_input("Oda kodu", 6)
	_join_input.name = "RoomCodeInput"
	_join_input.text_submitted.connect(func(_text): _join_room())
	room_card.add_child(_join_input)
	room_card.add_child(U.button("ODAYA KATIL", U.PAPER, _join_room, 50))
	_body.add_child(U.button("BAĞLANTIYI YENİLE", U.CREAM, func(): client.reconnect(), 44))

func _update_lobby() -> void:
	_code_label.text = "#" + str(client.profile.get("code", ""))
	if not _name_input.has_focus(): _name_input.text = str(client.profile.get("name", ""))
	_stats_label.text = "%d galibiyet · %d oyun" % [int(client.profile.get("wins", 0)), int(client.profile.get("played", 0))]
	var signature = JSON.stringify([client.friends, client.incoming, client.outgoing, client.invites])
	if signature == _social_signature: return
	_social_signature = signature
	for child in _social_list.get_children():
		_social_list.remove_child(child)
		child.queue_free()
	for invite: Dictionary in client.invites:
		var from: Dictionary = invite.get("from", {})
		var label = U.paragraph("%s seni odaya çağırıyor." % from.get("name", "Arkadaşın"), 16, U.INK)
		_social_list.add_child(label)
		_social_list.add_child(U.button("KATIL · " + str(invite.get("roomCode", "")), U.YELLOW, func(): _join_code(str(invite.get("roomCode", ""))), 44))
	for person: Dictionary in client.incoming:
		_social_list.add_child(U.paragraph("%s · #%s" % [person.get("name", ""), person.get("code", "")], 17, U.INK))
		var actions = U.row(8)
		actions.add_child(U.button("KABUL ET", U.MINT, func(): _respond(str(person.get("id", "")), true), 43))
		actions.add_child(U.button("GEÇ", U.CREAM, func(): _respond(str(person.get("id", "")), false), 43))
		for button in actions.get_children(): button.add_theme_font_size_override("font_size", 16)
		_social_list.add_child(actions)
	for person: Dictionary in client.outgoing:
		_social_list.add_child(U.paragraph("%s · İstek bekliyor" % person.get("name", ""), 15))
	for person: Dictionary in client.friends:
		_social_list.add_child(U.paragraph("%s · #%s" % [person.get("name", ""), person.get("code", "")], 17, U.INK))
		_social_list.add_child(U.button("BİRLİKTE OYNA", U.PAPER, func(): _create_and_invite(str(person.get("id", ""))), 44))
	if client.friends.is_empty() and client.incoming.is_empty() and client.outgoing.is_empty():
		_social_list.add_child(U.paragraph("İlk arkadaşını koduyla ekle. İsteğini kabul ettiğinde burada görünür.", 15))

func _build_room() -> void:
	_clear_body("room")
	_awaiting_first_snapshot = true
	var info = _card(Color("fff0c9"))
	info.add_child(_heading("ODA · " + client.room_code, 26))
	var copy_button = U.button("ODA KODUNU KOPYALA", U.PAPER, func(): DisplayServer.clipboard_set(client.room_code), 43)
	copy_button.add_theme_font_size_override("font_size", 16)
	info.add_child(copy_button)
	_phase_label = _heading("Rakibin bekleniyor…", 24)
	info.add_child(_phase_label)
	_clock_label = U.label("", 36, U.INK, true)
	info.add_child(_clock_label)
	_turn_label = U.paragraph("", 16, U.INK)
	info.add_child(_turn_label)
	_scoreboard = U.row(12)
	_body.add_child(_scoreboard)
	_start_button = U.button("YARIŞI BAŞLAT", U.ORANGE, func(): client.start_match())
	_body.add_child(_start_button)
	_room_invites = U.column(9)
	_body.add_child(_room_invites)
	_chain_list = U.column(9)
	_body.add_child(_chain_list)
	_body.add_child(U.paragraph("Sıran geldiğinde kelimeyi ekiyle yaz. 20 saniye içinde tekrar deneyebilirsin; doğru cevapta sıra değişir. Sohbet her zaman açık.", 15, U.MUTED))
	_messages_list = U.column(9)
	_body.add_child(_messages_list)
	_composer_clue = U.paragraph("", 18, U.INK)
	_body.add_child(_composer_clue)
	_chat_input = _make_input("Mesaj veya kelime yaz…", 160)
	_chat_input.name = "OnlineChatInput"
	_chat_input.text_submitted.connect(func(_text): _send_chat())
	_body.add_child(_chat_input)
	_send_button = U.button("GÖNDER", U.YELLOW, _send_chat, 52)
	_body.add_child(_send_button)
	_body.add_child(U.button("ODADAN AYRIL", U.CREAM, _leave_room, 45))

func _update_room() -> void:
	var snapshot: Dictionary = client.room_state
	var players: Array = snapshot.get("players", [])
	var phase = str(snapshot.get("phase", "waiting"))
	var host = not players.is_empty() and str(players[0].get("id", "")) == str(client.profile.get("id", ""))
	_start_button.visible = phase == "waiting" and host
	_start_button.disabled = players.size() < 2 or client.status != "connected" or not client.room_snapshot_ready
	_phase_label.text = {"waiting": "Rakibin bekleniyor…", "countdown": "Hazır mısın?", "playing": "Bağlantıyı bul!", "finished": "Maç tamam!"}.get(phase, "Bağlanıyor…")
	if phase == "finished":
		var winner = snapshot.get("winnerId")
		_phase_label.text = "Berabere!" if winner == null or str(winner).is_empty() else "Kazandın!" if str(winner) == str(client.profile.get("id", "")) else "Rakibin kazandı!"
	var score_key = JSON.stringify(players) + str(snapshot.get("activePlayerId", "")) + phase
	if score_key != _score_signature:
		_score_signature = score_key
		for child in _scoreboard.get_children():
			_scoreboard.remove_child(child)
			child.queue_free()
		for person: Dictionary in players:
			var card = U.panel(U.YELLOW if str(person.get("id", "")) == str(snapshot.get("activePlayerId", "")) and phase == "playing" else U.PAPER, 16)
			card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			var column = U.column(4)
			card.add_child(column)
			column.add_child(_heading(str(person.get("name", "")), 18))
			column.add_child(U.label(str(person.get("score", 0)), 28, U.INK, true))
			column.add_child(U.paragraph("Bağlı" if person.get("connected", false) else "Bağlanıyor…", 12))
			_scoreboard.add_child(card)
	var invite_key = JSON.stringify(client.friends) + phase + str(players.size())
	if invite_key != _invite_signature:
		_invite_signature = invite_key
		for child in _room_invites.get_children():
			_room_invites.remove_child(child)
			child.queue_free()
		if phase == "waiting" and players.size() < 2:
			for person: Dictionary in client.friends:
				_room_invites.add_child(U.paragraph(str(person.get("name", "")), 17, U.INK))
				_room_invites.add_child(U.button("ODAYA DAVET ET", U.MINT, func(): _invite(str(person.get("id", ""))), 44))
	var chain: Array = snapshot.get("chain", [])
	var chain_key = JSON.stringify(chain) + str(snapshot.get("activeIndex", 1))
	if chain_key != _chain_signature:
		_chain_signature = chain_key
		_render_chain(snapshot, chain)
	_render_messages(snapshot.get("messages", []))
	if client.room_snapshot_ready and _awaiting_first_snapshot:
		_awaiting_first_snapshot = false
		# If the socket dropped before delivery, keep the draft and allow retry.
		_pending_message_id = ""
		_pending_text = ""
		_send_button.disabled = client.status != "connected"
	_update_clock()

func _render_chain(snapshot: Dictionary, chain: Array) -> void:
	for child in _chain_list.get_children():
		_chain_list.remove_child(child)
		child.queue_free()
	var correct: Dictionary = snapshot.get("lastCorrect", {}) if snapshot.get("lastCorrect") is Dictionary else {}
	var marker = "%s/%s" % [correct.get("turnId", ""), correct.get("at", "")]
	var fresh = not correct.is_empty() and marker != _last_correct_marker and client.server_now_ms() - int(correct.get("at", 0)) < 2000
	_last_correct_marker = marker
	for i in chain.size():
		var cell: Dictionary = chain[i]
		var solved = str(cell.get("status", "hidden")) != "hidden"
		var row = WordRow.new()
		row.ordinal = i + 1
		row.mode = "solved" if solved else "locked"
		row.word = str(cell.get("stem", "")) if solved else str(cell.get("first", "?")) + "?".repeat(maxi(0, int(cell.get("length", 1)) - 1))
		row.known = []
		for p in row.word.length(): row.known.append(row.word[p] if solved or p == 0 else "")
		_chain_list.add_child(row)
		if not solved and i == int(snapshot.get("activeIndex", 1)):
			row.add_theme_stylebox_override("panel", U.box(U.PAPER, 18, U.YELLOW, 3))
			row.status_label.text = "SIRADAKİ KELİME · %d HARF" % row.word.length()
		if str(cell.get("status", "")) == "skipped": row.status_label.text = "SÜRE DOLDU · AÇILDI"
		if fresh and i == int(correct.get("index", -1)):
			row.show_correct_answer(str(correct.get("answer", row.word)))
			row.animate_to_stem(str(correct.get("stem", row.word)))

func _render_messages(messages: Array) -> void:
	var current = {}
	for message: Dictionary in messages:
		var id = str(message.get("id", ""))
		current[id] = true
		if str(message.get("clientMessageId", "")) == _pending_message_id and not _pending_message_id.is_empty() and str(message.get("playerId", "")) == str(client.profile.get("id", "")):
			if _chat_input.text.strip_edges() == _pending_text: _chat_input.clear()
			_pending_message_id = ""
			_pending_text = ""
		if _message_nodes.has(id): continue
		var kind = str(message.get("kind", "chat"))
		var panel = U.panel(U.MINT if kind == "correct" else Color("fff0c9") if kind == "system" else U.PAPER, 14)
		var column = U.column(3)
		panel.add_child(column)
		column.add_child(U.paragraph(str(message.get("name", "Oyun")), 12, U.MUTED))
		var label: Label
		if kind == "wrong":
			label = WrongGuessLabel.new()
			label.text = str(message.get("text", ""))
			label.clip_text = true
			label.add_theme_font_override("font", U.body_font())
			label.add_theme_font_size_override("font_size", 18)
			label.add_theme_color_override("font_color", Color("bc5542"))
		else:
			label = U.paragraph(("✓ " if kind == "correct" else "") + str(message.get("text", "")), 18, U.INK)
		column.add_child(label)
		_messages_list.add_child(panel)
		_message_nodes[id] = panel
	for id in _message_nodes.keys():
		if not current.has(id):
			var node = _message_nodes[id]
			_messages_list.remove_child(node)
			node.queue_free()
			_message_nodes.erase(id)
	_send_button.disabled = not _pending_message_id.is_empty() or client.status != "connected" or not client.room_snapshot_ready
	if _chat_input.has_focus(): _ensure_input_visible.call_deferred(_chat_input)

func _process(delta: float) -> void:
	_clock_tick += delta
	if _mode == "room" and _clock_tick >= 0.2:
		_clock_tick = 0
		_update_clock()

func _update_clock() -> void:
	if _mode != "room" or not is_instance_valid(_clock_label): return
	var snapshot: Dictionary = client.room_state
	var phase = str(snapshot.get("phase", "waiting"))
	var remaining = maxi(0, int(ceil(float(int(snapshot.get("deadlineAt", 0)) - client.server_now_ms()) / 1000)))
	_clock_label.visible = phase in ["countdown", "playing"]
	_clock_label.text = str(remaining) if phase == "countdown" else "%d sn" % remaining
	if phase == "playing":
		_turn_label.text = "SIRA SENDE · Cevabını veya mesajını yaz." if str(snapshot.get("activePlayerId", "")) == str(client.profile.get("id", "")) else "Sıra rakibinde. Sohbete devam edebilirsin."
	elif phase == "waiting": _turn_label.text = "Kodunu paylaş. İkiniz hazır olduğunuzda ev sahibi yarışı başlatır."
	elif phase == "countdown": _turn_label.text = "İlk kelime açık. Beş kelimelik zinciri birlikte tamamlayın."
	elif snapshot.get("tieBreak", "") == "speed":
		_turn_label.text = "Puanlar eşitti. Doğru cevapları toplamda daha kısa sürede bulan oyuncu kazandı."
	else:
		_turn_label.text = {"chain_complete": "Zincirdeki bütün bağlantılar tamamlandı.", "time_limit": "Maç süresi doldu. Sonucu puanlar belirledi.", "forfeit": "Bir oyuncu ayrıldığı için maç sona erdi.", "abandoned": "Maç sona erdi.", "room_closed": "Oda kapatıldı."}.get(str(snapshot.get("endReason", "")), "Yeni bir yarış için yeniden oda oluşturabilirsin.")
	_composer_clue.text = ""
	var index = int(snapshot.get("activeIndex", 0))
	var chain: Array = snapshot.get("chain", [])
	if phase == "playing" and index > 0 and index < chain.size():
		var cell: Dictionary = chain[index]
		var previous: Dictionary = chain[index - 1]
		var mask = str(cell.get("first", "")) + "·".repeat(maxi(0, int(cell.get("length", 1)) - 1))
		_composer_clue.text = "%d sn · %s + %s" % [remaining, str(previous.get("stem", "")), mask]

func _send_chat() -> void:
	if not _pending_message_id.is_empty() or not is_instance_valid(_chat_input) or not client.room_snapshot_ready: return
	var text = _chat_input.text.strip_edges()
	if text.is_empty(): return
	var id = client.send_chat(text)
	if id.is_empty(): return
	_error_label.hide()
	_pending_message_id = id
	_pending_text = text
	_send_button.disabled = true

func _rename() -> void:
	if _busy: return
	_busy = true
	await client.rename_profile(_name_input.text)
	_busy = false

func _request_friend() -> void:
	if _busy: return
	_busy = true
	if await client.request_friend(_friend_input.text): _friend_input.clear()
	_busy = false

func _respond(id: String, accept: bool) -> void:
	if _busy: return
	_busy = true
	await client.respond_friend(id, accept)
	_busy = false

func _create_room() -> void:
	if _busy: return
	_busy = true
	await client.create_room()
	_busy = false

func _create_and_invite(id: String) -> void:
	if _busy: return
	_busy = true
	if await client.create_room(): await client.invite_friend(id)
	_busy = false

func _join_room() -> void:
	_join_code(_join_input.text)

func _join_code(code: String) -> void:
	if _busy: return
	_busy = true
	await client.join_room(code)
	_busy = false

func _invite(id: String) -> void:
	if _busy: return
	_busy = true
	await client.invite_friend(id)
	_busy = false

func _leave_room() -> void:
	client.leave_room()

func _back() -> void:
	if client != null and not client.room_code.is_empty(): client.leave_room()
	return_home.emit()

func request_home() -> void:
	if is_instance_valid(_leave_prompt):
		_close_leave_prompt()
		return
	if client == null or client.room_state.get("phase", "") not in ["countdown", "playing"]:
		_back()
		return
	var focused = focus_control()
	if focused: focused.release_focus()
	if DisplayServer.has_feature(DisplayServer.FEATURE_VIRTUAL_KEYBOARD): DisplayServer.virtual_keyboard_hide()
	_leave_prompt = U.panel(Color("fff0c9"), 18, true)
	var column = U.column(12)
	_leave_prompt.add_child(column)
	column.add_child(_heading("Yarıştan ayrılmak istiyor musun?", 23))
	column.add_child(U.paragraph("Yarış sürerken ayrılırsan rakibin kazanır. Devam etmeyi seçersen yazdığın mesaj duruyor.", 16, U.INK))
	column.add_child(U.button("OYUNA DEVAM ET", U.MINT, _close_leave_prompt, 48))
	column.add_child(U.button("EVET, AYRIL", U.PAPER, _back, 48))
	_body.add_child(_leave_prompt)
	_body.move_child(_leave_prompt, 0)
	_ensure_input_visible.call_deferred(_leave_prompt)

func _close_leave_prompt() -> void:
	if is_instance_valid(_leave_prompt):
		_body.remove_child(_leave_prompt)
		_leave_prompt.queue_free()
	_leave_prompt = null

func focus_control() -> Control:
	if not is_inside_tree(): return null
	var focused = get_viewport().gui_get_focus_owner()
	return focused if focused is LineEdit and is_ancestor_of(focused) else null

func _on_error(reason: String) -> void:
	if reason == "not_configured": return
	_pending_message_id = ""
	_pending_text = ""
	if is_instance_valid(_send_button): _send_button.disabled = client.status != "connected" or not client.room_snapshot_ready
	var texts = {"invalid_name": "İsmin 2–18 karakter olmalı.", "invalid_code": "Arkadaş kodunu kontrol et.", "invalid_friend_code": "Arkadaş kodunu kontrol et.", "not_found": "Bu kodla bir oyuncu bulunamadı.", "user_not_found": "Bu kodla bir oyuncu bulunamadı.", "player_not_found": "Bu kodla bir oyuncu bulunamadı.", "self_request": "Kendi koduna arkadaşlık isteği gönderemezsin.", "cannot_add_self": "Kendi koduna arkadaşlık isteği gönderemezsin.", "room_not_found": "Bu oda bulunamadı veya süresi doldu.", "room_closed": "Bu oda kapatıldı. Yeni bir oda kodu iste.", "room_full": "Bu odada zaten iki oyuncu var.", "not_friends": "Önce arkadaşlık isteğinin kabul edilmesi gerekiyor.", "stale_turn": "Sıra değişti. Yazdığın mesaj duruyor; yeniden gönderebilirsin.", "rate_limited": "Biraz yavaşla; birkaç saniye sonra yeniden dene.", "invalid_message": "En fazla 160 karakterlik bir mesaj yaz.", "invalid_text": "En fazla 160 karakterlik bir mesaj yaz.", "host_only": "Yarışı yalnızca odayı açan oyuncu başlatabilir.", "need_two_players": "Rakibinin de odaya katılmasını bekle.", "player_disconnected": "Rakibin yeniden bağlanıyor. Biraz bekle.", "not_ready": "Odanın güncel bilgisi bekleniyor. Mesajın duruyor.", "session_replaced": "Bu hesap başka bir pencerede açıldı. Devam etmek için bağlantıyı yenileyebilirsin.", "connection_lost": "Bağlantı kesildi. Mesajın duruyor; bağlantı yenilenince gönderebilirsin.", "reconnect_expired": "Yeniden bağlanma süresi doldu. Bağlantıyı yenileyip maç sonucunu görebilirsin.", "unauthorized": "Oyuncu oturumu yenilenemedi. Yeniden bağlanmayı dene."}
	_error_label.text = str(texts.get(reason, "Bağlantı kurulamadı. Biraz sonra yeniden dene."))
	_error_label.show()

func _ensure_input_visible(edit: Control) -> void:
	if not is_instance_valid(edit) or not edit.is_inside_tree(): return
	var ancestor = get_parent()
	while ancestor != null:
		if ancestor is ScrollContainer:
			ancestor.ensure_control_visible(edit)
			return
		ancestor = ancestor.get_parent()

func _exit_tree() -> void:
	set_process(false)
	if is_instance_valid(client): client.stop()
