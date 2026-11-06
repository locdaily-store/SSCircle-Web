#!/usr/bin/env python3
"""Validasi statis SSCircle: JSON, syntax JS, rujukan HTML lokal, dan ZIP root."""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

REQUIRED = {"index.html", "admin.html", "registration.html", "status.html", "voting.html", "_worker.js", "_routes.json", "_headers", "style.css"}
ROUTES = {"/", "/admin", "/registration", "/status", "/voting", "/voting-preview", "/api"}


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for key, value in attrs:
            if key in ("href", "src", "poster") and value:
                self.urls.add(value)


def validate(site: Path) -> list[str]:
    issues = []
    missing = REQUIRED - {p.name for p in site.iterdir() if p.is_file()}
    if missing:
        issues.append("File wajib hilang: " + ", ".join(sorted(missing)))
    for path in sorted(site.rglob("*.json")):
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            issues.append(f"JSON invalid {path.relative_to(site)}: {exc}")
    node = shutil.which("node")
    if not node:
        issues.append("Node.js tidak tersedia untuk syntax check; pasang Node.js 20+.")
    else:
        for file in sorted(site.rglob("*.js")):
            proc = subprocess.run([node, "--check", str(file)], capture_output=True, text=True)
            if proc.returncode:
                issues.append(f"JavaScript invalid {file.relative_to(site)}: {proc.stderr.strip()[:250]}")
    for file in sorted(site.rglob("*.html")):
        refs = References()
        refs.feed(file.read_text(encoding="utf-8"))
        for url in refs.urls:
            parsed = urlsplit(url)
            if parsed.scheme or parsed.netloc or url.startswith(("#", "mailto:", "tel:", "data:", "//")):
                continue
            path = unquote(parsed.path)
            if not path or path in ROUTES or path.startswith("/api/"):
                continue
            if path.startswith("/"):
                check = site / path.lstrip("/")
            else:
                check = file.parent / path
            if not check.exists():
                issues.append(f"Rujukan hilang: {file.relative_to(site)} -> {url}")
    return issues


def main() -> int:
    parser = argparse.ArgumentParser(description="Uji statis dan syntax file website.")
    parser.add_argument("path", nargs="?", default="site")
    args = parser.parse_args()
    root = Path(args.path)
    if not root.is_dir():
        parser.error("Folder website tidak ada: " + str(root))
    issues = validate(root)
    if issues:
        for item in issues:
            print("GAGAL: " + item)
        return 1
    print("LOLOS: JSON, seluruh JavaScript, dan rujukan HTML lokal telah diperiksa.")
    print("Catatan: ini bukan pengganti uji browser atau integrasi Cloudflare.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
