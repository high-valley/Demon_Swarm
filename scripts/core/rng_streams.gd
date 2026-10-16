class_name RngStreams
extends RefCounted
## 用途ごとに乱数列を分ける。
## 例えば戦闘中の演出用乱数が増えても、敵出現や強化候補の順序は変わらない。

var spawn := RandomNumberGenerator.new()    # 敵の出現位置
var upgrade := RandomNumberGenerator.new()  # レベルアップ3択
var misc := RandomNumberGenerator.new()     # 戦闘中の細かなばらつき
var map := RandomNumberGenerator.new()      # 障害物配置


func _init(seed_value: int) -> void:
	spawn.seed = _mix(seed_value, 0x9E3779B1)
	upgrade.seed = _mix(seed_value, 0x85EBCA6B)
	misc.seed = _mix(seed_value, 0xC2B2AE35)
	map.seed = _mix(seed_value, 0x27D4EB2F)


static func _mix(a: int, b: int) -> int:
	# 文字列ハッシュはプラットフォームに依存しないので、seedと用途IDを混ぜるのに使う
	return ("%d:%d" % [a, b]).hash()
