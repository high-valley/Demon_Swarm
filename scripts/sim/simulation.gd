class_name Simulation
extends RefCounted
## 戦闘ロジック本体。ノードにもエンジンの描画にも依存しない。
## 固定ステップ(1/60秒)で進めるので、同じseed＋同じ入力なら同じ結果になる。
## 描画・効果音・トーストは events キューで外へ通知する。

const STEP := 1.0 / 60.0


class King:
	var pos := Vector2.ZERO
	var r := 14.0
	var dir := Vector2.RIGHT
	var dash_t := 0.0
	var dash_dir := Vector2.RIGHT
	var dash_cd := 0.0
	var iframe := 0.0
	var flash := 0.0


var data: DataLoader
var T: Dictionary
var seed_value: int
var mode: String
var compress := 1.0

# RunState
var t := 0.0
var hp := 100.0
var mana := 100.0
var exp_points := 0.0
var level := 1
var pending_levels := 0
var upgrades: Dictionary = {}
var picks: Array = []
var kills := 0
var summon_count := 0
var max_allies := 0
var result := ""            # "" / "win" / "lose"
var end_timer := 0.0
var boss: Unit = null
var boss_spawned := false
var slot := 0
var summon_cd: Array = [0.0, 0.0, 0.0]
var order_cd := 0.0
var wave_state: Array = []
var counts: Dictionary = {}
var swarm_on := false
var squad_on := false
var stats: Dictionary = {}
var flags: Dictionary = {}

# World
var king := King.new()
var allies: Array = []
var enemies: Array = []
var projs: Array = []       # {pos, vel, dmg, life}
var souls: Array = []       # {pos, v}
var obstacles: Array = []   # {pos, r}
var events: Array = []
var rng: RngStreams
var grid_a := SpatialGrid.new(96.0)
var grid_e := SpatialGrid.new(96.0)
var grid_all := SpatialGrid.new(64.0)
var next_id := 1
var ai_ms := 0.0


func _init(p_data: DataLoader, p_seed: int, p_mode: String = "short") -> void:
	data = p_data
	T = data.tuning
	seed_value = p_seed
	mode = p_mode
	compress = float(T.boss_sec) / float(T.short_boss_sec) if mode == "short" else 1.0
	rng = RngStreams.new(seed_value)
	hp = float(T.king_hp)
	king.r = float(T.king_radius)
	for s in data.summons:
		counts[s.unit_id] = 0
	for _w in data.waves:
		wave_state.append({"next": 0.0, "done": false})
	_generate_obstacles()
	recompute_stats()
	mana = float(stats.max_mana)


# ---------------------------------------------------------------- events
func _emit(type: String, payload: Dictionary = {}) -> void:
	payload["type"] = type
	events.append(payload)


func _fx(kind: String, pos: Vector2, dur: float, extra: Dictionary = {}) -> void:
	var e := extra.duplicate()
	e["kind"] = kind
	e["pos"] = pos
	e["dur"] = dur
	_emit("fx", e)


func _toast(text: String) -> void:
	_emit("toast", {"text": text})


func _fail(text: String) -> bool:
	_toast(text)
	_emit("sfx", {"name": "fail"})
	return false


func drain_events() -> Array:
	var out := events
	events = []
	return out


# ---------------------------------------------------------------- setup
func _generate_obstacles() -> void:
	for i in 34:
		var p := Vector2(rng.map.randf_range(-1700, 1700), rng.map.randf_range(-1700, 1700))
		var r := 26.0 + rng.map.randf() * 38.0
		if p.length() < 260.0:
			continue
		obstacles.append({"pos": p, "r": r})


func recompute_stats() -> void:
	stats = T.base_stats.duplicate()
	flags = {}
	for id in upgrades:
		var def: Dictionary = data.upgrade_by_id[id]
		var n: int = upgrades[id]
		for ef in def.effects:
			if ef.has("stat"):
				stats[ef.stat] = float(stats[ef.stat]) + float(ef.add) * n
			if ef.has("flag"):
				flags[ef.flag] = true
	for a in allies:
		var mhp := float(a.def.max_hp) * (1.0 + float(stats.ally_hp))
		if mhp > a.max_hp:
			a.hp += mhp - a.max_hp
			a.max_hp = mhp


