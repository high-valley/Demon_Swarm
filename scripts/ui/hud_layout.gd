class_name HudLayout
extends RefCounted
## HUDとタッチボタンの配置。描画（Hud / TouchControls）と当たり判定で同じ値を使う。

const PAD := 22.0


static func slot_rects(vp: Vector2) -> Array:
	var sw := 164.0
	var sh := 84.0
	var gap := 12.0
	var total := sw * 3.0 + gap * 2.0
	var x0 := vp.x / 2.0 - total / 2.0
	var y0 := vp.y - sh - PAD
	var out: Array = []
	for i in 3:
		out.append(Rect2(x0 + i * (sw + gap), y0, sw, sh))
	return out


static func touch_buttons(vp: Vector2) -> Dictionary:
	var r := clampf(vp.y * 0.085, 44.0, 70.0)
	return {
		"dash": {"pos": Vector2(vp.x - PAD - r, vp.y - PAD - r), "r": r, "label": "回避"},
		"clear": {"pos": Vector2(vp.x - PAD - r * 3.1, vp.y - PAD - r * 0.7), "r": r * 0.62, "label": "解除"},
		"pause": {"pos": Vector2(vp.x - PAD - 30.0, PAD + 30.0), "r": 30.0, "label": "II"},
		"info": {"pos": Vector2(vp.x - PAD - 100.0, PAD + 30.0), "r": 30.0, "label": "i"},
	}


static func hit_button(p: Vector2, b: Dictionary) -> bool:
	return p.distance_to(b.pos) <= b.r + 10.0
