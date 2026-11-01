extends SceneTree

const State = preload("res://scripts/game_state.gd")
const MainScene = preload("res://scenes/main.tscn")
const TEST_PATH = "user://zincir_ui_test.json"
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
	for suffix in ["", ".tmp", ".bak"]:
		var path = TEST_PATH + suffix
		if FileAccess.file_exists(path):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(path))

func settle() -> void:
	for i in 4:
		await process_frame

func enter_guess(text: String) -> void:
	app.active_row.edit.text = text
	app.active_row.edit.text_changed.emit(text)
	app.active_row.edit.text_submitted.emit(text)
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
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_size = Vector2i.ZERO
	root.size = Vector2i(390, 844)
	app = MainScene.instantiate()
	app.state = State.new(TEST_PATH, false)
	root.add_child(app)
	await create_timer(1.3).timeout
	await settle()
	check(app.screen == "profile", "Fresh session should open profile after loading.")
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
	var initial_gold = app.state.gold
	await enter_guess("yanlış")
	check(app.state.active_index == 1 and app.state.gold == initial_gold, "Wrong tutorial guess must not advance or spend gold.")
	await enter_guess("aşık")
	check(app.state.active_index == 2, "Typing tutorial suffix into cells should advance word.")
	await enter_guess("yun")
	await enter_guess("ava")
	check(app.screen == "win" and app.state.tutorial_done, "Tutorial should finish through cell inputs.")
	check(app.state.gold == 100 and app.state.score == 0, "Tutorial should preserve start gold without normal reward.")
	find_button("ANA MENÜYE").pressed.emit()
	await settle()
	check(app.screen == "home", "Tutorial completion button should enter home.")
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
	await enter_guess(hidden.to_lower())
	check(app.state.active_index == 2, "After joker, only hidden letters entered in cells should solve word.")
	while app.screen == "game":
		await enter_guess(app.state.current_word())
	check(app.screen == "win" and "mutfak_01" in app.state.completed, "Finishing all words should show win and mark completion.")
	check(app.state.gold == 105 and app.state.score == 100, "Normal UI completion should give exactly 40 gold and 100 score.")
	app._start_level("mutfak_01")
	await settle()
	while app.screen == "game":
		await enter_guess(app.state.current_word())
	check(app.state.gold == 105 and app.state.score == 100, "Replaying via UI should not duplicate rewards.")
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