func boss_real_sec() -> float:
	return float(T.boss_sec) / compress


func exp_need() -> float:
	return float(T.exp_base) + level * float(T.exp_per_level)


func command_radius() -> float:
	return float(T.command_radius) * (1.0 + float(stats.command_radius))


# ---------------------------------------------------------------- player actions
func select_slot(i: int) -> void:
	slot = clampi(i, 0, data.summons.size() - 1)


func try_dash(move: Vector2) -> bool:
	if king.dash_cd > 0.0 or result != "":
		return false
	var d := move.normalized() if move.length() > 0.01 else king.dir
	king.dash_dir = d
	king.dash_t = float(T.dash_time)
	king.dash_cd = float(T.dash_cd)
	king.iframe = float(T.dash_iframe)
	_emit("sfx", {"name": "dash"})
	_fx("trail", king.pos, 0.35)
	return true


func clamp_to_cast_range(world_pos: Vector2) -> Vector2:
	var sd: Dictionary = data.summons[slot]
	var off := world_pos - king.pos
	if off.length() > float(sd.cast_range):
		return king.pos + off.normalized() * float(sd.cast_range)
	return world_pos


func try_summon(world_pos: Vector2) -> bool:
	if result != "":
		return false
	var sd: Dictionary = data.summons[slot]
	var ud: Dictionary = data.units[sd.unit_id]
	if summon_cd[slot] > 0.0:
		return _fail("クールダウン中")
	if mana < float(sd.mana_cost):
		return _fail("魔力が足りない")
	var room: int = int(T.ally_cap) - allies.size()
	if room <= 0:
		return _fail("召喚上限 %d 体" % int(T.ally_cap))
	# 射程制限 → 障害物補正。補正に失敗したら魔力は消費しない
	var safe: Variant = find_safe_point(clamp_to_cast_range(world_pos), float(ud.radius))
	if safe == null:
		return _fail("召喚できる場所がない")
	var extra: int = int(stats.slime_quantity) if sd.unit_id == "slime" else 0
	var qty: int = mini(room, int(sd.quantity) + extra)
	for i in qty:
		var a := TAU * i / qty
		var rr := 14.0 if qty > 1 else 0.0
		_spawn_ally(ud, safe + Vector2(cos(a), sin(a)) * rr)
	mana -= float(sd.mana_cost)
	summon_cd[slot] = float(sd.cooldown)
	summon_count += qty
	_emit("sfx", {"name": "summon"})
	_fx("summon", safe, 0.4, {"color": ud.color_c})
	return true


func in_obstacle(p: Vector2, r: float) -> bool:
	for o in obstacles:
		if p.distance_to(o.pos) < o.r + r:
			return true
	return false


func _in_world(p: Vector2) -> bool:
	var h := float(T.world_half)
	return absf(p.x) < h and absf(p.y) < h


func find_safe_point(p: Vector2, r: float) -> Variant:
	if not in_obstacle(p, r) and _in_world(p):
		return p
	for ring in range(1, 7):
		for k in 12:
			var a := k / 12.0 * TAU
			var q := p + Vector2(cos(a), sin(a)) * ring * 18.0
			if not in_obstacle(q, r) and _in_world(q):
				return q
	return null


func _spawn_ally(def: Dictionary, p: Vector2) -> Unit:
	var u := Unit.new(next_id, def, p, float(def.max_hp) * (1.0 + float(stats.ally_hp)))
	next_id += 1
	u.born = t
	allies.append(u)
	return u


func enemy_at(world_pos: Vector2, slack: float = 16.0) -> Unit:
	return grid_e.nearest(world_pos, 48.0, func(e: Unit) -> bool: return world_pos.distance_to(e.pos) < e.r + slack)


