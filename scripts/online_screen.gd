class_name ZincirOnlineScreen
extends VBoxContainer

signal return_home

const U = preload("res://scripts/ui.gd")
const OnlineClient = preload("res://scripts/online_client.gd")
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
var _top_row: HBoxContainer
var _waiting_root: VBoxContainer
var _waiting_scoreboard: HBoxContainer
var _battle_root: VBoxContainer
var _chat_panel: PanelContainer
var _messages_scroll: ScrollContainer
var _question_label: Label
var _correct_label: Label
var _timer_bar: ProgressBar
var _result_panel: PanelContainer
var _result_text: Label
var _continue_button: Button
var _composer_row: HBoxContainer
var _leave_button: Button

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
	_top_row = top
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
	# The existing waiting room keeps its controls and colors.
	_waiting_root = U.column(18)
	_body.add_child(_waiting_root)
	var info_panel = U.panel(Color("fff0c9"), 20)
	_waiting_root.add_child(info_panel)
	var info = U.column(12)
	info_panel.add_child(info)
	info.add_child(_heading("ODA · " + client.room_code, 26))
	var copy_button = U.button("ODA KODUNU KOPYALA", U.PAPER, func(): DisplayServer.clipboard_set(client.room_code), 43)
	copy_button.add_theme_font_size_override("font_size", 16)
	info.add_child(copy_button)
	info.add_child(_heading("Rakibin bekleniyor…", 24))
	info.add_child(U.paragraph("Kodunu paylaş. İkiniz hazır olduğunuzda ev sahibi yarışı başlatır.", 16, U.INK))
	_waiting_scoreboard = U.row(12)
	_waiting_root.add_child(_waiting_scoreboard)
	_start_button = U.button("YARIŞI BAŞLAT", U.ORANGE, func(): client.start_match())
	_waiting_root.add_child(_start_button)
	_room_invites = U.column(9)
	_waiting_root.add_child(_room_invites)
	_battle_root = U.column(12)
	_body.add_child(_battle_root)
	_scoreboard = U.row(12)
	_battle_root.add_child(_scoreboard)
	_result_panel = U.panel(U.MINT, 20)
	_battle_root.add_child(_result_panel)
	var result_column = U.column(12)
	_result_panel.add_child(result_column)
	_phase_label = _heading("Tur tamamlandı", 26)
	_phase_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	result_column.add_child(_phase_label)
	_result_text = U.paragraph("", 17, U.INK)
	_result_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	result_column.add_child(_result_text)
	_continue_button = U.button("DEVAM ET →", U.ORANGE, func(): client.send_continue())
	_continue_button.name = "OnlineContinue"
	result_column.add_child(_continue_button)
	_chat_panel = U.panel(U.PAPER, 18)
	var chat_style = U.box(U.PAPER, 18, U.LINE, 1)
	chat_style.set_content_margin_all(12)
	_chat_panel.add_theme_stylebox_override("panel", chat_style)
	_battle_root.add_child(_chat_panel)
	var chat_column = U.column(0)
	_chat_panel.add_child(chat_column)
	_chain_list = U.column(5)
	chat_column.add_child(_chain_list)
	var question_strip = U.panel(U.INK, 12)
	var question_style = U.box(U.INK, 12)
	question_style.content_margin_left = 12
	question_style.content_margin_right = 12
	question_style.content_margin_top = 12
	question_style.content_margin_bottom = 12
	question_strip.add_theme_stylebox_override("panel", question_style)
	_chain_list.add_child(question_strip)
	_question_label = U.paragraph("", 25, U.PAPER)
	_question_label.name = "OnlineQuestionStrip"
	_question_label.add_theme_font_override("font", U.heading_font())
	_question_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	question_strip.add_child(_question_label)
	_correct_label = U.paragraph("", 14, U.TEAL)
	_correct_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_chain_list.add_child(_correct_label)
	_messages_scroll = ScrollContainer.new()
	_messages_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_messages_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	chat_column.add_child(_messages_scroll)
	_messages_list = U.column(13)
	_messages_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_messages_scroll.add_child(_messages_list)
	var turn_row = U.row(8)
	chat_column.add_child(turn_row)
	turn_row.add_child(U.icon("profile", 30))
	_turn_label = U.paragraph("", 16, U.INK)
	turn_row.add_child(_turn_label)
	_clock_label = U.label("30", 25, U.INK, true)
	turn_row.add_child(_clock_label)
	_timer_bar = U.progress(100, U.TEAL, 8)
	chat_column.add_child(_timer_bar)
	_composer_clue = U.paragraph("", 14, U.MUTED)
	_battle_root.add_child(_composer_clue)
	_composer_row = U.row(8)
	_battle_root.add_child(_composer_row)
	_chat_input = _make_input("Cevabını yaz…", 160)
	_chat_input.name = "OnlineChatInput"
	_chat_input.text_submitted.connect(func(_text): _send_chat())
	_chat_input.focus_entered.connect(_update_battle_layout)
	_chat_input.focus_exited.connect(_update_battle_layout)
	_composer_row.add_child(_chat_input)
	_send_button = U.button("CEVAPLA", U.YELLOW, _send_chat, 52)
	_send_button.add_theme_font_size_override("font_size", 17)
	_composer_row.add_child(_send_button)
	_leave_button = U.button("ODADAN AYRIL", U.CREAM, _leave_room, 45)
	_body.add_child(_leave_button)

