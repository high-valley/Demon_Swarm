class_name BattleView
extends Node2D
## 戦場の描画。Simulation の状態を読むだけで、ゲームロジックは持たない。
## 仮アセット段階なので図形で描いている。スプライトに差し替える時もここだけを変更する。

const VIEW_HEIGHT_DESKTOP := 800.0   # 画面に映るワールドの高さ（PC）
const VIEW_HEIGHT_TOUCH := 600.0     # スマホは寄せて大きく見せる

var sim: Simulation
var router: InputRouter
var camera := Camera2D.new()
var fx: Array = []
var shake := 0.0
var touch_mode := false
var _shake_rng := RandomNumberGenerator.new()


func _ready() -> void:
	add_child(camera)
	camera.make_current()


func add_fx(e: Dictionary) -> void:
	e["t"] = 0.0
	fx.append(e)


func add_shake(amount: float) -> void:
	shake = minf(14.0, shake + amount)


func clear() -> void:
	fx.clear()
	shake = 0.0


func screen_to_world(p: Vector2) -> Vector2:
	return get_canvas_transform().affine_inverse() * p


func world_to_screen(p: Vector2) -> Vector2:
	return get_canvas_transform() * p


func _process(delta: float) -> void:
	var vp := get_viewport_rect().size
	var view_h := VIEW_HEIGHT_TOUCH if touch_mode else VIEW_HEIGHT_DESKTOP
	var z := minf(vp.x, vp.y) / view_h if touch_mode else vp.y / view_h
	camera.zoom = Vector2(z, z)
	if sim:
		camera.position = sim.king.pos
		camera.offset = Vector2(_shake_rng.randf() - 0.5, _shake_rng.randf() - 0.5) * shake
	shake *= 0.85
	for f in fx:
		f.t += delta
	fx = fx.filter(func(f: Dictionary) -> bool: return f.t < f.dur)
	queue_redraw()


func _draw() -> void:
	if sim == null:
		return
	var vp := get_viewport_rect().size
	var half := vp / camera.zoom / 2.0
	var c := camera.position
	_draw_ground(c - half, c + half)
	for o in sim.obstacles:
		draw_circle(o.pos, o.r, Color("#2a2333"))
		draw_circle(o.pos - Vector2(o.r * 0.2, o.r * 0.25), o.r * 0.65, Color("#3a3046"))
	for s in sim.souls:
		draw_colored_polygon(PackedVector2Array([s.pos + Vector2(0, -4), s.pos + Vector2(4, 0), s.pos + Vector2(0, 4), s.pos + Vector2(-4, 0)]), Color("#b98cff"))
	_draw_summon_preview()
	for f in fx:
		_draw_fx_under(f)
	_draw_orders()
	for a in sim.allies:
		_draw_ally(a)
	for e in sim.enemies:
		_draw_enemy(e)
	_draw_king()
	for p in sim.projs:
		var dir: Vector2 = p.vel.normalized()
		draw_line(p.pos - dir * 7.0, p.pos + dir * 7.0, Color("#d8f0ff"), 2.0)
	for f in fx:
		_draw_fx_over(f)


func _draw_ground(a: Vector2, b: Vector2) -> void:
	var g := 80.0
	var col := Color("#1b1724")
	var x := floorf(a.x / g) * g
	while x < b.x:
		draw_line(Vector2(x, a.y), Vector2(x, b.y), col, 1.0)
		x += g
	var y := floorf(a.y / g) * g
	while y < b.y:
		draw_line(Vector2(a.x, y), Vector2(b.x, y), col, 1.0)
		y += g
	var h := float(sim.T.world_half)
	draw_rect(Rect2(-h, -h, h * 2.0, h * 2.0), Color("#4a2a3a"), false, 4.0)


func _dashed_circle(center: Vector2, r: float, col: Color) -> void:
	var n := 48
	for i in n:
		if i % 2 == 0:
			draw_arc(center, r, TAU * i / n, TAU * (i + 1) / n, 4, col, 2.0)