func issue_order(world_pos: Vector2) -> bool:
	if result != "":
		return false
	if order_cd > 0.0:
		_toast("命令クールダウン")
		return false
	var target := enemy_at(world_pos)
	var o := SquadOrder.new()
	o.type = SquadOrder.Type.FOCUS if target else SquadOrder.Type.RALLY
	o.target = target
	o.pos = world_pos
	o.issued = t
	o.expires = t + float(T.order_duration)
	var center := target.pos if target else world_pos
	var radius := command_radius()
	# 命令は「命令地点」または「魔王の周り」の指揮半径内の配下だけに届く
	for a in allies:
		if a.pos.distance_to(center) <= radius or a.pos.distance_to(king.pos) <= radius:
			a.order = o
			a.arrived = false
			a.tgt = null
			o.affected += 1
	order_cd = float(T.order_cd)
	_fx("focus" if target else "rally", center, 0.6, {"r": radius})
	if o.affected == 0:
		_toast("指揮半径内に配下がいない")
	else:
		_emit("sfx", {"name": "order"})
	return o.affected > 0


func clear_orders() -> void:
	for a in allies:
		a.order = null
		a.tgt = null
	_toast("命令解除：自律行動へ")


# ---------------------------------------------------------------- upgrades
func roll_upgrades() -> Array:
	var pool: Array = data.upgrades.filter(func(u: Dictionary) -> bool: return int(upgrades.get(u.id, 0)) < int(u.max_stacks))
	var out: Array = []
	var weights: Dictionary = T.rarity_weight
	while out.size() < 3 and not pool.is_empty():
		var total := 0.0
		for u in pool:
			total += float(weights[u.rarity])
		var r := rng.upgrade.randf() * total
		var idx := 0
		for i in pool.size():
			r -= float(weights[pool[i].rarity])
			idx = i
			if r <= 0.0:
				break
		out.append(pool[idx])
		pool.remove_at(idx)
	return out


func apply_upgrade(id: String) -> void:
	upgrades[id] = int(upgrades.get(id, 0)) + 1
	picks.append(data.upgrade_by_id[id].name)
	recompute_stats()
	pending_levels = maxi(0, pending_levels - 1)


# ---------------------------------------------------------------- waves
func _spawn_waves() -> void:
	var wave_t := t * compress
	var minutes := t / 60.0 * (float(T.short_difficulty_rate) if mode == "short" else 1.0)
	for i in data.waves.size():
		var w: Dictionary = data.waves[i]
		var ws: Dictionary = wave_state[i]
		if ws.done or wave_t < float(w.start_sec):
			continue
		if w.get("once", false):
			ws.done = true
			_spawn_boss(w.enemy_id)
			continue
		if wave_t > float(w.end_sec):
			ws.done = true
			continue
		if t < ws.next:
			continue
		ws.next = t + float(w.spawn_interval) / (1.0 + float(w.rate_per_min) * minutes)
		var n := roundi(float(w.group) + float(w.group_per_min) * minutes)
		var ang := rng.spawn.randf() * TAU
		for k in n:
			if enemies.size() >= int(T.enemy_cap):
				break
			var a := ang + (rng.spawn.randf() - 0.5) * 0.6
			var rr := float(T.spawn_ring) + rng.spawn.randf() * 120.0
			_spawn_enemy(data.units[w.enemy_id], king.pos + Vector2(cos(a), sin(a)) * rr, 1.0 + float(T.hp_scale_per_min) * minutes)


func _spawn_enemy(def: Dictionary, p: Vector2, hp_scale: float) -> Unit:
	var h := float(T.world_half)
	p = p.clamp(Vector2(-h, -h), Vector2(h, h))
	var safe: Variant = find_safe_point(p, float(def.radius))
	var e := Unit.new(next_id, def, safe if safe != null else p, float(def.max_hp) * hp_scale)
	next_id += 1
	e.atk_cd = rng.spawn.randf() * float(def.attack_interval)
	enemies.append(e)
	return e


func _spawn_boss(enemy_id: String) -> void:
	var a := rng.spawn.randf() * TAU
	boss = _spawn_enemy(data.units[enemy_id], king.pos + Vector2(cos(a), sin(a)) * 700.0, 1.0)
	boss_spawned = true
	_toast("勇者が現れた")
	_emit("sfx", {"name": "boss"})


