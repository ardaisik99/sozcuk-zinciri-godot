extends Control

const U = preload("res://scripts/ui.gd")
const State = preload("res://scripts/game_state.gd")
const WordRow = preload("res://scripts/word_row.gd")
var state = State.new()
var screen = "loading"
var selected_category = "Tümü"
var scroll: ScrollContainer
var content: VBoxContainer
var stage: Control
var active_row: ZincirWordRow
var active_group: VBoxContainer
var active_link: Label
var feedback: Label
var toast_layer: CanvasLayer
var toast_tween: Tween
var sound: Node
var keyboard_spacer: Control
var last_keyboard = 0
var keyboard_tick = 0.0
var compact = true
var building = false
var tutorial_replay = false
var party_level: Dictionary = {}
var party_count = 0
var resize_tick = 0.0
var previous_size = Vector2.ZERO
var online_view: Control
var profile_input: LineEdit
var transition_busy = false
var transition_token = 0
var transition_result: Dictionary = {}
const WORD_TRANSITION_SECONDS = 0.78

func _ready() -> void:
	OS.low_processor_usage_mode = true
	var background = Control.new()
	background.set_script(preload("res://scripts/backdrop.gd"))
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)
	sound = Node.new()
	sound.set_script(preload("res://scripts/sound.gd"))
	add_child(sound)
	sound.enabled = bool(state.settings.get("sound", true))
	toast_layer = CanvasLayer.new()
	toast_layer.layer = 10
	add_child(toast_layer)
	stage = Control.new()
	stage.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(stage)
	previous_size = size
	_show_loading()
	# Let controls finish their initial layout; never hold a fake intro timer.
	await get_tree().process_frame
	if not is_inside_tree(): return
	if state.profile_name.is_empty():
		_show_profile()
	elif not state.tutorial_done:
		_start_tutorial()
	else:
		_show_home()

func _process(delta: float) -> void:
	keyboard_tick += delta
	if keyboard_tick > 0.20:
		keyboard_tick = 0.0
		_update_keyboard()
	if size != previous_size:
		resize_tick += delta
		if resize_tick > 0.2:
			previous_size = size
			resize_tick = 0.0
			var next_compact = size.x < 760
			if next_compact != compact and screen in ["home", "levels", "party", "settings"]:
				_refresh_screen()
			elif is_instance_valid(active_row) and screen == "game":
				_scroll_active.call_deferred()

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		_go_back()
	if what == NOTIFICATION_APPLICATION_PAUSED or what == NOTIFICATION_WM_CLOSE_REQUEST:
		_finish_transition_immediately()
		state.save_game()

func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		_go_back()
		get_viewport().set_input_as_handled()

func _go_back() -> void:
	if screen == "online" and is_instance_valid(online_view):
		online_view.request_home()
		return
	if screen == "game" and not state.tutorial_done:
		_toast("Birlikte üç kelimeyi bulalım. Çok az kaldı!")
	elif screen != "loading" and screen != "profile":
		_hide_keyboard()
		_show_home()

func _refresh_screen() -> void:
	match screen:
		"home": _show_home()
		"levels": _show_levels()
		"party": _show_party(false)
		"settings": _show_settings()
		"online": _show_online()

func _clear(new_screen: String, max_width: int = 1080) -> void:
	_cancel_word_transition()
	_clear_toasts()
	screen = new_screen
	compact = size.x < 760
	active_row = null
	active_group = null
	active_link = null
	feedback = null
	keyboard_spacer = null
	for child in stage.get_children():
		stage.remove_child(child)
		child.queue_free()
	var outer = MarginContainer.new()
	outer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var margin = 20 if compact else 36
	outer.add_theme_constant_override("margin_left", margin)
	outer.add_theme_constant_override("margin_right", margin)
	outer.add_theme_constant_override("margin_top", 18 if compact else 28)
	outer.add_theme_constant_override("margin_bottom", 16)
	stage.add_child(outer)
	scroll = ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.follow_focus = true
	scroll.add_theme_stylebox_override("panel", StyleBoxEmpty.new())
	outer.add_child(scroll)
	var center = HBoxContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(center)
	center.add_child(U.expand())
	content = U.column(20 if compact else 24)
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content.size_flags_stretch_ratio = 100
	content.custom_minimum_size.x = minf(max_width, maxf(0, size.x - margin * 2 - 4))
	center.add_child(content)
	center.add_child(U.expand())
	# Expand flags share excess width; cap by adjusting side spacers after layout.
	content.size_flags_horizontal = Control.SIZE_SHRINK_CENTER

