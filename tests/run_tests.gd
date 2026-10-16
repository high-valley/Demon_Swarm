extends SceneTree
## ヘッドレス単体テスト。
##   godot --headless --path . -s res://tests/run_tests.gd
## 失敗があれば終了コード1（CIで検知できる）。

var failures := 0
var passed := 0
var data: DataLoader


func _init() -> void:
	data = DataLoader.load_dir("res://data")
	var tests := [
		"test_data_valid", "test_data_rejects_broken", "test_summon_cost_and_cooldown", "test_summon_fail_keeps_mana",
		"test_summon_cast_range_and_obstacle", "test_ally_cap", "test_slime_quantity_upgrade", "test_dash_iframe",
		"test_king_death_once", "test_order_radius_and_expiry", "test_focus_target_invalidation",
		"test_upgrade_roll_reproducible", "test_upgrade_max_stacks", "test_spawn_reproducible", "test_full_determinism",
		"test_boss_spawn_and_win", "test_no_leak_on_retry", "test_bot_run_short_mode", "test_perf_60_allies_80_enemies",
	]
	for name in tests:
		var before := failures
		call(name)
		if failures == before:
			passed += 1
			print("  ok   ", name)
		else:
			print("  FAIL ", name)
	print("\n%d passed, %d failed" % [passed, tests.size() - passed])
	quit(1 if failures > 0 else 0)


func check(cond: bool, msg: String) -> void:
	if not cond:
		failures += 1
		printerr("    assertion failed: ", msg)


func sim(seed_value: int = 1, mode: String = "short") -> Simulation:
	return Simulation.new(data, seed_value, mode)


func run_ticks(s: Simulation, n: int, move := Vector2.ZERO) -> void:
	for i in n:
		s.step(Simulation.STEP, move)


# ------------------------------------------------------------------ data
func test_data_valid() -> void:
	check(data.is_valid(), "data/*.json に検証エラー: %s" % [data.errors])


func test_data_rejects_broken() -> void:
	var d := DataLoader.new()
	var units: Array = JSON.parse_string(FileAccess.get_file_as_string("res://data/units.json"))
	units[0].erase("max_hp")
	var summons: Array = JSON.parse_string(FileAccess.get_file_as_string("res://data/summons.json"))
	summons[1].unit_id = "swordsman"
	d.setup(data.tuning, units, summons, [], data.upgrades)
	check(not d.is_valid(), "壊れたデータが通ってしまう")
	check(d.errors.size() >= 3, "max_hp欠落・敵を召喚・ボス無しの3件を検出すべき (got %s)" % [d.errors])


# ------------------------------------------------------------------ summon
func test_summon_cost_and_cooldown() -> void:
	var s := sim()
	s.select_slot(0)
	var m := s.mana
	check(s.try_summon(Vector2(50, 0)), "召喚できるはず")
	check(is_equal_approx(s.mana, m - 15.0), "スライムは魔力15")
	check(s.allies.size() == 1, "1体出る")
	check(not s.try_summon(Vector2(50, 0)), "CD中は召喚できない")
	run_ticks(s, 121)
	check(s.try_summon(Vector2(50, 0)), "2秒後は召喚できる")


func test_summon_fail_keeps_mana() -> void:
	var s := sim()
	s.select_slot(2)
	s.mana = 10.0
	check(not s.try_summon(Vector2(50, 0)), "魔力不足で失敗")
	check(is_equal_approx(s.mana, 10.0), "失敗時は魔力を消費しない")
	check(s.allies.is_empty(), "出現しない")


func test_summon_cast_range_and_obstacle() -> void:
	var s := sim()
	s.select_slot(0)
	s.try_summon(Vector2(5000, 0))
	check(s.allies[0].pos.distance_to(s.king.pos) <= 341.0, "射程340でクランプ")
	var s2 := sim()
	s2.obstacles = [{"pos": Vector2(100, 0), "r": 40.0}]
	s2.try_summon(Vector2(100, 0))
	check(not s2.in_obstacle(s2.allies[0].pos, s2.allies[0].r), "障害物の外へ補正")
	var s3 := sim()
	s3.obstacles = [{"pos": Vector2(100, 0), "r": 400.0}]
	var m := s3.mana
	check(not s3.try_summon(Vector2(100, 0)), "安全点がないと失敗")
	check(is_equal_approx(s3.mana, m), "補正失敗時は魔力を消費しない")