# ---------------------------------------------------------------- combat
func damage_king(d: float) -> void:
	if result != "" or king.iframe > 0.0:
		return
	hp -= d
	king.flash = 0.15
	_emit("sfx", {"name": "king"})
	_emit("shake", {"amount": 4.0})
	if hp <= 0.0:
		hp = 0.0
		_end(false)


func _hit_ally(a: Unit, d: float) -> void:
	if a.def.id == "skeleton":
		d /= 1.0 + float(stats.skeleton_defense)
	if a.def.id == "goblin" and squad_on:
		d *= 0.9
	a.hp -= d
	a.flash = 0.1


func _hit_enemy(e: Unit, d: float) -> void:
	e.hp -= d
	e.flash = 0.08
	if rng.misc.randf() < 0.15:
		_emit("sfx", {"name": "hit"})


func _end(win: bool) -> void:
	if result != "":
		return
	result = "win" if win else "lose"
	end_timer = 1.2
	if win:
		_toast("勇者を撃退した")


# ---------------------------------------------------------------- AI
static func _steer(u: Unit, target: Vector2, speed: float, dt: float, stop_at: float) -> void:
	var off := target - u.pos
	var d := off.length()
	var want := off / d * speed if d > stop_at else Vector2.ZERO
	u.vel += (want - u.vel) * minf(1.0, dt * 10.0)


static func _away(u: Unit, from: Vector2) -> Vector2:
	return u.pos * 2.0 - from


func _ally_update(a: Unit, dt: float) -> void:
	var d := a.def
	a.retarget -= dt
	a.atk_cd -= dt
	a.flash -= dt
	if a.order and a.order.is_expired(t):
		a.order = null
		a.tgt = null
	if a.tgt and a.tgt.dead:
		a.tgt = null   # ターゲット失効
	var goal: Variant = null
	if a.order:
		var o := a.order
		if o.type == SquadOrder.Type.FOCUS:
			a.tgt = o.target
		else:
			if not a.arrived and a.pos.distance_to(o.pos) > 50.0:
				goal = o.pos
				a.tgt = null
			else:
				a.arrived = true
				if a.retarget <= 0.0:
					a.tgt = grid_e.nearest(o.pos, 180.0)
					a.retarget = 0.25
				if a.tgt == null:
					var ang := a.id * 2.399
					goal = o.pos + Vector2(cos(ang), sin(ang)) * 30.0
	else:
		match d.target_policy:
			"guard":
				var threat := grid_e.nearest(king.pos, 460.0)
				if threat:
					var dir := (threat.pos - king.pos).normalized()
					var side := ((a.id % 7) - 3) * 18.0
					goal = king.pos + dir * 70.0 + Vector2(-dir.y, dir.x) * side
					if a.retarget <= 0.0:
						a.tgt = grid_e.nearest(a.pos, float(d.attack_range) + a.r + 30.0)
						a.retarget = 0.2
				else:
					a.tgt = null
			"swarm":
				if a.retarget <= 0.0:
					a.retarget = 0.2 + (a.id % 5) * 0.02
					a.tgt = grid_e.nearest(a.pos, 420.0)
			"threat":
				if a.retarget <= 0.0:
					a.retarget = 0.2 + (a.id % 5) * 0.02
					a.tgt = grid_e.nearest(king.pos, 520.0)
	var speed := float(d.move_speed)
	if d.id == "slime" and swarm_on:
		speed *= 1.2
	if a.tgt and goal == null:
		var reach := float(d.attack_range) + a.r + a.tgt.r
		_steer(a, a.tgt.pos, speed, dt, reach - 2.0)
		if a.pos.distance_to(a.tgt.pos) <= reach + 2.0 and a.atk_cd <= 0.0:
			var dmg := float(d.attack)
			if d.id == "slime":
				dmg *= 1.0 + minf(0.4, counts.get("slime", 0) * 0.01)   # 集団強化
			_hit_enemy(a.tgt, dmg)
			var aspd := 1.0 + float(stats.goblin_attack_speed) if d.id == "goblin" else 1.0
			a.atk_cd = float(d.attack_interval) / aspd
			_fx("spark", a.tgt.pos, 0.15, {"color": d.color_c})
	elif goal != null:
		_steer(a, goal, speed, dt, 6.0)
	else:
		var ang := a.id * 2.399 + t * 0.2
		var rr := 70.0 + (a.id % 4) * 16.0
		_steer(a, king.pos + Vector2(cos(ang), sin(ang)) * rr, speed * 0.8, dt, 10.0)


