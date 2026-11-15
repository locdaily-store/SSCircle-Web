# Troubleshooting SSCircle Cross Voice

| Gejala | Kemungkinan penyebab | Pemeriksaan |
|---|---|---|
| /scvoice status OFFLINE | WSS Cloudflare Worker, secret atau firewall keluar TCP 443 salah | Uji /api/health, Worker observability, DNS dan domain WSS |
| /voice link gagal | Bukan Bedrock/Floodgate atau gateway offline | Cek /voice status dan plugin floodgate |
| Kode pairing invalid | Sudah digunakan, kedaluwarsa 2 menit, atau server restart | Ketik /voice link untuk kode baru |
| Mikrofon ditolak | Browser tidak mendapat izin | Pastikan HTTPS, izin mikrofon diberikan |
| Java tidak dengar Bedrock | API AudioSender tidak tersedia, UDP SVC tertutup, atau JAR SVC tidak kompatibel | Periksa SVC, plugin version, /scvoice status |
| Bedrock tidak dengar Java | Opus decoder belum tersedia, suara tidak masuk event, atau browser tertutup | Periksa console Paper, gateway, /api/health |
| Pemain world lain terdengar | Bug isolasi | Matikan modul dan kirim laporan dengan UUID world, tanpa merekam suara |
| Suara mengganda | Browser aktif pada beberapa perangkat, SVC addon lain, atau pengiriman loop | Putuskan sesi lain dan periksa addon suara |
| iOS/Android berhenti mendengar | Browser ditangguhkan sistem operasi | Gunakan perangkat kedua atau desktop |
| Gateway 503 | Paper belum terhubung, secret atau origin Cloudflare tidak lengkap | Periksa Wrangler secret, /api/health dan restart Paper; Worker tidak perlu direstart |
| HTTP 429 | Terlalu banyak pairing gagal | Tunggu setidaknya 60 detik |

### Pengumpulan log
Kumpulkan status plugin, versi Paper, versi Simple Voice Chat, floodgate, platform browser, dan pesan error. Jangan mengunggah secret, kode pairing, token, atau audio pribadi.

### Batas pengujian
Tes Node berhasil membuktikan frame PCM mengalir antar-WebSocket, **bukan** bahwa semua klien manusia sudah dapat berbicara pada semua kombinasi platform. Dukungan Simple Voice Chat plugin Paper 26.3 dan mobile background belum terverifikasi melalui server sebenarnya.
