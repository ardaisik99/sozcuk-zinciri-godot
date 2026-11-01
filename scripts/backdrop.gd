extends Control

func _ready() -> void:
	mouse_filter = MOUSE_FILTER_IGNORE
	resized.connect(queue_redraw)

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color("fff8ee"))
	# A quiet printed-paper pattern, drawn only when the viewport changes.
	for x in range(18, int(size.x), 32):
		for y in range(14, int(size.y), 32):
			draw_circle(Vector2(x, y), 1.0, Color("e9e2d6"))
	draw_circle(Vector2(size.x + 60, 230), 210, Color("f4ecd9"))
	draw_circle(Vector2(-100, size.y - 50), 230, Color("f4ecd9"))
