#!/usr/bin/env python3
"""Read-only, redacted Cloudflare D1 metadata report in GitHub Actions."""

import html
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

DATABASE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$")
TABLE_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,63}$")
TABLES_SQL = (
    "SELECT name FROM sqlite_master WHERE type='table' "
    "AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' "
    "ORDER BY name LIMIT 201"
)
SAFE_AGGREGATES = {
    "submissions": "SELECT status AS kategori, COUNT(*) AS jumlah FROM submissions GROUP BY status ORDER BY jumlah DESC LIMIT 15",
    "minecraft_accounts": "SELECT provider AS kategori, COUNT(*) AS jumlah FROM minecraft_accounts GROUP BY provider ORDER BY jumlah DESC LIMIT 15",
}


def clean(value):
    return html.escape(str(value), quote=True).replace("|", r"\|").replace("\r", " ").replace("\n", " ")


def code_text(value):
    return chr(96) + clean(value) + chr(96)


def validate_database(value):
    if not DATABASE_RE.fullmatch(value):
        raise ValueError("Nama database staging tidak valid. Periksa variable SSCIRCLE_D1_STAGING_NAME.")


def validate_table(value):
    if not TABLE_RE.fullmatch(value) or value.lower().startswith("sqlite_"):
        raise ValueError("Nama tabel tidak valid. Ambil nama dari laporan overview.")


def unpack_json(raw):
    try:
        value = json.loads(raw)
    except (TypeError, json.JSONDecodeError) as error:
        raise RuntimeError("Respons Wrangler bukan JSON valid.") from error
    if not isinstance(value, list) or len(value) != 1:
        raise RuntimeError("Jumlah respons kueri tidak sesuai.")
    item = value[0]
    if not isinstance(item, dict) or item.get("success") is not True:
        raise RuntimeError("D1 tidak berhasil membaca metadata.")
    rows = item.get("results")
    if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
        raise RuntimeError("Format respons D1 tidak sesuai.")
    return rows


def execute_read_only(database, statement):
    # No arbitrary SQL from workflow inputs, no shell and no raw query output.
    proc = subprocess.run(
        ["npx", "--yes", "wrangler@4", "d1", "execute", database,
         "--remote", "--json", "--command", statement],
        text=True, capture_output=True, timeout=120, check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            "Koneksi D1 gagal. Periksa Account ID, API Token, nama database "
            "dan izin D1 Read; detail mentah tidak ditampilkan demi keamanan."
        )
    return unpack_json(proc.stdout)


def report(database, mode, table, read=execute_read_only):
    validate_database(database)
    if mode not in ("overview", "table"):
        raise ValueError("Mode hanya boleh overview atau table.")
    rows = read(database, TABLES_SQL)
    names = [row["name"] for row in rows if isinstance(row.get("name"), str)]
    if len(names) > 200:
        raise ValueError("Lebih dari 200 tabel, laporan dibatalkan agar tetap ringan.")
    out = [
        "# SSCircle Database Inspector",
        "",
        "**Staging saja**. Tidak membaca isi akun atau data pribadi.",
        "",
        "- Lingkungan: " + code_text("database-staging"),
        "- Database: " + code_text(database),
        "- Waktu UTC: " + datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"),
        "- Jumlah tabel: **" + str(len(names)) + "**",
        "",
        "## Daftar tabel", "", "| No. | Tabel |", "| ---: | --- |"
    ]
    for number, name in enumerate(names, 1):
        out.append("| " + str(number) + " | " + code_text(name) + " |")
    if not names:
        out.append("_Belum ada tabel. Periksa migrasi staging._")
    if mode == "overview":
        out.extend(["", "Gunakan Actions > SSCircle Database Inspector > Run workflow, "
                    "pilih mode table, lalu ketik nama tabel dari daftar di atas."])
    else:
        validate_table(table)
        if table not in names:
            raise ValueError("Tabel tidak ada pada D1 Staging.")
        identifier = '"' + table + '"'
        cols = read(database, "PRAGMA table_info(" + identifier + ")")
        counts = read(database, "SELECT COUNT(*) AS total FROM " + identifier)
        if len(counts) != 1 or not isinstance(counts[0].get("total"), int):
            raise RuntimeError("Jumlah baris tidak dapat dibaca.")
        out.extend([
            "", "## Struktur " + code_text(table),
            "", "Jumlah baris: **" + str(counts[0]["total"]) + "**", "",
            "| Kolom | Jenis | Wajib | Primary Key |",
            "| --- | --- | :---: | :---: |",
        ])
        for col in cols[:150]:
            out.append("| " + code_text(col.get("name", "")) + " | "
                       + clean(col.get("type", "")) + " | "
                       + ("Ya" if col.get("notnull") else "Tidak") + " | "
                       + ("Ya" if col.get("pk") else "Tidak") + " |")
        if table in SAFE_AGGREGATES:
            groups = read(database, SAFE_AGGREGATES[table])
            out.extend(["", "### Ringkasan agregat aman", "",
                        "| Kategori | Jumlah |", "| --- | ---: |"])
            for item in groups[:15]:
                out.append("| " + clean(item.get("kategori", "")) + " | "
                           + clean(item.get("jumlah", 0)) + " |")
        out.extend([
            "", "**Isi record, nama pemain, email, password, sesi, dan Mail Box "
            "tidak ditampilkan pada GitHub.**"
        ])
    out.extend(["", "---", "Inspector bersifat read-only dan tidak mengubah D1."])
    return "\n".join(out) + "\n"


def main():
    if not os.environ.get("CLOUDFLARE_API_TOKEN") or not os.environ.get("CLOUDFLARE_ACCOUNT_ID"):
        print("::error::Secret CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID belum tersedia pada database-staging.")
        return 1
    try:
        summary = os.environ.get("GITHUB_STEP_SUMMARY")
        if not summary:
            raise ValueError("Program ini hanya untuk GitHub Actions.")
        text = report(
            os.environ.get("SSCIRCLE_D1_STAGING_NAME", "sscircle-staging").strip(),
            os.environ.get("INSPECT_MODE", "overview").strip(),
            os.environ.get("INSPECT_TABLE", "").strip()
        )
        with open(summary, "a", encoding="utf-8") as output:
            output.write(text)
        print("Laporan berhasil dibuat. Buka tab Summary pada GitHub Actions.")
        return 0
    except (ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
        print("::error::" + str(error).replace("\n", " ")[:280])
        return 1


if __name__ == "__main__":
    sys.exit(main())
