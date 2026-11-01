"""Original vector pictograms for Sözcük Zinciri. No external icon library."""
from pathlib import Path

INK = '#263657'
GOLD = '#ffc647'
TEAL = '#28aaa0'
CORAL = '#fa714d'
CREAM = '#fff8eb'
PURPLE = '#7961bd'

icons = {
    'chain': '<g transform="rotate(-35 32 32)"><rect x="10" y="15" width="28" height="20" rx="10" fill="#ffc647"/><rect x="26" y="29" width="28" height="20" rx="10" fill="#28aaa0"/><path d="M27 26h10" fill="none"/></g>',
    'coin': '<ellipse cx="32" cy="35" rx="22" ry="23" fill="#d99430"/><ellipse cx="32" cy="30" rx="22" ry="23" fill="#ffc647"/><ellipse cx="32" cy="30" rx="14" ry="15" fill="none" stroke="#d99430"/><path d="m32 19 3.3 6.8 7.5 1-5.5 5.4 1.4 7.5-6.7-3.6-6.7 3.6 1.4-7.5-5.5-5.4 7.5-1z" fill="#fff1b2" stroke-width="2.5"/>',
    'trophy': '<path d="M18 15H9v7c0 10 9 14 14 14m23-21h9v7c0 10-9 14-14 14" fill="#ffc647"/><path d="M20 10h24v15c0 11-5 17-12 17s-12-6-12-17z" fill="#ffc647"/><path d="M32 42v10m-12 4h24l-3-5H23z" fill="#fa714d"/><path d="m32 17 2.7 5.2 5.8.8-4.3 4.2 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.2 5.8-.8z" fill="#fff8eb" stroke-width="2"/>',
    'spark': '<path d="m32 6 6.3 16.5L56 28l-16.7 7.2L34 55l-8-17.6L8 32l17-7z" fill="#ffc647"/><path d="m50 7 2 5.5 5 1.5-5 2-1.5 5-2-5-5-2 5-1.5z" fill="#fa714d" stroke-width="2"/>',
    'chef': '<path d="M17 38C3 36 4 18 17 18c2-14 24-14 28 0 13 0 15 18 2 20v14H17z" fill="#fff8eb"/><path d="M17 43h30v9H17z" fill="#ffc647"/><path d="M25 24v10m14-10v10" fill="none"/>',
    'ball': '<circle cx="32" cy="32" r="24" fill="#fff8eb"/><path d="m32 20 11 8-4 13H25l-4-13z" fill="#28aaa0"/><path d="m32 8 0 12M9 25l12 3M17 51l8-10m22 10-8-10m16-16-12 3M22 10l10 10 10-10M8 35l13-7m35 7-13-7M27 56l-2-15m12 15 2-15" fill="none" stroke-width="2.5"/>',
    'leaf': '<path d="M12 47C3 20 30 10 53 10c2 25-9 48-35 39z" fill="#28aaa0"/><path d="m12 55 30-32M24 43l-2-14m10 6 12 0" fill="none"/>',
    'book': '<path d="M8 14c11-4 18-2 24 4 6-6 13-8 24-4v38c-11-4-18-2-24 3-6-5-13-7-24-3z" fill="#ffc647"/><path d="M32 18v37" fill="none"/><path d="M15 23c5-1 8 0 11 2m-11 7c5-1 8 0 11 2m-11 7c5-1 8 0 11 2m12-18c3-2 6-3 11-2m-11 11c3-2 6-3 11-2m-11 11c3-2 6-3 11-2" fill="none" stroke-width="2.5"/>',
    'party': '<path d="m10 54 10-33 24 23z" fill="#fa714d"/><path d="m17 34 13 12m-16 0 7 6" fill="none" stroke="#fff8eb"/><path d="M32 23c-2-10 13-4 10-16m0 24c11 3 3-11 15-10M23 15l-3-7m32 38 5 4" fill="none"/><path d="m43 37 4-7 6 5-4 6z" fill="#28aaa0"/><circle cx="11" cy="17" r="3" fill="#ffc647"/><circle cx="53" cy="10" r="3" fill="#7961bd"/>',
    'back': '<path d="M38 13 19 32l19 19" fill="none" stroke-width="6"/>',
    'arrow': '<path d="M13 32h36M35 17l15 15-15 15" fill="none" stroke-width="5"/>',
    'sound': '<path d="M10 25h11l14-12v38L21 39H10z" fill="#ffc647"/><path d="M43 23c6 5 6 13 0 18m7-27c12 10 12 26 0 36" fill="none"/>',
    'sound_off': '<path d="M10 25h11l14-12v38L21 39H10z" fill="#fff8eb"/><path d="m44 24 12 16m0-16L44 40" fill="none" stroke-width="4"/>',
    'hint': '<path d="M9 11h46v32H32L19 54V43H9z" fill="#fff8eb"/><path d="M25 22c0-8 15-8 15 0 0 6-8 5-8 11" fill="none"/><circle cx="32" cy="38" r="1" fill="#263657"/>',
    'bulb': '<path d="M23 43c-1-7-9-9-9-20a18 18 0 0 1 36 0c0 11-8 13-9 20z" fill="#ffc647"/><path d="M24 43h16v8H24zm3 8h10l-2 5h-6z" fill="#fff8eb"/><path d="M27 26l5 5 5-5m-5 5v12M8 9 5 6m51 3 3-3M4 25H1m62 0h-3" fill="none" stroke-width="3"/>',
    'lock': '<path d="M19 29V20a13 13 0 0 1 26 0v9" fill="none" stroke-width="6"/><rect x="12" y="27" width="40" height="29" rx="7" fill="#ffc647"/><circle cx="32" cy="39" r="4" fill="#263657"/><path d="M32 42v6" stroke-width="4"/>',
    'check': '<path d="m12 32 13 14 27-28" fill="none" stroke="#28aaa0" stroke-width="8"/>',
    'settings': '<path d="m26 6 12 0 2 9 6 3 9-3 6 10-7 6 0 6 7 6-6 10-9-3-6 3-2 9H26l-2-9-6-3-9 3-6-10 7-6v-6l-7-6 6-10 9 3 6-3z" transform="translate(1 -2) scale(.97)" fill="#fff8eb"/><circle cx="32" cy="32" r="10" fill="#28aaa0"/>',
    'home': '<path d="M7 30 32 9l25 21M13 26v29h15V38h9v17h14V26" fill="#ffc647"/>',
    'profile': '<circle cx="32" cy="22" r="13" fill="#ffc647"/><path d="M9 56c0-15 9-23 23-23s23 8 23 23" fill="#28aaa0"/>',
    'keyboard': '<rect x="5" y="14" width="54" height="36" rx="7" fill="#fff8eb"/><path d="M14 23h2m8 0h2m8 0h2m8 0h2m-32 9h2m8 0h2m8 0h2m8 0h2m-29 10h27" stroke-width="4"/>',
    'letter': '<rect x="9" y="8" width="46" height="48" rx="10" fill="#ffc647"/><path d="m20 44 12-26 12 26m-19-8h14" fill="none" stroke-width="4"/>',
    'cup': '<path d="M44 19h7c13 0 10 19-7 19" fill="#fff8eb"/><path d="M9 17h36v21c0 10-36 10-36 0z" fill="#fa714d"/><path d="M7 51h43M20 6v5m12-5v5" fill="none"/>',
    'flag': '<path d="M14 57V8m1 3c12-10 21 10 36 0v26c-15 10-24-10-36 0" fill="#fa714d"/><path d="M9 57h10"/>',
    'close': '<path d="m17 17 30 30m0-30L17 47" fill="none" stroke-width="6"/>',
    'refresh': '<path d="M50 24a20 20 0 1 0 1 17M50 10v15H35" fill="none" stroke-width="5"/>',
}

out = Path(__file__).parent / 'icons'
out.mkdir(exist_ok=True)
for name, body in icons.items():
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><g stroke="{INK}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">{body}</g></svg>'
    (out / f'{name}.svg').write_text(svg, encoding='utf-8')
print(f'{len(icons)} original SVG icons created.')
