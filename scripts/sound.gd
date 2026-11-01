extends Node

var enabled = true
var player: AudioStreamPlayer
var notes: Dictionary = {}

func _ready() -> void:
	player = AudioStreamPlayer.new()
	add_child(player)
	for pair in [["tap", 520.0, 0.045], ["good", 880.0, 0.15], ["bad", 180.0, 0.13], ["win", 1046.5, 0.30]]:
		var stream = AudioStreamWAV.new()
		stream.format = AudioStreamWAV.FORMAT_16_BITS
		stream.mix_rate = 22050
		var bytes = PackedByteArray()
		var count = int(22050 * pair[2])
		bytes.resize(count * 2)
		for n in count:
			var t = float(n) / 22050.0
			var envelope = pow(1.0 - float(n) / count, 2.0)
			var sample = int(sin(t * TAU * pair[1]) * envelope * 3800)
			bytes.encode_s16(n * 2, sample)
		stream.data = bytes
		notes[pair[0]] = stream

func play(kind: String) -> void:
	if enabled and notes.has(kind):
		player.stream = notes[kind]
		player.play()
