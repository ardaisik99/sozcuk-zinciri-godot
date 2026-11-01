class_name ZincirWordRow
extends PanelContainer

signal submitted(text: String)
signal input_focused

const U = preload("res://scripts/ui.gd")
var word = ""
var known: Array = []
var mode = "locked"
var ordinal = 1
var edit: LineEdit
var cells: Array[Label] = []

func _ready() -> void:
	var active = mode == "active"
	var solved = mode == "solved"
	add_theme_stylebox_override("panel", U.box(Color("e1f1e9") if solved else Color.WHITE if active else Color("f2efe7"), 18, U.INK if active else Color("c8ded3") if solved else U.LINE, 2 if active else 1, 4 if active else 0))
	custom_minimum_size.y = 108 if active else 94
	var v = U.column(9)
	add_child(v)
	var top = U.row(8)
	v.add_child(top)
	top.add_child(U.label("%02d" % ordinal, 12, U.TEAL if solved else U.MUTED, true))
	top.add_child(U.label("TAMAMLANDI" if solved else "SIRA SENDE · %d HARF" % word.length() if active else "%d HARF" % word.length(), 12, U.TEAL if solved else U.ORANGE if active else U.MUTED, true))
	top.add_child(U.expand())
	top.add_child(U.icon("check" if solved else "arrow" if active else "lock", 18))
	var entry_area = Control.new()
	entry_area.custom_minimum_size.y = 46
	v.add_child(entry_area)
	var line = U.row(5)
	line.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	entry_area.add_child(line)
	for i in word.length():
		var tile = PanelContainer.new()
		tile.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tile.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var bg = Color("f2c75f") if i == 0 and not solved else Color("c4e4d6") if solved else Color("f6f1e8") if active else Color("ebe6dc")
		var style = U.box(bg, 7)
		style.set_content_margin_all(0)
		tile.add_theme_stylebox_override("panel", style)
		var l = U.label("", 28 if word.length() < 9 else 22, U.INK, true)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		cells.append(l)
		tile.add_child(l)
		line.add_child(tile)
	if active:
		edit = LineEdit.new()
		edit.name = "WordInput"
		edit.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		edit.virtual_keyboard_enabled = true
		edit.max_length = word.length()
		edit.caret_blink = false
		edit.context_menu_enabled = false
		edit.language = "tr"
		edit.add_theme_stylebox_override("normal", StyleBoxEmpty.new())
		edit.add_theme_stylebox_override("focus", U.box(Color.TRANSPARENT, 8, U.TEAL, 2))
		edit.add_theme_color_override("font_color", Color.TRANSPARENT)
		edit.add_theme_color_override("font_selected_color", Color.TRANSPARENT)
		edit.add_theme_color_override("caret_color", Color.TRANSPARENT)
		edit.add_theme_color_override("selection_color", Color.TRANSPARENT)
		edit.add_theme_font_size_override("font_size", 25)
		edit.text_changed.connect(func(_t): _update_letters())
		edit.text_submitted.connect(func(_t): submitted.emit(guess()))
		edit.focus_entered.connect(func(): input_focused.emit())
		entry_area.add_child(edit)
	_update_letters()

func _upper(text: String) -> String:
	return text.strip_edges().replace("i", "İ").replace("ı", "I").to_upper().replace(" ", "")

func _update_letters() -> void:
	var entered = _upper(edit.text) if is_instance_valid(edit) else ""
	var whole = entered.length() == word.length() and entered.begins_with(word[0])
	var pointer = 0
	for i in word.length():
		var fixed = word[i] if mode == "solved" else str(known[i]) if known.size() > i else word[0] if i == 0 else ""
		if fixed == "_": fixed = ""
		var letter = fixed
		if fixed.is_empty() and mode == "active":
			if whole:
				letter = entered[i]
			elif pointer < entered.length():
				letter = entered[pointer]
			pointer += 1
		cells[i].text = letter if not letter.is_empty() else "·"
		cells[i].add_theme_color_override("font_color", U.INK if not letter.is_empty() else Color("c5bfb3"))

func guess() -> String:
	if not is_instance_valid(edit): return ""
	var entered = _upper(edit.text)
	if entered.length() == word.length(): return entered
	var hidden_count = 0
	for i in word.length():
		if known.size() <= i or str(known[i]).is_empty(): hidden_count += 1
	if entered.length() > hidden_count: return entered
	var result = ""
	var pointer = 0
	for i in word.length():
		var fixed = str(known[i]) if known.size() > i else word[0] if i == 0 else ""
		if fixed == "_": fixed = ""
		if not fixed.is_empty():
			result += fixed
		elif pointer < entered.length():
			result += entered[pointer]
			pointer += 1
	return result

func focus_input() -> void:
	if is_instance_valid(edit):
		edit.grab_focus()
		edit.edit()

func typed_by_position() -> Dictionary:
	var result = {}
	if not is_instance_valid(edit): return result
	var entered = _upper(edit.text)
	var whole = entered.length() == word.length() and entered.begins_with(word[0])
	var pointer = 0
	for i in word.length():
		if known.size() > i and not str(known[i]).is_empty(): continue
		if whole:
			result[i] = entered[i]
		elif pointer < entered.length():
			result[i] = entered[pointer]
		pointer += 1
	return result

func restore_typed(letters: Dictionary) -> void:
	if not is_instance_valid(edit): return
	var text = ""
	for i in word.length():
		if (known.size() <= i or str(known[i]).is_empty()) and letters.has(i):
			text += str(letters[i])
	edit.text = text
	_update_letters()
