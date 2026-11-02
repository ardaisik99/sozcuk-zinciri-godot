extends SceneTree

const State = preload("res://scripts/game_state.gd")
const MainScene = preload("res://scenes/main.tscn")
const UI = preload("res://scripts/ui.gd")
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

func contrast(a: Color, b: Color) -> float:
	var la = a.srgb_to_linear().get_luminance()
	var lb = b.srgb_to_linear().get_luminance()
	return (maxf(la, lb) + 0.05) / (minf(la, lb) + 0.05)

func _run() -> void:
	clean_files()
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_size = Vector2i.ZERO
	root.size = Vector2i(390, 844)
	app = MainScene.instantiate()
	app.state = State.new(TEST_PATH, false)
	root.add_child(app)
	var runner = app.loading_runner
	var runner_ref = weakref(runner)
	check(app.screen == "loading" and is_instance_valid(runner), "Startup should create the loading-only mascot runner.")
	check(runner.atlas_texture is AtlasTexture and runner.frame_rects.size() == 8, "Runner should use eight atlas frames from one shared texture.")
	check(is_equal_approx(runner.frame_timer.wait_time, 0.1), "Loading runner should tick at ten FPS rather than processing per-frame animation.")
	var regions = {}
	var pixels = {}
	var atlas_image = runner.atlas_texture.atlas.get_image()
	for rect: Rect2 in runner.frame_rects:
		regions[str(rect)] = true
		var image = atlas_image.get_region(Rect2i(rect))
		pixels[image.get_data().hex_encode().sha256_text()] = true
	check(regions.size() == 8 and pixels.size() == 8, "All eight running frames should have distinct regions and distinct pixel content.")
	await create_timer(0.21).timeout
	check(runner.frame_index > 0 and runner.playing, "Visible loading runner should advance actual atlas frames.")
	runner.set_app_paused(true)
	var paused_frame = runner.frame_index
	await create_timer(0.14).timeout
	check(runner.frame_index == paused_frame and runner.frame_timer.is_stopped(), "Loading runner should stop timer work while application is paused.")
	runner.set_app_paused(false)
	await create_timer(0.12).timeout
	check(runner.frame_index != paused_frame and runner.playing, "Visible loading runner should resume after the app resumes.")
	runner.hide()
	var hidden_frame = runner.frame_index
	await create_timer(0.12).timeout
	check(runner.frame_index == hidden_frame and not runner.playing, "Hidden runner should not continue advancing off screen.")
	runner.show()
	check(runner.playing, "Showing an active loading runner should restart its timer.")
	await create_timer(1.3).timeout
	await settle()
	check(app.loading_runner == null and runner_ref.get_ref() == null, "Leaving loading should free the runner and its timer completely.")
	check(UI.ORANGE == Color("ff6538") and UI.TEAL == Color("12b7b0") and UI.CREAM == Color("fff2d5"), "Native UI should use the brighter warm orange/turquoise palette.")
	for surface in [UI.CREAM, UI.ORANGE, UI.YELLOW, UI.TEAL, UI.MINT, UI.HERO, UI.SOLVED, UI.LILAC, UI.APRICOT]:
		check(contrast(UI.INK, surface) >= 4.5, "Bright surfaces should preserve readable dark text contrast.")
	check(contrast(UI.TEAL_INK, UI.MINT) >= 4.5 and contrast(UI.MUTED, UI.CREAM) >= 4.5, "Small colored and muted text should stay readable on warm and mint surfaces.")
	check(app.screen == "profile", "Fresh session should open profile after loading.")
	var mascot = app._hero_art(96)
	check(mascot.texture.resource_path == "res://assets/mascot.png", "Native hero art should load the new mascot PNG rather than the old letter tiles.")
	mascot.free()
	for pose in ["think", "cheer"]:
		var pose_art = app._hero_art(96, pose)
		check(pose_art.texture.resource_path == "res://assets/mascot-%s.png" % pose, "Each mascot context should resolve its own optimized pose texture.")
		pose_art.free()
	check_layout("390 profile")
	app.profile_input.text = " "
	app._accept_profile()
	check(app.screen == "profile", "Empty profile should remain on profile screen.")
	app.profile_input.text = "Gökçen"
	app._accept_profile()
	await settle()
	check(app.screen == "game" and app.state.current_level.id == "tutorial", "Accepting name should start tutorial.")
	check(app.state.profile_name == "Gökçen", "UI should save Turkish profile name.")
	var guide_pose = app.stage.find_child("MascotThink", true, false)
	check(is_instance_valid(guide_pose) and guide_pose.texture.resource_path.ends_with("mascot-think.png"), "The tutorial guide should use the thinking pose.")
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
	var win_pose = app.stage.find_child("MascotCheer", true, false)
	check(is_instance_valid(win_pose) and win_pose.texture.resource_path.ends_with("mascot-cheer.png"), "Completion should use the cheering pose.")
	check(app.state.gold == 100 and app.state.score == 0, "Tutorial should preserve start gold without normal reward.")
	find_button("ANA MENÜYE").pressed.emit()
	await settle()
	check(app.screen == "home", "Tutorial completion button should enter home.")
	var brand_mascot = app.stage.find_child("BrandMascot", true, false)
	check(is_instance_valid(brand_mascot) and brand_mascot.texture.resource_path == "res://assets/mascot.png", "The main topbar brand should use the same mascot identity.")
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
