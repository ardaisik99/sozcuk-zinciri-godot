"""Validate and split the owner bank into Cloudflare secret-size safe chunks.

The output stays in ignored backend/private; never print question contents.
"""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRIVATE = ROOT / 'backend/private'

def pack():
    source = json.loads((PRIVATE / 'chains.json').read_text(encoding='utf-8'))
    compact = json.dumps(source, ensure_ascii=False, separators=(',', ':'))
    chunks, current, size = [], [], 0
    for char in compact:
        char_size = len(char.encode('utf-8'))
        if size + char_size > 4000:
            chunks.append(''.join(current))
            current, size = [], 0
        current.append(char)
        size += char_size
    if current:
        chunks.append(''.join(current))
    if not chunks or len(chunks) > 32:
        raise ValueError('Private bank needs 1–32 secrets of at most 4000 UTF-8 bytes.')
    secrets = {f'CHAIN_BANK_{i:02d}': chunk for i, chunk in enumerate(chunks, 1)}
    # Empty trailing chunks clear stale data if the bank shrinks on a later push.
    secrets.update({f'CHAIN_BANK_{i:02d}': '' for i in range(len(chunks)+1, 33)})
    assert json.loads(''.join(secrets.values())) == source
    legacy = PRIVATE / 'legacy-question-ids.json'
    if legacy.exists():
        legacy_ids = json.loads(legacy.read_text(encoding='utf-8'))
        assert isinstance(legacy_ids,list) and all(isinstance(x,str) and '|' in x for x in legacy_ids)
        serialized = json.dumps(legacy_ids,ensure_ascii=False,separators=(',',':'))
        assert len(serialized.encode('utf-8')) <= 4000
        secrets['LEGACY_QUESTION_IDS'] = serialized
    target = PRIVATE / 'secrets-bank.json'
    target.write_text(json.dumps(secrets, ensure_ascii=False), encoding='utf-8')
    print(f'Owner bank packed: {len(source)} entries, {len(chunks)} populated secrets. Contents not logged.')
    return target

if __name__ == '__main__':
    argparse.ArgumentParser(description=__doc__).parse_args()
    pack()
