extends SceneTree

const State = preload("res://scripts/game_state.gd")
const TEST_PATH := "user://zincir_state_test.json"
const EXPECTED_ANSWERS := {
	"tutorial": "ÇAY|KAŞIĞI|OYUNU|HAVASI",
	"mutfak_01": "KAHVE|FİNCANI|TAKIMI|ÇANTASI",
	"mutfak_02": "EKMEK|FIRINI|KAPISI|KOLU|SAATİ",
	"mutfak_03": "YEMEK|MASASI|ÖRTÜSÜ|DESENİ",
	"mutfak_04": "MEYVE|SUYU|BARDAĞI|ALTLIĞI",
	"mutfak_05": "SÜT|ŞİŞESİ|KAPAĞI|RESMİ|ÇERÇEVESİ",
	"mutfak_06": "BALIK|ÇORBASI|KAŞIĞI|OYUNU",
	"mutfak_07": "MUTFAK|DOLABI|KAPAĞI|RESMİ",
	"mutfak_08": "TATLI|KAŞIĞI|OYUNU|HAVASI",
	"spor_01": "FUTBOL|SAHASI|ÇİZGİSİ|FİLM",
	"spor_02": "BASKETBOL|TOPU|SEPETİ|ÖRGÜSÜ",
	"spor_03": "SPOR|AYAKKABISI|BAĞCIĞI|UCU",
	"spor_04": "TENİS|KORTU|KAPISI|KOLU",
	"spor_05": "YÜZME|HAVUZU|SUYU|SAATİ",
	"spor_06": "GOLF|TOPU|OYUNU|KURALI",
	"spor_07": "FUTBOL|TAKIMI|OYUNU|HAVASI",
	"spor_08": "SPOR|ÇANTASI|ASKISI|KANCASI",
	"yasam_01": "EV|KAPISI|KOLU|SAATİ",
	"yasam_02": "DUVAR|SAATİ|KULESİ|KAPISI",
	"yasam_03": "OKUL|ÇANTASI|CEBİ|TELEFONU",
	"yasam_04": "DİŞ|FIRÇASI|KILI|KÖKÜ",
	"yasam_05": "EL|ÇANTASI|ASKISI|KANCASI",
	"yasam_06": "KAPI|ZİLİ|SESİ|KAYDI",
	"yasam_07": "YATAK|ODASI|KAPISI|KOLU|SAATİ",
	"yasam_08": "MASA|LAMBASI|IŞIĞI|HIZI",
	"doga_01": "YAĞMUR|SUYU|BARDAĞI|ALTLIĞI",
	"doga_02": "ORMAN|YOLU|KENARI|TAŞI",
	"doga_03": "DENİZ|SUYU|KENARI|ÇİZGİSİ",
	"doga_04": "ÇAM|AĞACI|KABUĞU|RENGİ",
	"doga_05": "GÜL|BAHÇESİ|KAPISI|KOLU",
	"doga_06": "DAĞ|KEÇİSİ|SÜTÜ|ŞİŞESİ",
	"doga_07": "GÜNEŞ|IŞIĞI|KAYNAĞI|SUYU",
	"doga_08": "YAPRAK|DAMARI|YOLU|HARİTASI",
	"kultur_01": "KİTAP|KAPAĞI|RESMİ|SERGİSİ",
	"kultur_02": "SANAT|GALERİSİ|KAPISI|KOLU",
	"kultur_03": "SİNEMA|SALONU|KAPISI|KOLU",
	"kultur_04": "TİYATRO|OYUNU|YAZARI|EVİ",
	"kultur_05": "MÜZİK|ALETİ|KUTUSU|KAPAĞI",
	"kultur_06": "HALK|OYUNU|HAVASI|DURUMU",
	"kultur_07": "ŞİİR|KİTABI|KAPAĞI|RESMİ",
	"kultur_08": "ÖYKÜ|KİTABI|FUARI|ALANI",
}
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
	check(state.tutorial.answers == ["ÇAY", "KAŞIĞI", "OYUNU", "HAVASI"], "Öğreticide doğal çekimli cevaplar olmalı.")
	check(State.normalize("istanbul") == "İSTANBUL", "Türkçe i, İ'ye dönüşmeli.")
	check(State.normalize("ışık") == "IŞIK", "Türkçe ı, I'ya dönüşmeli.")
	check(State.normalize(" çiğ köfte ") == "ÇİĞKÖFTE", "Türkçe aksanlar korunmalı.")
	var ids: Dictionary = {}
	for level in state.levels:
		check(level.answers == Array(str(EXPECTED_ANSWERS[level.id]).split("|")), "Çekimli cevaplar doğru olmalı: " + str(level.id))
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
	check(state.current_word() == "KAŞIĞI" and state.stem_word() == "KAŞIK", "Aktif cevap çekimli, kök ayrı olmalı.")
	check(state.visible_letters() == ["K", "", "", "", "", ""], "Başlangıçta çekimli uzunluk ve yalnız ilk harf görünmeli.")
	check(not state.submit_guess("kaşık").ok, "Çekimliyken çıplak kök kabul edilmemeli.")
	var first_result: Dictionary = state.submit_guess("aşığı")
	check(first_result.ok and first_result.word == "KAŞIĞI" and first_result.stem == "KAŞIK" and first_result.solved_index == 1, "İlk harf hariç çekimli suffix ve kök dönüşümü doğru olmalı.")
	check(state.visible_letters(1) == ["K", "A", "Ş", "I", "K"], "Çözülmüş satır kökü göstermeli.")
	check(state.submit_guess("oyunu").ok, "Tam çekimli kelime kabul edilmeli.")
	var tutorial_result: Dictionary = state.submit_guess("avası")
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
	var every = State.new(TEST_PATH, false)
	for level in every.levels:
		every.begin_level(level.id)
		while not every.is_complete():
			var wi: int = every.active_index
			var answer: String = every.answer_word()
			var stem: String = every.stem_word()
			if answer != stem:
				check(not every.submit_guess(stem).ok, "Çıplak kök reddedilmeli: " + str(level.id) + " " + stem)
			var solved: Dictionary = every.submit_guess(answer)
			check(solved.ok and solved.word == answer and solved.stem == stem and solved.solved_index == wi, "Cevap ve kök dönüşümü doğru olmalı: " + answer)
			check("".join(every.visible_letters(wi)) == stem, "Çözülen kelime köke dönmeli: " + stem)
	check(every.gold == 1700 and every.score == 4000 and every.completed.size() == 40, "40 bölümün toplam ödülü doğru olmalı.")
	var forms = State.new(TEST_PATH, false)
	forms.begin_level("mutfak_04")
	forms.submit_guess("suyu")
	check(forms.current_word() == "BARDAĞI" and forms.visible_letters().size() == 7, "Bardak cevabı BARDAĞI ve 7 harf olmalı.")
	check(not forms.submit_guess("bardak").ok, "BARDAK yerine çekimli BARDAĞI istenmeli.")
	result = forms.submit_guess("ardağı")
	check(result.word == "BARDAĞI" and result.stem == "BARDAK" and result.solved_index == 2, "BARDAĞI, BARDAK köküne dönmeli.")
	forms.begin_level("yasam_06")
	forms.submit_guess("zili")
	forms.submit_guess("sesi")
	check(forms.current_word() == "KAYDI", "Kayıt kelimesinin cevabı KAYDI olmalı.")
	check(not forms.submit_guess("kayıt").ok, "KAYIT çıplak kökü reddedilmeli.")
	result = forms.submit_guess("aydı")
	check(result.word == "KAYDI" and result.stem == "KAYIT" and result.solved_index == 3, "KAYDI, KAYIT köküne dönmeli.")
	var legacy := {"version": 1, "profile_name": "Deniz", "gold": 65, "score": 100, "completed": ["mutfak_01"], "tutorial_done": true, "settings": {"sound": false, "haptics": true}, "progress": {
		"tutorial": {"active_index": 1, "revealed": {"1": [1, 4, 4, 99, 0, -1, 2.5]}, "hint_used": {"1": true}},
		"mutfak_04": {"active_index": 2, "revealed": {"2": [1, 5]}, "hint_used": {"2": true}},
		"yasam_06": {"active_index": 3, "revealed": {"3": [1, 3, 4, 3]}, "hint_used": {"3": true}}
	}}
	var legacy_file := FileAccess.open(TEST_PATH, FileAccess.WRITE)
	legacy_file.store_string(JSON.stringify(legacy))
	legacy_file.close()
	var migrated = State.new(TEST_PATH)
	check(migrated.profile_name == "Deniz" and migrated.gold == 145 and migrated.score == 100 and migrated.completed == ["mutfak_01"] and migrated.tutorial_done, "Göçte profil/ilerleme korunmalı, 4 değişen harf 80 altın iade edilmeli.")
	check(not migrated.settings.sound, "Ses tercihi göçte korunmalı.")
	check(migrated.progress.tutorial.revealed["1"] == [1], "KAŞIK göçünde aynı A harfi korunmalı, K harfi iade edilmeli.")
	check(migrated.progress.mutfak_04.revealed["2"] == [1], "BARDAK göçünde değişen K harfi iade edilmeli.")
	check(migrated.progress.yasam_06.revealed["3"] == [1], "KAYIT göçünde değişen iki harf iade edilmeli.")
	check(migrated.progress.tutorial.answer_schema == 2, "Yeni cevap şeması kaydedilmeli.")
	var migrated_again = State.new(TEST_PATH)
	check(migrated_again.gold == 145, "Yeniden yüklemede iade tekrar verilmemeli.")
	migrated.begin_level("tutorial")
	check(migrated.buy_hint().ok and migrated.gold == 145, "Satın alınmış tanım göçte ücretsiz kalmalı.")
	migrated.revealed["1"].append(5)
	migrated.save_game()
	var answer_reload = State.new(TEST_PATH)
	answer_reload.begin_level("tutorial")
	check(answer_reload.visible_letters()[5] == "I" and answer_reload.gold == 145, "Ek harf konumları yeni kayıtta korunmalı.")
	clean_test_files()
	print("ZincirState: %d kontrol, %d hata." % [checks, failures])
	quit(1 if failures > 0 else 0)