func _score_card(person: Dictionary, active: bool, waiting: bool = false) -> PanelContainer:
	var card = U.panel(U.MINT if active else U.PAPER, 16)
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var column = U.column(4)
	card.add_child(column)
	if waiting:
		column.add_child(_heading(str(person.get("name", "")), 18))
		column.add_child(U.label(str(person.get("score", 0)), 28, U.INK, true))
		column.add_child(U.paragraph("Bağlı" if person.get("connected", false) else "Bağlanıyor…", 12))
		return card
	var avatar = U.label(str(person.get("name", "?")).substr(0, 1).to_upper(), 24, U.INK, true)
	avatar.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(avatar)
	var shown_name = str(person.get("name", ""))
	if shown_name.length() > 11: shown_name = shown_name.substr(0, 10) + "…"
	var name_label = U.label(shown_name, 16, U.INK, true)
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_label.custom_minimum_size.y = 22
	name_label.clip_text = true
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(name_label)
	var detail = "Bağlı" if person.get("connected", false) else "Bağlanıyor…"
	if not waiting: detail = "%d puan" % int(person.get("score", 0))
	var detail_label = U.paragraph(detail, 12)
	detail_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(detail_label)
	return card

func _update_room() -> void:
	var snapshot: Dictionary = client.room_state
	var players: Array = snapshot.get("players", [])
	var phase = str(snapshot.get("phase", "waiting"))
	var waiting = phase == "waiting"
	_waiting_root.visible = waiting
	_battle_root.visible = not waiting
	_chat_panel.visible = phase in ["countdown", "playing"]
	_composer_row.visible = phase in ["countdown", "playing"]
	_composer_clue.visible = phase in ["countdown", "playing"]
	_result_panel.visible = phase in ["round_end", "finished"]
	_leave_button.text = "ARKADAŞLARA DÖN" if phase == "finished" else "ODADAN AYRIL"
	var host = not players.is_empty() and str(players[0].get("id", "")) == str(client.profile.get("id", ""))
	_start_button.visible = waiting and host
	_start_button.disabled = players.size() < 2 or client.status != "connected" or not client.room_snapshot_ready
	var score_key = JSON.stringify(players) + str(snapshot.get("activePlayerId", "")) + phase + str(snapshot.get("roundNumber", 1))
	if score_key != _score_signature:
		_score_signature = score_key
		for target in [_scoreboard, _waiting_scoreboard]:
			for child in target.get_children(): target.remove_child(child); child.queue_free()
		for person: Dictionary in players:
			_waiting_scoreboard.add_child(_score_card(person, false, true))
		if not players.is_empty(): _scoreboard.add_child(_score_card(players[0], str(players[0].id) == str(snapshot.get("activePlayerId", "")) and phase == "playing"))
		var series = U.column(2)
		series.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		var series_score = U.label("%d – %d" % [int(players[0].get("roundWins", 0)) if players.size() > 0 else 0, int(players[1].get("roundWins", 0)) if players.size() > 1 else 0], 30, U.INK, true)
		series_score.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		series.add_child(series_score)
		var round_label = U.label("TUR %d / 3" % int(snapshot.get("roundNumber", 1)), 12, U.MUTED)
		series.add_child(round_label)
		_scoreboard.add_child(series)
		if players.size() > 1: _scoreboard.add_child(_score_card(players[1], str(players[1].id) == str(snapshot.get("activePlayerId", "")) and phase == "playing"))
	var invite_key = JSON.stringify(client.friends) + phase + str(players.size())
	if invite_key != _invite_signature:
		_invite_signature = invite_key
		for child in _room_invites.get_children(): _room_invites.remove_child(child); child.queue_free()
		if waiting and players.size() < 2:
			for person: Dictionary in client.friends:
				_room_invites.add_child(U.paragraph(str(person.get("name", "")), 17, U.INK))
				_room_invites.add_child(U.button("ODAYA DAVET ET", U.MINT, func(): _invite(str(person.get("id", ""))), 44))
	_render_chain(snapshot, snapshot.get("chain", []))
	_render_messages(snapshot.get("messages", []))
	if client.room_snapshot_ready and _awaiting_first_snapshot:
		_awaiting_first_snapshot = false
		_pending_message_id = ""
		_pending_text = ""
	_update_round_result(snapshot)
	_update_clock()
	_update_battle_layout()

