#!/usr/bin/env python3
"""Write a static source receipt after committing the implementation (no build)."""
import hashlib
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
lab = root / 'web' / 'geometry-lab'
files = sorted(p for p in lab.iterdir() if p.suffix in {'.mjs', '.html', '.css'})
relative = [str(p.relative_to(root)) for p in files]
status = subprocess.check_output(['git', 'status', '--porcelain', '--', *relative], cwd=root, text=True)
if status.strip():
    raise SystemExit('Commit the runtime sources before sealing; refusing to label uncommitted source.')
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
hashes = ''.join(f'{p.name}\0{hashlib.sha256(p.read_bytes()).hexdigest()}\n' for p in files)
receipt = {'buildCommit': commit, 'sourceDigest': hashlib.sha256(hashes.encode()).hexdigest(), 'files': [p.name for p in files]}
(lab / 'study-build.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'buildCommit': commit, 'sourceDigest': receipt['sourceDigest']}))
