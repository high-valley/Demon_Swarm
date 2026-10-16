class_name Sfx
extends Node
## 仮の効果音。起動時に短い波形をコードで生成する（音源ファイル不要）。
## 本番の音源に差し替える時は SOUNDS を AudioStream の読込に置き換える。

const RATE := 22050
const SOUNDS := {
	# name: [開始Hz, 終了Hz, 秒, 波形]
	"summon": [520.0, 880.0, 0.08, "tri"],
	"hit": [180.0, 90.0, 0.06, "square"],
	"king": [140.0, 60.0, 0.18, "saw"],
	"level": [440.0, 1320.0, 0.3, "tri"],
	"order": [660.0, 660.0, 0.05, "sine"],
	"fail": [200.0, 160.0, 0.1, "square"],
	"boss": [90.0, 50.0, 0.6, "saw"],
	"dash": [300.0, 700.0, 0.08, "sine"],
}

var players := {}


func _ready() -> void:
	for name in SOUNDS:
		var p := AudioStreamPlayer.new()
		p.stream = _make(SOUNDS[name])
		p.max_polyphony = 4
		p.volume_db = -8.0
		add_child(p)
		players[name] = p


func play(name: String) -> void:
	if players.has(name):
		players[name].play()


static func _make(spec: Array) -> AudioStreamWAV:
	var f0: float = spec[0]
	var f1: float = spec[1]
	var dur: float = spec[2]
	var wave: String = spec[3]
	var n := int(RATE * dur)
	var bytes := PackedByteArray()
	bytes.resize(n * 2)
	var phase := 0.0
	for i in n:
		var k := float(i) / n
		var f := f0 * pow(f1 / f0, k)
		phase = fmod(phase + f / RATE, 1.0)
		var v := 0.0
		match wave:
			"sine": v = sin(phase * TAU)
			"square": v = 1.0 if phase < 0.5 else -1.0
			"saw": v = phase * 2.0 - 1.0
			_: v = 1.0 - absf(phase * 4.0 - 2.0)
		v *= exp(-k * 5.0) * 0.5
		bytes.encode_s16(i * 2, int(v * 32767.0))
	var s := AudioStreamWAV.new()
	s.format = AudioStreamWAV.FORMAT_16_BITS
	s.mix_rate = RATE
	s.stereo = false
	s.data = bytes
	return s