func _render_chain(snapshot: Dictionary, chain: Array) -> void:
	var phase = str(snapshot.get("phase", "waiting"))
	if phase == "countdown":
		_question_label.text = "Hazır mısınız?"
	else:
		var index = int(snapshot.get("activeIndex", 1))
		if index > 0 and index < chain.size():
			var cell: Dictionary = chain[index]
			_question_label.text = "%s → %s%s" % [str(chain[index - 1].get("stem", "")), str(cell.get("first", "")), "_".repeat(maxi(0, int(cell.get("length", 1)) - 1))]
		else: _question_label.text = "Zincir tamamlandı"
	var correct: Dictionary = snapshot.get("lastCorrect", {}) if snapshot.get("lastCorrect") is Dictionary else {}
	_correct_label.visible = not correct.is_empty() and client.server_now_ms() - int(correct.get("at", 0)) < 2200
	_correct_label.text = "%s → %s" % [correct.get("answer", ""), correct.get("stem", "")] if not correct.is_empty() else ""

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
		var mine = str(message.get("playerId", "")) == str(client.profile.get("id", ""))
		var row = U.row(8)
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		if mine: row.add_child(U.expand())
		var avatar = U.label(str(message.get("name", "?")).substr(0, 1), 18, U.TEAL, true)
		row.add_child(avatar)
		var column = U.column(2)
		column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(column)
		column.add_child(U.paragraph(str(message.get("name", "Oyun")), 11, U.MUTED))
		var message_row = U.row(6)
		column.add_child(message_row)
		var label: Label
		if kind == "wrong":
			label = WrongGuessLabel.new()
			label.text = str(message.get("text", ""))
			label.clip_text = true
			label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			label.add_theme_font_override("font", U.body_font())
			label.add_theme_font_size_override("font_size", 18)
			label.add_theme_color_override("font_color", Color("bc5542"))
		else: label = U.paragraph(str(message.get("text", "")), 18, U.INK)
		message_row.add_child(label)
		if kind in ["correct", "wrong"]:
			var mark = U.label("✓" if kind == "correct" else "×", 20, U.TEAL if kind == "correct" else Color("bc5542"), true)
			message_row.add_child(mark)
		if not mine: row.add_child(U.expand())
		_messages_list.add_child(row)
		_message_nodes[id] = row
	for id in _message_nodes.keys():
		if not current.has(id):
			var node = _message_nodes[id]
			_messages_list.remove_child(node)
			node.queue_free()
			_message_nodes.erase(id)
	if not messages.is_empty(): _messages_scroll.set_deferred("scroll_vertical", int(_messages_scroll.get_v_scroll_bar().max_value))
	_update_entry_lock()

