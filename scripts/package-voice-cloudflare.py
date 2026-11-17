#!/usr/bin/env python3
"""Offline packaging for Cloudflare Pages (direct upload) and Voice Worker (Wrangler).

No credentials, npm dependencies, Minecraft JARs or mobile build needed.
Built from the current checked-out Git revision; refuses missing/empty files.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent.parent
VERSION_FILE = ROOT / "package.json"
WORKER_FILES = {
    "wrangler.toml": "cross-voice/cloudflare/wrangler.toml",
    "package.json": "cross-voice/cloudflare/package.json",
    "src/index.mjs": "cross-voice/cloudflare/src/index.mjs",
    "README-ID.md": "cross-voice/INSTALL-ID.md",
    "README-WORKER.md": "cross-voice/cloudflare/README.md",
}
VOICE_WEB_FILES = (
    "_worker.js", "_routes.json", "voice.html", "voice.css", "voice.js",
    "voice-config.js", "voice-worklet.js", "index.html", "public-unified.js",
    "assets/sscircle-logo.png",
)


def verify(path: Path, expected: set[str]) -> None:
    with ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or archive.testzip() is not None:
            raise ValueError(f"Corrupted or duplicate ZIP entry: {path}")
        if not expected.issubset(names):
            raise ValueError(f"Missing required archive entry: {expected - set(names)}")
        if any(n.startswith("/") or ".." in Path(n).parts or "\\" in n for n in names):
            raise ValueError(f"Unsafe archive path: {path}")


def build(output_dir: str | Path = None) -> dict[str, Path]:
    destination = Path(output_dir or ROOT / "dist").resolve()
    destination.mkdir(parents=True, exist_ok=True)

    spec = importlib.util.spec_from_file_location(
        "ssc_cloudflare_package", ROOT / "scripts/package-cloudflare.py"
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to import Pages packaging script")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    # Uses existing validated public-file allowlist and Worker release marker.
    pages = module.build(destination)
    verify(pages, module.REQUIRED | set(VOICE_WEB_FILES))

    version = json.loads(VERSION_FILE.read_text("utf-8"))["version"]
    worker = destination / f"SSCircle-Voice-Worker-Cloudflare-V{version}.zip"
    with ZipFile(worker, "w", ZIP_DEFLATED, compresslevel=8) as archive:
        for dest, source in WORKER_FILES.items():
            file = ROOT / source
            if not file.is_file() or file.stat().st_size < 10:
                raise ValueError(f"Missing Cloudflare Worker source: {source}")
            archive.write(file, dest)
    verify(worker, set(WORKER_FILES))
    with ZipFile(worker) as bundle:
        assert b"DurableObject" in bundle.read("src/index.mjs")
        assert b"VOICE_BRIDGE_SECRET" in bundle.read("src/index.mjs")

    changes = destination / f"SSCircle-Voice-Web-ONLY-CHANGES-V{version}.zip"
    with ZipFile(pages) as source, ZipFile(changes, "w", ZIP_DEFLATED, compresslevel=8) as out:
        for member in VOICE_WEB_FILES:
            out.writestr(member, source.read(member))
    verify(changes, set(VOICE_WEB_FILES))

    readme = f"""SSCircle Cloudflare Deployment Kit (website version {version})
=====================================================================
1. SSCircle-Cloudflare-Upload-V{version}.zip:
   Upload DIRECTLY to Cloudflare Pages via Direct Upload (contains whole website).
2. SSCircle-Voice-Worker-Cloudflare-V{version}.zip:
   EXTRACT FIRST; configure VOICE_ORIGIN in wrangler.toml and run:
     npm install --no-audit --no-fund
     npx wrangler login
     npx wrangler secret put VOICE_BRIDGE_SECRET
     npx wrangler deploy
   The VOICE_BRIDGE_SECRET must equal Paper plugin config secret, >=32 chars.
   This archive is NOT a Cloudflare Pages Direct Upload ZIP.
3. SSCircle-Voice-Web-ONLY-CHANGES-V{version}.zip:
   Partial Voice web assets for overlaying an existing build, NOT a standalone
   complete Cloudflare Pages upload.

After deploying the Worker, set Cloudflare Pages environment variable:
  VOICE_PUBLIC_URL=https://YOUR-WORKER.workers.dev
Then redeploy Pages. Native Android app requires gateway /api/renew.
No server secrets, API tokens, or .dev.vars are included in any archive.
Do not merge PR #74 to production until actual Minecraft + HP tests pass.
"""
    kit = destination / f"SSCircle-Cloudflare-DEPLOYMENT-KIT-V{version}.zip"
    with ZipFile(kit, "w", ZIP_DEFLATED, compresslevel=6) as archive:
        archive.write(pages, pages.name)
        archive.write(worker, worker.name)
        archive.write(changes, changes.name)
        archive.writestr("BACA-DULU-ID.txt", readme)
    verify(kit, {pages.name, worker.name, changes.name, "BACA-DULU-ID.txt"})

    result = {"pages": pages, "worker": worker, "only_changes": changes, "kit": kit}
    for name, path in result.items():
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        print(f"{name}: {path.name} ({path.stat().st_size} bytes) SHA256={digest}")
    return result


if __name__ == "__main__":
    try:
        build(sys.argv[1] if len(sys.argv) > 1 else None)
    except Exception as exc:
        sys.exit(f"Cloudflare bundle FAILED: {exc}")