func _draw_summon_preview() -> void:
	if sim.result != "" or router == null or not router.gameplay_enabled:
		return
	if not (router.mouse_inside or touch_mode):
		return
	var sd: Dictionary = sim.data.summons[sim.slot]
	var ud: Dictionary = sim.data.units[sd.unit_id]
	_dashed_circle(sim.king.pos, float(sd.cast_range), Color(0.6, 0.39, 0.91, 0.25))
	if touch_mode:
		return
	var p := sim.clamp_to_cast_range(screen_to_world(router.mouse_pos))
	var ok: bool = sim.mana >= float(sd.mana_cost) and sim.summon_cd[sim.slot] <= 0.0 and sim.allies.size() < int(sim.T.ally_cap)
	draw_arc(p, float(ud.radius) + 4.0, 0, TAU, 24, Color(ud.color_c, 0.75) if ok else Color("#ff5163"), 2.0)


func _draw_orders() -> void:
	var seen := {}
	for a in sim.allies:
		var o: SquadOrder = a.order
		if o == null or seen.has(o):
			continue
		seen[o] = true
		if o.type == SquadOrder.Type.RALLY:
			var col := Color(0.91, 0.66, 0.23, 0.85)
			draw_line(o.pos - Vector2(10, 0), o.pos + Vector2(10, 0), col, 2.0)
			draw_line(o.pos - Vector2(0, 10), o.pos + Vector2(0, 10), col, 2.0)
			draw_arc(o.pos, 16.0, 0, TAU, 24, col, 2.0)
		elif o.target and not o.target.dead:
			draw_arc(o.target.pos, o.target.r + 8.0, 0, TAU, 24, Color(1, 0.32, 0.39, 0.9), 2.0)


func _hp_bar(u: Unit, w: float) -> void:
	if u.hp >= u.max_hp:
		return
	var y := u.pos.y - u.r - 7.0
	draw_rect(Rect2(u.pos.x - w / 2.0, y, w, 3), Color(0, 0, 0, 0.6))
	draw_rect(Rect2(u.pos.x - w / 2.0, y, w * maxf(0.0, u.hp / u.max_hp), 3), Color("#7be08a") if u.ally else Color("#ff5163"))


func _draw_ally(a: Unit) -> void:
	var col: Color = Color.WHITE if a.flash > 0.0 else a.def.color_c
	match a.def.id:
		"slime":
			var wob := sin(sim.t * 8.0 + a.id) * 1.5
			draw_set_transform(a.pos + Vector2(0, 2), 0.0, Vector2((a.r + wob * 0.4) / a.r, (a.r - 1.0 - wob * 0.3) / a.r))
			draw_circle(Vector2.ZERO, a.r, col)
			draw_set_transform(Vector2.ZERO)
			draw_rect(Rect2(a.pos.x - 4, a.pos.y - 1, 2, 2), Color("#1d3a22"))
			draw_rect(Rect2(a.pos.x + 2, a.pos.y - 1, 2, 2), Color("#1d3a22"))
		"goblin":
			var ang := a.vel.angle() if a.vel.length() > 1.0 else 0.0
			var r := a.r
			var pts := PackedVector2Array([Vector2(r + 3, 0), Vector2(-r, -r * 0.8), Vector2(-r * 0.5, 0), Vector2(-r, r * 0.8)])
			draw_set_transform(a.pos, ang)
			draw_colored_polygon(pts, col)
			draw_set_transform(Vector2.ZERO)
		_:
			draw_rect(Rect2(a.pos - Vector2(a.r, a.r), Vector2(a.r, a.r) * 2.0), col)
			draw_rect(Rect2(a.pos.x - a.r + 3, a.pos.y - 3, a.r * 2.0 - 6, 6), Color("#4b4458"))
			if a.revived:
				draw_rect(Rect2(a.pos - Vector2(a.r + 2, a.r + 2), Vector2(a.r + 2, a.r + 2) * 2.0), Color("#b48cff"), false, 1.5)
	if a.order:
		draw_rect(Rect2(a.pos.x - 1.5, a.pos.y - a.r - 5, 3, 3), Color("#ff5163") if a.order.type == SquadOrder.Type.FOCUS else Color("#e7a93b"))
	_hp_bar(a, a.r * 2.0)


