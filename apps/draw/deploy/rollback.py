"""Undo a deployment using its backup, refusing to overwrite later Nginx edits."""
from pathlib import Path
import hashlib, json, subprocess, sys
backup = Path(sys.argv[1]).resolve()
base = Path('/var/www/image-draw')
if not backup.is_relative_to((base / 'backups').resolve()): raise RuntimeError('Unexpected backup path')
config = Path('/etc/nginx/conf.d/velunest-https.conf')
if hashlib.sha256(config.read_bytes()).hexdigest() != (backup / 'nginx.conf.after.sha256').read_text():
    raise RuntimeError('Nginx was changed after deployment; merge the rollback manually')
state = json.loads((backup / 'state.json').read_text())
config.write_bytes((backup / 'nginx.conf.before').read_bytes())
snippet = Path('/etc/nginx/snippets/image-draw.conf')
if state['had_snippet']: snippet.write_bytes((backup / 'snippet.before').read_bytes())
else: snippet.unlink(missing_ok=True)
current = base / 'current'
if not current.is_symlink(): raise RuntimeError('Current release is not a managed symlink')
current.unlink()
if state['previous']: current.symlink_to(state['previous'], target_is_directory=True)
subprocess.run(['nginx', '-t'], check=True)
subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
print('Rolled back image-draw; release files retained for recovery.')
