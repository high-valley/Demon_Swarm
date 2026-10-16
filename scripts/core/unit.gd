class_name Unit
extends RefCounted
## 味方・敵共通のユニット状態。ノードではなく軽量オブジェクトとして持ち、
## 描画は BattleView がまとめて行う（大量体数に備えた設計）。

var id: int
var def: Dictionary
var ally: bool
var pos: Vector2
var vel := Vector2.ZERO
var r: float
var hp: float
var max_hp: float
var atk_cd := 0.0
var flash := 0.0
var dead := false
var born := 0.0

# 味方用
var tgt: Unit = null
var order: SquadOrder = null
var arrived := false
var retarget := 0.0
var revived := false

# 敵用
var think := 0.0
var blocker: Unit = null
var ward: Unit = null
var aoe_cd := 3.0
var windup := 0.0


func _init(p_id: int, p_def: Dictionary, p_pos: Vector2, p_max_hp: float) -> void:
	id = p_id
	def = p_def
	ally = p_def.faction == "ally"
	pos = p_pos
	r = float(p_def.radius)
	max_hp = p_max_hp
	hp = p_max_hp