func _enemy_update(e: Unit, dt: float) -> void:
	var d := e.def
	e.atk_cd -= dt
	e.think -= dt
	e.flash -= dt
	if e.think <= 0.0:
		e.think = 0.18
		e.blocker = grid_a.nearest(e.pos, e.r + 28.0)
		if d.ai == "support":
			e.ward = _lowest_enemy(e)
	if e.blocker and e.blocker.dead:
		e.blocker = null
	var dk := e.pos.distance_to(king.pos)
	match d.ai:
		"melee", "boss":
			var king_reach := float(d.attack_range) + e.r + king.r
			var target_pos := king.pos
			var target_unit: Unit = null
			var reach := king_reach
			# 敵の目的は常に魔王。足止めされた時だけ妨害排除として配下を攻撃
			if dk > king_reach and e.blocker:
				target_unit = e.blocker
				target_pos = e.blocker.pos
				reach = float(d.attack_range) + e.r + e.blocker.r
			_steer(e, king.pos, float(d.move_speed) * (0.55 if e.blocker else 1.0), dt, king_reach - 4.0)
			if e.pos.distance_to(target_pos) <= reach + 2.0 and e.atk_cd <= 0.0:
				e.atk_cd = float(d.attack_interval)
				if target_unit:
					_hit_ally(target_unit, float(d.attack))
				else:
					damage_king(float(d.attack))
				_fx("slash", target_pos, 0.18)
			if d.ai == "boss":
				_boss_aoe(e, dt, dk)
		"ranged":
			var aim := king.pos
			if e.blocker:
				_steer(e, _away(e, e.blocker.pos), float(d.move_speed) * 0.8, dt, 0.0)
				aim = e.blocker.pos
			elif dk > 250.0:
				_steer(e, king.pos, float(d.move_speed), dt, 0.0)
			elif dk < 190.0:
				_steer(e, _away(e, king.pos), float(d.move_speed) * 0.7, dt, 0.0)
			else:
				_steer(e, e.pos, 0.0, dt, 1.0)
			if e.pos.distance_to(aim) <= float(d.attack_range) and e.atk_cd <= 0.0:
				e.atk_cd = float(d.attack_interval)
				var ang := (aim - e.pos).angle() + (rng.misc.randf() - 0.5) * 0.08
				projs.append({"pos": e.pos, "vel": Vector2(cos(ang), sin(ang)) * 430.0, "dmg": float(d.attack), "life": 1.0})
		"support":
			if e.blocker:
				_steer(e, _away(e, e.blocker.pos), float(d.move_speed), dt, 0.0)
			elif dk > 260.0:
				_steer(e, king.pos, float(d.move_speed), dt, 0.0)
			elif dk < 210.0:
				_steer(e, _away(e, king.pos), float(d.move_speed) * 0.7, dt, 0.0)
			else:
				_steer(e, e.pos, 0.0, dt, 1.0)
			var w := e.ward
			if w and not w.dead and e.atk_cd <= 0.0 and w.hp < w.max_hp:
				e.atk_cd = float(d.attack_interval)
				w.hp = minf(w.max_hp, w.hp + float(d.heal) + w.max_hp * 0.06)
				_fx("heal", e.pos, 0.35, {"to": w.pos})