func _draw_enemy(e: Unit) -> void:
	var col: Color = Color.WHITE if e.flash > 0.0 else e.def.color_c
	var p := e.pos
	draw_circle(p, e.r, col)
	var ink := Color("#0d0b12")
	match e.def.id:
		"swordsman":
			draw_line(p + Vector2(-5, 5), p + Vector2(6, -6), ink, 2.0)
		"archer":
			draw_arc(p, e.r - 4.0, -1.2, 1.2, 12, ink, 2.0)
		"priest":
			draw_line(p + Vector2(0, -6), p + Vector2(0, 6), ink, 2.0)
			draw_line(p + Vector2(-4, -2), p + Vector2(4, -2), ink, 2.0)
		"hero_boss":
			draw_arc(p, e.r + 6.0, 0, TAU, 40, Color("#ffd0d5"), 3.0)
			var crown := PackedVector2Array([p + Vector2(-10, -e.r + 2), p + Vector2(-6, -e.r - 8), p + Vector2(0, -e.r + 1), p + Vector2(6, -e.r - 8), p + Vector2(10, -e.r + 2)])
			draw_colored_polygon(crown, Color("#ffe9a8"))
	if e != sim.boss:
		_hp_bar(e, e.r * 2.0)


func _draw_king() -> void:
	var k := sim.king
	var alpha := 0.4 if k.iframe > 0.0 and int(sim.t * 40.0) % 2 == 0 else 1.0
	draw_set_transform(k.pos + Vector2(0, k.r - 2), 0.0, Vector2(1.0, 0.35))
	draw_circle(Vector2.ZERO, k.r, Color(0, 0, 0, 0.6 * alpha))
	draw_set_transform(Vector2.ZERO)
	draw_circle(k.pos, k.r, Color(1, 1, 1, alpha) if k.flash > 0.0 else Color(0.6, 0.39, 0.91, alpha))
	var gold := Color(0.91, 0.66, 0.23, alpha)
	draw_colored_polygon(PackedVector2Array([k.pos + Vector2(-10, -8), k.pos + Vector2(-14, -22), k.pos + Vector2(-5, -12)]), gold)
	draw_colored_polygon(PackedVector2Array([k.pos + Vector2(10, -8), k.pos + Vector2(14, -22), k.pos + Vector2(5, -12)]), gold)
	var eye := k.pos + k.dir * 5.0
	draw_rect(Rect2(eye.x - 4, eye.y - 3, 3, 3), Color(1, 1, 1, alpha))
	draw_rect(Rect2(eye.x + 1, eye.y - 3, 3, 3), Color(1, 1, 1, alpha))


func _draw_fx_under(f: Dictionary) -> void:
	var k: float = f.t / f.dur
	match f.kind:
		"warn":
			var e: Unit = f.follow
			if e and not e.dead:
				draw_circle(e.pos, f.r * k, Color(1, 0.32, 0.39, 0.12 + 0.18 * k))
				draw_arc(e.pos, f.r, 0, TAU, 48, Color(1, 0.32, 0.39, 0.7), 2.0)
		"boom":
			draw_arc(f.pos, f.r * (0.7 + 0.3 * k), 0, TAU, 48, Color(1, 0.7, 0.47, 1.0 - k), 6.0)
		"rally":
			draw_arc(f.pos, f.r * k, 0, TAU, 48, Color(0.91, 0.66, 0.23, 1.0 - k), 2.0)
		"focus":
			draw_arc(f.pos, f.r * k, 0, TAU, 48, Color(1, 0.32, 0.39, 1.0 - k), 2.0)
		"summon":
			draw_arc(f.pos, 8.0 + 30.0 * k, 0, TAU, 32, Color(f.color, 1.0 - k), 3.0)
		"trail":
			draw_circle(f.pos, 16.0, Color(0.6, 0.39, 0.91, 0.4 * (1.0 - k)))


func _draw_fx_over(f: Dictionary) -> void:
	var k: float = f.t / f.dur
	match f.kind:
		"spark":
			draw_line(f.pos - Vector2(6, 6), f.pos + Vector2(6, 6), Color(f.color, 1.0 - k), 1.5)
		"slash":
			draw_line(f.pos - Vector2(6, 6), f.pos + Vector2(6, 6), Color(1, 1, 1, 1.0 - k), 1.5)
		"poof":
			draw_circle(f.pos, 6.0 + 14.0 * k, Color(f.color, (1.0 - k) * 0.6))
		"heal":
			draw_line(f.pos, f.to, Color(1, 0.84, 0.35, 1.0 - k), 2.0)
