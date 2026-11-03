"""Configure the public API origin for both clients. This is not a secret."""
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit

url = sys.argv[1].strip().rstrip('/') if len(sys.argv) > 1 else ''
parsed = urlsplit(url)
if url and (parsed.scheme != 'https' and not (parsed.scheme == 'http' and parsed.hostname in ['127.0.0.1', 'localhost'])):
    raise SystemExit('HTTPS API adresi veya yerel localhost adresi gerekli.')
if url and (not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path):
    raise SystemExit('Yalnız API origin adresini yaz; yol, token veya sorgu ekleme.')
target = Path(__file__).resolve().parent.parent / 'config/online.json'
target.write_text(json.dumps({'baseUrl': url}) + '\n', encoding='utf-8')
print('Web ve Godot ortak online adresi kaydedildi.')
