class_name ZincirState
extends RefCounted

## UI'dan bağımsız, çevrimdışı oyun ve kayıt durumu.
const START_GOLD := 100
const LETTER_COST := 20
const HINT_COST := 15
const LEVEL_GOLD := 40
const LEVEL_SCORE := 100
const ANSWER_SCHEMA := 2
const SAVE_PATH := "user://zincir_save.json"
const CONTENT_PATH := "res://data/levels.json"

var profile_name: String = ""
var profile_avatar: String = "mascot-boy"
var gold: int = START_GOLD
var score: int = 0
var completed: Array[String] = []
var tutorial_done: bool = false
var settings: Dictionary = {"sound": true, "haptics": true}
var levels: Array[Dictionary] = []
var tutorial: Dictionary = {}
var current_level: Dictionary = {}
var active_index: int = 1
var revealed: Dictionary = {}
var hint_used: Dictionary = {}
var progress: Dictionary = {}
var save_path: String = SAVE_PATH
var last_save_ok: bool = true


func _init(path: String = SAVE_PATH, auto_load: bool = true) -> void:
	save_path = path
	load_content()
	if auto_load:
		load_save()


static func normalize(value: String) -> String:
	return value.strip_edges().replace("i", "İ").replace("ı", "I").to_upper().replace(" ", "")


func load_content() -> bool:
	levels.clear()
	tutorial.clear()
	if not FileAccess.file_exists(CONTENT_PATH):
		return false
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(CONTENT_PATH))
	if not parsed is Dictionary:
		return false
	if _valid_level(parsed.get("tutorial", {})):
		tutorial = parsed["tutorial"].duplicate(true)
	for item: Variant in parsed.get("levels", []):
		if _valid_level(item):
			levels.append(item.duplicate(true))
	return not levels.is_empty() and not tutorial.is_empty()


func _valid_level(level: Variant) -> bool:
	if not level is Dictionary:
		return false
	var words: Variant = level.get("words", [])
	var answers: Variant = level.get("answers", [])
	var definitions: Variant = level.get("definitions", [])
	var links: Variant = level.get("links", [])
	if not (level.get("id", "") is String and not str(level.get("id", "")).is_empty() and words is Array and answers is Array and definitions is Array and links is Array):
		return false
	if words.size() < 4 or words.size() > 5 or answers.size() != words.size() or definitions.size() != words.size() or links.size() != words.size() - 1:
		return false
	for word: Variant in words:
		if not word is String or word.is_empty() or normalize(word) != word:
			return false
	for answer: Variant in answers:
		if not answer is String or answer.is_empty() or normalize(answer) != answer:
			return false
	if answers[0] != words[0]:
		return false
	return true


func set_profile(value: String) -> bool:
	var clean := value.strip_edges()
	if clean.length() < 2 or clean.length() > 18:
		return false
	for i in clean.length():
		if clean.unicode_at(i) < 32:
			return false
	profile_name = clean
	save_game()
	return true


func find_level(id: String) -> Dictionary:
	if id == "tutorial":
		return tutorial
	for level in levels:
		if str(level["id"]) == id:
			return level
	return {}


func begin_level(id: String) -> bool:
	var level := find_level(id)
	if level.is_empty():
		return false
	current_level = level.duplicate(true)
	var stored: Variant = progress.get(id, {})
	active_index = 1
	revealed = {}
	hint_used = {}
	if stored is Dictionary:
		var stored_index := int(stored.get("active_index", 1))
		if stored_index >= 1 and stored_index < current_level["words"].size():
			active_index = stored_index
			if stored.get("revealed", {}) is Dictionary:
				revealed = stored.get("revealed", {}).duplicate(true)
			if stored.get("hint_used", {}) is Dictionary:
				hint_used = stored.get("hint_used", {}).duplicate(true)
	_store_current()
	save_game()
	return true


func is_complete() -> bool:
	return not current_level.is_empty() and active_index >= current_level["words"].size()


func current_word() -> String:
	return answer_word()


func answer_word(word_index: int = -1) -> String:
	var index := active_index if word_index < 0 else word_index
	if current_level.is_empty() or index < 0 or index >= current_level["answers"].size():
		return ""
	return str(current_level["answers"][index])


func stem_word(word_index: int = -1) -> String:
	var index := active_index if word_index < 0 else word_index
	if current_level.is_empty() or index < 0 or index >= current_level["words"].size():
		return ""
	return str(current_level["words"][index])