func test_ally_cap() -> void:
	var s := sim()
	for i in 60:
		s._spawn_ally(data.units.slime, Vector2(i * 3, 200))
	check(not s.try_summon(Vector2(0, 50)), "60体で上限")
	check(s.allies.size() == 60, "上限を超えない")


func test_slime_quantity_upgrade() -> void:
	var s := sim()
	s.apply_upgrade("slime_qty")
	s.try_summon(Vector2(60, 0))
	check(s.allies.size() == 2, "スライム分裂で2体")


# ------------------------------------------------------------------ king
func test_dash_iframe() -> void:
	var s := sim()
	s.try_dash(Vector2.RIGHT)
	s.damage_king(10)
	check(is_equal_approx(s.hp, 100.0), "ダッシュ無敵中は被弾しない")
	run_ticks(s, 12)
	s.damage_king(10)
	check(is_equal_approx(s.hp, 90.0), "無敵後は被弾する")
	check(not s.try_dash(Vector2.RIGHT), "ダッシュCD4秒")


func test_king_death_once() -> void:
	var s := sim()
	s.damage_king(60)
	s.damage_king(60)
	s.damage_king(60)
	check(s.result == "lose", "HP0で敗北")
	check(s.hp == 0.0, "HPは0で止まる")
	check(not s.try_summon(Vector2(30, 0)), "終了後は召喚できない")


# ------------------------------------------------------------------ orders
func test_order_radius_and_expiry() -> void:
	var s := sim()
	var near := s._spawn_ally(data.units.goblin, Vector2(900, 0))
	var far := s._spawn_ally(data.units.goblin, Vector2(-2000, 1500))
	s.issue_order(Vector2(950, 0))
	check(near.order != null, "命令地点の近くの配下には届く")
	check(far.order == null, "遠くの配下には届かない")
	check(not s.issue_order(Vector2(950, 0)), "命令CD1秒")
	run_ticks(s, 8 * 60 + 2)
	check(near.order == null, "8秒で命令が切れる")


func test_focus_target_invalidation() -> void:
	var s := sim()
	var a := s._spawn_ally(data.units.goblin, Vector2(40, 0))
	var e := s._spawn_enemy(data.units.swordsman, Vector2(120, 0), 1.0)
	s.grid_e.clear()
	s.grid_e.add(e)
	s.issue_order(e.pos)
	check(a.order != null and a.order.target == e, "敵を右クリックで集中攻撃")
	e.hp = 0
	run_ticks(s, 2)
	check(a.order == null and a.tgt == null, "標的が死んだら命令とターゲットが失効")


# ------------------------------------------------------------------ seed
func test_upgrade_roll_reproducible() -> void:
	var a := sim(777)
	var b := sim(777)
	var ids_a := []
	var ids_b := []
	for i in 5:
		ids_a.append(a.roll_upgrades().map(func(u: Dictionary) -> String: return u.id))
		ids_b.append(b.roll_upgrades().map(func(u: Dictionary) -> String: return u.id))
	check(ids_a == ids_b, "同seedで強化候補の順序が一致")
	var c := sim(778)
	var ids_c := []
	for i in 5:
		ids_c.append(c.roll_upgrades().map(func(u: Dictionary) -> String: return u.id))
	check(ids_a != ids_c, "seedが違えば候補も変わる")


func test_upgrade_max_stacks() -> void:
	var s := sim()
	s.apply_upgrade("swarm_evo")
	for i in 30:
		for u in s.roll_upgrades():
			check(u.id != "swarm_evo", "上限に達した強化は候補に出ない")


func test_spawn_reproducible() -> void:
	var a := sim(4242)
	var b := sim(4242)
	run_ticks(a, 60 * 30)
	run_ticks(b, 60 * 30)
	var pa: Array = a.enemies.map(func(e: Unit) -> String: return "%s@%.1f,%.1f" % [e.def.id, e.pos.x, e.pos.y])
	var pb: Array = b.enemies.map(func(e: Unit) -> String: return "%s@%.1f,%.1f" % [e.def.id, e.pos.x, e.pos.y])
	check(pa.size() > 5 and pa == pb, "同seedで敵の出現が一致 (%d体)" % pa.size())


