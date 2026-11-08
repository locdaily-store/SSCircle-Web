#!/usr/bin/env python3
"""Validate a reviewed staging-only D1 SQL migration before invoking Wrangler."""

import os
import re
import sys
from pathlib import Path

MIGRATION_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,90}\.sql\Z")
DATABASE_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,100}\Z")
MAX_BYTES = 2_000_000


def validate(database: str, migration: str, root: Path = Path(".")) -> Path:
    if not DATABASE_RE.fullmatch(database or ""):
        raise ValueError("D1_STAGING_DATABASE harus berupa nama database D1 yang valid.")
    parts = re.split(r"[-_]", database.lower())
    if "staging" not in parts or {"prod", "production", "live"} & set(parts):
        raise ValueError(
            "Workflow ini hanya boleh menggunakan database bernama staging "
            "(misalnya sscircle-staging). Jangan masukkan database production."
        )
    if not MIGRATION_RE.fullmatch(migration or ""):
        raise ValueError("Pilih nama file .sql biasa dari folder migrations, tanpa path.")
    path = root / "migrations" / migration
    if path.is_symlink() or not path.is_file():
        raise ValueError("File migrasi SQL tidak ditemukan atau berupa symlink.")
    size = path.stat().st_size
    if not 0 < size <= MAX_BYTES:
        raise ValueError("File migrasi kosong atau terlalu besar (batas 2 MB).")
    try:
        if not path.read_text(encoding="utf-8").strip():
            raise ValueError("File migrasi hanya berisi spasi.")
    except UnicodeError as error:
        raise ValueError("File migrasi wajib UTF-8.") from error
    return path


def main() -> int:
    try:
        path = validate(
            os.environ.get("D1_DATABASE_NAME", "").strip(),
            os.environ.get("MIGRATION_NAME", "").strip(),
        )
        print("Validasi staging berhasil: " + path.name)
        print("Pastikan SQL sudah direview. Validasi nama bukan audit SQL/Cloudflare.")
        return 0
    except ValueError as error:
        print("::error::" + str(error))
        return 1


if __name__ == "__main__":
    sys.exit(main())
