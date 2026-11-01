# Sözcük Zinciri görsel varlıkları

Bu klasör oyuna ait özgün ikonları, çizimi ve yerel fontları içerir. Oyun çalışırken dış font ya da görsel servisine bağlanmaz.

- `hero.png`: Dahili ImageGen aracıyla üretilmiş özgün saydam oyun çizimi. 768×512 RGBA, yaklaşık 343 KB. Kaynak oluşturma çıktısı Codex generated_images klasöründe korunur.
- `hero.webp`: Hızlı web sürümü için aynı çizimin 512 piksel genişliğe küçültülmüş, alfa kanalı korunmuş WebP kopyası; kalite 82. Godot PNG kaynağı değiştirilmez.
- `icons/*.svg`: Oyuna özel 26 özgün, yuvarlak hatlı vektör ikon; 64×64. Kaynak üretici `generate_icons.py`.
- `icon.svg`: Özgün uygulama simgesi.
- `pattern.svg`: Çok düşük kontrastlı, döşenebilir zincir ve harf deseni.
- `fonts/Baloo2.ttf`: Türkçe karakterli Baloo 2 ExtraBold, 800 ağırlık, Latin ve genişletilmiş Latin alt kümesi. SIL Open Font License 1.1, `Baloo2-OFL.txt`.
- `fonts/Nunito.ttf`: Türkçe karakterli Nunito ExtraBold, 800 ağırlık. SIL Open Font License 1.1, `Nunito-OFL.txt`.
- `fonts/Symbols.ttf`: Noto Sans Math Regular içinden yalnızca oyunda kullanılan ok, onay işareti ve basit simgeleri içeren küçük alt küme. `→ ✓ ↻ ↳ ↓` glifleri doğrulanmıştır. SIL Open Font License 1.1, `Symbols-OFL.txt`. Web sürümünde işletim sistemi fontlarına ihtiyaç duymayan simge yedeği olarak kullanılır.
- `fonts/{Baloo2,Nunito,Symbols}.woff2`: Aynı lisanslı fontların web için WOFF2 biçiminde sıkıştırılmış kopyaları. Türkçe ve simge glifleri korunur.
- `fonts/Fredoka.ttf`: Fredoka Bold 700. Türkçe Ğ, İ, Ş, ğ, ş gliflerini içermediğinden ana Türkçe metinlerde Baloo 2 tercih edilir. SIL Open Font License 1.1, `Fredoka-OFL.txt`.

Fontlar Google Fonts'un resmi deposundan alınmıştır: [Baloo 2](https://github.com/google/fonts/tree/main/ofl/baloo2), [Nunito](https://github.com/google/fonts/tree/main/ofl/nunito), [Fredoka](https://github.com/google/fonts/tree/main/ofl/fredoka). Font dosyalarının isim ve lisans kayıtları korunmuştur.

Simge fontunun resmi kaynağı: [Noto Sans Math](https://github.com/google/fonts/tree/main/ofl/notosansmath). Noto Sans Symbols 2, temel okların tamamını içermediğinden tüm gerekli glifleri tek dosyada içeren Noto Sans Math seçilmiştir.

## Palet

Krem `#fff8eb`, koyu mürekkep `#263657`, mercan `#fa714d`, turkuaz `#28aaa0`, altın `#ffc647`, mor `#7961bd`.

## Çizim üretim istemi

Use case: stylized-concept. Asset type: original hero illustration for a polished Turkish mobile word chain puzzle game UI, used as a crisp 400 pixel wide cutout. Primary request: a compact playful diagonal cluster of three interlocking chunky alphabet game tiles connected by a golden chain link, with a fourth small floating tile and a few simple star shapes. The main tiles show the single uppercase letters S, Z, C, each letter clear and dark navy. Style: premium hand-crafted casual mobile game 2.5D illustration, bold rounded dark navy outlines, exaggerated thick beveled tile edges and confident simple shapes, clean cel shading and soft warm highlights, visually appealing collectible board game pieces. Color palette: warm cream #fff8eb tile faces, coral #fa714d, teal #28aaa0, golden yellow #ffc647 and navy #263657 outlines; no neon, no purple glow. Composition: one coherent central cluster with generous transparent padding, all parts entirely visible, naturally tilted pieces, front three quarter perspective, no background or platform, genuine transparent background. Constraints: original artwork, no existing game characters, no trademark, no logos, no words, no watermark, no room scenery, no UI mockup. Make rich readable toy-like forms with a strong silhouette that works on both a cream and turquoise UI.
