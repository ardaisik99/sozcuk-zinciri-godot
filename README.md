# Sözcük Zinciri

Godot 4.7.2 ile hazırlanmış, Türkçe isim tamlamalarını bir zincirde birleştirdiğin mobil uyumlu kelime oyunu. GitHub Pages sürümü aynı bölüm içeriğini ve oyun ekonomisini kullanan hafif bir HTML/CSS/JavaScript uygulamasıdır. Godot projesi ayrıca yerel olarak çalışır.

[Oyunu tarayıcıda aç](https://ardaisik99.github.io/sozcuk-zinciri-godot/) · [GitHub kaynak deposu](https://github.com/ardaisik99/sozcuk-zinciri-godot)

## v1.8 / web v8

Online turlar altı sorudur. Eşitlikte iki oyuncuya da eşit cevap hakkı tanıyan uzatma oynanır; hız eşitliği bozmaz. İki tur kazanan seriyi kazanır. Son cevap dahil görülen soruların doğru cevapları sonuçta ve son 50 maçın geçmişinde gösterilir. Her oyuncunun maç başına 2 ipucu ve 4 harf sınırı vardır; envanter kullanılır veya sunucudaki altından 15 / 20 düşülür.

Arkadaşla oda/davet akışına rastgele eşleşme eklendi. 12 saniye içinde başka oyuncu bulunamazsa açıkça bot olarak işaretlenen Damla ile oynanır. Bot değişken sürelerde cevaplar, hata yapabilir ve süreyi kaçırabilir. Cevaplar istemciye önceden verilmez. Oyuncuların gördüğü online soru çiftleri sunucuda kalıcı tutulur; iki oyuncudan herhangi birine daha önce gösterilmiş soru tekrar seçilmez. Mevcut havuz sonludur; tükenince eski sorular geri döndürülmez, içerik eklemek gerekir.

Profilde kız / erkek maskot seçilir. Ana menüde profil, arkadaşlar, geçmiş ve market bulunur. Öğreticide gazeteli maskot rehberlik eder. Kullanıcının sağladığı yeni logo uygulama simgesidir. [Maskot çizimleri ve üretim istemleri](assets/mascot-v8-notes.md).

Altınla market alışverişi çalışır. Gerçek para satışı, kullanıcı hesabı hazır olmadığı için kapalıdır. Resmi Android Billing eklentisi ve Google sunucu doğrulama akışı hazırlandı; canlı ödeme ve geri ödeme testleri Play hesabı açıldıktan sonra yapılmalıdır. [Play Store hazırlığı ve gereken hesap adımları](PLAY_STORE_HAZIRLIK.md). Online envanter ve altın sunucudadır; tek kişilik cihaz kaydıyla birleştirilmez.

5 kategoride 40 bölüm, adla profil oluşturma, uygulamalı öğretici, kalıcı ilerleme, altın, harf/tanım jokerleri ve yüz yüze parti modu hazırdır. Kelime Savaşı modunda adla cihaz hesabı, arkadaş kodu ve istekleri, oda/davet, canlı sohbet ve sunucunun yönettiği 30 saniyelik sıralar bulunur.

Online Kelime Savaşı'nda oyuncu adını ve maskotunu seçer; hesabı bu cihazda saklanır. Arkadaş isteği gönderip kabul edebilir, oda kodu veya davetle iki kişi oynayabilirsin. Tahmin ve sohbet aynı alana yazılır. Aktif oyuncunun yanlış tek kelimelik tahmini kırmızı çizilir; doğru çekimli kelimesi yeşil tik alıp 100 puan kazandırır ve sıra rakibe geçer. 30 saniye boyunca tekrar denemek serbesttir; sırası gelmeyen oyuncu mesaj gönderemez. Tur sonunda iki oyuncu da Devam et diyerek yeni sorulara geçer. İki tur kazanan seri 2–0 veya 2–1 tamamlanır. İstemci yalnız açılmış cevapları alır; süre, puan ve doğrulama Cloudflare sunucusundadır. [Online kurulum ve testler](backend/README.md).

v1.4'te önceki krem, mint, mercan ve altın renk düzenine dönüldü. Kullanıcının özgün mavi damla karakteri, elinde ince katlanmış gazete ve kelime bulmacasıyla yeniden çizildi. Giriş, profil, menü, rehber ve sonuç ekranları bu statik resmi paylaşır. Koşu animasyonu kaldırıldı. Web açılışında resmin indirilmesi ya da çözülmesi beklenmez; oyun verisi hazır olduğunda doğrudan devam edilir.

Oyuncu tamlamayı doğal çekimiyle yazar: **SU + BARDAĞI**. Doğru cevap yaklaşık 0,75 saniyede **BARDAK** biçimine dönüşür; sonraki kelime bu kökten devam eder. Çekimli cevaplar tüm bölümlerde tek tek tanımlıdır. Bu kısa oyun içi efekt korunur; web sürümü sistemin hareketi azaltma tercihini izler.

## Godot'ta çalıştırma

Godot 4.7.2 Standard sürümünde `project.godot` dosyasını içe aktar ve **F5** ile çalıştır. .NET veya bir API anahtarı gerekmez. Mobil uyumlu portre düzeni masaüstünde de çalışır.

## Web sürümünü deneme

Hazır çıktı `docs/` klasöründedir. Dosyaya çift tıklamak yerine PowerShell'de proje klasöründen çalıştır:

```powershell
./tools/serve.ps1
```

Ardından [http://localhost:8060](http://localhost:8060) adresini aç. Python 3 gerekir. Web sürümü modern bir tarayıcıda çalışır; WebAssembly motoru indirmez.

Hızlı web sürümünü kaynak dosyalardan yeniden oluştur:

```powershell
python tools/build_web.py
```

Bu işlem `web/` kaynaklarını ve `data/levels.json` içeriğini tek HTML dosyasına paketler; küçük WebP/WOFF2/SVG görsellerini `docs/assets/` altına kopyalar. Bir paket yöneticisi gerekmez.

Godot motorunu tarayıcıda ayrıca test etmek istersen **4.7.2 export templates** paketini kurup isteğe bağlı büyük WebAssembly çıktısını oluştur:

```powershell
./tools/export-web.ps1 -Godot 'C:\Godot\Godot_v4.7.2-stable_win64_console.exe'
```

Bu çıktı `output/godot-web/index.html` altındadır ve hızlı `docs/` sürümünü değiştirmez. Godot motor dosyası yaklaşık 39,5 MB (gzip aktarımı yaklaşık 10,2 MB) olduğu için bu seçenek GitHub Pages'in varsayılan sürümü değildir.

## GitHub Pages'e gönderme

1. Bu klasörü kendi GitHub deponun `main` dalına yükle.
2. Depoda **Settings → Pages → Source → GitHub Actions** seç.
3. **Actions → Sözcük Zinciri hızlı web sürümünü yayınla** iş akışını çalıştır. Sonraki `main` gönderimlerinde otomatik yeniden yayınlanır.
4. Başarılı çalışmanın `github-pages` adresini arkadaşlarınla paylaş.

Hazır `docs/` çıktısını kullanarak derlemesiz yayınlamak istersen Pages Source'u **Deploy from a branch → main → /docs** seçebilirsin. İki yayın yönteminden birini kullan. Bu teslimat için ayrı `sozcuk-zinciri-godot` deposu kullanılır.

## Oynanış ve kayıt

İlk kelime açıktır. Sıradaki kelimenin ilk harfi hazırdır; kutuya dokunarak telefonunun veya bilgisayarının kendi klavyesiyle kalan harfleri, tamlamanın ekiyle birlikte yaz. Örneğin ÇAY için KAŞIĞI yazılır; ilk K hazır olduğundan AŞIĞI girmen yeterlidir. Cevap KAŞIK biçimine dönüşür, ardından OYUNU yazılır. Harf jokeri 20, tanım jokeri 15 altındır; ilk tamamlamada 40 altın ve 100 puan kazanılır. Tekrar oynamak sınırsız ödül vermez.

Profil, altın, puan ve ilerleme cihazda kaydedilir. Web'de tarayıcı/site verilerini temizlemek kaydı siler; özel modda kalıcı kayıt tarayıcıya bağlıdır. Online hesap ve arkadaşlar Cloudflare üzerinde saklanır; cihazdaki hesap anahtarını silmek o hesaba erişimi kaybettirir. Arkadaş kodu giriş anahtarı değildir. Online maç sonuçları tek kişilik altın/ilerlemeyi değiştirmez. Parti modu aynı cihaz etrafında yüz yüze oynanır.

Godot ve hızlı web sürümünün cihaz kayıtları ayrıdır; birindeki ilerleme diğerine otomatik aktarılmaz.

Önceki sürümdeki bölüm ilerlemesi, puan, altın ve alınmış tanımlar korunur. Eski kök cevapta açılmış bir harf yeni çekimli biçimde değişmişse o harfin 20 altını bir kez iade edilir. Aynı kalan harfler açık kalır.

## Doğrulama

```powershell
& 'C:\Godot\Godot_v4.7.2-stable_win64_console.exe' --headless --path . --script tests/test_state.gd
& 'C:\Godot\Godot_v4.7.2-stable_win64_console.exe' --headless --path . --script tests/test_ui.gd
node tools/test_web_state.mjs
```

v8 doğrulamasında Godot mantığı 789, genel arayüzü 367, gerçek online bağlantısı 106, online görsel arayüzü 69 ve ödeme adaptörü 16 kontrolden geçti. Web mantığı 512, yeni arayüz 37, gerçek iki tarayıcılı maç 30 ve gerçek eşleştirme 12 kontrol geçti. Sunucuda 80 test geçti; isteğe bağlı gerçek entegrasyon varsayılan koşuda atlanır, ayrıca çalıştırıldığında 9/9 geçti. Altı doğru cevapla 3–3 eşitlik, gerçek 30 saniyelik uzatma, son cevaplar, joker ücretleri, kalıcı geçmiş, insan/bot eşleştirme ve joker ücretlendirmesinde yeniden başlatma/kayıp yanıt senaryoları denendi. Gerçek Play ödeme penceresi hesap hazır olmadığı için test edilmedi. Android/iOS cihaz klavyeleri ayrıca cihazda denenmelidir.

Godot sürümü Compatibility renderer kullanır. Hızlı web sürümü yerel WebP/WOFF2 dosyaları ve küçük SVG simgeler kullanır. Online mod ayrı bir WebSocket bağlantısını yalnız açıldığında kurar. Android/iOS imzalama veya mağaza paketleri bu teslimata dahil değildir; mobil tarayıcı sürümü doğrudan test edilebilir.

Hızlı web HTML dosyası yaklaşık 75 KB (gzip yaklaşık 23 KB), kopyalanan görsel ve fontların tamamı yaklaşık 266 KB’dır. Profil maskotları 11–13 KB, öğretici 27 KB, logo 51 KB WebP’dir. Web sürümü yüksek çözünürlüklü ana çizimleri veya Godot motorunu indirmez. Online JS/CSS yalnız bu mod açıldığında yüklenir. Sunucuya her saniye istek gönderilmez; sayaç yerelde çizilir, son kararı sunucu verir. Cevap efektleri kısa süre çalışır; sürekli animasyon, parçacık veya video yoktur. Godot hareketsiz ekranlarda düşük işlemci kullanır. Yeni görsel üretim istemleri [assets/mascot-v8-notes.md](assets/mascot-v8-notes.md), font lisansları [assets/README.md](assets/README.md) içindedir.

Godot: [resmi indirme](https://godotengine.org/download/windows/), [web dışa aktarma belgesi](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html).
