#!/usr/bin/env python3
"""Buat ZIP Direct Upload Cloudflare Pages dari folder site/, tanpa dokumen internal."""
from __future__ import annotations

import argparse
import sys
import zipfile
from pathlib import Path

from scan_secrets import scan

REQUIRED = {"index.html", "admin.html", "registration.html", "status.html", "voting.html", "style.css", "_worker.js", "_routes.json", "_headers"}


def main() -> int:
    parser = argparse.ArgumentParser(description="Buat paket ZIP Cloudflare dari SSCircle/site")
    parser.add_argument("--source", type=Path, default=Path("site"))
    parser.add_argument("--output", type=Path, default=Path("dist/SSCircle-Cloudflare-Upload.zip"))
    args = parser.parse_args()
    site = args.source.resolve()
    missing = sorted(REQUIRED - {p.name for p in site.iterdir() if p.is_file()}) if site.is_dir() else sorted(REQUIRED)
    if missing:
        print("GAGAL: File wajib tidak ditemukan di root site/: " + ", ".join(missing), file=sys.stderr)
        return 1
    issues = scan(site)
    if issues:
        print("GAGAL: Ada indikasi secret. Jalankan python scripts/scan_secrets.py site", file=sys.stderr)
        for issue in issues:
            print(" - " + issue, file=sys.stderr)
        return 1
    files = sorted((p for p in site.rglob("*") if p.is_file()), key=lambda p: p.relative_to(site).as_posix())
    for f in files:
        if f.is_symlink():
            print("GAGAL: Simbolik link tidak diperbolehkan: " + str(f), file=sys.stderr)
            return 1
    out = args.output.resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for file in files:
            # Tanpa folder site/ di root ZIP. Cloudflare harus menemukan _worker.js langsung di root.
            zf.write(file, file.relative_to(site).as_posix())
    with zipfile.ZipFile(out) as zf:
        if zf.testzip():
            print("GAGAL: ZIP tidak valid", file=sys.stderr)
            return 1
    print(f"Berhasil: {out} | {len(files)} file | {out.stat().st_size / (1024*1024):.2f} MiB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
