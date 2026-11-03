"""Owner source delivery, with the private question bank but no credentials."""
import json
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'output/SozcukZinciri-Godot-ve-Web.zip'
files = {p for p in subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).decode('utf-8').split('\0') if p}
files.update({'backend/private/chains.json','backend/private/legacy-question-ids.json','backend/private/build-bank.py'})
files.update('services/online-gateway/'+p for p in ['worker/index.js','scripts/build.mjs','scripts/validate-artifact.mjs','package.json','README.md','.openai/hosting.json'])
for name in files:
    path = (ROOT / name).resolve()
    if not path.is_relative_to(ROOT.resolve()):
        raise ValueError('Archive path escapes workspace')
    if any(part in {'.git','.godot','.wrangler','node_modules'} for part in path.parts) or path.name in {'.dev.vars','.env','.env.local','secrets-bank.json'}:
        raise ValueError('Private tool/runtime state selected')
OUTPUT.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(OUTPUT,'w',zipfile.ZIP_DEFLATED,compresslevel=7,strict_timestamps=False) as archive:
    for name in sorted(files):
        path=ROOT/name
        if path.is_file():
            archive.write(path,name)
with zipfile.ZipFile(OUTPUT) as archive:
    assert archive.testzip() is None
    assert 'addons/GodotGooglePlayBilling/BillingClient.gd' in archive.namelist()
    assert json.loads(archive.read('config/online.json'))['baseUrl'].startswith('https://')
    bank=json.loads(archive.read('backend/private/chains.json'))
    assert len(bank)>500
    print(f'Owner ZIP verified: {len(archive.namelist())} files, {OUTPUT.stat().st_size:,} bytes; {len(bank)} private pairs; no credentials.')
