extends SceneTree

const State = preload("res://scripts/game_state.gd")
const TEST_PATH := "user://zincir_state_test.json"
var failures: int = 0
var checks: int = 0


func _initialize() -> void:
	call_deferred("run")


func check(condition: bool, description: String) -> void:
	checks += 1
	if not condition:
		failures += 1
		push_error(description)


func clean_test_files() -> void:
	for suffix in ["", ".tmp", ".bak"]:
		var path: String = TEST_PATH + str(suffix)
		if FileAccess.file_exists(path):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(path))


func solve(state: RefCounted) -> Dictionary:
	var result: Dictionary = {}
	while not state.is_complete():
		result = state.submit_guess(state.current_word())
	return result


func run() -> void:
	clean_test_files()
	var state = State.new(TEST_PATH, false)
	check(state.levels.size() >= 36, "En az 36 seviye yüklenmeli.")
	check(state.tutorial.words == ["ÇAY", "KAŞIK", "OYUN", "HAVA"], "Öğretici zinciri doğru olmalı.")
	check(State.normalize("istanbul") == "İSTANBUL", "Türkçe i, İ'ye dönüşmeli.")
	check(State.normalize("ışık") == "IŞIK", "Türkçe ı, I'ya dönüşmeli.")
	check(State.normalize(" çiğ köfte ") == "ÇİĞKÖFTE", "Türkçe aksanlar korunmalı.")
	var ids: Dictionary = {}
	for level in state.levels:
		check(not ids.has(level.id), "Seviye kimlikleri benzersiz olmalı: " + str(level.id))
		ids[level.id] = true
		check(level.words.size() >= 4 and level.words.size() <= 5, "Zincir uzunluğu 4 veya 5 olmalı.")
		check(level.definitions.size() == level.words.size(), "Her kelimenin bir tanımı olmalı.")
		check(level.links.size() == level.words.size() - 1, "Her bağlantının tamlama açıklaması olmalı.")
		for word in level.words:
			check(State.normalize(word) == word, "İçerik kelimeleri Türkçe büyük harf olmalı: " + str(word))
	check(not state.set_profile(" "), "Boş profil reddedilmeli.")
	check(state.set_profile("Deniz"), "Profil kaydedilmeli.")
	check(state.gold == 100 and state.score == 0, "Başlangıç bakiyesi 100 olmalı.")
	check(not state.begin_level("missing"), "Bilinmeyen seviye reddedilmeli.")
	check(state.begin_level("tutorial"), "Öğretici başlayabilmeli.")
	check(state.visible_letters() == ["K", "", "", "", ""], "Başlangıçta yalnız ilk harf görünmeli.")
	check(state.submit_guess("aşık").ok, "İlk harf hariç Türkçe suffix kabul edilmeli.")
	check(state.submit_guess("oyun").ok, "Tam kelime kabul edilmeli.")
	var tutorial_result: Dictionary = state.submit_guess("ava")
	check(tutorial_result.complete and state.tutorial_done, "Öğretici tamamlanmalı.")
	check(state.gold == 100 and state.score == 0, "Öğretici seviye ödülü vermemeli.")
	check(state.begin_level("mutfak_01"), "Normal seviye başlayabilmeli.")
	var before_index: int = state.active_index
	check(not state.submit_guess("yanlış").ok, "Yanlış cevap reddedilmeli.")
	check(state.active_index == before_index and state.gold == 100, "Yanlış tahmin ilerlemeyi ve altını etkilememeli.")
	check(state.buy_hint().ok and state.gold == 85, "İlk tanım 15 altın olmalı.")
	check(state.buy_hint().ok and state.gold == 85, "Aynı tanımı tekrar göstermek ücretsiz olmalı.")
	var letter: Dictionary = state.reveal_letter()
	check(letter.ok and state.gold == 65, "Harf 20 altın olmalı.")
	check(letter.index > 0, "İlk harf yeniden satılmamalı.")
	var restored = State.new(TEST_PATH)
	check(restored.profile_name == "Deniz" and restored.gold == 65, "Profil ve harcamalar yeniden açılınca korunmalı.")
	check(restored.begin_level("mutfak_01"), "Kayıtlı bölüm açılabilmeli.")
	check(restored.visible_letters() == state.visible_letters(), "Açılmış harfler korunmalı.")
	check(restored.buy_hint().ok and restored.gold == 65, "Yeniden açmada tanıma tekrar ücret kesilmemeli.")
	var hidden := ""
	var shown: Array[String] = restored.visible_letters()
	var target: String = restored.current_word()
	for i in target.length():
		if shown[i].is_empty():
			hidden += target[i]
	check(restored.submit_guess(hidden).ok, "Joker sonrası yalnız gizli harfler kabul edilmeli.")
	var partial = State.new(TEST_PATH)
	partial.begin_level("mutfak_01")
	check(partial.active_index == 2, "Çözülmüş kelime ilerlemesi korunmalı.")
	var result := solve(partial)
	check(result.complete and result.reward_gold == 40 and result.reward_score == 100, "İlk tamamlama 40 altın ve 100 puan vermeli.")
	check(partial.gold == 105 and partial.score == 100, "Ödül bakiyeye eklenmeli.")
	check("mutfak_01" in partial.completed, "Tamamlanmış bölüm kaydedilmeli.")
	check(not partial.submit_guess("ÇANTA").ok and partial.gold == 105, "Bitmiş bölümden tekrar ödül alınamamalı.")
	partial.begin_level("mutfak_01")
	result = solve(partial)
	check(result.reward_gold == 0 and partial.gold == 105 and partial.score == 100, "Tekrar oynamak ikinci ödül vermemeli.")
	partial.begin_level("mutfak_02")
	partial.gold = 19
	check(not partial.reveal_letter().ok and partial.gold == 19, "Yetersiz bakiyede harf satılmamalı.")
	partial.gold = 14
	check(not partial.buy_hint().ok and partial.gold == 14, "Yetersiz bakiyede tanım satılmamalı.")
	partial.gold = 1000
	while partial.reveal_letter().ok:
		pass
	var all_letters_gold: int = partial.gold
	check(not partial.reveal_letter().ok and partial.gold == all_letters_gold, "Bütün harfler açılınca yeniden ücret alınmamalı.")
	var corrupt := FileAccess.open(TEST_PATH, FileAccess.WRITE)
	corrupt.store_string("{broken")
	corrupt.close()
	var recovered = State.new(TEST_PATH)
	check(recovered.profile_name == "Deniz", "Bozuk kayıt yedekten kurtarılmalı.")
	recovered.reset_progress()
	check(recovered.gold == 100 and recovered.completed.is_empty() and not recovered.tutorial_done and recovered.profile_name.is_empty(), "Sıfırlama başlangıç durumuna dönmeli.")
	clean_test_files()
	print("ZincirState: %d kontrol, %d hata." % [checks, failures])
	quit(1 if failures > 0 else 0)
