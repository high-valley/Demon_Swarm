class_name TouchControls
extends Control
## スマホ用の操作レイヤー。結果はすべて InputRouter のシグナルとして流すので、
## ゲーム側はマウス操作と区別しない。
##   画面左側ドラッグ = 仮想スティック / タップ = 召喚 / 長押し = 命令
##   右下 = 回避・命令解除 / 右上 = 詳細・ポーズ / スロットをタップ = 切替

const LONG_PRESS_SEC := 0.42
const JOY_RADIUS := 60.0

var router: InputRouter
var sim_ref: Callable          # 現在の Simulation を返す（ダッシュCD表示用）
var joy := {}                  # {index, origin, pos}
var press := {}                # {index, pos, t0, done}
var font: Font


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	font = get_theme_default_font()


func reset() -> void:
	joy = {}
	press = {}
	if router:
		router.touch_move = Vector2.ZERO


func _active() -> bool:
	return visible and router != null and router.gameplay_enabled


func _input(event: InputEvent) -> void:
	if not _active():
		return
	if event is InputEventScreenTouch:
		var p: Vector2 = event.position
		if event.pressed:
			_on_down(event.index, p)
		else:
			_on_up(event.index, event.canceled)
		get_viewport().set_input_as_handled()
	elif event is InputEventScreenDrag:
		if not joy.is_empty() and joy.index == event.index:
			joy.pos = event.position
			var v: Vector2 = joy.pos - joy.origin
			router.touch_move = v / JOY_RADIUS if v.length() > 8.0 else Vector2.ZERO
			router.touch_move = router.touch_move.limit_length(1.0)
		elif not press.is_empty() and press.index == event.index:
			press.pos = event.position
		get_viewport().set_input_as_handled()


func _on_down(index: int, p: Vector2) -> void:
	var b := HudLayout.touch_buttons(size)
	if HudLayout.hit_button(p, b.pause):
		router.pause_toggled.emit()
		return
	if HudLayout.hit_button(p, b.info):
		router.info_requested.emit(true)
		return
	if HudLayout.hit_button(p, b.dash):
		router.dash_requested.emit()
		return
	if HudLayout.hit_button(p, b.clear):
		router.clear_orders_requested.emit()
		return
	var rects := HudLayout.slot_rects(size)
	for i in rects.size():
		if rects[i].grow(6).has_point(p):
			router.slot_selected.emit(i)
			return
	if joy.is_empty() and p.x < size.x * 0.42:
		joy = {"index": index, "origin": p, "pos": p}
		return
	if press.is_empty():
		press = {"index": index, "pos": p, "t0": Time.get_ticks_msec() / 1000.0, "done": false}


func _on_up(index: int, canceled: bool) -> void:
	if not joy.is_empty() and joy.index == index:
		joy = {}
		router.touch_move = Vector2.ZERO
	if not press.is_empty() and press.index == index:
		if not press.done and not canceled:
			router.summon_at.emit(press.pos)
		press = {}


func _process(_delta: float) -> void:
	if not press.is_empty() and not press.done and _active():
		if Time.get_ticks_msec() / 1000.0 - press.t0 >= LONG_PRESS_SEC:
			press.done = true
			router.order_at.emit(press.pos)
	if visible:
		queue_redraw()


func _draw() -> void:
	if not _active():
		return
	var b := HudLayout.touch_buttons(size)
	var s: Simulation = sim_ref.call() if sim_ref.is_valid() else null
	var dash_cd := 0.0
	if s:
		dash_cd = s.king.dash_cd / float(s.T.dash_cd)
	_button(b.dash, s != null and s.king.dash_cd <= 0.0, dash_cd)
	_button(b.clear, false, 0.0)
	_button(b.pause, false, 0.0)
	_button(b.info, false, 0.0)
	if not joy.is_empty():
		var v: Vector2 = (joy.pos - joy.origin).limit_length(JOY_RADIUS)
		draw_arc(joy.origin, JOY_RADIUS, 0, TAU, 48, Color(0.93, 0.9, 0.95, 0.35), 3.0)
		draw_circle(joy.origin + v, 26.0, Color(0.6, 0.39, 0.91, 0.7))
	elif s and s.t < 12.0:
		var y := size.y * 0.55
		draw_string(font, Vector2(24, y), "← 左側ドラッグで移動", HORIZONTAL_ALIGNMENT_LEFT, -1, 22, Color("#a59cb6"))
		draw_string(font, Vector2(0, y), "タップで召喚・長押しで命令 →", HORIZONTAL_ALIGNMENT_RIGHT, size.x - 24, 22, Color("#a59cb6"))
	if not press.is_empty() and not press.done:
		var k := clampf((Time.get_ticks_msec() / 1000.0 - press.t0) / LONG_PRESS_SEC, 0.0, 1.0)
		if k > 0.25:
			draw_arc(press.pos, 34.0, -PI / 2.0, -PI / 2.0 + TAU * k, 40, Color("#e7a93b"), 4.0)
	if size.y > size.x:
		draw_string(font, Vector2(0, 150), "横向きにすると遊びやすくなります", HORIZONTAL_ALIGNMENT_CENTER, size.x, 22, Color("#e7a93b"))


func _button(btn: Dictionary, lit: bool, cd: float) -> void:
	var p: Vector2 = btn.pos
	var r: float = btn.r
	draw_circle(p, r, Color(0.12, 0.1, 0.16, 0.75))
	if cd > 0.0:
		var pts := PackedVector2Array([p])
		for i in 33:
			var a := -PI / 2.0 + TAU * cd * i / 32.0
			pts.append(p + Vector2(cos(a), sin(a)) * r)
		draw_colored_polygon(pts, Color(0.04, 0.03, 0.06, 0.8))
	draw_arc(p, r, 0, TAU, 48, Color("#e7a93b") if lit else Color("#3c3250"), 3.0)
	var fs := maxi(18, int(r * 0.45))
	draw_string(font, p + Vector2(-r, fs * 0.36), btn.label, HORIZONTAL_ALIGNMENT_CENTER, r * 2.0, fs, Color("#ece6f3"))
