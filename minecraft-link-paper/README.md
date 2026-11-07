# SSCircle Player Sync Paper · V10.45.1 (Direct, tanpa Velocity)

## Persyaratan
- **Paper 26.3, Java 25+, satu server online-mode**. Server memiliki koneksi internet keluar via HTTPS menuju website SSCircle di Cloudflare Pages + D1.
- SSCircle website backend minimal V10.45 (endpoint `/api/minecraft/link/claim` dan Profile dengan password dashboard).
- Secret server `SSCIRCLE_LINK_SERVER_SECRET` acak (minimum 32 karakter) disetel **sama** pada proses Paper dan Cloudflare Pages.
- Gunakan akun Minecraft Java Premium autentik untuk tes pertama; Bedrock opsional setelah Geyser + Floodgate terpasang dan lolos uji.

## Instalasi Windows paling sederhana
1. **Backup** world, konfigurasi server, dan D1 testing. Matikan Paper/Velocity yang lama.
2. Gunakan Paper 26.3 dan Java 25. Jangan jalankan Velocity.
3. Di `server.properties`: `online-mode=true`, `server-port=25565`, `server-ip=127.0.0.1` untuk lokal satu PC. Untuk akses LAN sesuaikan IP setelah uji awal.
4. Di `config/paper-global.yml`: `proxies.velocity.enabled: false`. Di `spigot.yml`: `settings.bungeecord: false`. Jangan biarkan proxy forwarding aktif.
5. Salin artifact `SSCircle-Player-Sync-Paper-10.45.1.jar` ke `Paper/plugins/`, lalu jalankan Paper sekali.
6. Edit `Paper/plugins/SSCirclePlayerSync/config.yml`: ubah `endpoint` menjadi **domain HTTPS website SSCircle** tanpa path.
7. Di Windows, tambahkan environment variable pengguna `SSCIRCLE_LINK_SERVER_SECRET` (Secret terenkripsi yang sama harus aktif di Cloudflare). Tutup semua jendela launcher/terminal lama, jalankan ulang Paper.
8. Buka Minecraft Java Premium, Multiplayer → `127.0.0.1:25565`. Perintah `/sscircle status` harus memperlihatkan konfigurasi siap dan Java Premium.
9. Masuk Profile website SSCircle sebagai anggota diterima **dengan password dashboard**, klik Buat kode penghubung, jalankan `/sscircle link SC-...` di Minecraft, lalu kembali ke Profile → Perbarui status → Konfirmasi identitas.

## Kontrol
- `/sscircle status`: status konfigurasi dan jenis identitas yang terbaca, **bukan** bukti akun sudah linked.
- `/sscircle link <kode>`: klaim kode sekali pakai 10 menit; tautan **belum selesai** sampai dikonfirmasi di website.
- `/sscircle reload`: untuk operator; memuat ulang URL website pada config; perubahan environment variable biasanya butuh restart proses.
- Untuk mengganti akun, Profile website → Putuskan tautan (memerlukan verifikasi password).

## Keamanan & batasan
- **Java Non-Premium dan offline-mode selalu ditolak**. UUID offline serta nickname bukan bukti identitas.
- Plugin login campuran seperti LibreLogin, AuthMe, nLogin, FastLogin, JPremium dan EasyAuth memblokir linking sampai tersedia adapter autentikasi yang terpercaya pada rilis selanjutnya.
- Untuk Bedrock, pasang **Geyser-Spigot** dan **Floodgate-Spigot** pada Paper. Atur auth-type Floodgate pada Geyser. Plugin akan meminta bukti XUID melalui Floodgate; jika API Floodgate tidak ada/bermasalah, seluruh klaim ditolak, bukan dianggap Premium.
- JAR V10.45 untuk Velocity **tidak perlu dipakai** dalam mode ini. Jangan menginstal plugin Velocity di Paper.
- Tidak mengirim playtime, deaths, atau statistik otomatis; itu tahap terpisah.
- Secret tidak disimpan pada file config dan tidak ditampilkan di chat/log. Perintah linking berisi kode sekali pakai; jangan gunakan pada livestream saat menampilkan chat/console secara publik.
- Build CI membuktikan kompilasi; tes langsung pada Paper+Floodgate+Cloudflare staging tetap wajib sebelum server publik.

## Jika gagal
- Tidak bisa masuk server: port 25565 sedang dipakai, server online-mode belum valid, atau server-ip tidak sesuai.
- Pesan 'requires Velocity': Paper masih punya forwarding enabled, bukan plugin SSCircle.
- '/sscircle' tidak dikenal: cek plugin terpasang benar di Paper dan `logs/latest.log`.
- 'belum dikonfigurasi': cek `plugins/SSCirclePlayerSync/config.yml`, secret pada proses Paper, lalu restart.
- HTTP 401/403: cek secret/identitas auth dan waktu sistem.
- HTTP 404/410: kode sudah habis/keliru atau domain tidak cocok.
- Cloudflare website belum mengeluarkan kode: cek binding D1 `DB`, `SESSION_SECRET`, login password dashboard, dan `SSCIRCLE_LINK_SERVER_SECRET` Cloudflare.

Dokumentasi lengkap pemasangan: `docs/V10.45.1-PAPER-DIRECT.md`.
