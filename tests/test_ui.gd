extends SceneTree

const State = preload("res://scripts/game_state.gd")
const MainScene = preload("res://scenes/main.tscn")
const UI = preload("res://scripts/ui.gd")
const OnlineClient = preload("res://scripts/online_client.gd")
const TEST_PATH = "user://zincir_ui_test.json"
const ONLINE_TEST_CONFIG = "user://zincir_ui_online_disabled.json"
var checks = 0
var failures = 0
var app: Control

func _initialize() -> void:
	_run.call_deferred()

func check(condition: bool, description: String) -> void:
	checks += 1
	if not condition:
		failures += 1
		push_error(description)

func clean_files() -> void:
	if FileAccess.file_exists(ONLINE_TEST_CONFIG): DirAccess.remove_absolute(ProjectSettings.globalize_path(ONLINE_TEST_CONFIG))
	for suffix in ["", ".tmp", ".bak"]:
		var path = TEST_PATH + suffix
		if FileAccess.file_exists(path):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(path))

func settle() -> void:
	for i in 4:
		await process_frame

func enter_guess(text: String) -> void:
	submit_now(text)
	await finish_transition()

func submit_now(text: String) -> void:
	app.active_row.edit.text = text
	app.active_row.edit.text_changed.emit(text)
	app.active_row.edit.text_submitted.emit(text)

func finish_transition() -> void:
	var deadline = Time.get_ticks_msec() + 1800
	while app.transition_busy and Time.get_ticks_msec() < deadline:
		await process_frame
	check(not app.transition_busy, "Correct-word transition should finish within its short time budget.")
	await settle()

func all_buttons(node: Node) -> Array[Button]:
	var result: Array[Button] = []
	if node is Button:
		result.append(node)
	for child in node.get_children():
		result.append_array(all_buttons(child))
	return result

func find_button(prefix: String) -> Button:
	for button in all_buttons(app.stage):
		if button.text.begins_with(prefix):
			return button
	return null

func check_layout(label: String) -> void:
	var min_width = app.content.get_combined_minimum_size().x
	var available = app.scroll.size.x
	var rect = app.content.get_global_rect()
	check(rect.position.x >= -1 and rect.end.x <= app.size.x + 1, "%s horizontal overflow: content rect %s exceeds viewport %s (minimum %.1f, scroll %.1f)" % [label, rect, app.size, min_width, available])

func click_word_input() -> void:
	app.scroll.ensure_control_visible(app.active_row.edit)
	await settle()
	var position = app.active_row.edit.get_global_rect().get_center()
	var motion = InputEventMouseMotion.new()
	motion.position = position
	motion.global_position = position
	Input.parse_input_event(motion)
	for pressed in [true, false]:
		var event = InputEventMouseButton.new()
		event.button_index = MOUSE_BUTTON_LEFT
		event.position = position
		event.global_position = position
		event.pressed = pressed
		Input.parse_input_event(event)
		await process_frame
	await settle()

