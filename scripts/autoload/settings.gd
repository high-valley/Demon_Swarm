extends Node
## 設定の保存と読込。デスクトップでは user:// のファイル、Web ではブラウザ内(IndexedDB)に保存される。

signal changed

const PATH := "user://settings.cfg"
const SCHEMA_VERSION := 1

var volume := 0.6
var shake := true
var debug_hud := false


func _ready() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(PATH) == OK:
		volume = clampf(float(cfg.get_value("audio", "volume", volume)), 0.0, 1.0)
		shake = bool(cfg.get_value("video", "shake", shake))
		debug_hud = bool(cfg.get_value("debug", "hud", debug_hud))
	_apply()


func save() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("meta", "schema_version", SCHEMA_VERSION)
	cfg.set_value("audio", "volume", volume)
	cfg.set_value("video", "shake", shake)
	cfg.set_value("debug", "hud", debug_hud)
	cfg.save(PATH)
	_apply()
	changed.emit()


func _apply() -> void:
	var bus := AudioServer.get_bus_index("Master")
	AudioServer.set_bus_mute(bus, volume <= 0.001)
	AudioServer.set_bus_volume_db(bus, linear_to_db(maxf(volume, 0.001)))
