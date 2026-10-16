class_name SquadOrder
extends RefCounted
## 部隊命令。複数の配下が同じ命令オブジェクトを参照する。

enum Type { FOCUS, RALLY }

var type: Type
var target: Unit = null      # FOCUS のときの標的
var pos: Vector2             # RALLY の集合地点 / 命令地点
var issued: float
var expires: float
var affected := 0


func is_expired(now: float) -> bool:
	return now >= expires or (type == Type.FOCUS and (target == null or target.dead))
