class_name DataLoader
extends RefCounted
## data/*.json を読み込み、検証して型付きの辞書として提供する。
## バランス値はコードに書かず、すべてここから参照する。

const REQUIRED := {
	"unit": ["id", "name", "faction", "max_hp", "move_speed", "attack", "attack_range", "attack_interval", "radius", "color", "mass"],
	"summon": ["unit_id", "mana_cost", "cooldown", "quantity", "cast_range"],
	"wave": ["enemy_id", "start_sec"],
	"upgrade": ["id", "name", "desc", "rarity", "max_stacks", "effects"],
	"tuning": ["schema_version", "king_hp", "king_speed", "king_radius", "dash_speed", "dash_time", "dash_cd", "dash_iframe",
		"ally_cap", "enemy_cap", "order_duration", "order_cd", "command_radius", "soul_pickup", "world_half", "spawn_ring",
		"boss_sec", "short_boss_sec", "short_difficulty_rate", "hp_scale_per_min", "exp_base", "exp_per_level", "base_stats", "rarity_weight"],
}
const POLICIES := ["swarm", "threat", "guard"]
const ENEMY_AI := ["melee", "ranged", "support", "boss"]

var tuning: Dictionary = {}
var units: Dictionary = {}          # id -> unit definition
var summons: Array = []
var waves: Array = []
var upgrades: Array = []
var upgrade_by_id: Dictionary = {}
var errors: PackedStringArray = []


static func load_dir(dir: String = "res://data") -> DataLoader:
	var d := DataLoader.new()
	d.setup(d._read(dir + "/tuning.json"), d._read(dir + "/units.json"), d._read(dir + "/summons.json"),
		d._read(dir + "/waves.json"), d._read(dir + "/upgrades.json"))
	return d


## テストから辞書を直接渡せるようにしている
func setup(p_tuning: Variant, p_units: Variant, p_summons: Variant, p_waves: Variant, p_upgrades: Variant) -> void:
	tuning = p_tuning if p_tuning is Dictionary else {}
	summons = p_summons if p_summons is Array else []
	waves = p_waves if p_waves is Array else []
	upgrades = p_upgrades if p_upgrades is Array else []
	units = {}
	if p_units is Array:
		for u in p_units:
			if u is Dictionary and u.has("id"):
				units[u.id] = u
	for u in upgrades:
		if u is Dictionary and u.has("id"):
			upgrade_by_id[u.id] = u
	validate()
	if errors.is_empty():
		for u in units.values():
			u["color_c"] = Color.html(u.color)


func is_valid() -> bool:
	return errors.is_empty()


func _read(path: String) -> Variant:
	if not FileAccess.file_exists(path):
		errors.append("ファイルがない: " + path)
		return null
	var text := FileAccess.get_file_as_string(path)
	var v: Variant = JSON.parse_string(text)
	if v == null:
		errors.append("JSONとして読めない: " + path)
	return v


func _require(kind: String, d: Variant, label: String) -> bool:
	if not d is Dictionary:
		errors.append("%s: 辞書ではない" % label)
		return false
	var ok := true
	for key in REQUIRED[kind]:
		if not d.has(key):
			errors.append("%s: '%s' がない" % [label, key])
			ok = false
	return ok


func validate() -> void:
	if _require("tuning", tuning, "tuning"):
		for stat in ["max_mana", "mana_regen"]:
			if not tuning.base_stats.has(stat):
				errors.append("tuning.base_stats: '%s' がない" % stat)
	for id in units:
		var u: Dictionary = units[id]
		var label := "units[%s]" % id
		if not _require("unit", u, label):
			continue
		if u.faction == "ally":
			if not u.get("target_policy", "") in POLICIES:
				errors.append("%s: target_policy は %s のどれか" % [label, POLICIES])
		elif u.faction == "enemy":
			if not u.get("ai", "") in ENEMY_AI:
				errors.append("%s: ai は %s のどれか" % [label, ENEMY_AI])
			if u.ai == "boss" and not u.has("aoe"):
				errors.append("%s: ボスには aoe が必要" % label)
		else:
			errors.append("%s: faction は ally か enemy" % label)
		for key in ["max_hp", "move_speed", "attack_interval", "radius", "mass"]:
			if float(u.get(key, 0)) <= 0.0:
				errors.append("%s: %s は正の数" % [label, key])
		if not Color.html_is_valid(str(u.color)):
			errors.append("%s: color が不正" % label)
	if summons.size() != 3:
		errors.append("summons: MVPは3スロット固定（現在 %d）" % summons.size())
	for i in summons.size():
		var s: Variant = summons[i]
		var label := "summons[%d]" % i
		if not _require("summon", s, label):
			continue
		if not units.has(s.unit_id) or units[s.unit_id].faction != "ally":
			errors.append("%s: unit_id '%s' は味方ユニットではない" % [label, s.unit_id])
	var has_boss := false
	for i in waves.size():
		var w: Variant = waves[i]
		var label := "waves[%d]" % i
		if not _require("wave", w, label):
			continue
		if not units.has(w.enemy_id) or units[w.enemy_id].faction != "enemy":
			errors.append("%s: enemy_id '%s' は敵ユニットではない" % [label, w.enemy_id])
			continue
		if w.get("once", false):
			has_boss = has_boss or units[w.enemy_id].ai == "boss"
		else:
			for key in ["end_sec", "spawn_interval", "group", "group_per_min", "rate_per_min"]:
				if not w.has(key):
					errors.append("%s: '%s' がない" % [label, key])
			if float(w.get("spawn_interval", 0)) <= 0.0:
				errors.append("%s: spawn_interval は正の数" % label)
	if not has_boss:
		errors.append("waves: ボス出現（once: true）の定義がない")
	for u in upgrades:
		var label := "upgrades[%s]" % str(u.get("id", "?")) if u is Dictionary else "upgrades[?]"
		if not _require("upgrade", u, label):
			continue
		if tuning.has("rarity_weight") and not tuning.rarity_weight.has(u.rarity):
			errors.append("%s: rarity '%s' の重みがない" % [label, u.rarity])
		for ef in u.effects:
			if ef.has("stat"):
				if tuning.has("base_stats") and not tuning.base_stats.has(ef.stat):
					errors.append("%s: 未知のstat '%s'" % [label, ef.stat])
				if not ef.has("add"):
					errors.append("%s: stat効果には add が必要" % label)
			elif not ef.has("flag"):
				errors.append("%s: 効果は stat か flag" % label)
