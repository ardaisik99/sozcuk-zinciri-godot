# Running mascot atlas

Generated with the built-in image generation tool on 2026-11-02. Reference: the user-supplied character as saved in `assets/mascot.png` (original `C:/Users/ArdHP/Desktop/karakter.png`). The droplet identity, oval navy eyes, smile, turquoise shading and deep blue outline are preserved. The running poses contain no book or pencil.

- Master: `mascot-run-source.png`, 1774 × 887, RGBA transparent, four columns × two rows.
- Runtime: `mascot-run.png` and `mascot-run.webp`, 1024 × 128, RGBA transparent.
- Eight 128 × 128 cells, left to right, at 10 fps (0.8-second cycle).
- Rectangle metadata: `mascot-run.json`; `frames` is the integer count and `frame_rects` lists the eight rectangles.
- All eight frames are different original running poses, including foot contact, compression, passing and flight. The PNG shares one texture; WebP is the lightweight browser asset.
- Mechanical processing only: split the master into eight equal grid cells, remove almost invisible alpha noise (alpha ≤ 8/255), downsample each cell to 128 × 128 with Lanczos, discard resampling alpha noise ≤ 3/255, and concatenate into one horizontal strip. Character proportions and pose content were not repainted or translated.
- QA: all eight pixel hashes are distinct; each cell contains transparent outer margins, a whole character, and no labels, ground or props. The source is retained for future export sizes.

## Generation prompt

Use case: game sprite animation asset, transparent sprite sheet. Reference image is the exact mascot identity to preserve, not a layout reference. Create one clean eight-frame running-in-place animation sprite sheet of the same cute bright cyan turquoise water-droplet character. Remove the entire book and pencil, leaving the droplet body and tiny arms and feet. Preserve the rounded pointed droplet silhouette, thick deep blue navy outline, two simple vertical oval navy eyes, curved happy smile, turquoise shading and small white highlight. No costumes or props. Polished hand-drawn mobile cartoon game art matching the reference, not a realistic water render.

Uniform four-columns by two-rows grid, eight equal cells, without divider lines. Frames ordered left to right along the top row and then along the bottom row. Same fixed camera, scale, palette, nearly front-facing perspective slightly toward the viewer's right, and horizontal body alignment. Each whole character remains inside its cell with generous transparent margins. The character occupies about 75% of the cell height.

Genuine alternating running gait with individually redrawn bent knees, feet and opposed arms: (1) left foot forward contact, right leg back; (2) left-foot compression and right-foot lift; (3) left support with right knee passing; (4) flight with right foot reaching forward; (5) right-foot contact with left leg back; (6) right-foot compression with left-foot lift; (7) right support with left knee passing; (8) flight with left foot reaching forward, returning smoothly to the first frame. Energetic tiny arms and feet, stable head with a small vertical bob, and a happy expression throughout.

Everything outside the mascot must be real transparent alpha. No background, ground, platform, cast shadow, speed lines, effects, text, frame numbers, labels, watermarks, borders, checkerboard texture, book or pencil. This is a production animation atlas.