func _topbar(title: String = "", back: bool = false) -> void:
	var h = U.row(10)
	content.add_child(h)
	if back:
		var b = U.icon_button("back", _go_back)
		h.add_child(b)
	else:
		var brand_mascot = _hero_art(38)
		brand_mascot.name = "BrandMascot"
		brand_mascot.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		brand_mascot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		h.add_child(brand_mascot)
	var title_label = U.label(title if not title.is_empty() else "SÖZCÜK\nZİNCİRİ", 20 if compact else 23, U.INK, true)
	title_label.clip_text = true
	title_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_label.add_theme_constant_override("line_spacing", -12)
	h.add_child(title_label)
	var coins = U.panel(Color("fff0be"), 14)
	coins.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var sb = U.box(Color("fff0be"), 14, Color("e8c66c"), 1)
	sb.content_margin_left = 10
	sb.content_margin_right = 12
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	coins.add_theme_stylebox_override("panel", sb)
	var cr = U.row(6)
	cr.add_child(U.icon("coin", 25))
	cr.add_child(U.label(str(state.gold), 20, U.INK, true))
	coins.add_child(cr)
	h.add_child(coins)
	if not back:
		var settings = U.icon_button("settings", _show_settings)
		h.add_child(settings)

func _show_loading() -> void:
	_clear("loading", 460)
	content.add_child(U.spacer(maxf(20, size.y * 0.18)))
	var logo = _hero_art(148)
	logo.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	content.add_child(logo)
	var l = _title("Sözcük Zinciri", 34)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	content.add_child(l)

func _show_profile() -> void:
	_clear("profile", 460)
	content.add_child(U.spacer(35))
	var art = _hero_art(180)
	content.add_child(art)
	content.add_child(U.badge("KELİME KULÜBÜNE HOŞ GELDİN", U.YELLOW))
	content.add_child(U.label("Sana ne diyelim?", 38, U.INK, true))
	content.add_child(U.paragraph("Bir isim seç, kelimelerin peşine düş.\nHesap açmana gerek yok.", 19, U.INK))
	profile_input = LineEdit.new()
	profile_input.name = "ProfileName"
	profile_input.placeholder_text = "Oyuncu adın"
	profile_input.max_length = 18
	profile_input.custom_minimum_size.y = 66
	profile_input.add_theme_font_override("font", U.body_font())
	profile_input.add_theme_font_size_override("font_size", 24)
	profile_input.add_theme_color_override("font_color", U.INK)
	profile_input.add_theme_stylebox_override("normal", U.box(U.PAPER, 15, U.INK, 2))
	profile_input.add_theme_stylebox_override("focus", U.box(U.PAPER, 15, U.TEAL, 3))
	profile_input.text_submitted.connect(func(_t): _accept_profile())
	content.add_child(profile_input)
	content.add_child(U.button("HADİ BAŞLAYALIM  →", U.ORANGE, _accept_profile))
	var bonus = U.row(8)
	bonus.add_child(U.icon("coin", 25))
	bonus.add_child(U.label("İlk 100 altının bizden!", 17, U.MUTED))
	content.add_child(bonus)
	keyboard_spacer = U.spacer()
	content.add_child(keyboard_spacer)

func _accept_profile() -> void:
	if state.set_profile(profile_input.text):
		_hide_keyboard()
		_start_tutorial()
	else:
		_toast("En az 2 harften oluşan bir isim yaz.")

func _hero_art(height: int) -> Control:
	var art = TextureRect.new()
	art.name = "EditorialMascot"
	art.texture = load("res://assets/mascot-editorial.png")
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	art.custom_minimum_size = Vector2(height, height)
	art.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return art

func _title(text: String, font_size: int = 36) -> Label:
	var l = U.paragraph(text, font_size, U.INK)
	l.add_theme_font_override("font", U.heading_font())
	return l

