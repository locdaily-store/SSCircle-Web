#!/usr/bin/env python3
"""Validate a reviewed staging-only D1 SQL migration before invoking Wrangler."""

import os
import re
import sys
from pathlib import Path

MIGRATION_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,90}\.sql\Z")
DATABASE_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,100}\Z")
MAX_BYTES = 2_000_000

# Automatic staging deploys accept additive migrations only. Any destructive
# operation needs an explicit, separately reviewed backup/restore procedure.
DANGEROUS_SQL = re.compile(
    r"\b(?:DROP\s+(?:TABLE|INDEX|VIEW|TRIGGER|COLUMN)|"
    r"DELETE\s+FROM|TRUNCATE\s+TABLE|"
    r"ATTACH\s+(?:DATABASE\s+)?|DETACH\s+(?:DATABASE\s+)?|"
    r"PRAGMA\s+(?:writable_schema|foreign_keys\s*=\s*(?:OFF|0)))\b",
    re.IGNORECASE,
)


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
        sql = path.read_text(encoding="utf-8")
    except UnicodeError as error:
        raise ValueError("File migrasi wajib UTF-8.") from error
    if not sql.strip():
        raise ValueError("File migrasi hanya berisi spasi.")
    if DANGEROUS_SQL.search(sql):
        raise ValueError(
            "Migrasi mengandung operasi destruktif. Gunakan jalur review manual "
            "dengan backup dan uji pemulihan, bukan workflow staging otomatis."
        )
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
