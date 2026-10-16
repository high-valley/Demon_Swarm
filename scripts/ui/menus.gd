class_name Menus
extends Control
## タイトル / ポーズ / 設定 / レベルアップ / 詳細 / リザルト の各画面。
## 仮UIなのでシーンファイルではなくコードで組み立てている。

signal play_pressed(seed_value: int, mode: String)
signal resume_pressed
signal retire_pressed
signal upgrade_chosen(id: String)
signal retry_same_pressed
signal retry_new_pressed
signal title_pressed
signal info_closed

const C_BG := Color("#120f19")
const C_PANEL := Color("#1e1928")
const C_EDGE := Color("#3c3250")
const C_TEXT := Color("#ece6f3")
const C_DIM := Color("#a59cb6")
const C_DEMON := Color("#9a63e8")
const C_EMBER := Color("#e7a93b")
const C_BLOOD := Color("#ff5163")

var title_ov: Control
var pause_ov: Control
var settings_ov: Control
var level_ov: Control
var info_ov: Control
var result_ov: Control

var seed_edit: LineEdit
var mode_opt: OptionButton
var kbd_help: Label
var touch_help: Label
var level_title: Label
var cards_box: GridContainer
var info_label: Label
var result_title: Label
var result_stats: GridContainer
var result_picks: Label
var vol_slider: HSlider
var shake_check: CheckButton
var debug_check: CheckButton
var _settings_back_to: Control
var _card_ids: Array = []


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	theme = _make_theme()
	_build_title()
	_build_pause()
	_build_settings()
	_build_level()
	_build_info()
	_build_result()
	hide_all()


# ------------------------------------------------------------------ theme
func _box(bg: Color, edge: Color, radius := 6, pad := 18) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = edge
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(radius)
	sb.set_content_margin_all(pad)
	return sb


func _make_theme() -> Theme:
	var th := Theme.new()
	th.default_font_size = 24
	th.set_stylebox("panel", "PanelContainer", _box(C_PANEL, C_EDGE, 8, 36))
	for state in ["normal", "focus"]:
		th.set_stylebox(state, "Button", _box(Color("#2c2439"), C_EDGE, 5, 14))
	th.set_stylebox("hover", "Button", _box(Color("#2c2439"), C_DEMON, 5, 14))
	th.set_stylebox("pressed", "Button", _box(Color("#3a2f4d"), C_DEMON, 5, 14))
	th.set_stylebox("focus", "Button", _box(Color("#2c2439"), C_EMBER, 5, 14))
	th.set_color("font_color", "Button", C_TEXT)
	th.set_color("font_hover_color", "Button", C_TEXT)
	th.set_color("font_color", "Label", C_TEXT)
	th.set_stylebox("normal", "LineEdit", _box(C_BG, C_EDGE, 4, 10))
	th.set_stylebox("normal", "OptionButton", _box(C_BG, C_EDGE, 4, 10))
	th.set_stylebox("hover", "OptionButton", _box(C_BG, C_DEMON, 4, 10))
	return th


func _overlay() -> Array:
	var ov := ColorRect.new()
	ov.color = Color(C_BG, 0.8)
	ov.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ov.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(ov)
	var scroll := ScrollContainer.new()
	scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	ov.add_child(scroll)
	var center := CenterContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	center.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.add_child(center)
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(minf(980.0, get_viewport_rect().size.x - 40.0), 0)
	center.add_child(panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 18)
	panel.add_child(box)
	return [ov, box]


func _label(text: String, size := 24, col := C_TEXT, wrap := false) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", col)
	if wrap:
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return l


func _button(text: String, primary := false) -> Button:
	var b := Button.new()
	b.text = text
	if primary:
		b.add_theme_stylebox_override("normal", _box(C_DEMON, C_DEMON, 5, 14))
		b.add_theme_stylebox_override("hover", _box(C_DEMON.lightened(0.1), C_EMBER, 5, 14))
	return b


func _row() -> HFlowContainer:
	var r := HFlowContainer.new()
	r.add_theme_constant_override("h_separation", 12)
	r.add_theme_constant_override("v_separation", 12)
	return r


