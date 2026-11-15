# SSCircleSkinBridge V10.49.1.4

Addon untuk SSCirclePlayerSync 10.49.1. Perbaikan penting: mengirim file PNG skin dari server ke Cloudflare D1, bukan hanya hash. User web otomatis melihat skin ketika berhasil ditautkan dan login. Baca `docs/V10.49.1.3-SKIN-IMAGE-D1-AUTO.md` untuk pemasangan dan diagnosis.

- Pertahankan plugin utama dan `server-secret.txt`; jangan salin secret ke addon.
- Build resmi: Java 25, Paper API 26.3, Gradle (tersedia pada `build.gradle.kts`).
- Plugin ini hanya baca skin dan mengirim metadata, tidak menyentuh playerdata/inventory/statistik.
- Hanya pasang satu versi `SSCircleSkinBridge` dalam folder plugins.

## Perintah cepat dan diagnosis

- `/ssb me`: semua pemain dapat melihat status skin sendiri (tanpa akses OP).
- `/ssb help`: panduan singkat.
- `/ssb status`: OP memeriksa HTTPS, otorisasi server, SkinsRestorer, status kirim terakhir, antrean, dan penundaan karena TPS.
- `/ssb sync [nama]`: OP menjadwalkan sinkronisasi ulang untuk satu pemain atau semua pemain online, tanpa membebani main thread.
- `/ssb check <nama>`: OP membaca status dan penjelasan yang mudah dipahami.
- `/ssb reload`: OP memuat kembali konfigurasi Core dan Skin Bridge, termasuk jadwal pemeriksaan.

Alias `/ssskin` dan `/skinbridge` tetap tersedia. Jangan pakai `/skin` karena umumnya dipakai SkinsRestorer. Skin Bridge mengikuti secret/pairing SSCirclePlayerSync; tidak membutuhkan secret tersendiri.
