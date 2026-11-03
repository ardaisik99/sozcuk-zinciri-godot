# v8 maskotları ve logo

Üç yeni çizim, dahili ImageGen aracıyla gerçek şeffaf arka plan istenerek üretildi. OpenAI API anahtarı kullanılmadı. Gazeteli özgün çizim karakter kimliği; kullanıcının yüklediği `Sevimli Harf Bulmaca Tahtası.png` logo/stil referansıdır. Kullanıcının logosunun dışındaki siyah köşeler ayrıca aynı araçla şeffaflaştırıldı; özgün yükleme `app-logo-source.png`, düzenlenen ana dosya `app-logo-alpha-source.png` olarak saklandı. Kutlama pozu önceki onaylı çizimden tekrar kullanıldı.

| Oyun dosyası | Boyut | WebP bayt |
| --- | --- | --- |
| `mascot-boy.png` / `.webp` | 256 × 256 | 12.422 |
| `mascot-girl.png` / `.webp` | 256 × 256 | 10.552 |
| `mascot-teacher.png` / `.webp` | 512 × 512 | 27.208 |
| `mascot-celebrate.png` / `.webp` | 384 × 384 | 15.594 |
| `app-logo.png` / `.webp` | 512 × 512 | 50.884 |
| `app-logo-icon.png` | 64 × 64 | 11.106 PNG |

Her seçilen görselin ana dosyası `*-source.png` olarak bu klasördedir; Godot dışa aktarımı ve web açılışı bunları içermez. `tools/prepare_mascot_assets.py` yalnız Pillow LANCZOS küçültme ve WebP sıkıştırma yapar. Boyama veya arka planı kodla silme yapılmadı. Şeffaf maskotların alfa aralığı 0–255'tir. Ana kaynaklar değişmeden saklanır.

## Üretim istemleri

### Logo dış köşelerinin şeffaflaştırılması

Use case: background-extraction. Edit target: the user's existing app logo exactly as supplied. Remove ONLY the black background OUTSIDE the cream rounded-square outer border, replacing that outside corner/background area with genuine alpha transparency. Preserve the complete rounded-square cream border and everything INSIDE the logo exactly: cyan smiling water-drop mascot with hands, folded newspaper bottomleft, books, warm wooden desk, violet library walls, green leaves, six cream word tiles with the purple S and underscores, and gold attention marks. Do not redraw, redesign, retype, recolor, shift, or alter any inside element or lettering. Do not crop the cream border. Square canvas, isolated original logo with transparent outer corners; clean crisp edge. This is precise background removal, not a new logo design.

### Erkek profil

Use case: identity-preserve. Asset type: transparent game avatar, boy variant of the supplied cyan water-drop mascot. Reference1 gives EXACT character identity, reference2 gives the user's new game logo and polished friendly finish. Generate ONE standalone portrait avatar with head and small shoulders/rounded hands, smiling confidently toward viewer with a small friendly wave. Preserve cyan teardrop head, navy oval eyes, tiny curved smile, rounded simple arms and overall identity. A tiny muted navy-blue cap sitting tastefully atop/back of head gives this avatar boy styling, otherwise same mascot. No human face, no human hair, no newspapers, no letters, no text, no border, no background, no floor, no pedestal. Beautiful professional mobile puzzle game illustration, confident smooth dark-navy contour, soft clean cel shading, refined subtle highlights, bright cyan with cream and muted navy accents, no neon, no glowing or clutter. Square icon composition, large recognizable face and hands, fully contained with 12% transparent padding. Actual alpha transparency.

### Kız profil

Use case: identity-preserve. Asset type: girl avatar matching this mobile puzzle game's new boy avatar. Image1 is the EXACT style, scale, facial proportions, same cyan drop identity and cropping target. Image2 confirms original character. Make ONE matching standalone girl variant: same smiling cyan water-droplet head, navy simple oval eyes, tiny shoulders and hands with friendly wave, same balanced professional cel-shaded illustration. Change ONLY the cap: remove baseball cap and replace with one small pretty coral bow near upper left of her teardrop head; add just two subtle short eyelashes at the outer corner of each eye. Keep same eye size, friendly small curved smile, round hands and shade of blue. No human hair, no human face, no clothing, no floating punctuation/marks, no lettering, no border. Beautiful refined finish, clean silhouette and controlled highlights. Full subject within frame with 12 percent transparent padding. Real alpha transparency, no ground/shadow platform/background.

### Öğretici

Use case: identity-preserve. Asset type: mascot teaching tutorial illustration, transparent game asset. Preserve EXACT original cyan water droplet from image1, identity and navy oval eyes and tiny smiling mouth and rounded small arms/feet. Image2 gives polished game's logo finish. Draw the same mascot as a helpful clever guide, full body seated/standing at a slight three-quarter angle facing right. One hand naturally holds a small warm-ivory unfolded newspaper crossword sheet against its lower body; the other rounded hand points outward/up to the right as if showing the player the next instruction. A small ochre pencil rests naturally over the newspaper. The NEWSPAPER should clearly be a thin folded paper with subtle news columns and one modest empty crossword grid, no readable text. Happy encouraging expression, original beautiful drop-shaped silhouette intact. Refined smooth dark navy contours, cyan and turquoise subtle cel shading, gently polished highlights, consistent with supplied game mascot, no neon. No blackboard, no words, no speech balloon (the interface adds real text), no books, no other character, no environment, no floor, no shadowplatform, no border, no confetti. Keep whole head, hand and paper in frame, generous transparent padding. Actual transparent alpha background.