# ------------------------------------------------------------------ screens
func _build_title() -> void:
	var o := _overlay()
	title_ov = o[0]
	var box: VBoxContainer = o[1]
	box.add_child(_label("PROTOTYPE · GODOT %s" % Engine.get_version_info().string.split(".stable")[0], 16, C_EMBER))
	var t := RichTextLabel.new()
	t.bbcode_enabled = true
	t.fit_content = true
	t.scroll_active = false
	t.add_theme_font_size_override("normal_font_size", 84)
	t.text = "DEMON [color=#9a63e8]SWARM[/color]"
	box.add_child(t)
	box.add_child(_label("魔王は攻撃できない。逃げて、召喚して、命令する。勇者が魔王に届く前に、魔物の群れで押し返せ。", 22, C_DIM, true))
	var row := _row()
	seed_edit = LineEdit.new()
	seed_edit.custom_minimum_size = Vector2(200, 0)
	seed_edit.placeholder_text = "seed"
	row.add_child(_label("Seed", 20, C_DIM))
	row.add_child(seed_edit)
	mode_opt = OptionButton.new()
	mode_opt.add_item("短縮：3分でボス出現")
	mode_opt.add_item("仕様どおり：10分でボス出現")
	row.add_child(mode_opt)
	box.add_child(row)
	var buttons := _row()
	var play := _button("Play", true)
	play.pressed.connect(func() -> void: play_pressed.emit(int(seed_edit.text) if seed_edit.text.is_valid_int() else 0, "short" if mode_opt.selected == 0 else "full"))
	buttons.add_child(play)
	var st := _button("Settings")
	st.pressed.connect(func() -> void: open_settings(title_ov))
	buttons.add_child(st)
	if Platform.can_quit():
		var q := _button("Quit")
		q.pressed.connect(func() -> void: get_tree().quit())
		buttons.add_child(q)
	box.add_child(buttons)
	kbd_help = _label("WASD 移動 / Space 回避 / 1・2・3 召喚スロット / 左クリック 召喚 / 右クリック 敵＝集中攻撃・地面＝集結 / R 命令解除 / Esc・P ポーズ / Tab 詳細 / F3 デバッグ", 18, C_DIM, true)
	touch_help = _label("左側ドラッグ 移動 / タップ 召喚 / 長押し 命令（敵＝集中攻撃・地面＝集結）/ 右下 回避・命令解除 / スロットをタップで切替 / 横向き推奨", 18, C_DIM, true)
	box.add_child(kbd_help)
	box.add_child(touch_help)


func _build_pause() -> void:
	var o := _overlay()
	pause_ov = o[0]
	var box: VBoxContainer = o[1]
	box.add_child(_label("ポーズ中", 40))
	box.add_child(_label("ゲーム時間・AI・攻撃はすべて停止しています。", 20, C_DIM, true))
	var row := _row()
	var r := _button("再開", true)
	r.pressed.connect(func() -> void: resume_pressed.emit())
	row.add_child(r)
	var s := _button("Settings")
	s.pressed.connect(func() -> void: open_settings(pause_ov))
	row.add_child(s)
	var q := _button("タイトルへ戻る")
	q.pressed.connect(func() -> void: retire_pressed.emit())
	row.add_child(q)
	box.add_child(row)


func _build_settings() -> void:
	var o := _overlay()
	settings_ov = o[0]
	var box: VBoxContainer = o[1]
	box.add_child(_label("Settings", 40))
	box.add_child(_label("音量", 20, C_DIM))
	vol_slider = HSlider.new()
	vol_slider.min_value = 0
	vol_slider.max_value = 1
	vol_slider.step = 0.05
	vol_slider.custom_minimum_size = Vector2(0, 32)
	box.add_child(vol_slider)
	shake_check = CheckButton.new()
	shake_check.text = "被弾時の画面揺れ"
	box.add_child(shake_check)
	debug_check = CheckButton.new()
	debug_check.text = "デバッグHUD（FPS・体数・AI時間・seed）"
	box.add_child(debug_check)
	box.add_child(_label("Steam版ではここに解像度・フルスクリーン・キー設定が入る予定。", 18, C_DIM, true))
	var back := _button("戻る", true)
	back.pressed.connect(func() -> void:
		Settings.volume = vol_slider.value
		Settings.shake = shake_check.button_pressed
		Settings.debug_hud = debug_check.button_pressed
		Settings.save()
		settings_ov.hide()
		if _settings_back_to:
			_settings_back_to.show())
	box.add_child(back)


func _build_level() -> void:
	var o := _overlay()
	level_ov = o[0]
	var box: VBoxContainer = o[1]
	level_title = _label("Level up", 16, C_EMBER)
	box.add_child(level_title)
	box.add_child(_label("強化を1つ選ぶ", 36))
	cards_box = GridContainer.new()
	cards_box.columns = 3
	cards_box.add_theme_constant_override("h_separation", 14)
	cards_box.add_theme_constant_override("v_separation", 14)
	box.add_child(cards_box)