func _run() -> void:
	clean_files()
	var online_config = FileAccess.open(ONLINE_TEST_CONFIG, FileAccess.WRITE)
	online_config.store_string(JSON.stringify({"baseUrl": ""}))
	online_config.close()
	OnlineClient.config_override_for_tests = ONLINE_TEST_CONFIG
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_size = Vector2i.ZERO
	root.size = Vector2i(390, 844)
	app = MainScene.instantiate()
	app.state = State.new(TEST_PATH, false)
	root.add_child(app)
	check(app.screen == "loading", "Initial layout may show a static loading screen without holding an intro.")
	var loading_art = app.stage.find_child("EditorialMascot", true, false)
	check(is_instance_valid(loading_art) and loading_art is TextureRect, "The initial screen should use one static editorial mascot texture.")
	check(get_processed_tweens().is_empty(), "The intro should not start movement, entrance or fake progress tweens.")
	check(app.stage.find_children("*", "Timer", true, false).is_empty(), "The static intro should not create a running-frame timer.")
	await settle()
	check(app.screen == "profile", "Profile should open as soon as initial controls are ready, without an intro delay.")
	var expected_palette = {"INK": "29364f", "MUTED": "78808c", "CREAM": "fff8ee", "PAPER": "ffffff", "ORANGE": "fb7852", "YELLOW": "ffca51", "TEAL": "2ba99e", "MINT": "d9eee7", "PURPLE": "8370b6", "LINE": "e5ded2"}
	var palette_script: Script = load("res://scripts/ui.gd")
	for token in expected_palette:
		check(palette_script.get_script_constant_map()[token] == Color(expected_palette[token]), "Native palette %s should match the original v3 color." % token)
	var mascot = app._hero_art(96)
	check(mascot.texture.resource_path == "res://assets/mascot-editorial.png", "Every native mascot context should use the new static newspaper character.")
	mascot.free()
	check_layout("390 profile")
	app.profile_input.text = " "
	app._accept_profile()
	check(app.screen == "profile", "Empty profile should remain on profile screen.")
	app.profile_input.text = "Gökçen"
	app._accept_profile()
	await settle()
	check(app.screen == "game" and app.state.current_level.id == "tutorial", "Accepting name should start tutorial.")
	check(app.state.profile_name == "Gökçen", "UI should save Turkish profile name.")
	check_layout("390 tutorial")
	check(app.active_row.word == "KAŞIĞI" and app.active_row.cells.size() == 6, "Tutorial should request the six-letter inflected answer KAŞIĞI.")
	var initial_gold = app.state.gold
	await enter_guess("yanlış")
	check(app.state.active_index == 1 and app.state.gold == initial_gold, "Wrong tutorial guess must not advance or spend gold.")
	await enter_guess("aşık")
	check(app.state.active_index == 1 and not app.transition_busy, "The bare stem KAŞIK must not solve the requested inflected answer.")
	submit_now("aşığı")
	check(app.transition_busy and app.active_row.word == "KAŞIĞI" and not app.active_row.edit.editable, "A correct answer should remain visible and lock input during its transition.")
	check(app.active_link.text == "Çay kaşığı", "A correct answer should display the natural linked phrase above its animated row.")
	check(app.state.active_index == 2 and app.state.gold == initial_gold, "Correct answer should commit once before presentation animation.")
	app._submit("OYUNU")
	app._reveal()
	app._hint()
	check(app.state.active_index == 2 and app.state.gold == initial_gold, "Double-submit and jokers during transition must not advance or spend gold.")
	await create_timer(0.50).timeout
	check(app.transition_busy and app.active_row.word == "KAŞIK" and app.active_row.cells.size() == 5, "The short animation should transform KAŞIĞI into the five-letter stem KAŞIK.")
	await finish_transition()
	check(app.active_row.word == "OYUNU" and app.active_row.cells.size() == 5, "Next answer should use the inflected form OYUNU.")
	await enter_guess("yunu")
	await enter_guess("avası")
	check(app.screen == "win" and app.state.tutorial_done, "Tutorial should finish through cell inputs.")
	check(app.state.gold == 100 and app.state.score == 0, "Tutorial should preserve start gold without normal reward.")
	find_button("ANA MENÜYE").pressed.emit()
	await settle()
	check(app.screen == "home", "Tutorial completion button should enter home.")
	var brand_mascot = app.stage.find_child("BrandMascot", true, false)
	check(is_instance_valid(brand_mascot) and brand_mascot.texture.resource_path == "res://assets/mascot-editorial.png", "The main topbar brand should use the same static newspaper mascot.")
	check_layout("390 home")
	app._show_levels()
	await settle()
	check_layout("390 levels")
	var unlocked = 0
	for level in app.state.levels:
		if app._available(level):
			unlocked += 1
	check(unlocked == app._categories().size() - 1, "Each category should initially expose exactly its first level.")
	app._start_level("mutfak_01")
	await settle()
	check(app.screen == "game" and app.state.current_level.id == "mutfak_01", "Normal level should start.")
	var game_mascot = app.stage.find_child("EditorialMascot", true, false)
	check(is_instance_valid(game_mascot) and game_mascot.texture.resource_path == "res://assets/mascot-editorial.png", "Normal game guidance should include the same small static editorial mascot.")
	var before = app.state.gold
	var partial = app.state.current_word().substr(1, 2)
	app.active_row.edit.text = partial
	app.active_row.edit.text_changed.emit(partial)
	app._hint()
	await settle()
	check(app.state.gold == before - 15 and app.state.hint_used.get("1", false), "UI hint should spend once and remember definition.")
	check(app.active_row.edit.text == partial and app.active_row.cells[1].text == partial[0] and app.active_row.cells[2].text == partial[1], "Buying a hint must preserve partial text and its displayed letter positions.")
	app._hint()
	await settle()
	check(app.state.gold == before - 15, "Second UI hint should be free.")
	app._reveal()
	await settle()
	check(app.state.gold == before - 35, "UI letter reveal should charge 20 gold.")
	var target = app.state.current_word()
	var shown = app.state.visible_letters()
	check(app.active_row.cells[1].text == target[1] and app.active_row.cells[2].text == target[2], "Revealing a random letter must preserve previously typed letters in their original positions.")
	var expected_draft = ""
	for i in range(1, 3):
		if shown[i].is_empty():
			expected_draft += target[i]
	check(app.active_row.edit.text == expected_draft, "Revealed characters should leave the editable draft while remaining typed letters are preserved.")
	var hidden = ""
	for i in target.length():
		if shown[i].is_empty():
			hidden += target[i]
	await enter_guess(hidden.replace("I", "ı").replace("İ", "i").to_lower())
	check(app.state.active_index == 2, "After joker, only hidden letters entered in cells should solve word.")
	while app.screen == "game":
		if app.state.active_index == app.state.current_level.words.size() - 1:
			submit_now(app.state.current_word())
			var awarded_gold = app.state.gold
			var awarded_score = app.state.score
			app._submit(app.state.current_word())
			check(app.state.gold == awarded_gold and app.state.score == awarded_score, "Double-submit on the final animated answer must not duplicate rewards.")
			await finish_transition()
		else:
			await enter_guess(app.state.current_word())
	check(app.screen == "win" and "mutfak_01" in app.state.completed, "Finishing all words should show win and mark completion.")
	check(app.state.gold == 105 and app.state.score == 100, "Normal UI completion should give exactly 40 gold and 100 score.")
	app._start_level("mutfak_01")
	await settle()
	while app.screen == "game":
		await enter_guess(app.state.current_word())
	check(app.state.gold == 105 and app.state.score == 100, "Replaying via UI should not duplicate rewards.")
	app._start_level("mutfak_01")
	await settle()
	submit_now(app.state.current_word())
	app._show_home()
	check(not app.transition_busy and app.screen == "home", "Navigation should cancel only the transient word animation.")
	check(app.toast_layer.get_child_count() == 0, "Navigation should clear transient feedback from the previous chain.")
	await create_timer(0.9).timeout
	check(app.screen == "home", "A cancelled animation must not reopen the game after navigation.")
	app._start_level("mutfak_01")
	await settle()
	submit_now(app.state.current_word())
	var committed_index = app.state.active_index
	app._notification(Node.NOTIFICATION_APPLICATION_PAUSED)
	check(not app.transition_busy and app.screen == "game" and app.active_row.word == app.state.current_word(), "Pausing should settle a committed answer into the next editable row.")
	await create_timer(0.9).timeout
	check(app.state.active_index == committed_index, "Resuming after a cancelled transition must not submit the next answer.")
	app._show_party(true)
	await settle()
	var old_party_id = app.party_level.id
	find_button("YENİ ZİNCİR").pressed.emit()
	await settle()
	check(app.party_level.id != old_party_id, "Party next-chain button should avoid immediate repeat.")
	check(app.state.gold == 105 and app.state.score == 100, "Party mode must preserve progression economy.")
	for viewport_size in [Vector2i(320, 568), Vector2i(360, 640), Vector2i(390, 844), Vector2i(480, 900), Vector2i(900, 900), Vector2i(1440, 900)]:
		root.size = viewport_size
		await settle()
		for method in ["_show_profile", "_show_home", "_show_levels", "_show_settings", "_show_online", "_show_party"]:
			app.call(method)
			await settle()
			check_layout("%s %s" % [viewport_size, method])
		app._start_level("mutfak_01")
		await settle()
		check_layout("%s normal game" % viewport_size)
	root.size = Vector2i(320, 568)
	await settle()
	for level in app.state.levels:
		app.state.begin_level(level.id)
		for i in range(1, level.words.size()):
			app.state.active_index = i
			app._show_game()
			await settle()
			check_layout("320 inflected %s answer %s" % [level.id, app.state.current_word()])
			check(app.active_row.word == app.state.answer_word(i) and app.active_row.cells.size() == app.state.answer_word(i).length(), "Every active row should expose the inflected answer's exact tile count.")
	app.state.profile_name = "Abcdefghijklmnopqr"
	app._show_home()
	await settle()
	check_layout("320 longest profile name home")
	app._start_level("mutfak_01")
	await settle()
	await click_word_input()
	check(app.active_row.edit.has_focus(), "Clicking the letter tiles should focus their native LineEdit directly.")
	var entry_rect = app.active_row.edit.get_global_rect()
	var visible_rect = app.scroll.get_global_rect()
	check(visible_rect.encloses(entry_rect), "320x568 focused word input should scroll fully into view.")
	root.size = Vector2i(320, 300)
	await create_timer(0.35).timeout
	await settle()
	app._scroll_active()
	await settle()
	entry_rect = app.active_row.edit.get_global_rect()
	visible_rect = app.scroll.get_global_rect()
	check(visible_rect.encloses(entry_rect), "After viewport shrinks for keyboard, focused input should remain fully visible.")
	for level in app.state.levels:
		if not app.state.completed.has(level.id):
			app.state.completed.append(level.id)
	app._start_tutorial()
	await settle()
	while app.screen == "game":
		await enter_guess(app.state.current_word())
	var secondary = find_button("İLK ZİNCİRİ")
	if secondary:
		secondary.pressed.emit()
		await settle()
		check(app.screen != "win", "After campaign completion, tutorial secondary button should navigate without empty next level access.")
	else:
		find_button("ANA MENÜYE").pressed.emit()
		await settle()
		check(app.screen == "home", "After campaign completion, tutorial replay should still return to home.")
	app.queue_free()
	await settle()
	clean_files()
	print("Zincir UI integration: %d checks, %d failures." % [checks, failures])
	quit(1 if failures else 0)
