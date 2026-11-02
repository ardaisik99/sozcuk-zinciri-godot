# Sözcük Zinciri görsel varlıkları

Bu klasör oyuna ait özgün ikonları, çizimi ve yerel fontları içerir. Oyun çalışırken dış font ya da görsel servisine bağlanmaz.

- `mascot-source.png`: Kullanıcının verdiği `karakter.png` damla maskotu referans alınarak dahili ImageGen düzenlemesiyle oluşturulan özgün 1254×1254 RGBA ana çizim. Aynı turkuaz damla, lacivert oval gözleri ve gülümsemesiyle boş kelime kutuları olan bir defteri kalemle çözüyor. Görselde harf veya yazı yoktur.
- `mascot.png`: Godot için ana çizimin alfa kanalı korunan 512×512 PNG kopyası; 174.117 bayt.
- `mascot.webp`: Hızlı web için aynı çizimin alfa kanalı korunan 512×512 WebP kopyası; kalite 82, 27.250 bayt. İkon ve ana görsel aynı dosyayı paylaşır.
- `mascot-icon.png`: Ana çizimin kırpılmadan mekanik olarak küçültülen 64×64 saydam PNG kopyası; tarayıcı sekme simgesi için kullanılır.
- PNG/WebP boyutlandırması ve biçim sıkıştırması Pillow ile mekanik olarak yapıldı; karakterin çizimine ek müdahale yapılmadı. Kullanıcının özgün referansı değiştirilmedi.
- Önceki `hero.png` / `hero.webp` harf kutusu çizimleri yeni maskotla değiştirilmiştir; güncel oyun arayüzünde kullanılmaz.
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

## Güncel maskot üretim istemi

Use case: identity-preserve. Asset type: square transparent hero mascot for the Turkish word-chain puzzle game Sözcük Zinciri. Edit the exact supplied character into a new activity pose. The attached image is the identity reference: a cheerful turquoise water-droplet creature with one large recognizable pointed teardrop head and rounded body, two dark blue simple oval eyes, a small dark blue curved smile, tiny rounded stubby arms and feet. Preserve that exact silhouette, turquoise cyan body coloring, navy-blue outline, facial style and proportions. Do not invent a different character. Primary request: this exact droplet mascot is happily solving a word puzzle, standing or sitting in a three-quarter-front pose, holding an open warm cream puzzle notebook in front of its lower torso and a short chunky golden-yellow pencil in one hand, pencil tip touching the page. Its joyful face, teardrop point, both eyes, both arms and little feet must remain clearly recognizable and visible. The open notebook pages contain a few orderly empty square word-puzzle cells ONLY, with no letters or words at all. Make the notebook a modest supporting prop, with the face as focal point. Style: polished original casual mobile game 2D illustration, thick smooth dark navy outlines, clean rich cel shading, rounded toy-like shapes, turquoise highlights, gentle warm cream/gold accents on the notebook and pencil. Preserve source character identity rather than making it glossy 3D. Composition: compact central fullbody mascot and notebook, clean strong silhouette readable at 80px, square image with generous transparent margins, all parts in frame. Background: genuine transparency with alpha; remove the supplied white canvas and black rectangular area entirely. Constraints: no letters, no typography, no SZC, no alphabet tiles, no logo lettering, no text, no clothes or accessories other than the requested puzzle notebook and pencil, no additional characters, no confetti, no neon glow, no external backdrop, no watermark. Preserve the same friendly expression and original character identity.

## Arşivlenen önceki çizimin üretim istemi

Use case: stylized-concept. Asset type: original hero illustration for a polished Turkish mobile word chain puzzle game UI, used as a crisp 400 pixel wide cutout. Primary request: a compact playful diagonal cluster of three interlocking chunky alphabet game tiles connected by a golden chain link, with a fourth small floating tile and a few simple star shapes. The main tiles show the single uppercase letters S, Z, C, each letter clear and dark navy. Style: premium hand-crafted casual mobile game 2.5D illustration, bold rounded dark navy outlines, exaggerated thick beveled tile edges and confident simple shapes, clean cel shading and soft warm highlights, visually appealing collectible board game pieces. Color palette: warm cream #fff8eb tile faces, coral #fa714d, teal #28aaa0, golden yellow #ffc647 and navy #263657 outlines; no neon, no purple glow. Composition: one coherent central cluster with generous transparent padding, all parts entirely visible, naturally tilted pieces, front three quarter perspective, no background or platform, genuine transparent background. Constraints: original artwork, no existing game characters, no trademark, no logos, no words, no watermark, no room scenery, no UI mockup. Make rich readable toy-like forms with a strong silhouette that works on both a cream and turquoise UI.