func _update_round_result(snapshot: Dictionary) -> void:
	var phase = str(snapshot.get("phase", "waiting"))
	if phase not in ["round_end", "finished"]: return
	var result: Dictionary = snapshot.get("roundResult", {}) if snapshot.get("roundResult") is Dictionary else {}
	var winner = result.get("winnerId") if phase == "round_end" else snapshot.get("winnerId")
	var own = str(client.profile.get("id", ""))
	var title = "Tur berabere!" if winner == null else "Turu kazandın!" if str(winner) == own else "Rakibin turu kazandı!"
	if phase == "finished": title = "Maç berabere!" if winner == null else "Maçı kazandın!" if str(winner) == own else "Rakibin maçı kazandı!"
	_phase_label.text = title
	var players: Array = snapshot.get("players", [])
	var tally = "%d – %d" % [int(players[0].get("roundWins", 0)) if players.size() > 0 else 0, int(players[1].get("roundWins", 0)) if players.size() > 1 else 0]
	_result_text.text = "Seri skoru: %s. İki tur kazanan maçı kazanır." % tally
	if phase == "round_end" and winner == null: _result_text.text += " Berabere tur yeniden oynanır."
	if result.get("tieBreak", "") == "speed": _result_text.text += " Eşit puanda doğru cevap süresi belirleyici oldu."
	_continue_button.visible = phase == "round_end"
	var ready: Array = snapshot.get("continueReady", [])
	var is_ready = ready.has(own)
	_continue_button.disabled = is_ready or client.status != "connected"
	_continue_button.text = "RAKİBİN BEKLENİYOR…" if is_ready else "DEVAM ET →"

func _update_entry_lock() -> void:
	var snapshot: Dictionary = client.room_state
	var mine = str(snapshot.get("phase", "")) == "playing" and str(snapshot.get("activePlayerId", "")) == str(client.profile.get("id", ""))
	var enabled = mine and client.status == "connected" and client.room_snapshot_ready
	_chat_input.editable = enabled
	_chat_input.placeholder_text = "Cevabını yaz…" if enabled else "Sıra rakibinde" if snapshot.get("phase", "") == "playing" else "Turun başlaması bekleniyor…"
	_send_button.disabled = not enabled or not _pending_message_id.is_empty()

func _process(delta: float) -> void:
	_clock_tick += delta
	if _mode == "room" and _clock_tick >= 0.2:
		_clock_tick = 0
		_update_clock()
		_update_battle_layout()

func _update_clock() -> void:
	if _mode != "room" or not is_instance_valid(_clock_label): return
	var snapshot: Dictionary = client.room_state
	var phase = str(snapshot.get("phase", "waiting"))
	var remaining = maxi(0, int(ceil(float(int(snapshot.get("deadlineAt", 0)) - client.server_now_ms()) / 1000)))
	_clock_label.text = str(remaining) if phase == "countdown" else "%d sn" % remaining
	_timer_bar.value = minf(100, float(remaining) / (3 if phase == "countdown" else 30) * 100)
	var mine = str(snapshot.get("activePlayerId", "")) == str(client.profile.get("id", ""))
	var player_name = "Rakibin"
	for person: Dictionary in snapshot.get("players", []):
		if str(person.get("id", "")) == str(snapshot.get("activePlayerId", "")): player_name = str(person.get("name", "Rakibin"))
	_turn_label.text = "Hazır olun!" if phase == "countdown" else "SIRA SENDE" if mine else player_name + " düşünüyor"
	_composer_clue.text = "30 saniye · Tur %d / 3 · İlk 2 turu kazanan alır" % int(snapshot.get("roundNumber", 1))
	if is_instance_valid(_correct_label) and _correct_label.visible:
		var correct: Dictionary = snapshot.get("lastCorrect", {}) if snapshot.get("lastCorrect") is Dictionary else {}
		if client.server_now_ms() - int(correct.get("at", 0)) > 2200: _correct_label.hide()
	_update_entry_lock()