func current_definition() -> String:
	if current_level.is_empty() or is_complete():
		return ""
	return str(current_level["definitions"][active_index])


func visible_letters(word_index: int = -1) -> Array[String]:
	var result: Array[String] = []
	if current_level.is_empty():
		return result
	var index := active_index if word_index < 0 else word_index
	if index < 0 or index >= current_level["words"].size():
		return result
	var word := stem_word(index) if index < active_index else answer_word(index)
	var shown: Variant = revealed.get(str(index), [])
	for i in word.length():
		result.append(word[i] if index < active_index or i == 0 or (shown is Array and i in shown) else "")
	return result


func submit_guess(text: String) -> Dictionary:
	if current_level.is_empty() or is_complete():
		return {"ok": false, "complete": is_complete(), "reason": "inactive"}
	var target := current_word()
	var guess := normalize(text)
	var accepted := guess == target or target[0] + guess == target
	# UI yalnızca boş konumları gönderirse açılmış harfleri yerinde tut.
	if not accepted:
		var letters := visible_letters()
		var hidden := ""
		for i in target.length():
			if letters[i].is_empty():
				hidden += target[i]
		accepted = guess == hidden
	if not accepted:
		return {"ok": false, "complete": false, "reason": "incorrect", "word": "", "reward_gold": 0, "reward_score": 0}
	var solved_index := active_index
	var stem := stem_word()
	active_index += 1
	var reward_gold := 0
	var reward_score := 0
	if is_complete():
		var id := str(current_level["id"])
		if id == "tutorial":
			tutorial_done = true
		elif id not in completed:
			completed.append(id)
			reward_gold = LEVEL_GOLD
			reward_score = LEVEL_SCORE
			gold += reward_gold
			score += reward_score
	_store_current()
	save_game()
	return {"ok": true, "complete": is_complete(), "word": target, "stem": stem, "solved_index": solved_index, "reward_gold": reward_gold, "reward_score": reward_score}


func reveal_letter() -> Dictionary:
	if current_level.is_empty() or is_complete():
		return {"ok": false, "reason": "inactive"}
	var word := current_word()
	var shown := visible_letters()
	var candidates: Array[int] = []
	for i in range(1, word.length()):
		if shown[i].is_empty():
			candidates.append(i)
	if candidates.is_empty():
		return {"ok": false, "reason": "all_revealed"}
	if gold < LETTER_COST:
		return {"ok": false, "reason": "insufficient_gold"}
	var position: int = candidates.pick_random()
	var key := str(active_index)
	if not revealed.get(key, []) is Array:
		revealed[key] = []
	if not revealed.has(key):
		revealed[key] = []
	revealed[key].append(position)
	gold -= LETTER_COST
	_store_current()
	save_game()
	return {"ok": true, "reason": "", "index": position, "letter": word[position]}


func buy_hint() -> Dictionary:
	if current_level.is_empty() or is_complete():
		return {"ok": false, "reason": "inactive", "text": ""}
	var key := str(active_index)
	if not bool(hint_used.get(key, false)):
		if gold < HINT_COST:
			return {"ok": false, "reason": "insufficient_gold", "text": ""}
		gold -= HINT_COST
		hint_used[key] = true
		_store_current()
		save_game()
	return {"ok": true, "reason": "", "text": current_definition()}


func _store_current() -> void:
	if not current_level.is_empty():
		progress[str(current_level["id"])] = {"answer_schema": ANSWER_SCHEMA, "active_index": active_index, "revealed": revealed.duplicate(true), "hint_used": hint_used.duplicate(true)}


func save_game() -> bool:
	_store_current()
	var payload := {"version": 1, "profile_name": profile_name, "profile_avatar": profile_avatar, "gold": gold, "score": score, "completed": completed, "tutorial_done": tutorial_done, "settings": settings, "progress": progress}
	var tmp := save_path + ".tmp"
	var file := FileAccess.open(tmp, FileAccess.WRITE)
	if file == null:
		last_save_ok = false
		return false
	file.store_string(JSON.stringify(payload))
	file.flush()
	file.close()
	# Aynı dizindeki geçici dosya, yarım kayıtla ana kaydın bozulmasını önler.
	var source := ProjectSettings.globalize_path(tmp)
	var destination := ProjectSettings.globalize_path(save_path)
	var backup := destination + ".bak"
	if FileAccess.file_exists(save_path):
		DirAccess.copy_absolute(destination, backup)
	var error := DirAccess.rename_absolute(source, destination)
	if error != OK:
		error = DirAccess.copy_absolute(source, destination)
		if error == OK:
			DirAccess.remove_absolute(source)
	last_save_ok = error == OK
	return last_save_ok