func _build_info() -> void:
	var o := _overlay()
	info_ov = o[0]
	var box: VBoxContainer = o[1]
	box.add_child(_label("Tab を離す / タップで閉じる", 16, C_EMBER))
	info_label = _label("", 20, C_TEXT, true)
	box.add_child(info_label)
	info_ov.gui_input.connect(func(ev: InputEvent) -> void:
		if (ev is InputEventMouseButton and ev.pressed) or (ev is InputEventScreenTouch and ev.pressed):
			info_closed.emit())


func _build_result() -> void:
	var o := _overlay()
	result_ov = o[0]
	var box: VBoxContainer = o[1]
	box.add_child(_label("RUN RESULT", 16, C_EMBER))
	result_title = _label("", 40)
	box.add_child(result_title)
	result_stats = GridContainer.new()
	result_stats.columns = 3
	result_stats.add_theme_constant_override("h_separation", 30)
	result_stats.add_theme_constant_override("v_separation", 10)
	box.add_child(result_stats)
	result_picks = _label("", 20, C_DIM, true)
	box.add_child(result_picks)
	var row := _row()
	var same := _button("同じseedで再挑戦", true)
	same.pressed.connect(func() -> void: retry_same_pressed.emit())
	row.add_child(same)
	var nw := _button("新しいseedで挑戦")
	nw.pressed.connect(func() -> void: retry_new_pressed.emit())
	row.add_child(nw)
	var tt := _button("タイトル")
	tt.pressed.connect(func() -> void: title_pressed.emit())
	row.add_child(tt)
	box.add_child(row)


# ------------------------------------------------------------------ API
func hide_all() -> void:
	for ov in [title_ov, pause_ov, settings_ov, level_ov, info_ov, result_ov]:
		ov.hide()


func set_touch_mode(on: bool) -> void:
	kbd_help.visible = not on
	touch_help.visible = on
	cards_box.columns = 3 if get_viewport_rect().size.x > 900 else 1


func show_title(seed_value: int) -> void:
	hide_all()
	seed_edit.text = str(seed_value)
	title_ov.show()


func show_pause() -> void:
	hide_all()
	pause_ov.show()
	pause_ov.find_children("*", "Button", true, false)[0].grab_focus()


func open_settings(from: Control) -> void:
	_settings_back_to = from
	vol_slider.value = Settings.volume
	shake_check.button_pressed = Settings.shake
	debug_check.button_pressed = Settings.debug_hud
	from.hide()
	settings_ov.show()


func show_levelup(level: int, picks: Array, stacks: Dictionary) -> void:
	hide_all()
	level_title.text = "LEVEL %d" % level
	for c in cards_box.get_children():
		c.queue_free()
	_card_ids = []
	for i in picks.size():
		var u: Dictionary = picks[i]
		var b := Button.new()
		var rare: bool = u.rarity == "rare"
		b.text = "[%d] %s · %d/%d\n%s\n%s" % [i + 1, "シナジー" if rare else "強化", int(stacks.get(u.id, 0)), int(u.max_stacks), u.name, u.desc]
		b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.custom_minimum_size = Vector2(280, 150)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		if rare:
			b.add_theme_color_override("font_color", C_EMBER)
			b.add_theme_stylebox_override("normal", _box(Color("#2c2439"), C_EMBER, 5, 14))
		var id: String = u.id
		b.pressed.connect(func() -> void: upgrade_chosen.emit(id))
		cards_box.add_child(b)
		_card_ids.append(id)
	level_ov.show()
	if cards_box.get_child_count() > 0:
		cards_box.get_child(0).grab_focus()


func choose_card(index: int) -> void:
	if level_ov.visible and index < _card_ids.size():
		upgrade_chosen.emit(_card_ids[index])


func show_info(text: String) -> void:
	info_label.text = text
	info_ov.show()


func hide_info() -> void:
	info_ov.hide()


func show_result(win: bool, rows: Array, picks_text: String) -> void:
	hide_all()
	result_title.text = "勝利：勇者を撃退" if win else "敗北：魔王は倒れた"
	result_title.add_theme_color_override("font_color", C_EMBER if win else C_BLOOD)
	for c in result_stats.get_children():
		c.queue_free()
	for row in rows:
		var v := VBoxContainer.new()
		v.add_child(_label(str(row[1]), 34))
		v.add_child(_label(row[0], 16, C_DIM))
		result_stats.add_child(v)
	result_picks.text = picks_text
	result_ov.show()
	result_ov.find_children("*", "Button", true, false)[0].grab_focus()
