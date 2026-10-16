extends Node
## ゲーム全体の状態機械と配線。
##   TITLE → PLAY ⇄ (LEVELUP / PAUSE) → RESULT → PLAY or TITLE
## Simulation（ロジック）・BattleView/Hud（表示）・InputRouter/TouchControls（入力）・Menus（画面）をつなぐだけ。

enum State { TITLE, PLAY, LEVELUP, PAUSE, RESULT }

var state := State.TITLE
var data: DataLoader
var sim: Simulation
var current_seed := 0
var current_mode := "short"
var info_open := false

var router: InputRouter
var view: BattleView
var hud: Hud
var touch: TouchControls
var menus: Menus
var sfx: Sfx


func _ready() -> void:
	randomize()
	data = DataLoader.load_dir("res://data")
	if not data.is_valid():
		_show_fatal("データ定義にエラーがあります:\n" + "\n".join(data.errors))
		return
	router = InputRouter.new()
	add_child(router)
	view = BattleView.new()
	view.router = router
	add_child(view)
	var layer := CanvasLayer.new()
	add_child(layer)
	hud = Hud.new()
	hud.view = view
	layer.add_child(hud)
	touch = TouchControls.new()
	touch.router = router
	touch.sim_ref = func() -> Simulation: return sim
	layer.add_child(touch)
	menus = Menus.new()
	layer.add_child(menus)
	sfx = Sfx.new()
	add_child(sfx)

	router.summon_at.connect(func(p: Vector2) -> void: if _playing(): sim.try_summon(view.screen_to_world(p)))
	router.order_at.connect(func(p: Vector2) -> void: if _playing(): sim.issue_order(view.screen_to_world(p)))
	router.dash_requested.connect(func() -> void: if _playing(): sim.try_dash(router.move_vector()))
	router.slot_selected.connect(func(i: int) -> void: if _playing(): sim.select_slot(i))
	router.slot_cycled.connect(func(d: int) -> void: if _playing(): sim.select_slot(posmod(sim.slot + d, 3)))
	router.clear_orders_requested.connect(func() -> void: if _playing(): sim.clear_orders())
	router.pause_toggled.connect(_on_pause_toggled)
	router.info_requested.connect(_on_info)
	router.debug_toggled.connect(func() -> void:
		Settings.debug_hud = not Settings.debug_hud
		Settings.save())
	router.upgrade_hotkey.connect(func(i: int) -> void: if state == State.LEVELUP: menus.choose_card(i))
	router.touch_mode_changed.connect(_on_touch_mode)

	menus.play_pressed.connect(func(s: int, m: String) -> void: _start(s, m))
	menus.resume_pressed.connect(func() -> void: _set_state(State.PLAY))
	menus.retire_pressed.connect(_to_title)
	menus.upgrade_chosen.connect(_on_upgrade)
	menus.retry_same_pressed.connect(func() -> void: _start(current_seed, current_mode))
	menus.retry_new_pressed.connect(func() -> void: _start(randi() % 1000000, current_mode))
	menus.title_pressed.connect(_to_title)
	menus.info_closed.connect(func() -> void: _on_info(false))

	get_window().size_changed.connect(_apply_ui_scale)
	router.set_touch_mode(Platform.prefers_touch())
	_on_touch_mode(router.touch_mode)
	current_seed = randi() % 1000000
	_to_title()
	_dev_hooks()


## 開発用: `godot --path . -- --shot=out.png [--play] [--touch] [--frames=N]`
## 指定フレーム後にスクリーンショットを保存して終了する（見た目の確認・スモークテスト用）
func _dev_hooks() -> void:
	var args := {}
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=", true, 1)
		args[kv[0]] = kv[1] if kv.size() > 1 else "1"
	if not args.has("shot"):
		return
	if args.has("touch"):
		router.set_touch_mode(true)
	if args.has("play"):
		_start(12345, "short")
	var frames := int(args.get("frames", "30"))
	for i in frames:
		await get_tree().process_frame
		if args.has("play") and _playing() and i % 20 == 0:
			var e := sim.grid_e.nearest(sim.king.pos, 600.0)
			if e:
				sim.select_slot((i / 20) % 3)
				sim.try_summon((sim.king.pos + e.pos) / 2.0)
		if state == State.LEVELUP and i < frames - 5:
			menus.choose_card(0)
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(args.shot)
	print("screenshot saved: ", args.shot)
	get_tree().quit()


func _playing() -> bool:
	return state == State.PLAY and sim != null


# ------------------------------------------------------------------ loop
## 物理ティック(60Hz固定)でシミュレーションを進める → seed再現性
func _physics_process(_delta: float) -> void:
	if not _playing():
		return
	sim.step(Simulation.STEP, router.move_vector())
	for e in sim.drain_events():
		match e.type:
			"fx": view.add_fx(e)
			"sfx": sfx.play(e.name)
			"toast": hud.toast(e.text)
			"shake":
				if Settings.shake:
					view.add_shake(e.amount)
	if sim.result != "":
		if sim.end_timer <= 0.0:
			_show_result()
	elif sim.pending_levels > 0:
		_open_levelup()