func load_save() -> bool:
	var data: Variant = _read_save(save_path)
	if not data is Dictionary:
		data = _read_save(save_path + ".bak")
	if not data is Dictionary:
		return false
	current_level = {}
	active_index = 1
	revealed = {}
	hint_used = {}
	profile_name = str(data.get("profile_name", "")).left(18).strip_edges()
	profile_avatar = str(data.get("profile_avatar", "mascot-boy"))
	if profile_avatar not in ["mascot-boy", "mascot-girl"]: profile_avatar = "mascot-boy"
	gold = clampi(_safe_int(data.get("gold", START_GOLD), START_GOLD), 0, 99999999)
	score = clampi(_safe_int(data.get("score", 0), 0), 0, 99999999)
	tutorial_done = bool(data.get("tutorial_done", false))
	completed.clear()
	if data.get("completed", []) is Array:
		for id: Variant in data.get("completed", []):
			if id is String and not find_level(id).is_empty() and id != "tutorial" and id not in completed:
				completed.append(id)
	if data.get("settings", {}) is Dictionary:
		var saved_settings: Dictionary = data.get("settings", {})
		settings = {"sound": bool(saved_settings.get("sound", true)), "haptics": bool(saved_settings.get("haptics", true))}
	progress = {}
	var migrated := false
	if data.get("progress", {}) is Dictionary:
		for id: Variant in data.get("progress", {}):
			var level := find_level(str(id))
			var entry: Variant = data["progress"][id]
			if level.is_empty() or not entry is Dictionary:
				continue
			var index := clampi(_safe_int(entry.get("active_index", 1), 1), 1, level["words"].size())
			var safe_revealed: Dictionary = {}
			var safe_hints: Dictionary = {}
			var legacy := _safe_int(entry.get("answer_schema", 1), 1) != ANSWER_SCHEMA
			if legacy:
				migrated = true
			for wi in range(1, level["words"].size()):
				var key := str(wi)
				var positions: Array[int] = []
				var seen_positions: Array[int] = []
				var old_word := str(level["words"][wi]) if legacy else str(level["answers"][wi])
				var new_word := str(level["answers"][wi])
				var source: Variant = entry.get("revealed", {})
				if source is Dictionary and source.get(key, []) is Array:
					for pos: Variant in source.get(key, []):
						if (pos is int or pos is float) and int(pos) == pos and int(pos) > 0 and int(pos) < old_word.length() and int(pos) not in seen_positions:
							var position := int(pos)
							seen_positions.append(position)
							if not legacy or (position < new_word.length() and old_word[position] == new_word[position]):
								positions.append(position)
							else:
								gold = mini(99999999, gold + LETTER_COST)
				safe_revealed[key] = positions
				var hints: Variant = entry.get("hint_used", {})
				safe_hints[key] = hints is Dictionary and bool(hints.get(key, false))
			progress[str(id)] = {"answer_schema": ANSWER_SCHEMA, "active_index": index, "revealed": safe_revealed, "hint_used": safe_hints}
	# Şema işareti ve iadeler birlikte kaydedilir; yeniden açılış tekrar altın vermez.
	if migrated:
		save_game()
	return true


func _read_save(path: String) -> Variant:
	if not FileAccess.file_exists(path):
		return null
	var json := JSON.new()
	if json.parse(FileAccess.get_file_as_string(path)) != OK:
		return null
	var parsed: Variant = json.data
	if parsed is Dictionary and _safe_int(parsed.get("version", 0), 0) == 1:
		return parsed
	return null


func _safe_int(value: Variant, fallback: int) -> int:
	if value is int or value is float:
		return int(value)
	if value is String and value.is_valid_int():
		return int(value)
	return fallback


func reset_progress() -> void:
	profile_name = ""
	profile_avatar = "mascot-boy"
	gold = START_GOLD
	score = 0
	completed.clear()
	tutorial_done = false
	current_level = {}
	active_index = 1
	revealed = {}
	hint_used = {}
	progress = {}
	settings = {"sound": true, "haptics": true}
	save_game()