func _show_home() -> void:
	_clear("home")
	_topbar()
	var welcome = U.row()
	var greetings = U.column(2)
	greetings.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	greetings.add_child(_title("Merhaba, %s!" % state.profile_name, 25))
	greetings.add_child(U.paragraph("Bugün hangi kelimeye bağlanıyoruz?", 15 if compact else 18, U.MUTED))
	welcome.add_child(greetings)
	if not compact:
		welcome.add_child(U.badge("%d PUAN" % state.score, U.MINT))
	content.add_child(welcome)
	var hero = U.panel(U.MINT, 26, true)
	content.add_child(hero)
	var hero_layout = U.column(10) if compact else U.row(20)
	hero.add_child(hero_layout)
	var hero_text = U.column(12)
	hero_text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hero_layout.add_child(hero_text)
	var tag = U.row()
	tag.add_child(U.badge("HER KELİME BİR BAŞLANGIÇ", U.YELLOW))
	tag.add_child(U.expand())
	hero_text.add_child(tag)
	hero_text.add_child(_title("Bağlantıyı bul.\nZinciri tamamla!", 34 if compact else 50))
	hero_text.add_child(U.paragraph("Bir kelimeden diğerine, küçük bir\nbeyin jimnastiği. Hazırsan başlayalım.", 17, U.INK))
	if compact:
		var mini = U.row(10)
		var chain = U.column(6)
		chain.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		chain.add_child(U.spacer(4))
		chain.add_child(U.badge("ÇAY → K_____", Color("fff5da")))
		chain.add_child(U.label("Sıradaki kelime sende.", 14, U.INK))
		mini.add_child(chain)
		mini.add_child(_hero_art(85 if size.x < 380 else 112))
		hero_text.add_child(mini)
	else:
		hero_layout.add_child(_hero_art(260))
	var next = _next_level()
	var action = "MACERAYA BAŞLA  →" if state.completed.is_empty() else "MACERAYA DEVAM  →" if not next.is_empty() else "BÖLÜMLERE GÖZ AT  →"
	hero_text.add_child(U.button(action, U.ORANGE, func(): _start_level(next.id) if not next.is_empty() else _show_levels(), 62))
	var journey = U.panel(U.PAPER, 20)
	var j = U.column(10)
	journey.add_child(j)
	var jh = U.row()
	jh.add_child(U.icon("trophy", 26))
	jh.add_child(U.label("KELİME YOLCULUĞUN", 16, U.INK, true))
	jh.add_child(U.expand())
	jh.add_child(U.label("%d / %d" % [state.completed.size(), state.levels.size()], 16, U.MUTED, true))
	j.add_child(jh)
	j.add_child(U.progress(float(state.completed.size()) / maxf(1, state.levels.size()) * 100))
	var jtext = U.row()
	jtext.add_child(U.label("%d puan" % state.score, 15, U.MUTED))
	jtext.add_child(U.expand())
	var list_button = U.button("Bölümler  →", U.CREAM, _show_levels, 40)
	list_button.add_theme_font_size_override("font_size", 16)
	jtext.add_child(list_button)
	j.add_child(jtext)
	content.add_child(journey)
	content.add_child(U.label("OYUN ALANIN", 15, U.MUTED, true))
	var cards = U.column(14) if compact else U.row(18)
	content.add_child(cards)
	_mode_card(cards, "party", "Parti zamanı!", "Ekranı ortaya koy.\nZincirler açığa çıksın.", Color("ffe2c5"), "PARTİ MODU  →", func(): _show_party(true))
	_mode_card(cards, "chef", "Bir kategori seç", "Mutfak, spor, doğa...\nKendi rotanı çiz.", Color("e3def0"), "KEŞFET  →", _show_levels)
	_mode_card(cards, "lock", "Karşılıklı 1v1", "Oda koduyla kelime yarışı.\n30 saniyelik sıra ve sohbet.", Color("ece9e3"), "KELİME SAVAŞI  →", _show_online)
	var footer = U.row(8)
	footer.add_child(U.icon("spark", 20))
	footer.add_child(U.paragraph("Acele yok, süre yok. Sadece sen ve kelimeler.", 14, U.MUTED))
	content.add_child(footer)
	content.add_child(U.spacer(10))

