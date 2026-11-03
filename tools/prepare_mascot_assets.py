"""Mechanical resizing/compression of approved artwork; no painting or retouching."""
from pathlib import Path
from PIL import Image

ASSETS = Path(__file__).resolve().parent.parent / 'assets'
for name, size, quality in [('mascot-boy',256,82),('mascot-girl',256,82),('mascot-teacher',512,82),('mascot-celebrate',384,82),('app-logo',512,82)]:
    source = ASSETS / (name + '-source.png')
    if name == 'app-logo' and (ASSETS / 'app-logo-alpha-source.png').exists():
        source = ASSETS / 'app-logo-alpha-source.png'
    with Image.open(source) as image:
        image = image.convert('RGBA')
        image.thumbnail((size,size),Image.Resampling.LANCZOS)
        image.save(ASSETS / (name + '.png'),optimize=True)
        image.save(ASSETS / (name + '.webp'),format='WEBP',quality=quality,method=6,exact=True)
        if name == 'app-logo':
            icon = image.copy()
            icon.thumbnail((64,64),Image.Resampling.LANCZOS)
            icon.save(ASSETS / 'app-logo-icon.png',optimize=True)
        print(name, image.size, 'alpha', image.getchannel('A').getextrema(), 'web bytes', (ASSETS/(name+'.webp')).stat().st_size)
