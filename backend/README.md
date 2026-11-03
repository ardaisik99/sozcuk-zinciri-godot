# Online sunucu

Cloudflare Workers ve SQLite Durable Objects üzerinde çalışan iki oyunculu Kelime Savaşı. Her oda ayrı bir aktördür. Hesap/arkadaş kayıtları ayrı, indeksli bir aktörde tutulur. Harici veritabanı, ücretli plan, SMS, e-posta servisi veya istemci SDK'sı gerekmez. Ücretsiz kotalar aşılırsa servis istekleri reddedebilir; bu proje ücretli plana otomatik geçiş yapmaz.

## Oynanış

- Yalnız adla cihaz hesabı oluşturulur. Sunucu benzersiz arkadaş kodu verir. Kod hesap parolası değildir; cihazda saklanan rastgele anahtar hesap erişimini sağlar. Site/uygulama verisi silinirse bu hesaba erişim kaybolur.
- Arkadaş isteği kabul edildikten sonra oda daveti gönderilebilir. Altı karakterli oda koduyla doğrudan katılmak da mümkündür.
- İki oyuncu hazırken ev sahibi başlatır. Üç saniyelik geri sayım sonrası, sunucunun belirlediği oyuncunun 20 saniyelik sırası başlar.
- Aktif oyuncunun tek kelimelik mesajı tahmindir. Yanlış cevap kırmızı çizilir; oyuncu kalan sürede tekrar deneyebilir. Çok kelimeli sohbet ve rakibin mesajları normal sohbet olarak gösterilir. Doğru çekimli cevap yeşil tik alır, 100 puan kazandırır, kelime köküne döner ve sıra rakibe geçer.
- Süre biterse aynı kelimede sıra rakibe geçer. Aynı kelimede iki sıra da cevapsız kalırsa kelime açılır; puan verilmez. Beş kelimelik zincir bitince veya üç dakika dolunca karşılaşma sonuçlanır. Puanlar eşitse doğru cevaplara harcanan toplam süre kullanılır; o da eşitse beraberlik olur.
- Bağlantı kesilmesinde 30 saniye dönüş süresi vardır. Başlamış maçtan açıkça ayrılmak rakibe galibiyet verir. Maç başlamadan oda kapanması istatistik yazmaz. Oda sohbeti 24 saat sonra temizlenir.

## Yerel test

Node 24 LTS önerilir. Yeni klonda `npm ci` çalıştır. Sahibe verilen proje paketinde `private/chains.json` bulunur; bu dosya ve `.dev.vars` GitHub'a gönderilmez. Başka bir geliştirici kendi beşli zincirlerini bu biçimde oluşturabilir:

```json
[{"id":"ornek","words":["ÇAY","KAŞIK","OYUN","HAVA","DURUM"],"answers":["ÇAY","KAŞIĞI","OYUNU","HAVASI","DURUMU"],"links":["Çay kaşığı","Kaşık oyunu","Oyun havası","Hava durumu"]}]
```

Proje kökünden:

```powershell
./tools/online.ps1 -Action Dev
```

Bu işlem özel bankayı doğrular ve yerel `.dev.vars` dosyasını oluşturur. API `http://127.0.0.1:8787` adresindedir. Başka terminalde yalnız yerel web çıktısı için:

```powershell
$env:ZINCIR_ONLINE_URL='http://127.0.0.1:8787'
python tools/build_web.py
Remove-Item Env:ZINCIR_ONLINE_URL
./tools/serve.ps1
```

Godot'ta yerel API kullanılacaksa `config/online.json` içindeki `baseUrl` yerel adrese ayarlanır. Canlı adresi yanlışlıkla değiştirmemeye dikkat et. İki ayrı tarayıcı profili veya iki cihaz hesabı kullan; aynı hesabın ikinci sekmesi önceki bağlantıyı devralır.

## Yayın

```powershell
./tools/online.ps1 -Action Login
./tools/online.ps1 -Action Deploy
python tools/set-online-url.py https://SUNUCU-ADRESI
python tools/build_web.py
```

Giriş tarayıcıdaki Cloudflare OAuth ekranından yapılır. Şifre veya erişim anahtarı kaynak koduna eklenmez. Deploy betiği testleri çalıştırır, Worker'ı yayınlar ve özel kelime bankasını `CHAIN_BANK` sunucu sırrına stdin üzerinden yükler. Banka minify edilir; tek Cloudflare metin sırrının yaklaşık 5 KB sınırını aşan bankalar ayrıca depolama tasarımı gerektirir. Mevcut 18 zincir yaklaşık 3,6 KB'dır.

`config/online.json` gizli değildir; aynı URL hem Godot hem web tarafından kullanılır. Tarayıcı için yalnız izin verilen origin'ler `wrangler.jsonc` içindedir. Üretim hesabında Worker ve Durable Object kaynakları bu dosyadaki migration ile otomatik oluşur. Migrations daha sonra silinmemeli/değiştirilmemelidir; yeni tag eklenir.

GitHub Pages yalnız oyun istemcisini sunar; sunucu ve hesap verileri Cloudflare'dadır. Bazı ağlar `workers.dev` alanını filtreleyebilir; dağıtımda seçilen erişilebilir API adresini kullan. GitHub Pages'e localhost adresi gönderilmemelidir.

## Doğrulama

```powershell
npm test
$env:ONLINE_API_URL='http://127.0.0.1:8787'
node --test tests/integration.test.mjs
```

Varsayılan testler saf oyun motorunu ve gerçek aktör kodlarının deterministik yaşam döngüsünü kapsar. Canlı entegrasyon testi gerçek HTTP/WebSocket ve SQLite Durable Objects kullanır; yerel sunucu olmadan kendini atlar. Web uçtan uca testi `tools/browser_online_flow.cjs`, Godot testi `tests/test_online_ui.gd` dosyasındadır. Testler kimlik anahtarlarını yazdırmaz.

Ayrıntılı istemci/sunucu sözleşmesi: [PROTOCOL.md](PROTOCOL.md).

## Bu kurulumdaki ücretsiz giriş adresi

Canlı istemci adresi `https://sozcuk-zinciri-api-ardaisik.ardadc99.chatgpt.site` olarak ayarlıdır. Yerel TTNET hattı workers.dev ve pages.dev adreslerini filtrelediği için Sites üzerinde herkese açık, durum tutmayan bir HTTP/WebSocket giriş Worker'ı kullanılır. Hesap ve oda verileri yine sahibin Cloudflare hesabındaki `sozcuk-zinciri-online` Worker ve Durable Object kaynaklarındadır. Giriş kaynağı, sahibe verilen ZIP'te `services/online-gateway/` klasöründedir; ayrı Sites kaynak deposunda da kayıtlıdır.

`GATEWAY_KEY` Cloudflare'da, eş değeri `ZINCIR_GATEWAY_KEY` Sites ortamında sır olarak tutulur. Anahtar yalnız sunucular arasında kullanılır; tarayıcıya veya proje ZIP'ine eklenmez. Bu anahtarlar korunursa normal Worker güncellemelerinde giriş adresini yeniden yayınlamak gerekmez. Sites proje kimliği `.openai/hosting.json` içindedir; mevcut proje yeniden kullanılır.
