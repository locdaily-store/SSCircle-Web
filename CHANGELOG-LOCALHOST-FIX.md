# SSCircle Localhost Fix V10.49.1.5-local.3

Memperbaiki `wrangler 4.160.0: Cannot use --preview without --remote`.

- `scripts/local-dev.mjs`: hilangkan flag CLI `--preview` pada `d1 execute`; pertahankan `--local`; tambahkan `--yes` saat impor SQL.
- `wrangler.local.toml` **tidak diubah**: `preview_database_id = "DB"` merupakan konfigurasi binding Pages lokal, bukan flag CLI.
- `docs/LOCALHOST-WRANGLER-D1.md`: ganti panduan SQL local agar tidak lagi mencampur `--local --preview`.
- `tests/local-wrangler-cli.test.mjs`: uji regresi pemanggilan CLI terisolasi.
- Source dan data development tetap terisolasi dari Cloudflare production. Tidak perlu migrasi D1, reset `.wrangler/state`, atau menyentuh data akun Minecraft.

## Cara paling cepat di VS Code Windows

1. Ekstrak ZIP Only Changes **ke root folder SSCircle**, pilih Replace files if prompted. Alternatif: salin `scripts/local-dev.mjs` saja.
2. Tidak perlu install ulang dependency. Jalankan:

   ```powershell
   npm.cmd run dev
   ```

3. Bila berhasil, browser buka http://localhost:8788 dan http://localhost:8788/api/health
4. Untuk cek D1 lokal: `npm.cmd run local:check`

Tidak perlu upload ke Cloudflare atau mengganti plugin Paper. Jika kamu perlu membagikan perbaikannya ke collaborator, commit perubahan script + dokumentasi ke branch GitHub.

## Tambahan local.3
- Perbaiki error `Pages does not support custom paths for the Wrangler configuration file` pada Wrangler 4.160.0.
- Pisahkan argumen Wrangler: `d1 execute` tetap `--config wrangler.local.toml --local`, sedangkan `pages dev` memakai `--d1 DB=DB` dan binding environment via CLI **tanpa** `--config`.
- Gunakan folder `.wrangler/state` yang sama sehingga DB hasil bootstrap sebelumnya tetap dapat dipakai.
- Tolak standard config root yang tak disengaja untuk mencegah tertukarnya konfigurasi production.
- Perluas tes CLI untuk memastikan semua argumen di jalur `pages dev` aman dan valid.
