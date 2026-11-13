#!/usr/bin/env python3
"""Build the Cloudflare Pages Direct Upload ZIP from tracked public files only."""
import json
import os
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent
ROOT_EXT = {'.html', '.js', '.css', '.json', '.txt', '.xml', '.webmanifest',
            '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.woff',
            '.woff2', '.mp3', '.mp4', '.webm'}
ASSET_EXT = ROOT_EXT | {'.ogg', '.ttf', '.otf', '.avif', '.wasm'}
EXTRA_ROOT = {'_headers', '_redirects', '_version.txt', 'robots.txt', 'favicon.ico'}
EXCLUDED_DIRS = {'.github', 'docs', 'scripts', 'tests', 'migrations', '.vscode',
                 'minecraft-link-velocity', 'minecraft-link-paper',
                 'minecraft-skin-bridge-paper', 'dev'}
EXCLUDED_ROOT = {'.gitignore', '.gitattributes', 'README.md', 'CONTRIBUTING.md',
                 'SECURITY.md', 'PANDUAN-GITHUB.md', 'rules-defaults.json',
                 'wrangler.local.toml', '.dev.vars.example', 'MULAI-LOCALHOST.bat',
                 'package.json', 'package-lock.json'}
REQUIRED = {'index.html', 'admin.html', 'registration.html', 'status.html',
            'voting.html', '_worker.js', '_routes.json', 'member-social.js',
            'member-social.css', 'profile-workspace.js', 'profile-workspace.css',
            'announcements.html', 'announcements.js', 'announcements.css',
            'announcements-admin.js', 'announcements-admin.css',
            'overview-dashboard.js', 'overview-dashboard.css',
            'community-events-admin.js', 'community-achievements.js',
            'ssc-dialog.js', 'ssc-dialog.css'}

def build(output_dir=None):
    pkg = json.loads((ROOT / 'package.json').read_text('utf-8'))
    version = pkg.get('version', '')
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:\.\d+)?', version):
        raise ValueError('Invalid package version for artifact name')
    worker = (ROOT / '_worker.js').read_text('utf-8')
    marker = re.search(r"const SSC_RUNTIME_RELEASE=['\"]([^'\"]+)['\"]", worker)
    if marker is None or marker.group(1) != version:
        raise ValueError('Runtime Worker and package.json release do not match')

    tracked = subprocess.check_output(['git', '-C', str(ROOT), 'ls-files', '-z'])
    site = []
    for raw in sorted(part for part in tracked.split(b'\0') if part):
        rel = PurePosixPath(raw.decode('utf-8'))
        if rel.is_absolute() or '..' in rel.parts:
            raise ValueError('Unsafe tracked path: ' + str(rel))
        path = ROOT.joinpath(*rel.parts)
        if not path.is_file() or path.is_symlink() or any(
            ancestor.is_symlink() for ancestor in path.parents if ancestor != ROOT
        ):
            raise ValueError('Missing or symbolic-link tracked file: ' + str(rel))
        parts = rel.parts
        if parts[0] in EXCLUDED_DIRS or (
            len(parts) == 1 and (rel.name in EXCLUDED_ROOT or rel.suffix.lower() == '.md')
        ):
            continue
        if len(parts) == 1 and (rel.name in EXTRA_ROOT or rel.suffix.lower() in ROOT_EXT):
            site.append((path, str(rel)))
        elif parts[0] == 'assets' and len(parts) > 1 and rel.suffix.lower() in ASSET_EXT:
            site.append((path, str(rel)))
        else:
            raise ValueError('Unknown file outside Cloudflare allowlist: ' + str(rel))
    names = {name for _, name in site}
    missing = sorted(REQUIRED - names)
    if missing:
        raise ValueError('Missing Cloudflare files: ' + ', '.join(missing))

    destination = Path(output_dir).resolve() if output_dir else ROOT
    destination.mkdir(parents=True, exist_ok=True)
    artifact_name = 'SSCircle-Cloudflare-Upload-V' + version
    zip_path = destination / (artifact_name + '.zip')
    with ZipFile(zip_path, 'w', ZIP_DEFLATED, compresslevel=6) as archive:
        for path, name in site:
            archive.write(path, arcname=name)
    with ZipFile(zip_path) as verify:
        if verify.testzip() is not None or set(verify.namelist()) != names:
            raise ValueError('ZIP integrity verification failed')

    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as result:
            result.write('zip_path=' + str(zip_path) + '\n')
            result.write('artifact_name=' + artifact_name + '\n')
    print(f'Created {zip_path.name} with {len(site)} public files ({zip_path.stat().st_size} bytes)')
    return zip_path

if __name__ == '__main__':
    try:
        build(sys.argv[1] if len(sys.argv) > 1 else None)
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        sys.exit('Cloudflare package failed: ' + str(exc))
