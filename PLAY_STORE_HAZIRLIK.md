# Google Play marketini açma

Bu sürümde altınla joker alışverişi sunucuda çalışır. Gerçek para ürünleri, sahibinin talebiyle kapalıdır: Google Play hesabı ve ödeme profili henüz hazır değildir. Web mağazası Google Play ödeme penceresi açmaz. Sahte ödeme, test düğmesiyle ücretsiz ürün verme veya istemcinin bildirdiği tutarı kabul etme yoktur.

## Hazırlanan ürün kimlikleri

| Kimlik | Teslimat | Tür |
| --- | --- | --- |
| `hint_pack_10` | 10 ipucu | Tüketilebilir |
| `letter_pack_25` | 25 harf | Tüketilebilir |
| `gold_500` | 500 online altın | Tüketilebilir |
| `gold_1500` | 1500 online altın | Tüketilebilir |
| `remove_ads` | Reklam kaldırma hakkı | Kalıcı |

Fiyatlar Play Console'da belirlenecek; uygulama mağazadan gelen yerel fiyatı gösterir. Reklam ağı bu oyuna henüz eklenmediği için `remove_ads` ayrıca kapalı kalır. Zaten reklamsız bir sürümde reklam kaldırma satılmaz.

## Hesap hazır olduğunda gerekenler

1. Play Console geliştirici hesabını ve ödeme profilini tamamla. Oyunun kalıcı Android paket adını belirle; mağaza ürünlerini yukarıdaki kimliklerle oluştur.
2. İmzalı Android App Bundle'ı dahili test kanalına yükle. Lisans test kullanıcılarını ekle. Godot Android Gradle dışa aktarımı ve Google Play Billing eklentisini etkinleştir. Bu projedeki eklenti MIT lisanslı resmi GodotGooglePlayBilling 3.3.0'dır.
3. Google Cloud'da Android Publisher API'yi ve Play Console'a yetkili hizmet hesabını hazırla. En az gerekli satın alma/işlem izinlerini ver. Hizmet hesabı özel anahtarını sadece sunucunun secret alanına koy; oyuna, GitHub'a veya bu belgeye yapıştırma.
4. Sunucuda `GOOGLE_PLAY_PACKAGE_NAME` değişkenini, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` secret'ını ve testten sonra `GOOGLE_PLAY_ENABLED=true` değerini ayarla. Yerel testten önce bütün ürünleri açma. Reklam kaldırma için gerçek reklam entegrasyonu ve `ADS_ENABLED=true` ayrıca gerekir.
5. Satın alma, bekleyen ödeme, iptal, bağlantı kesilmesi, aynı makbuzun yeniden gönderilmesi, uygulamayı kapatıp açma, hesabın değişmesi ve geri ödeme senaryolarını lisans test hesaplarıyla doğrula. Gerçek satın alma henüz test edilmedi.
6. Canlı satış öncesinde Google Play gerçek zamanlı geliştirici bildirimleri / iptal edilmiş satın alma takibini bağla; geri ödemelerde hakların geri alınmasını ve sunucu onayının tekrar denenmesini doğrula. Mevcut doğrulama mevcut satın alma durumunu denetler, arka planda geri ödeme bildirim servisi henüz bağlı değildir.

## Hazır doğrulama akışı

Android, `SHA256('zincir:' + online_hesap_id)` değerini Play ödeme akışının obfuscated account id alanına verir. Satın alma belirteci yalnız kimliği doğrulanmış `POST /v1/purchases/google` isteğiyle sunucuya gönderilir. Sunucu Google'dan satın alma durumunu, ürün kimliğini, hesap eşleşmesini ve adedi doğrular. Bekleyen veya iptal edilen ödeme hak kazandırmaz.

Belirtecin SHA-256 özeti sunucudaki tekil işlem anahtarıdır. Teslimat veritabanında bir kez yapılır; yeniden gönderim ikinci teslimat yaratmaz. Tüketme/onaylama teslimattan sonra sunucuda yapılır. Ham belirteç, hizmet hesabı anahtarı ve erişim token'ı istemci geçmişine veya loga yazılmaz. Satışlar hesap yapılandırılana kadar `billing_not_configured` döndürür.

Tek kişilik altın cihazda, online altın sunucuda saklanır. İstemciden güvenilmez altın yüklemesi yapılmaz. Satılan paketler online envantere gider; tek kişilik ile birleştirme ve cihazlar arası hesap kurtarma canlı satış öncesinde ayrıca kararlaştırılmalıdır. Mevcut isimle cihaz hesabında site/uygulama verilerini silmek hesap erişimini kaybettirebilir.

Resmi kaynaklar: [Godot Android satın alma](https://docs.godotengine.org/en/latest/tutorials/platform/android/android_in_app_purchases.html), [Google satın alma doğrulaması](https://developer.android.com/google/play/billing/security), [Play ödeme politikası](https://support.google.com/googleplay/android-developer/answer/9858738?hl=tr).