func _boss_aoe(e: Unit, dt: float, dk: float) -> void:
	var aoe: Dictionary = e.def.aoe
	var radius := float(aoe.radius)
	e.aoe_cd -= dt
	if e.windup > 0.0:
		e.windup -= dt
		if e.windup <= 0.0:
			for a in grid_a.query(e.pos, radius + 20.0):
				if not a.dead and a.pos.distance_to(e.pos) < radius + a.r:
					_hit_ally(a, float(aoe.damage))
			if dk < radius + king.r:
				damage_king(float(aoe.damage) * 0.6)
			_fx("boom", e.pos, 0.35, {"r": radius})
			_emit("shake", {"amount": 6.0})
			_emit("sfx", {"name": "boss"})
	elif e.aoe_cd <= 0.0 and (grid_a.count(e.pos, radius) >= 4 or dk < radius):
		e.windup = float(aoe.windup)
		e.aoe_cd = float(aoe.interval)
		_fx("warn", e.pos, float(aoe.windup), {"r": radius, "follow": e})


func _lowest_enemy(p: Unit) -> Unit:
	var best: Unit = null
	var best_ratio := 1.0
	var rng_r := float(p.def.attack_range)
	for e in grid_e.query(p.pos, rng_r):
		if e.dead or e.pos.distance_to(p.pos) >= rng_r:
			continue
		var ratio: float = e.hp / e.max_hp
		if ratio < best_ratio:
			best_ratio = ratio
			best = e
	return best


# ---------------------------------------------------------------- physics
func _resolve_collisions() -> void:
	grid_all.clear()
	for a in allies:
		grid_all.add(a)
	for e in enemies:
		grid_all.add(e)
	for u in allies + enemies:
		for n in grid_all.query(u.pos, u.r + 26.0):
			if n.id <= u.id:
				continue
			var off: Vector2 = n.pos - u.pos
			var rr: float = u.r + n.r
			var d2 := off.length_squared()
			if d2 >= rr * rr or d2 == 0.0:
				continue
			var d := sqrt(d2)
			var nrm := off / d
			var push := rr - d
			var mu := float(u.def.mass)
			var mn := float(n.def.mass)
			u.pos -= nrm * push * (mn / (mu + mn))
			n.pos += nrm * push * (mu / (mu + mn))
	# 魔王は配下に押されない。敵だけを魔王から押し出す
	for e in enemies:
		var off: Vector2 = e.pos - king.pos
		var rr: float = e.r + king.r
		if off.length() < rr and off.length() > 0.0:
			e.pos = king.pos + off.normalized() * rr
	var h := float(T.world_half)
	var bodies: Array = allies + enemies
	bodies.append(king)
	for u in bodies:
		for o in obstacles:
			var off: Vector2 = u.pos - o.pos
			var rr: float = o.r + u.r
			if off.length() < rr and off.length() > 0.0:
				u.pos = o.pos + off.normalized() * rr
		u.pos = u.pos.clamp(Vector2(-h, -h), Vector2(h, h))