func _mode_card(parent: Container, icon_name: String, title: String, desc: String, color: Color, action: String, callback: Callable) -> void:
	var p = U.panel(color, 20)
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(p)
	var v = U.column(10)
	p.add_child(v)
	var h = U.row(10)
	h.add_child(U.icon(icon_name, 36))
	h.add_child(U.label(title, 23 if compact else 21, U.INK, true))
	v.add_child(h)
	v.add_child(U.paragraph(desc, 16, U.INK))
	var button = U.button(action, U.PAPER, callback, 44)
	button.add_theme_font_size_override("font_size", 16)
	v.add_child(button)

func _categories() -> Array:
	var categories: Array = ["Tümü"]
	for level in state.levels:
		if not categories.has(level.category): categories.append(level.category)
	return categories

func _category_icon(category: String) -> String:
	match category:
		"Mutfak": return "chef"
		"Spor": return "ball"
		"Doğa": return "leaf"
		"Kültür": return "book"
	return "chain"

func _available(level: Dictionary) -> bool:
	var earlier = ""
	for item in state.levels:
		if item.category != level.category: continue
		if item.id == level.id: return earlier.is_empty() or state.completed.has(earlier) or state.completed.has(level.id)
		earlier = item.id
	return false

func _next_level() -> Dictionary:
	for level in state.levels:
		if not state.completed.has(level.id) and _available(level): return level
	return {}

func _show_levels() -> void:
	_clear("levels")
	_topbar("Bölümler", true)
	content.add_child(_title("Kendi rotanı çiz.", 34 if compact else 44))
	content.add_child(U.paragraph("Her kategorinin ilk bölümü açık. Zincirleri çöz, yenilerini keşfet.", 17))
	var tabs = HFlowContainer.new()
	tabs.add_theme_constant_override("h_separation", 9)
	tabs.add_theme_constant_override("v_separation", 12)
	content.add_child(tabs)
	for category in _categories():
		var tab = U.button(category, U.YELLOW if selected_category == category else U.PAPER, func(): selected_category = category; _show_levels(), 43)
		tab.add_theme_font_size_override("font_size", 16)
		tabs.add_child(tab)
	var grid = GridContainer.new()
	grid.columns = 1 if compact else 3
	grid.add_theme_constant_override("h_separation", 18)
	grid.add_theme_constant_override("v_separation", 18)
	content.add_child(grid)
	var num = 0
	for level in state.levels:
		if selected_category != "Tümü" and selected_category != level.category: continue
		num += 1
		var unlocked = _available(level)
		var done = state.completed.has(level.id)
		var p = U.panel(Color("e2f0e8") if done else U.PAPER if unlocked else Color("efece5"), 20)
		p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(p)
		var v = U.column(10)
		p.add_child(v)
		var h = U.row(8)
		h.add_child(U.icon(_category_icon(level.category), 28))
		h.add_child(U.label(level.category.to_upper(), 13, U.MUTED, true))
		h.add_child(U.expand())
		h.add_child(U.icon("check" if done else "lock" if not unlocked else "spark", 22))
		v.add_child(h)
		v.add_child(U.label(level.title, 23, U.INK, true))
		v.add_child(U.label("%d kelime · İlk kelime: %s" % [level.words.size(), level.words[0]], 15, U.MUTED))
		var b = U.button("TEKRAR OYNA" if done else "ZİNCİRİ ÇÖZ  →" if unlocked else "ÖNCEKİ BÖLÜMÜ TAMAMLA", U.MINT if done else U.YELLOW if unlocked else Color("e6e2da"), func(): _start_level(level.id), 45)
		b.add_theme_font_size_override("font_size", 14)
		b.disabled = not unlocked
		v.add_child(b)

func _start_tutorial() -> void:
	tutorial_replay = state.tutorial_done
	state.begin_level("tutorial")
	_show_game()

func _start_level(id: String) -> void:
	if state.begin_level(id):
		tutorial_replay = false
		_show_game()

