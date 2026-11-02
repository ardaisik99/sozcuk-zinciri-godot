class_name ZincirMascotRunner
extends Control

## One texture, one atlas region and a ten-Hz timer, only on the loading screen.
const ATLAS_PATH = "res://assets/mascot-run.png"
const METADATA_PATH = "res://assets/mascot-run.json"
const FRAME_COUNT = 8
const FRAMES_PER_SECOND = 10.0

var image: TextureRect
var atlas_texture: AtlasTexture
var frame_rects: Array[Rect2] = []
var frame_index = 0
var frame_timer: Timer
var playing = false
var app_paused = false

func _ready() -> void:
	name = "LoadingRunner"
	custom_minimum_size = Vector2(176, 176)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_process(false)
	image = TextureRect.new()
	image.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	image.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(image)
	frame_timer = Timer.new()
	frame_timer.wait_time = 1.0 / FRAMES_PER_SECOND
	frame_timer.timeout.connect(_advance_frame)
	add_child(frame_timer)
	if not _load_atlas():
		image.texture = load("res://assets/mascot.png")
	visibility_changed.connect(_sync_playback)
	_sync_playback()

func _load_atlas() -> bool:
	if not ResourceLoader.exists(ATLAS_PATH) or not FileAccess.file_exists(METADATA_PATH): return false
	var metadata: Variant = JSON.parse_string(FileAccess.get_file_as_string(METADATA_PATH))
	if not metadata is Dictionary or int(metadata.get("frames", 0)) != FRAME_COUNT: return false
	var texture: Texture2D = load(ATLAS_PATH)
	var rects: Variant = metadata.get("frame_rects", [])
	if not rects is Array or rects.size() != FRAME_COUNT: return false
	for data: Variant in rects:
		if not data is Dictionary: return false
		var rect = Rect2(float(data.get("x", 0)), float(data.get("y", 0)), float(data.get("width", 0)), float(data.get("height", 0)))
		if rect.size.x <= 0 or rect.size.y <= 0 or rect.position.x < 0 or rect.position.y < 0 or rect.end.x > texture.get_width() or rect.end.y > texture.get_height() or frame_rects.has(rect):
			frame_rects.clear()
			return false
		frame_rects.append(rect)
	atlas_texture = AtlasTexture.new()
	atlas_texture.atlas = texture
	atlas_texture.region = frame_rects[0]
	image.texture = atlas_texture
	return true

func _advance_frame() -> void:
	if not playing or app_paused or not is_visible_in_tree(): return
	frame_index = (frame_index + 1) % FRAME_COUNT
	atlas_texture.region = frame_rects[frame_index]

func _sync_playback() -> void:
	if not is_instance_valid(frame_timer): return
	playing = is_inside_tree() and is_visible_in_tree() and not app_paused and atlas_texture != null
	if playing:
		if frame_timer.is_stopped(): frame_timer.start()
	else:
		frame_timer.stop()

func set_app_paused(paused: bool) -> void:
	app_paused = paused
	_sync_playback()

func stop() -> void:
	playing = false
	if is_instance_valid(frame_timer): frame_timer.stop()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_PAUSED or what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		set_app_paused(true)
	elif what == NOTIFICATION_APPLICATION_RESUMED or what == NOTIFICATION_APPLICATION_FOCUS_IN:
		set_app_paused(false)

func _exit_tree() -> void:
	stop()
