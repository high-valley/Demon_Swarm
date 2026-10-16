extends Node
## 実行環境の違いを1か所に閉じ込める。
## - Web版（GitHub Pages）とデスクトップ版（Steam）で同じコードを使う
## - Steam連携（GodotSteam）は将来ここに追加し、Web版では読み込まない

var is_web := OS.has_feature("web")
var is_mobile_web := OS.has_feature("web_android") or OS.has_feature("web_ios")
var is_mobile := OS.has_feature("mobile") or is_mobile_web


## 最初からタッチ操作UIを出すか（実際の入力が来たら InputRouter が切り替える）
func prefers_touch() -> bool:
	return is_mobile


## 将来: GodotSteam が使える時だけ true。Web版では常に false。
func steam_available() -> bool:
	return false


func can_quit() -> bool:
	return not is_web