func _show_game() -> void:
	_clear("game", 580)
	var level = state.current_level
	var tutorial = level.id == "tutorial"
	_topbar("Birlikte deneyelim" if tutorial else level.category, true)
	var heading = U.row(10)
	heading.add_child(U.badge("ALIŞTIRMA" if tutorial else "KELİME ZİNCİRİ", U.YELLOW))
	heading.add_child(U.expand())
	heading.add_child(U.label("%d / %d" % [state.active_index, level.words.size() - 1], 15, U.MUTED, true))
	content.add_child(heading)
	content.add_child(_title("İlk bağlantıyı kur." if tutorial and state.active_index == 1 else "Zinciri devam ettir!", 30))
	content.add_child(U.progress(float(state.active_index - 1) / (level.words.size() - 1) * 100, U.TEAL, 8))
	if tutorial:
		var tip = U.panel(Color("fff0c9"), 16)
		var tips = ["", "Çay kaşığı! K hazır; AŞIĞI yaz. Doğru cevap KAŞIĞI, kısa bir dönüşümle KAŞIK olacak.", "Şimdi kaşık oyunu. O hazır; YUNU yaz. OYUNU, sonraki bağlantı için OYUN olacak.", "Son bağlantı: oyun havası. H hazır; AVASI yaz. HAVASI → HAVA ve zincir tamam!"]
		var guide = U.row(12)
		if state.active_index == 1:
			var mascot = _hero_art(64)
			mascot.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
			guide.add_child(mascot)
		guide.add_child(U.paragraph(tips[mini(state.active_index, tips.size() - 1)], 17, U.INK))
		tip.add_child(guide)
		content.add_child(tip)
	else:
		var guide = U.row(12)
		var mascot = _hero_art(50)
		mascot.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		guide.add_child(mascot)
		guide.add_child(U.paragraph("Tamlamayı tamamlayan kelimeyi ekiyle yaz. Doğru cevap, sıradaki bağlantı için köküne dönüşür.", 16))
		content.add_child(guide)
	var chain = U.column(9)
	content.add_child(chain)
	for i in level.words.size():
		if i > 0:
			var connector = U.row(8)
			connector.add_child(U.icon("chain", 18))
			var masked = state.answer_word(i).substr(0, 1) + " ·".repeat(maxi(0, state.answer_word(i).length() - 1))
			var link_text = str(level.links[i - 1]) if i < state.active_index else "%s + %s" % [state.stem_word(i - 1), masked] if i == state.active_index else ""
			var link_label = U.paragraph(link_text, 13, U.TEAL if i < state.active_index else U.MUTED)
			connector.add_child(link_label)
			if i == state.active_index: active_link = link_label
			chain.add_child(connector)
		var row = WordRow.new()
		row.word = state.stem_word(i) if i < state.active_index else state.answer_word(i)
		row.ordinal = i + 1
		row.mode = "solved" if i < state.active_index else "active" if i == state.active_index else "locked"
		row.known = state.visible_letters(i)
		if i == state.active_index:
			active_group = U.column(12)
			chain.add_child(active_group)
			active_group.add_child(row)
			active_row = row
			row.submitted.connect(_submit)
			row.input_focused.connect(func(): _scroll_active.call_deferred())
		else:
			chain.add_child(row)
	feedback = U.paragraph("Yalnızca eksik harfleri yaz; tamlamanın eki de cevaba dahil.", 15, U.MUTED)
	active_group.add_child(feedback)
	active_group.add_child(U.button("KONTROL ET  ✓", U.ORANGE, func(): _submit(active_row.guess()), 56))
	var jokers = U.row(12)
	active_group.add_child(jokers)
	var letter = U.button("Harf al · 20", U.YELLOW, _reveal, 52)
	letter.add_theme_font_size_override("font_size", 18)
	letter.icon = load("res://assets/icons/spark.svg")
	letter.expand_icon = true
	letter.add_theme_constant_override("icon_max_width", 24)
	letter.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	letter.disabled = tutorial
	jokers.add_child(letter)
	var hint = U.button("İpucu · 15", U.MINT, _hint, 52)
	hint.add_theme_font_size_override("font_size", 18)
	hint.icon = load("res://assets/icons/bulb.svg")
	hint.expand_icon = true
	hint.add_theme_constant_override("icon_max_width", 24)
	hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hint.disabled = tutorial
	jokers.add_child(hint)
	if not tutorial:
		var hint_text = state.current_definition() if bool(state.hint_used.get(str(state.active_index), false)) else ""
		if not hint_text.is_empty():
			var hp = U.panel(Color("fff0c9"), 14)
			hp.add_child(U.paragraph(hint_text, 17, U.INK))
			active_group.add_child(hp)
		content.add_child(U.label("Bölüm ödülü: 40 altın + 100 puan", 14, U.MUTED))
	keyboard_spacer = U.spacer(12)
	content.add_child(keyboard_spacer)
	_update_keyboard()
	if state.active_index > 1: _scroll_active.call_deferred()

