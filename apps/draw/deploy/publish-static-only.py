"""Publish an existing draw ZIP via an atomic symlink; never modify services/config."""
from pathlib import Path, PurePosixPath
import datetime
import hashlib
import json
import os
import shutil
import stat
import sys
import zipfile

BASE = Path('/var/www/image-draw')
CURRENT = BASE / 'current'
CONFIGS = [Path('/etc/nginx/conf.d/velunest-https.conf'), Path('/etc/nginx/snippets/image-draw.conf')]

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def config_hashes():
    return {str(path): digest(path) for path in CONFIGS}

def managed_release(path):
    resolved = path.resolve(strict=True)
    if not resolved.is_relative_to(BASE / 'releases') or resolved == BASE / 'releases':
        raise RuntimeError('Release outside managed directory')
    if not resolved.is_dir():
        raise RuntimeError('Release is not a directory')
    return resolved

def switch(expected, target, stamp):
    if not CURRENT.is_symlink() or CURRENT.resolve() != expected:
        raise RuntimeError('Current release changed concurrently; no switch performed')
    temp = BASE / ('.current-' + stamp)
    temp.symlink_to(target, target_is_directory=True)
    try:
        if CURRENT.resolve() != expected:
            raise RuntimeError('Current release changed concurrently')
        os.replace(temp, CURRENT)
    finally:
        if temp.is_symlink():
            temp.unlink()

def rollback(state_file):
    path = Path(state_file).resolve(strict=True)
    if not path.is_relative_to(BASE / 'backups') or path.name != 'state.json':
        raise RuntimeError('Invalid rollback state path')
    state = json.loads(path.read_text())
    previous = managed_release(Path(state['previous']))
    release = managed_release(Path(state['release']))
    before = config_hashes()
    switch(release, previous, 'rollback-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    if config_hashes() != before:
        raise RuntimeError('Configuration changed outside this deployment')
    print(json.dumps({'rolled_back_to': str(previous), 'config_unchanged': True}))

def publish(archive_path, expected_sha, expected_previous):
    archive_path = Path(archive_path)
    if digest(archive_path) != expected_sha:
        raise RuntimeError('ZIP checksum mismatch')
    if not CURRENT.is_symlink():
        raise RuntimeError('Refusing to replace an unmanaged current directory')
    previous = managed_release(CURRENT)
    if str(previous) != expected_previous:
        raise RuntimeError('Previous release differs from inspected version')
    if any(path.is_symlink() for path in previous.rglob('*')):
        raise RuntimeError('Unexpected links inside previous static release')
    before = config_hashes()
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-quality'
    release = BASE / 'releases' / stamp
    backup = BASE / 'backups' / stamp
    manifest = {}
    with zipfile.ZipFile(archive_path) as archive:
        entries = archive.infolist()
        if len(entries) > 100 or sum(entry.file_size for entry in entries) > 16 * 1024 * 1024:
            raise RuntimeError('Unexpected archive size')
        names = set()
        for entry in entries:
            name = PurePosixPath(entry.filename)
            mode = entry.external_attr >> 16
            if name.is_absolute() or '..' in name.parts or '\\' in entry.filename or stat.S_ISLNK(mode):
                raise RuntimeError('Unsafe ZIP member')
            if entry.filename in names:
                raise RuntimeError('Duplicate ZIP member')
            names.add(entry.filename)
            if not entry.is_dir() and name.suffix not in {'.html', '.js', '.css', '.svg', '.webp', '.md'}:
                raise RuntimeError('Unexpected file type')
        if 'index.html' not in names:
            raise RuntimeError('Missing index.html')
        release.mkdir(mode=0o755, exist_ok=False)
        for entry in entries:
            target = release / entry.filename
            if entry.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                data = archive.read(entry)
                target.write_bytes(data)
                manifest[entry.filename] = hashlib.sha256(data).hexdigest()
    backup.mkdir(mode=0o700, exist_ok=False)
    shutil.copytree(previous, backup / 'site')
    # Keep fingerprinted assets for tabs that still hold the old HTML.
    old_assets = previous / 'assets'
    retained = []
    if old_assets.exists():
        for source in old_assets.rglob('*'):
            if not source.is_file():
                continue
            relative = source.relative_to(previous)
            destination = release / relative
            if destination.exists():
                if digest(source) != digest(destination):
                    raise RuntimeError('Fingerprint collision')
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, destination)
                retained.append(str(relative))
    for path in release.rglob('*'):
        path.chmod(0o755 if path.is_dir() else 0o644)
    release.chmod(0o755)
    state = {'previous': str(previous), 'release': str(release), 'backup': str(backup),
             'bundle_sha256': expected_sha, 'configs_before': before, 'manifest': manifest,
             'retained_assets': retained, 'published_at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    (backup / 'state.json').write_text(json.dumps(state, indent=2))
    for name, sha in manifest.items():
        if digest(release / name) != sha:
            raise RuntimeError('Extracted file checksum mismatch')
    for source in previous.rglob('*'):
        if source.is_file() and digest(source) != digest(backup / 'site' / source.relative_to(previous)):
            raise RuntimeError('Backup verification failed')
    if config_hashes() != before:
        raise RuntimeError('Configuration changed before publish')
    switch(previous, release, stamp)
    try:
        if config_hashes() != before:
            raise RuntimeError('Configuration changed outside this deployment')
    except BaseException:
        switch(release, previous, stamp + '-restore')
        raise
    state['config_unchanged'] = True
    (backup / 'state.json').write_text(json.dumps(state, indent=2))
    print(json.dumps(state))

if __name__ == '__main__':
    if sys.argv[1] == '--rollback':
        rollback(sys.argv[2])
    else:
        publish(*sys.argv[1:4])