# ---------------------------------------------------------------- tick
func step(dt: float, move: Vector2) -> void:
	t += dt
	var mv := move.normalized() if move.length() > 0.01 else Vector2.ZERO
	if mv != Vector2.ZERO:
		king.dir = mv
	if king.dash_t > 0.0:
		king.dash_t -= dt
		king.pos += king.dash_dir * float(T.dash_speed) * dt
	else:
		king.pos += mv * float(T.king_speed) * dt
	king.dash_cd = maxf(0.0, king.dash_cd - dt)
	king.iframe = maxf(0.0, king.iframe - dt)
	king.flash -= dt
	mana = minf(float(stats.max_mana), mana + float(stats.mana_regen) * dt)
	for i in summon_cd.size():
		summon_cd[i] = maxf(0.0, summon_cd[i] - dt)
	order_cd = maxf(0.0, order_cd - dt)

	if result == "":
		_spawn_waves()

	grid_a.clear()
	grid_e.clear()
	for k in counts:
		counts[k] = 0
	for a in allies:
		grid_a.add(a)
		counts[a.def.id] = counts.get(a.def.id, 0) + 1
	for e in enemies:
		grid_e.add(e)
	swarm_on = flags.get("swarm_evo", false) and counts.get("slime", 0) >= 20
	squad_on = flags.get("squad", false) and counts.get("goblin", 0) >= 5 and counts.get("skeleton", 0) >= 5
	max_allies = maxi(max_allies, allies.size())

	var t0 := Time.get_ticks_usec()
	for a in allies:
		_ally_update(a, dt)
	for e in enemies:
		_enemy_update(e, dt)
	ai_ms = ai_ms * 0.95 + (Time.get_ticks_usec() - t0) / 1000.0 * 0.05
	for u in allies:
		u.pos += u.vel * dt
	for u in enemies:
		u.pos += u.vel * dt

	# 矢は配下（特にスケルトン）が体で防げる
	for p in projs:
		p.pos += p.vel * dt
		p.life -= dt
		if in_obstacle(p.pos, 2.0):
			p.life = 0.0
			continue
		var pp: Vector2 = p.pos
		var hit := grid_a.nearest(pp, 24.0, func(a: Unit) -> bool: return pp.distance_to(a.pos) < a.r + 3.0)
		if hit:
			_hit_ally(hit, p.dmg)
			p.life = 0.0
			continue
		if pp.distance_to(king.pos) < king.r + 3.0:
			damage_king(p.dmg)
			p.life = 0.0
	projs = projs.filter(func(p: Dictionary) -> bool: return p.life > 0.0)

	_resolve_collisions()

	for a in allies:
		if a.hp > 0.0:
			continue
		if a.def.id == "skeleton" and flags.get("necro", false) and not a.revived and rng.misc.randf() < 0.2:
			a.revived = true
			a.hp = a.max_hp * 0.5
			_fx("summon", a.pos, 0.5, {"color": Color("#b48cff")})
		else:
			a.dead = true
			_release(a)
			_fx("poof", a.pos, 0.3, {"color": a.def.color_c})
	for e in enemies:
		if e.hp > 0.0 or e.dead:
			continue
		e.dead = true
		_release(e)
		kills += 1
		var drops := mini(int(e.def.get("soul", 1)), 6)
		var value := float(e.def.get("soul", 1)) / drops
		for i in drops:
			souls.append({"pos": e.pos + Vector2(rng.misc.randf() - 0.5, rng.misc.randf() - 0.5) * 20.0, "v": value})
		_fx("poof", e.pos, 0.35, {"color": e.def.color_c})
		if e == boss:
			_end(true)
	allies = allies.filter(func(a: Unit) -> bool: return not a.dead)
	enemies = enemies.filter(func(e: Unit) -> bool: return not e.dead)

	var pickup := float(T.soul_pickup)
	var kept: Array = []
	for s in souls:
		var off: Vector2 = king.pos - s.pos
		var d := off.length()
		if d < king.r + 8.0:
			exp_points += s.v
			continue
		if d < pickup:
			s.pos += off / d * maxf(220.0, 600.0 - d * 2.0) * dt
		kept.append(s)
	souls = kept
	if souls.size() > 400:
		souls = souls.slice(souls.size() - 400)
	while exp_points >= exp_need():
		exp_points -= exp_need()
		level += 1
		pending_levels += 1
		_emit("sfx", {"name": "level"})

	if result != "":
		end_timer -= dt


## 相互参照（tgt⇄blocker など）の循環を断ち、RefCounted を確実に解放する
static func _release(u: Unit) -> void:
	u.tgt = null
	u.order = null
	u.blocker = null
	u.ward = null


## ラン終了・リトライ時に呼ぶ。参照を全部切ってメモリリークを防ぐ
func dispose() -> void:
	for u in allies + enemies:
		_release(u)
	allies.clear()
	enemies.clear()
	projs.clear()
	souls.clear()
	events.clear()
	boss = null


## テスト・デバッグ用: 状態を短い文字列に要約（決定性チェックに使う）
func state_digest() -> String:
	var sx := 0.0
	for e in enemies:
		sx += e.pos.x * 0.37 + e.pos.y * 0.11 + e.hp
	for a in allies:
		sx += a.pos.x * 0.13 + a.pos.y * 0.29 + a.hp
	return "%d|%d|%d|%d|%.2f|%.2f|%s" % [enemies.size(), allies.size(), kills, level, hp, sx, str(picks)]