func _submit(guess: String) -> void:
	if screen != "game" or transition_busy: return
	var result = state.submit_guess(guess)
	if result.get("ok", false):
		transition_busy = true
		transition_result = result.duplicate()
		var token = transition_token
		var solved_row = active_row
		_hide_keyboard()
		_disable_group_inputs(active_group)
		solved_row.show_correct_answer(str(result.word))
		if is_instance_valid(active_link):
			active_link.text = str(state.current_level.links[int(result.solved_index) - 1])
			active_link.add_theme_color_override("font_color", U.TEAL)
		feedback.text = "%s  →  %s\nBağlantı tamam; kelime sıradaki halkaya hazırlanıyor." % [result.word, result.stem]
		feedback.add_theme_color_override("font_color", U.TEAL)
		sound.play("win" if result.get("complete", false) else "good")
		if bool(state.settings.get("haptics", true)) and OS.has_feature("android"):
			Input.vibrate_handheld(35)
		solved_row.animate_to_stem(str(result.stem), bool(state.settings.get("reduced_motion", false)))
		await get_tree().create_timer(WORD_TRANSITION_SECONDS).timeout
		if token != transition_token or screen != "game" or not is_instance_valid(solved_row): return
		transition_busy = false
		if result.get("complete", false):
			_show_win(result)
		else:
			_show_game()
			_toast("Bağlantı tamam! %s" % state.current_level.links[state.active_index - 2], true)
	else:
		sound.play("bad")
		feedback.text = "Bu bağlantı olmadı. Bir daha dene; altının azalmaz."
		feedback.add_theme_color_override("font_color", Color("bc5542"))
		if is_instance_valid(active_row):
			var tw = create_tween()
			tw.tween_property(active_row, "modulate", Color("ffd0bb"), 0.12)
			tw.tween_property(active_row, "modulate", Color.WHITE, 0.18)

func _disable_group_inputs(node: Node) -> void:
	if not is_instance_valid(node): return
	if node is Button: node.disabled = true
	for child in node.get_children():
		_disable_group_inputs(child)

func _cancel_word_transition() -> void:
	transition_token += 1
	transition_busy = false
	transition_result.clear()
	if is_instance_valid(active_row):
		active_row.cancel_animation()

func _finish_transition_immediately() -> void:
	if not transition_busy: return
	var result = transition_result.duplicate()
	_cancel_word_transition()
	if screen != "game": return
	if result.get("complete", false): _show_win(result)
	else: _show_game()

func _reveal() -> void:
	if screen != "game" or transition_busy: return
	var typed = active_row.typed_by_position() if is_instance_valid(active_row) else {}
	var result = state.reveal_letter()
	if result.get("ok", false):
		sound.play("tap")
		_show_game()
		active_row.restore_typed(typed)
		_toast("Bir harf açıldı. Bağlantı sana kaldı!", true)
	else:
		_toast("Bu kelimede açılacak başka harf kalmadı." if result.get("reason") != "insufficient_gold" else "Harf almak için 20 altın gerekiyor.")

func _hint() -> void:
	if screen != "game" or transition_busy: return
	var typed = active_row.typed_by_position() if is_instance_valid(active_row) else {}
	var result = state.buy_hint()
	if result.get("ok", false):
		sound.play("tap")
		_show_game()
		active_row.restore_typed(typed)
		_toast(str(result.get("text", "İpucun açıldı.")), true)
	else:
		_toast("İpucu için 15 altın gerekiyor.")

