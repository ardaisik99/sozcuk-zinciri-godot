extends Control

const U = preload("res://scripts/ui.gd")

func _ready() -> void:
	mouse_filter = MOUSE_FILTER_IGNORE
	resized.connect(queue_redraw)

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), U.CREAM)
	# Static warm paper and broad color accents; no background processing.
	for x in range(18, int(size.x), 32):
		for y in range(14, int(size.y), 32):
			draw_circle(Vector2(x, y), 1.0, Color("e1cfa7"))
	draw_circle(Vector2(size.x + 130, 200), 225, Color("ffe19a"))
	draw_circle(Vector2(-135, size.y - 40), 215, Color("bae7d3"))
