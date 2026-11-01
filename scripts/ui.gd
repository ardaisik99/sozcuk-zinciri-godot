class_name ZincirUI
extends RefCounted

const INK = Color("29364f")
const MUTED = Color("78808c")
const CREAM = Color("fff8ee")
const PAPER = Color("ffffff")
const ORANGE = Color("fb7852")
const YELLOW = Color("ffca51")
const TEAL = Color("2ba99e")
const MINT = Color("d9eee7")
const PURPLE = Color("8370b6")
const LINE = Color("e5ded2")

static func heading_font() -> Font:
	var font: FontFile = load("res://assets/fonts/Baloo2.ttf")
	if font.fallbacks.is_empty():
		font.fallbacks = [load("res://assets/fonts/Symbols.ttf")]
	return font

static func body_font() -> Font:
	var font: FontFile = load("res://assets/fonts/Nunito.ttf")
	if font.fallbacks.is_empty():
		font.fallbacks = [load("res://assets/fonts/Symbols.ttf")]
	return font

static func box(color: Color, radius: int = 20, border: Color = Color.TRANSPARENT, width: int = 0, shadow: int = 0) -> StyleBoxFlat:
	var s = StyleBoxFlat.new()
	s.bg_color = color
	s.set_corner_radius_all(radius)
	s.set_border_width_all(width)
	s.border_color = border
	s.content_margin_left = 20
	s.content_margin_right = 20
	s.content_margin_top = 16
	s.content_margin_bottom = 16
	if shadow > 0:
		s.shadow_color = INK
		s.shadow_offset = Vector2(0, shadow)
		s.shadow_size = 0
	return s

static func label(text: String, size: int = 20, color: Color = INK, heading: bool = false) -> Label:
	var l = Label.new()
	l.text = text
	l.add_theme_font_override("font", heading_font() if heading else body_font())
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l

static func paragraph(text: String, size: int = 18, color: Color = MUTED) -> Label:
	var l = label(text, size, color)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return l

static func icon(name: String, size: int = 32) -> TextureRect:
	var i = TextureRect.new()
	i.texture = load("res://assets/icons/%s.svg" % name)
	i.custom_minimum_size = Vector2(size, size)
	i.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	i.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	i.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return i

static func button(text: String, color: Color = ORANGE, callback: Callable = Callable(), height: int = 60) -> Button:
	var b = Button.new()
	b.text = text
	b.custom_minimum_size.y = height
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	b.add_theme_font_override("font", heading_font())
	b.add_theme_font_size_override("font_size", 22)
	b.add_theme_color_override("font_color", INK)
	b.add_theme_color_override("font_hover_color", INK)
	b.add_theme_color_override("font_pressed_color", INK)
	b.add_theme_color_override("font_disabled_color", Color("979c9e"))
	b.add_theme_stylebox_override("normal", box(color, 17, INK, 2, 4))
	b.add_theme_stylebox_override("hover", box(color.lightened(0.09), 17, INK, 2, 4))
	b.add_theme_stylebox_override("pressed", box(color.darkened(0.07), 17, INK, 2))
	b.add_theme_stylebox_override("disabled", box(Color("e6e2da"), 17, LINE, 2, 2))
	b.add_theme_stylebox_override("focus", box(Color.TRANSPARENT, 17, TEAL, 3))
	if callback.is_valid():
		b.pressed.connect(callback)
	return b

static func panel(color: Color = PAPER, radius: int = 22, outline: bool = false) -> PanelContainer:
	var p = PanelContainer.new()
	p.add_theme_stylebox_override("panel", box(color, radius, INK if outline else LINE, 2 if outline else 1, 4 if outline else 0))
	return p

static func icon_button(icon_name: String, callback: Callable) -> Button:
	var b = button("", PAPER, callback, 48)
	b.custom_minimum_size.x = 48
	b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	b.icon = load("res://assets/icons/%s.svg" % icon_name)
	b.expand_icon = true
	b.add_theme_constant_override("icon_max_width", 26)
	for state in ["normal", "hover", "pressed", "focus"]:
		var s = b.get_theme_stylebox(state).duplicate()
		s.set_content_margin_all(8)
		b.add_theme_stylebox_override(state, s)
	return b

static func column(gap: int = 12) -> VBoxContainer:
	var v = VBoxContainer.new()
	v.add_theme_constant_override("separation", gap)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return v

static func row(gap: int = 12) -> HBoxContainer:
	var h = HBoxContainer.new()
	h.add_theme_constant_override("separation", gap)
	return h

static func spacer(height: float = 8) -> Control:
	var c = Control.new()
	c.custom_minimum_size.y = height
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c

static func expand() -> Control:
	var c = Control.new()
	c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c

static func badge(text: String, color: Color = YELLOW) -> PanelContainer:
	var p = panel(color, 10)
	p.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var s = box(color, 10)
	s.content_margin_left = 10
	s.content_margin_right = 10
	s.content_margin_top = 5
	s.content_margin_bottom = 5
	p.add_theme_stylebox_override("panel", s)
	p.add_child(label(text, 13, INK, true))
	return p

static func progress(value: float, color: Color = TEAL, height: int = 10) -> ProgressBar:
	var p = ProgressBar.new()
	p.custom_minimum_size.y = height
	p.show_percentage = false
	p.value = value
	var bg = box(Color("e8e6df"), height / 2)
	bg.set_content_margin_all(0)
	var fill = box(color, height / 2)
	fill.set_content_margin_all(0)
	p.add_theme_stylebox_override("background", bg)
	p.add_theme_stylebox_override("fill", fill)
	return p