func _show_win(result: Dictionary) -> void:
	_clear("win", 520)
	var tutorial = state.current_level.id == "tutorial"
	content.add_child(U.spacer(20))
	var trophy = _hero_art(104)
	trophy.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	content.add_child(trophy)
	var badge = U.badge("BAĞLANTILAR TAMAM!", U.YELLOW)
	badge.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	content.add_child(badge)
	var title = _title("İşte bu, zincir sende!", 35)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	content.add_child(title)
	content.add_child(U.paragraph("Artık hazırsın! Her kelime bir sonrakinin anahtarı. Kendi kelime yolculuğuna başlayabilirsin." if tutorial else "Bir bağlantı daha keşfettin. Kelime yolculuğun büyümeye devam ediyor.", 18, U.INK))
	var summary = U.panel(U.MINT, 22)
	var sv = U.column(8)
	summary.add_child(sv)
	for i in state.current_level.words.size():
		sv.add_child(U.label(str(state.current_level.words[i]), 25, U.INK, true))
		if i < state.current_level.links.size():
			sv.add_child(U.label("↳ " + str(state.current_level.links[i]), 15, U.TEAL))
	content.add_child(summary)
	if not tutorial:
		var reward = U.row(12)
		reward.add_child(U.icon("coin", 32))
		reward.add_child(U.label("+%d altın" % result.get("reward_gold", 0), 25, U.INK, true))
		reward.add_child(U.expand())
		reward.add_child(U.label("+%d puan" % result.get("reward_score", 0), 23, U.TEAL, true))
		content.add_child(reward)
		if result.get("reward_gold", 0) == 0:
			content.add_child(U.paragraph("Bu bölümün ödülünü daha önce aldın. Yeni ödüller için yeni zincirleri çöz.", 15))
	var next = _next_level()
	if tutorial:
		content.add_child(U.button("ANA MENÜYE  →", U.ORANGE, _show_home))
	elif not next.is_empty():
		content.add_child(U.button("SIRADAKİ ZİNCİR  →", U.ORANGE, func(): _start_level(next.id)))
	if tutorial and not next.is_empty():
		content.add_child(U.button("İLK ZİNCİRİ ÇÖZ", U.PAPER, func(): _start_level(next.id)))
	elif not tutorial:
		content.add_child(U.button("BÖLÜMLERE DÖN", U.PAPER, _show_levels))

func _show_party(new_chain: bool = true) -> void:
	if new_chain or party_level.is_empty():
		var choices = state.levels.filter(func(l): return l.id != party_level.get("id", ""))
		party_level = choices.pick_random() if not choices.is_empty() else state.levels[0]
		party_count += 1
	_clear("party", 620)
	_topbar("Parti zamanı!", true)
	var h = U.row()
	h.add_child(U.badge("HEP BİRLİKTE OYNAYIN", U.YELLOW))
	h.add_child(U.expand())
	h.add_child(U.label("Zincir %02d" % party_count, 15, U.MUTED))
	content.add_child(h)
	content.add_child(_title("Kelimeler masada.", 35))
	content.add_child(U.paragraph("Sırayla bir kelime söyleyin, bağlantısını açıklayın. Yeni bir tur için zincire dokunun.", 17, U.INK))
	var card = U.panel(Color("ffe6ce"), 24, true)
	content.add_child(card)
	var v = U.column(13)
	card.add_child(v)
	v.add_child(U.label(party_level.category.to_upper(), 14, U.MUTED, true))
	for i in party_level.words.size():
		var word = U.button(str(party_level.words[i]), U.PAPER, func(): _show_party(true), 62)
		word.add_theme_font_size_override("font_size", 30)
		v.add_child(word)
		if i < party_level.links.size():
			var link = U.label("↓  " + str(party_level.links[i]), 16, U.INK)
			link.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			v.add_child(link)
	content.add_child(U.button("YENİ ZİNCİR  ↻", U.ORANGE, func(): sound.play("tap"); _show_party(true)))
	content.add_child(U.paragraph("Parti modunda altın harcanmaz, ilerlemen değişmez. Telefonu arkadaşlarınla paylaşman yeterli.", 14))

func _show_online() -> void:
	_clear("online", 640)
	online_view = load("res://scripts/online_screen.gd").new()
	online_view.setup(state.profile_name)
	content.add_child(online_view)
	online_view.return_home.connect(_show_home)
	keyboard_spacer = U.spacer(12)
	content.add_child(keyboard_spacer)

