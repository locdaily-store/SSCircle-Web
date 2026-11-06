#!/usr/bin/env python3
"""Pemeriksaan pola secret pada kode SSCircle. Bukan pengganti audit keamanan penuh."""
from __future__ import annotations

import argparse
import re
from pathlib import Path

BAD_NAMES = [
    re.compile(r"^\.env(?:\..+)?$", re.I),
    re.compile(r"^\.dev\.vars(?:\..+)?$", re.I),
    re.compile(r"(?:^|[._-])(?:credentials?|service[-_]account|secrets?|database[-_]backup)(?:[._-]|$)", re.I),
    re.compile(r"\.(?:sqlite3?|db|dump|bak|pem|p12|pfx|key|log)$", re.I),
    re.compile(r"\.sql(?:\.gz|\.zip)?$", re.I),
]

SECRET_PATTERNS = {
    "PEM private key": re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----"),
    "AWS access key": re.compile(rb"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    "GitHub credential": re.compile(rb"\b(?:ghp_|gho_|ghu_|ghs_|ghr_|github_pat_)[A-Za-z0-9_]{20,}\b"),
    "Google API key": re.compile(rb"\bAIza[0-9A-Za-z_-]{35}\b"),
    "Stripe secret key": re.compile(rb"\bsk_(?:live|test)_[A-Za-z0-9]{12,}\b"),
    "JWT-like token": re.compile(rb"\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
    "Hardcoded named secret": re.compile(
        rb"\b(?:ADMIN_PASSWORD|SESSION_SECRET|CF_API_TOKEN|CLOUDFLARE_API_TOKEN|"
        rb"CLOUDFLARE_API_KEY|GITHUB_TOKEN|CLIENT_SECRET|PRIVATE_KEY)\s*[=:]\s*"
        rb"(?:['\"][^'\"\r\n]{6,}['\"]|[A-Za-z0-9_\-]{24,})(?![A-Za-z0-9])",
        re.I,
    ),
    "Bearer credential": re.compile(rb"\bBearer\s+[A-Za-z0-9_\-\.]{24,}", re.I),
    "URL with embedded password": re.compile(rb"https?://[^/@\s:]+:[^/@\s]+@", re.I),
}

TEXT_SUFFIXES = {".html", ".js", ".css", ".json", ".txt", ".md", ".yml", ".yaml", ".toml", ".xml", ".svg", ".csv"}
TEXT_SPECIAL = {"_headers", "_routes.json", "_version.txt", "_redirects"}
EXCLUDED_DIRS = {".git", "dist", "node_modules", "__pycache__", ".venv", ".wrangler"}


def scan(root: Path) -> list[str]:
    issues: list[str] = []
    for f in sorted(root.rglob("*")):
        if f.is_dir() or any(part in EXCLUDED_DIRS for part in f.relative_to(root).parts[:-1]):
            continue
        rel = f.relative_to(root).as_posix()
        if f.is_symlink():
            issues.append(f"{rel}: simbolik link tidak diperbolehkan untuk paket deploy")
            continue
        if f.name != "scan_secrets.py" and any(p.search(f.name) for p in BAD_NAMES):
            issues.append(f"{rel}: nama file kemungkinan berisi data sensitif")
        if f.suffix.lower() not in TEXT_SUFFIXES and f.name not in TEXT_SPECIAL:
            continue
        if f.stat().st_size > 5_000_000:
            issues.append(f"{rel}: file teks terlalu besar untuk dipindai otomatis")
            continue
        content = f.read_bytes()
        for desc, pattern in SECRET_PATTERNS.items():
            for match in pattern.finditer(content):
                line = content.count(b"\n", 0, match.start()) + 1
                issues.append(f"{rel}:{line}: dugaan {desc} (nilai tidak ditampilkan)")
    return issues


def main() -> int:
    parser = argparse.ArgumentParser(description="Periksa dugaan secret sebelum commit/deploy.")
    parser.add_argument("path", nargs="?", default="site", help="Folder yang dipindai (default: site)")
    args = parser.parse_args()
    root = Path(args.path)
    if not root.is_dir():
        parser.error(f"Folder tidak ditemukan: {root}")
    issues = scan(root)
    if issues:
        print(f"GAGAL: ditemukan {len(issues)} indikasi sensitif:")
        for item in issues:
            print(" - " + item)
        print("Periksa dan pindahkan secret ke dashboard Cloudflare sebelum commit.")
        return 1
    print(f"LOLOS: tidak ditemukan pola secret yang dikenali di {root}.")
    print("Catatan: pemindaian pola tidak menjamin tidak ada data sensitif tersembunyi.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
