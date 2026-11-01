extends SceneTree

const Main = preload("res://scenes/main.tscn")
const State = preload("res://scripts/game_state.gd")
var app: Control

func _initialize() -> void:
	_run.call_deferred()

func capture(file: String) -> void:
	for i in 6: await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png("res://output/" + file)

func _run() -> void:
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_size = Vector2i.ZERO
	root.size = Vector2i(1280, 920)
	app = Main.instantiate()
	app.state = State.new("user://zincir_capture_only.json", false)
	app.state.profile_name = "Arda"
	app.state.tutorial_done = true
	root.add_child(app)
	await create_timer(1.4).timeout
	OS.low_processor_usage_mode = false
	await capture("menu-desktop.png")
	root.size = Vector2i(390, 844)
	await create_timer(0.4).timeout
	app._show_home()
	await capture("menu-mobile.png")
	app._start_level("mutfak_01")
	await capture("game-mobile.png")
	app.active_row.edit.grab_focus()
	root.size = Vector2i(390, 420)
	await create_timer(0.4).timeout
	await capture("game-keyboard-height.png")
	root.size = Vector2i(390, 844)
	app._show_levels()
	await capture("levels-mobile.png")
	app._show_party(true)
	await capture("party-mobile.png")
	app.free()
	for suffix in ["", ".tmp", ".bak"]:
		var path = "user://zincir_capture_only.json" + suffix
		if FileAccess.file_exists(path): DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	quit()