func _update_battle_layout() -> void:
	if _mode != "room" or not is_instance_valid(_messages_scroll): return
	var phase = str(client.room_state.get("phase", "waiting"))
	var keyboard = DisplayServer.virtual_keyboard_get_height() if DisplayServer.has_feature(DisplayServer.FEATURE_VIRTUAL_KEYBOARD) else 0
	var compact = phase in ["countdown", "playing"] and (get_viewport_rect().size.y < 720 or keyboard > 0)
	_top_row.visible = not compact
	_connection_label.visible = not compact
	_scoreboard.visible = not compact
	_composer_clue.visible = phase in ["countdown", "playing"] and not compact
	_leave_button.visible = not compact
	_question_label.add_theme_font_size_override("font_size", 20 if compact else 25)
	if compact: _correct_label.hide()
	var available = get_viewport_rect().size.y - float(keyboard) - (235 if compact else 520)
	_messages_scroll.custom_minimum_size.y = clampf(available, 60 if compact else 160, 490)

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
	if client == null or client.room_state.get("phase", "") not in ["countdown", "playing", "round_end"]:
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
	if is_instance_valid(_send_button): _update_entry_lock()
	var texts = {"not_your_turn": "Sıra rakibinde. Sıran geldiğinde yazabilirsin.", "not_playing": "Turun başlamasını bekle.", "invalid_name": "İsmin 2–18 karakter olmalı.", "invalid_code": "Arkadaş kodunu kontrol et.", "invalid_friend_code": "Arkadaş kodunu kontrol et.", "not_found": "Bu kodla bir oyuncu bulunamadı.", "user_not_found": "Bu kodla bir oyuncu bulunamadı.", "player_not_found": "Bu kodla bir oyuncu bulunamadı.", "self_request": "Kendi koduna arkadaşlık isteği gönderemezsin.", "cannot_add_self": "Kendi koduna arkadaşlık isteği gönderemezsin.", "room_not_found": "Bu oda bulunamadı veya süresi doldu.", "room_closed": "Bu oda kapatıldı. Yeni bir oda kodu iste.", "room_full": "Bu odada zaten iki oyuncu var.", "not_friends": "Önce arkadaşlık isteğinin kabul edilmesi gerekiyor.", "stale_turn": "Sıra değişti. Yazdığın mesaj duruyor; yeniden gönderebilirsin.", "rate_limited": "Biraz yavaşla; birkaç saniye sonra yeniden dene.", "invalid_message": "En fazla 160 karakterlik bir mesaj yaz.", "invalid_text": "En fazla 160 karakterlik bir mesaj yaz.", "host_only": "Yarışı yalnızca odayı açan oyuncu başlatabilir.", "need_two_players": "Rakibinin de odaya katılmasını bekle.", "player_disconnected": "Rakibin yeniden bağlanıyor. Biraz bekle.", "not_ready": "Odanın güncel bilgisi bekleniyor. Mesajın duruyor.", "session_replaced": "Bu hesap başka bir pencerede açıldı. Devam etmek için bağlantıyı yenileyebilirsin.", "connection_lost": "Bağlantı kesildi. Mesajın duruyor; bağlantı yenilenince gönderebilirsin.", "reconnect_expired": "Yeniden bağlanma süresi doldu. Bağlantıyı yenileyip maç sonucunu görebilirsin.", "unauthorized": "Oyuncu oturumu yenilenemedi. Yeniden bağlanmayı dene."}
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