func test_full_determinism() -> void:
	var digests := []
	for k in 2:
		var s := sim(99)
		for i in 60 * 60:
			if i % 30 == 0:
				s.select_slot((i / 30) % 3)
				s.try_summon(s.king.pos + Vector2(120, 0))
			if i % 300 == 0 and not s.enemies.is_empty():
				s.issue_order(s.enemies[0].pos)
			if s.pending_levels > 0:
				s.apply_upgrade(s.roll_upgrades()[0].id)
			s.step(Simulation.STEP, Vector2(1 if (i / 240) % 2 == 0 else -1, 0))
		digests.append(s.state_digest())
	check(digests[0] == digests[1], "同seed・同入力で完全一致: %s" % [digests])


# ------------------------------------------------------------------ flow
func test_boss_spawn_and_win() -> void:
	var s := sim(5, "short")
	s.hp = 1e9
	var boss_at := s.boss_real_sec()
	run_ticks(s, int(boss_at * 60.0) + 2)
	check(s.boss_spawned and s.boss != null, "短縮モードは%.0f秒でボス出現" % boss_at)
	s.boss.hp = 0
	run_ticks(s, 1)
	check(s.result == "win", "ボス撃破で勝利")


func test_no_leak_on_retry() -> void:
	var counts := []
	for k in 4:
		var s := sim(k)
		for i in 60 * 40:
			if i % 20 == 0:
				s.select_slot(i % 3)
				s.try_summon(s.king.pos + Vector2(100, 0))
			if s.pending_levels > 0:
				s.apply_upgrade(s.roll_upgrades()[0].id)
			s.step(Simulation.STEP, Vector2.ZERO)
		s.dispose()
		s = null
		counts.append(Performance.get_monitor(Performance.OBJECT_COUNT))
	check(counts[3] <= counts[1] + 5, "リトライを繰り返してもオブジェクト数が増え続けない %s" % [counts])


## 簡易ボット: 敵から逃げつつ召喚・命令・強化選択。例外なく最後まで回るか
func test_bot_run_short_mode() -> void:
	var outcomes := []
	for seed_value in [11, 22, 33]:
		var s := sim(seed_value, "short")
		var i := 0
		while s.result == "" and i < 60 * 240:
			if s.pending_levels > 0:
				s.apply_upgrade(s.roll_upgrades()[0].id)
			var e := s.grid_e.nearest(s.king.pos, 600.0)
			var mv := Vector2.ZERO
			if e and e.pos.distance_to(s.king.pos) < 200.0:
				mv = (s.king.pos - e.pos).normalized()
			elif not s.souls.is_empty():
				mv = (s.souls[0].pos - s.king.pos).normalized()
			if e and i % 10 == 0:
				s.select_slot([0, 0, 1, 2][(i / 60) % 4])
				s.try_summon((s.king.pos + e.pos) / 2.0)
			if e and i % 300 == 0:
				s.issue_order(e.pos)
			s.step(Simulation.STEP, mv)
			s.drain_events()
			i += 1
		outcomes.append("%d:%s@%.0fs kills=%d lv=%d" % [seed_value, s.result if s.result != "" else "timeout", s.t, s.kills, s.level])
		check(s.kills > 20, "ボットでも敵を倒せる (seed %d)" % seed_value)
	print("    bot: ", outcomes)


func test_perf_60_allies_80_enemies() -> void:
	var s := sim(3)
	s.hp = 1e9
	for i in 60:
		s._spawn_ally(data.units[["slime", "goblin", "skeleton"][i % 3]], Vector2(cos(i) * 150, sin(i) * 150))
	for i in 80:
		s._spawn_enemy(data.units[["swordsman", "archer", "priest"][i % 3]], Vector2(cos(i * 0.7) * 500, sin(i * 0.7) * 500), 50.0)
	s.wave_state = s.wave_state.map(func(_w: Dictionary) -> Dictionary: return {"next": 1e9, "done": true})
	var t0 := Time.get_ticks_usec()
	run_ticks(s, 600)
	var ms := (Time.get_ticks_usec() - t0) / 1000.0 / 600.0
	print("    perf: %.3f ms/tick (allies=%d enemies=%d)  ※60FPSの予算は16.7ms" % [ms, s.allies.size(), s.enemies.size()])
	check(ms < 8.0, "1ティック8ms未満（描画分の余裕を残す）")
