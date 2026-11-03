"""Build the fast Pages edition. Only the Python standard library is needed."""
import gzip
import json
import os
import re
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DEST = (ROOT / 'docs').resolve()
assert DEST.parent == ROOT.resolve() and DEST.name == 'docs'
DEST.mkdir(exist_ok=True)
html = (ROOT / 'web/index.html').read_text(encoding='utf-8')
css = (ROOT / 'web/style.css').read_text(encoding='utf-8')
state = (ROOT / 'web/state.js').read_text(encoding='utf-8')
game = (ROOT / 'web/game.js').read_text(encoding='utf-8')
online = json.loads((ROOT / 'config/online.json').read_text(encoding='utf-8'))
if os.environ.get('ZINCIR_ONLINE_URL'):
    online['baseUrl'] = os.environ['ZINCIR_ONLINE_URL']
html = html.replace('<script id="online-config" type="application/json">{"baseUrl":""}</script>',
                    '<script id="online-config" type="application/json">' + json.dumps(online,ensure_ascii=False).replace('<','\\u003c') + '</script>')
state = re.sub(r'^export default[^\n]*\n?', '', state, flags=re.MULTILINE)
state = re.sub(r'^export\s+', '', state, flags=re.MULTILINE)
game = re.sub(r'^import[^\n]*\n?', '', game, flags=re.MULTILINE)
content = json.loads((ROOT / 'data/levels.json').read_text(encoding='utf-8'))
content_json = json.dumps(content, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + css + '\n</style>')
script = (state + '\n' + game).replace('</script', '<\\/script')
html = html.replace('<script type="module" src="game.js"></script>', '<script id="game-content" type="application/json">' + content_json + '</script>\n<script type="module">\n' + script + '\n</script>')
if 'src="game.js"' in html or 'href="style.css"' in html or 'export default ' in script:
    raise RuntimeError('Source entry points did not bundle correctly')
(DEST / 'index.html').write_text(html, encoding='utf-8', newline='\n')
for name in ['online.js', 'online.css']:
    shutil.copy2(ROOT / 'web' / name, DEST / name)
for name in ['.gdignore', '.nojekyll']:
    (DEST / name).touch()
(DEST / 'data').mkdir(exist_ok=True)
shutil.copy2(ROOT / 'data/levels.json', DEST / 'data/levels.json')
(DEST / 'assets/fonts').mkdir(parents=True, exist_ok=True)
(DEST / 'assets/icons').mkdir(parents=True, exist_ok=True)
for name in ['mascot-editorial.webp', 'mascot-editorial-icon.png',
             'app-logo.webp', 'app-logo-icon.png', 'mascot-boy.webp', 'mascot-girl.webp',
             'mascot-teacher.webp', 'mascot-celebrate.webp']:
    shutil.copy2(ROOT / 'assets' / name, DEST / 'assets' / name)
for name in ['app-logo.png', 'hero.webp', 'mascot.webp', 'mascot-icon.png', 'mascot-think.webp',
             'mascot-cheer.webp', 'mascot-run.webp']:
    target = (DEST / 'assets' / name).resolve()
    assert target.parent == (DEST / 'assets').resolve()
    target.unlink(missing_ok=True)
for name in ['Baloo2', 'Nunito', 'Symbols']:
    shutil.copy2(ROOT / f'assets/fonts/{name}.woff2', DEST / f'assets/fonts/{name}.woff2')
    shutil.copy2(ROOT / f'assets/fonts/{name}-OFL.txt', DEST / f'assets/fonts/{name}-OFL.txt')
for icon in (ROOT / 'assets/icons').glob('*.svg'):
    shutil.copy2(icon, DEST / 'assets/icons' / icon.name)
# These exact files were produced by the previous Godot export. No recursive
# deletion or computed external paths are used for cleanup.
for name in ['index.wasm', 'index.pck', 'index.js', 'index.audio.position.worklet.js',
             'index.audio.worklet.js', 'index.apple-touch-icon.png', 'index.icon.png',
             'index.png', 'index.apple-touch-icon.png.import', 'index.icon.png.import',
             'index.png.import']:
    target = (DEST / name).resolve()
    assert target.parent == DEST
    target.unlink(missing_ok=True)
raw = html.encode('utf-8')
assets = sum(p.stat().st_size for p in (DEST / 'assets').rglob('*') if p.is_file())
print(f'Fast web ready: docs/index.html ({len(raw):,} bytes, gzip {len(gzip.compress(raw)):,} bytes)')
print(f'All copied assets: {assets:,} bytes. No WebAssembly runtime.')