# ------------------------------------------------------------------ state
func _set_state(s: State) -> void:
	state = s
	router.gameplay_enabled = s == State.PLAY
	touch.reset()
	if s != State.PLAY:
		_on_info(false)
	match s:
		State.PLAY:
			menus.hide_all()
			get_viewport().gui_release_focus()
		State.PAUSE:
			menus.show_pause()
	hud.visible = sim != null and s != State.TITLE
	touch.visible = router.touch_mode and s == State.PLAY


func _start(seed_value: int, mode: String) -> void:
	if sim:
		sim.dispose()   # 前回ランの参照を断ってリークを防ぐ
	current_seed = seed_value
	current_mode = mode
	sim = Simulation.new(data, seed_value, mode)
	view.sim = sim
	view.clear()
	hud.sim = sim
	_set_state(State.PLAY)


func _to_title() -> void:
	if sim:
		sim.dispose()
	sim = null
	view.sim = null
	hud.sim = null
	_set_state(State.TITLE)
	menus.show_title(current_seed)


func _on_pause_toggled() -> void:
	if state == State.PLAY:
		_set_state(State.PAUSE)
	elif state == State.PAUSE:
		_set_state(State.PLAY)


func _open_levelup() -> void:
	_set_state(State.LEVELUP)
	var shown_level := sim.level - sim.pending_levels + 1
	menus.show_levelup(shown_level, sim.roll_upgrades(), sim.upgrades)


func _on_upgrade(id: String) -> void:
	if state != State.LEVELUP:
		return
	sim.apply_upgrade(id)
	if sim.pending_levels > 0:
		_open_levelup()
	else:
		_set_state(State.PLAY)


func _show_result() -> void:
	_set_state(State.RESULT)
	var rows := [["生存時間", Hud.fmt_time(sim.t)], ["召喚総数", sim.summon_count], ["撃破数", sim.kills],
		["最大同時召喚", sim.max_allies], ["到達レベル", sim.level], ["seed", sim.seed_value]]
	var picks := "選んだ強化：" + "、".join(sim.picks) if not sim.picks.is_empty() else "強化は選ばなかった"
	menus.show_result(sim.result == "win", rows, picks)


func _on_info(show: bool) -> void:
	if show and _playing():
		info_open = true
		menus.show_info(_info_text())
	elif info_open:
		info_open = false
		menus.hide_info()


func _info_text() -> String:
	var lines: Array = ["【召喚】"]
	var policy := {"swarm": "最寄りの敵に群がる", "threat": "魔王に近い敵を狙う", "guard": "魔王と敵の間に割り込む"}
	for sd in data.summons:
		var u: Dictionary = data.units[sd.unit_id]
		lines.append("  %s  魔%d / CD%ds  ×%d  … %s" % [u.name, int(sd.mana_cost), int(sd.cooldown), int(sim.counts.get(sd.unit_id, 0)), policy[u.target_policy]])
	lines.append("【シナジー】")
	for pair in [["swarm_evo", sim.swarm_on], ["necro", sim.flags.get("necro", false)], ["squad", sim.squad_on]]:
		var u: Dictionary = data.upgrade_by_id[pair[0]]
		var st := "未取得"
		if sim.upgrades.has(pair[0]):
			st = "発動中" if pair[1] else "取得済（条件未達）"
		lines.append("  %s：%s" % [u.name, st])
	lines.append("【敵の特性】")
	lines.append("  戦士：魔王へ直進。配下に足止めされる")
	lines.append("  弓兵：距離を取り魔王を射る。矢は配下が体で防げる")
	lines.append("  僧侶：後方から味方を回復。集中攻撃で落とす")
	lines.append("  勇者：密集した配下を範囲技で崩す（赤い円が予兆）")
	return "\n".join(lines)


# ------------------------------------------------------------------ touch / scale
func _on_touch_mode(on: bool) -> void:
	view.touch_mode = on
	menus.set_touch_mode(on)
	touch.visible = on and state == State.PLAY
	_apply_ui_scale()


## スマホでは文字やボタンが小さくなりすぎないよう、論理解像度の短辺を約600にする
func _apply_ui_scale() -> void:
	var win := get_window()
	if not router.touch_mode:
		win.content_scale_factor = 1.0
		return
	var phys := Vector2(win.size)
	var base_fit := minf(phys.x / 1920.0, phys.y / 1080.0)
	var want := minf(phys.x, phys.y) / 600.0
	win.content_scale_factor = clampf(want / maxf(base_fit, 0.01), 1.0, 4.0)


func _show_fatal(text: String) -> void:
	var l := Label.new()
	l.text = text
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(l)
