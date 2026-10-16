class_name InputRouter
extends Node
## キーボード・マウス・タッチを「プレイヤーの意図」に変換する層。
## ゲーム側（Main / Simulation）は入力デバイスを知らず、ここのシグナルと move_vector() だけを使う。
## ゲームパッド対応を足すときもここだけを触ればよい。

signal summon_at(screen_pos: Vector2)
signal order_at(screen_pos: Vector2)
signal dash_requested
signal slot_selected(index: int)
signal slot_cycled(step: int)
signal clear_orders_requested
signal pause_toggled
signal info_requested(show: bool)
signal debug_toggled
signal upgrade_hotkey(index: int)
signal touch_mode_changed(on: bool)

const ACTIONS := {
	"move_left": [KEY_A, KEY_LEFT], "move_right": [KEY_D, KEY_RIGHT],
	"move_up": [KEY_W, KEY_UP], "move_down": [KEY_S, KEY_DOWN],
	"dash": [KEY_SPACE], "slot_1": [KEY_1], "slot_2": [KEY_2], "slot_3": [KEY_3],
	"clear_orders": [KEY_R], "pause": [KEY_ESCAPE, KEY_P], "info": [KEY_TAB], "debug_hud": [KEY_F3],
}

var gameplay_enabled := false       # プレイ中だけ true（Main が切り替える）
var touch_mode := false
var touch_move := Vector2.ZERO      # TouchControls の仮想スティックが書き込む
var mouse_pos := Vector2.ZERO
var mouse_inside := false


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	for action in ACTIONS:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
			for key in ACTIONS[action]:
				var ev := InputEventKey.new()
				ev.physical_keycode = key
				InputMap.action_add_event(action, ev)


func move_vector() -> Vector2:
	if touch_move.length() > 0.0:
		return touch_move
	return Input.get_vector("move_left", "move_right", "move_up", "move_down")


func set_touch_mode(on: bool) -> void:
	if on == touch_mode:
		return
	touch_mode = on
	if on:
		mouse_inside = false
	touch_mode_changed.emit(on)


static func is_real_mouse(event: InputEvent) -> bool:
	# タッチから自動生成されたマウスイベントは device = DEVICE_ID_EMULATION
	return event.device != InputEvent.DEVICE_ID_EMULATION


func _input(event: InputEvent) -> void:
	# 実際に使われたデバイスでUIモードを切り替える
	if event is InputEventScreenTouch or event is InputEventScreenDrag:
		set_touch_mode(true)
	elif event is InputEventMouseMotion and is_real_mouse(event) and event.relative.length() > 3.0:
		set_touch_mode(false)
	elif event is InputEventKey and event.pressed and not event.echo:
		set_touch_mode(false)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		pause_toggled.emit()
		return
	if event.is_action_pressed("debug_hud"):
		debug_toggled.emit()
		return
	for i in 3:
		if event.is_action_pressed("slot_%d" % (i + 1)):
			upgrade_hotkey.emit(i)   # レベルアップ画面中は強化選択に使う
			if gameplay_enabled:
				slot_selected.emit(i)
			return
	if not gameplay_enabled:
		return
	if event.is_action_pressed("info"):
		info_requested.emit(true)
	elif event.is_action_released("info"):
		info_requested.emit(false)
	elif event.is_action_pressed("dash"):
		dash_requested.emit()
	elif event.is_action_pressed("clear_orders"):
		clear_orders_requested.emit()
	elif event is InputEventMouseMotion and is_real_mouse(event):
		mouse_pos = event.position
		mouse_inside = true
	elif event is InputEventMouseButton and event.pressed and is_real_mouse(event):
		match event.button_index:
			MOUSE_BUTTON_LEFT:
				summon_at.emit(event.position)
			MOUSE_BUTTON_RIGHT:
				order_at.emit(event.position)
			MOUSE_BUTTON_WHEEL_DOWN:
				slot_cycled.emit(1)
			MOUSE_BUTTON_WHEEL_UP:
				slot_cycled.emit(-1)


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_MOUSE_EXIT:
		mouse_inside = false
