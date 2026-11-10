# SSCircle Web · Preview localhost

**Gunakan Wrangler, bukan Live Server.** Website SSCircle memakai Cloudflare Pages Functions `_worker.js` dan database D1. Preview file statis saja tidak bisa menjalankan backend.

```bash
npm install
npm run dev
```

Buka **http://localhost:8788** dan uji **http://localhost:8788/api/health**. Untuk Windows tersedia `MULAI-LOCALHOST.bat` dan task VS Code. D1 localhost memakai data fiktif dan tidak mengubah D1 Cloudflare.

Panduan lengkap: [docs/LOCALHOST-WRANGLER-D1.md](docs/LOCALHOST-WRANGLER-D1.md).

**Wrangler 4.160.0:** Jika pernah mendapat pesan `Cannot use --preview without --remote`, gunakan paket local.3 ini. Pemanggilan `d1 execute` sudah dibetulkan menjadi `--local` saja. `preview_database_id` pada file TOML tetap dipertahankan.


**Wrangler 4.160.0: perbaikan kedua (`pages dev`).** Pages tidak menerima `--config <wrangler.local.toml>`.
Skrip `local.3` sekarang menggunakan konfigurasi D1 lokal hanya untuk `d1 execute`; untuk `pages dev`,
script memakai `--d1 DB=DB --binding MEDIA_MODE=D1 --binding STORAGE_LIMIT_MB=500`
dan direktori persistence yang sama. Database tidak perlu dihapus atau diimpor ulang secara manual.


**V10.49.1.6:** Jalankan `npm.cmd run dev` di PowerShell Windows jika
`npm.ps1` diblokir. Script sudah menggunakan D1 `--local` tanpa `--preview`
dan menjalankan Pages Dev tanpa opsi `--config`. File `.dev.vars` dan
`.wrangler/state` harus tetap lokal. Jangan mengunggah ZIP source localhost
langsung ke Cloudflare; gunakan paket Cloudflare khusus.
