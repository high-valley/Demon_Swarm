class_name Hud
extends Control
## 戦闘HUD。表示専用（クリックは透過）。

var sim: Simulation
var view: BattleView
var font: Font
var toast_text := ""
var toast_t := 0.0
var fps := 60.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	font = get_theme_default_font()


func toast(text: String) -> void:
	toast_text = text
	toast_t = 1.6


func _process(delta: float) -> void:
	toast_t -= delta
	fps = lerpf(fps, Engine.get_frames_per_second(), 0.1)
	if visible:
		queue_redraw()


func _text(pos: Vector2, s: String, size: int, col: Color, align := HORIZONTAL_ALIGNMENT_LEFT, width := -1.0) -> void:
	draw_string(font, pos, s, align, width, size, col)


func _bar(r: Rect2, v: float, col: Color, label: String) -> void:
	draw_rect(r, Color(0.04, 0.03, 0.06, 0.8))
	draw_rect(Rect2(r.position, Vector2(r.size.x * clampf(v, 0.0, 1.0), r.size.y)), col)
	draw_rect(r, Color("#3c3250"), false, 1.0)
	if label != "":
		_text(r.position + Vector2(10, r.size.y * 0.5 + 7), label, 18, Color("#ece6f3"))


static func fmt_time(s: float) -> String:
	var n := maxi(0, ceili(s))
	return "%02d:%02d" % [n / 60, n % 60]


func _draw() -> void:
	if sim == null:
		return
	var vp := size
	var pad := HudLayout.PAD
	var fg := Color("#ece6f3")
	var dim := Color("#a59cb6")
	_bar(Rect2(pad, pad, 340, 30), sim.hp / float(sim.T.king_hp), Color("#ff5163"), "HP %d / %d" % [ceili(sim.hp), int(sim.T.king_hp)])
	_bar(Rect2(pad, pad + 38, 340, 24), sim.mana / float(sim.stats.max_mana), Color("#9a63e8"), "魔力 %d / %d" % [floori(sim.mana), int(sim.stats.max_mana)])
	_bar(Rect2(pad, pad + 70, 340, 10), sim.exp_points / sim.exp_need(), Color("#b98cff"), "")
	_text(Vector2(pad, pad + 112), "Lv %d" % sim.level, 22, fg)
	var dash_txt := "ダッシュ OK" if sim.king.dash_cd <= 0.0 else "ダッシュ %.1fs" % sim.king.dash_cd
	_text(Vector2(pad + 90, pad + 112), dash_txt, 22, Color("#e7a93b") if sim.king.dash_cd <= 0.0 else dim)

	# タイマーとボス
	var timer := fmt_time(sim.t) if sim.boss_spawned else fmt_time(sim.boss_real_sec() - sim.t)
	_text(Vector2(0, pad + 40), timer, 44, fg, HORIZONTAL_ALIGNMENT_CENTER, vp.x)
	_text(Vector2(0, pad + 68), "勇者戦  経過時間" if sim.boss_spawned else "勇者出現まで", 16, dim, HORIZONTAL_ALIGNMENT_CENTER, vp.x)
	if sim.boss and not sim.boss.dead:
		var w := minf(560.0, vp.x - 120.0)
		_bar(Rect2(vp.x / 2.0 - w / 2.0, pad + 82, w, 14), sim.boss.hp / sim.boss.max_hp, Color("#ff5163"), "")
		_text(Vector2(0, pad + 120), "勇者", 18, fg, HORIZONTAL_ALIGNMENT_CENTER, vp.x)
		_draw_boss_arrow()

	# 召喚スロット
	var rects := HudLayout.slot_rects(vp)
	for i in rects.size():
		var r: Rect2 = rects[i]
		var sd: Dictionary = sim.data.summons[i]
		var ud: Dictionary = sim.data.units[sd.unit_id]
		var cdv: float = sim.summon_cd[i] / float(sd.cooldown)
		var afford: bool = sim.mana >= float(sd.mana_cost)
		draw_rect(r, Color(0.12, 0.1, 0.16, 0.9))
		if cdv > 0.0:
			draw_rect(Rect2(r.position.x, r.position.y + r.size.y * (1.0 - cdv), r.size.x, r.size.y * cdv), Color(0.04, 0.03, 0.06, 0.8))
		draw_rect(r, Color("#e7a93b") if sim.slot == i else Color("#3c3250"), false, 3.0 if sim.slot == i else 1.0)
		draw_circle(r.position + Vector2(24, 30), 10.0, ud.color_c)
		_text(r.position + Vector2(40, 38), ud.name, 19, fg if afford else Color("#7c7389"), HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 60)
		_text(r.position + Vector2(12, r.size.y - 14), "魔%d" % int(sd.mana_cost), 17, Color("#b98cff") if afford else Color("#ff5163"))
		_text(r.position + Vector2(70, r.size.y - 14), "×%d" % int(sim.counts.get(sd.unit_id, 0)), 17, dim)
		_text(r.position + Vector2(r.size.x - 20, 22), str(i + 1), 16, fg)

	_text(Vector2(pad, vp.y - pad - 6), "配下 %d/%d   撃破 %d" % [sim.allies.size(), int(sim.T.ally_cap), sim.kills], 18, dim)
	var syn: Array = []
	if sim.swarm_on:
		syn.append("群体進化")
	if sim.squad_on:
		syn.append("小隊連携")
	if not syn.is_empty():
		_text(Vector2(pad, vp.y - pad - 32), "発動中: " + " / ".join(syn), 18, Color("#e7a93b"))
	if sim.order_cd > 0.0:
		_text(Vector2(pad, vp.y - pad - 58), "命令CD %.1fs" % sim.order_cd, 18, dim)
	if toast_t > 0.0:
		_text(Vector2(0, rects[0].position.y - 18), toast_text, 24, Color(fg, minf(1.0, toast_t * 2.0)), HORIZONTAL_ALIGNMENT_CENTER, vp.x)
	if Settings.debug_hud:
		var lines := ["FPS %d" % roundi(fps), "敵 %d  味方 %d" % [sim.enemies.size(), sim.allies.size()], "AI %.2f ms" % sim.ai_ms,
			"弾 %d  魂 %d" % [sim.projs.size(), sim.souls.size()], "seed %d" % sim.seed_value, "wave t %ds" % int(sim.t * sim.compress),
			"platform %s" % ("web" if Platform.is_web else OS.get_name())]
		var y0 := pad + (80.0 if view and view.touch_mode else 20.0)
		for i in lines.size():
			_text(Vector2(0, y0 + i * 22), lines[i], 17, Color("#7be08a"), HORIZONTAL_ALIGNMENT_RIGHT, vp.x - pad)


func _draw_boss_arrow() -> void:
	if view == null:
		return
	var sp := view.world_to_screen(sim.boss.pos)
	if Rect2(Vector2.ZERO, size).has_point(sp):
		return
	var c := size / 2.0
	var a := (sp - c).angle()
	var p := c + Vector2(cos(a), sin(a)) * (minf(size.x, size.y) / 2.0 - 50.0)
	var pts := PackedVector2Array([Vector2(18, 0), Vector2(-10, -12), Vector2(-10, 12)])
	for i in pts.size():
		pts[i] = p + pts[i].rotated(a)
	draw_colored_polygon(pts, Color("#ff5163"))
