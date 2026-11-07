"""Install a prebuilt static release. Run on Zgo; never recreates sub2api."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tarfile

BASE = Path('/var/www/image-draw')
CONFIG = Path('/etc/nginx/conf.d/velunest-https.conf')
SNIPPET = Path('/etc/nginx/snippets/image-draw.conf')
INCLUDE = ' include /etc/nginx/snippets/image-draw.conf;'
MARKER = ' server_name sub.velunest.top;'

def install(archive, snippet):
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    release = BASE / 'releases' / stamp
    backup = BASE / 'backups' / stamp
    release.mkdir(parents=True, exist_ok=False)
    backup.mkdir(parents=True, exist_ok=False)
    current = BASE / 'current'
    if current.exists() and not current.is_symlink():
        raise RuntimeError('Refusing to replace an unmanaged current directory')
    previous = os.readlink(current) if current.is_symlink() else None
    old_config = CONFIG.read_bytes()
    old_snippet = SNIPPET.read_bytes() if SNIPPET.exists() else None
    (backup / 'nginx.conf.before').write_bytes(old_config)
    if old_snippet is not None: (backup / 'snippet.before').write_bytes(old_snippet)
    state = {'previous': previous, 'had_snippet': old_snippet is not None, 'release': str(release)}
    (backup / 'state.json').write_text(json.dumps(state), encoding='utf-8')
    with tarfile.open(archive) as bundle:
        for member in bundle.getmembers():
            target = (release / member.name).resolve()
            if not target.is_relative_to(release.resolve()) or member.issym() or member.islnk() or member.isdev():
                raise RuntimeError('Unsafe archive member')
        bundle.extractall(release, filter='data')
    if not (release / 'index.html').exists(): raise RuntimeError('Missing index.html')
    for path in release.rglob('*'):
        path.chmod(0o755 if path.is_dir() else 0o644)
    release.chmod(0o755)
    text = old_config.decode()
    if INCLUDE not in text:
        if text.count(MARKER) != 1: raise RuntimeError('HTTPS server block is ambiguous')
        text = text.replace(MARKER, MARKER + '\n' + INCLUDE, 1)
    try:
        SNIPPET.write_bytes(Path(snippet).read_bytes())
        CONFIG.write_text(text, encoding='utf-8')
        temp = BASE / 'next'
        if temp.is_symlink(): temp.unlink()
        temp.symlink_to(release, target_is_directory=True)
        os.replace(temp, current)
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    except BaseException:
        CONFIG.write_bytes(old_config)
        if old_snippet is None: SNIPPET.unlink(missing_ok=True)
        else: SNIPPET.write_bytes(old_snippet)
        if current.is_symlink(): current.unlink()
        if previous: current.symlink_to(previous, target_is_directory=True)
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        raise
    (backup / 'nginx.conf.after.sha256').write_text(hashlib.sha256(CONFIG.read_bytes()).hexdigest())
    print(json.dumps({'release': str(release), 'backup': str(backup), 'url': 'https://sub.velunest.top/draw/'}))

if __name__ == '__main__': install(sys.argv[1], sys.argv[2])
