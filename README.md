# Sözcük Zinciri

Godot 4.7.2 ile hazırlanmış, Türkçe isim tamlamalarını bir zincirde birleştirdiğin mobil uyumlu kelime oyunu. GitHub Pages sürümü aynı bölüm içeriğini ve oyun ekonomisini kullanan hafif bir HTML/CSS/JavaScript uygulamasıdır. Godot projesi ayrıca yerel olarak çalışır.

[Oyunu tarayıcıda aç](https://ardaisik99.github.io/sozcuk-zinciri-godot/) · [GitHub kaynak deposu](https://github.com/ardaisik99/sozcuk-zinciri-godot)

5 kategoride 40 bölüm, adla profil oluşturma, uygulamalı öğretici, kalıcı ilerleme, altın, harf/tanım jokerleri ve yüz yüze parti modu hazırdır. Karşılıklı 1v1 menüde gelecek mod olarak gösterilir.

v1.2'de kullanıcının mavi damla karakteri, elinde defter ve kalemle oyunun maskotu oldu. Önceki S/Z/C çizimi arayüzden kaldırıldı. Oyuncu tamlamayı doğal çekimiyle yazar: **SU + BARDAĞI**. Doğru cevap yaklaşık 0,75 saniyede **BARDAK** biçimine dönüşür; sonraki kelime bu kökten devam eder. Çekimli cevaplar tüm bölümlerde tek tek tanımlıdır. Web sürümü sistemin hareketi azaltma tercihini izler.

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

Profil, altın, puan ve ilerleme cihazda kaydedilir. Web'de tarayıcı/site verilerini temizlemek kaydı siler; özel modda kalıcı kayıt tarayıcıya bağlıdır. İnternet bağlantılı 1v1 henüz etkin değildir. Parti modu aynı cihaz etrafında yüz yüze oynanır.

Godot ve hızlı web sürümünün cihaz kayıtları ayrıdır; birindeki ilerleme diğerine otomatik aktarılmaz.

Önceki sürümdeki bölüm ilerlemesi, puan, altın ve alınmış tanımlar korunur. Eski kök cevapta açılmış bir harf yeni çekimli biçimde değişmişse o harfin 20 altını bir kez iade edilir. Aynı kalan harfler açık kalır.

## Doğrulama

```powershell
& 'C:\Godot\Godot_v4.7.2-stable_win64_console.exe' --headless --path . --script tests/test_state.gd
& 'C:\Godot\Godot_v4.7.2-stable_win64_console.exe' --headless --path . --script tests/test_ui.gd
node tools/test_web_state.mjs
```

v1.2 doğrulamasında Godot mantığı 789, Godot arayüzü 349, web mantığı 512 ve tarayıcı akışı 55 kontrolden geçti. Çekimli cevaplar, köke dönüşüm, tüm bölümlerin harf sayısı, eski kayıt göçü, dönüşüm sırasında art arda gönderim/joker engeli, ekrandan ayrılma, hareketi azaltma, mobil giriş ve 320–1440 piksel düzenler kontrol edildi. Gerçek Android/iOS cihaz klavyeleri ayrıca cihazda denenmelidir.

Godot sürümü Compatibility renderer kullanır. Hızlı web sürümü yerel WebP/WOFF2 dosyaları ve küçük SVG simgeler kullanır. Android/iOS imzalama veya mağaza paketleri bu teslimata dahil değildir; mobil tarayıcı sürümü doğrudan test edilebilir.

Hızlı web HTML dosyası yaklaşık 69 KB (gzip yaklaşık 21 KB), kopyalanan görsel ve fontların tamamı yaklaşık 135 KB'dır. Web maskotu yalnızca 27 KB'dır ve ekranlar aynı dosyayı paylaşır. HTML içindeki oyun kodu ve bölüm verileri ek motor indirmesi beklemeden çalışır. Efektler yalnızca cevapta kısa süre çalışır; sürekli parçacık, video veya animasyon döngüsü yoktur. Godot'un hareketsiz ekranlarında düşük işlemci kullanımı etkinleşir. Görsel üretim istemi, yerel dosyalar ve font lisansları [assets/README.md](assets/README.md) içinde belgelenmiştir.

Godot: [resmi indirme](https://godotengine.org/download/windows/), [web dışa aktarma belgesi](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html).
