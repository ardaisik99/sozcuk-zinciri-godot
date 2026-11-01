# Sözcük Zinciri

Godot 4.7.2 ile hazırlanmış, Türkçe isim tamlamalarını bir zincirde birleştirdiğin mobil uyumlu kelime oyunu. Web çıktısı aynı Godot projesidir.

[Oyunu tarayıcıda aç](https://ardaisik99.github.io/sozcuk-zinciri-godot/) · [GitHub kaynak deposu](https://github.com/ardaisik99/sozcuk-zinciri-godot)

5 kategoride 40 bölüm, adla profil oluşturma, uygulamalı öğretici, kalıcı ilerleme, altın, harf/tanım jokerleri ve yüz yüze parti modu hazırdır. Karşılıklı 1v1 menüde gelecek mod olarak gösterilir.

## Godot'ta çalıştırma

Godot 4.7.2 Standard sürümünde `project.godot` dosyasını içe aktar ve **F5** ile çalıştır. .NET veya bir API anahtarı gerekmez. Mobil uyumlu portre düzeni masaüstünde de çalışır.

## Web sürümünü deneme

Hazır çıktı `docs/` klasöründedir. Dosyaya çift tıklamak yerine PowerShell'de proje klasöründen çalıştır:

```powershell
./tools/serve.ps1
```

Ardından [http://localhost:8060](http://localhost:8060) adresini aç. Python 3 gerekir. Web sürümü WebAssembly ve WebGL 2 destekleyen güncel bir tarayıcı ister.

Değişikliklerden sonra Godot'un **4.7.2 export templates** paketini kurup yeniden dışa aktar:

```powershell
./tools/export-web.ps1 -Godot 'C:\Godot\Godot_v4.7.2-stable_win64_console.exe'
```

Godot **Project → Export → Web → Export Project** ile `docs/index.html` dosyasına da çıktı alabilirsin. Single-threaded Web preset'i GitHub Pages üzerinde özel HTTP başlığı gerektirmez.

## GitHub Pages'e gönderme

1. Bu klasörü kendi GitHub deponun `main` dalına yükle.
2. Depoda **Settings → Pages → Source → GitHub Actions** seç.
3. **Actions → Godot oyununu GitHub Pages'e yayınla** iş akışını çalıştır. Sonraki `main` gönderimlerinde otomatik yeniden yayınlanır.
4. Başarılı çalışmanın `github-pages` adresini arkadaşlarınla paylaş.

Hazır `docs/` çıktısını kullanarak derlemesiz yayınlamak istersen Pages Source'u **Deploy from a branch → main → /docs** seçebilirsin. İki yayın yönteminden birini kullan. Bu teslimat için ayrı `sozcuk-zinciri-godot` deposu kullanılır.

## Oynanış ve kayıt

İlk kelime açıktır. Sıradaki kelimenin ilk harfi hazırdır; kutuya dokunarak telefonunun veya bilgisayarının kendi klavyesiyle kalan harfleri yaz. Doğru cevapta sıradaki kelime açılır. Harf jokeri 20, tanım jokeri 15 altındır; ilk tamamlamada 40 altın ve 100 puan kazanılır. Tekrar oynamak sınırsız ödül vermez.

Profil, altın, puan ve ilerleme cihazda kaydedilir. Web'de tarayıcı/site verilerini temizlemek kaydı siler; özel modda kalıcı kayıt tarayıcıya bağlıdır. İnternet bağlantılı 1v1 henüz etkin değildir. Parti modu aynı cihaz etrafında yüz yüze oynanır.

## Doğrulama

```powershell
& 'C:\Godot\Godot_v4.7.2-stable_win64_console.exe' --headless --path . --script tests/test_state.gd
& 'C:\Godot\Godot_v4.7.2-stable_win64_console.exe' --headless --path . --script tests/test_ui.gd
```

Yerel doğrulamada oyun mantığı için 361, arayüz için 74 kontrol geçti. Arayüz testleri 320–1440 piksel genişlikleri, uzun oyuncu adı, doğrudan kutuya yazma, kısa ekranda aktif alanın görünmesi, joker sırasında yazıyı koruma ve tekrar ödül korumasını kapsar. Chrome'da masaüstü ve dokunmatik mobil emülasyonuyla web yükleme/öğretici/kayıt testleri de yapılır. Gerçek Android/iOS cihaz klavyeleri ayrıca cihazda denenmelidir.

Compatibility renderer, tek iş parçacıklı web çıktısı, yerel fontlar, küçük vektör simgeler ve paylaşılan görseller kullanılır. Android/iOS imzalama veya mağaza paketleri bu teslimata dahil değildir; mobil tarayıcıda aynı oyunu test edebilirsin.

Oyun paketi yaklaşık 0,6 MB'dır; ilk web açılışında buna Godot'un yaklaşık 39,5 MB WebAssembly motoru eklenir. Arayüzde sürekli çalışan görsel efektler yoktur; hareketsiz ekranlarda Godot'un düşük işlemci kullanımı etkinleşir. Görsel üretim istemi, yerel dosyalar ve font lisansları [assets/README.md](assets/README.md) içinde belgelenmiştir.

Godot: [resmi indirme](https://godotengine.org/download/windows/), [web dışa aktarma belgesi](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html).