func _show_settings() -> void:
	_clear("settings", 580)
	_topbar("Oyuncu kartın", true)
	var card = U.panel(U.MINT, 22, true)
	var cv = U.column(8)
	card.add_child(cv)
	cv.add_child(_title(state.profile_name, 34))
	cv.add_child(U.label("%d bölüm · %d puan" % [state.completed.size(), state.score], 18, U.INK))
	content.add_child(card)
	content.add_child(U.label("OYUN AYARLARI", 15, U.MUTED, true))
	content.add_child(U.button("Sesler: " + ("AÇIK" if sound.enabled else "KAPALI"), U.PAPER, func(): state.settings.sound = not sound.enabled; sound.enabled = state.settings.sound; state.save_game(); _show_settings(), 55))
	content.add_child(U.button("Titreşim: " + ("AÇIK" if state.settings.get("haptics", true) else "KAPALI"), U.PAPER, func(): state.settings.haptics = not state.settings.get("haptics", true); state.save_game(); _show_settings(), 55))
	content.add_child(U.button("ÖĞRETİCİYİ TEKRAR OYNA", U.YELLOW, _start_tutorial, 55))
	content.add_child(U.paragraph("İlerleme bu cihazda otomatik kaydedilir. Web sürümünde aynı tarayıcı ve adresle devam edebilirsin. Gizli sekmede kayıt kalıcı olmayabilir.", 16))
	var about = U.panel(U.PAPER, 18)
	about.add_child(U.paragraph("NASIL OYNANIR?\n\nİlk kelime açık. Sonraki kelimenin ilk harfi ve uzunluğu hazır. Kutulara dokun, tamlamayı tamamlayan kelimeyi ekiyle yaz ve kontrol et. Örneğin ÇAY → KAŞIĞI; doğru cevap kısa bir animasyonla KAŞIK olur. Sonra KAŞIK → OYUNU ile devam edersin.\n\nHarf: 20 altın · Tanım ipucu: 15 altın\nYeni bölüm: +40 altın · +100 puan\n\nSözcük Zinciri · Türkçe · v1.5", 16, U.INK))
	content.add_child(about)

func _toast(message: String, success: bool = false) -> void:
	_clear_toasts()
	var wrap = MarginContainer.new()
	wrap.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	wrap.offset_left = 24
	wrap.offset_right = -24
	wrap.offset_top = 16
	wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	toast_layer.add_child(wrap)
	var panel = U.panel(U.MINT if success else Color("fff0c9"), 15, true)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	wrap.add_child(panel)
	var l = U.paragraph(message, 17, U.INK)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	panel.add_child(l)
	toast_tween = create_tween()
	toast_tween.tween_interval(2.8)
	toast_tween.tween_property(wrap, "modulate:a", 0.0, 0.25)
	toast_tween.tween_callback(wrap.queue_free)

func _clear_toasts() -> void:
	if toast_tween and toast_tween.is_valid(): toast_tween.kill()
	toast_tween = null
	if not is_instance_valid(toast_layer): return
	for child in toast_layer.get_children():
		toast_layer.remove_child(child)
		child.queue_free()

func _hide_keyboard() -> void:
	var focused = get_viewport().gui_get_focus_owner()
	if focused: focused.release_focus()
	DisplayServer.virtual_keyboard_hide()

func _update_keyboard() -> void:
	var height = 0
	if OS.has_feature("android") or OS.has_feature("ios"):
		height = DisplayServer.virtual_keyboard_get_height()
		var scale_factor = get_viewport().get_screen_transform().get_scale().y
		height = int(height / maxf(0.1, scale_factor))
	# The web shell resizes the canvas to visualViewport; no guessed keyboard height.
	if is_instance_valid(keyboard_spacer):
		keyboard_spacer.custom_minimum_size.y = height + 12
	if height != last_keyboard:
		last_keyboard = height
		_scroll_active.call_deferred()

func _scroll_active() -> void:
	if screen == "online" and is_instance_valid(online_view) and is_instance_valid(scroll):
		var target = online_view.focus_control()
		if is_instance_valid(target): scroll.ensure_control_visible(target)
	elif is_instance_valid(active_row) and is_instance_valid(scroll):
		scroll.ensure_control_visible(active_group if is_instance_valid(active_group) and active_group.size.y < scroll.size.y else active_row)
	elif is_instance_valid(profile_input) and screen == "profile" and is_instance_valid(scroll):
		scroll.ensure_control_visible(profile_input)
