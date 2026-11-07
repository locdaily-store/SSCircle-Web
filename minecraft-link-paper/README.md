# SSCircle Player Sync Paper · V10.45.3 (Direct, tanpa Velocity)

## Persyaratan
- **Paper 26.3, Java 25+, satu server online-mode**. Server memiliki koneksi internet keluar via HTTPS menuju website SSCircle di Cloudflare Pages + D1.
- SSCircle website backend minimal V10.45 (endpoint `/api/minecraft/link/claim` dan Profile dengan password dashboard).
- Secret server `SSCIRCLE_LINK_SERVER_SECRET` acak (minimum 32 karakter) di Cloudflare Pages dan dibaca oleh Paper dari environment variable **atau** file privat `plugins/SSCirclePlayerSync/server-secret.txt` yang bisa dibuat otomatis. Nilainya **harus sama persis**.
- Gunakan akun Minecraft Java Premium autentik untuk tes pertama; Bedrock opsional setelah Geyser + Floodgate terpasang dan lolos uji.

## Instalasi Windows paling sederhana
1. **Backup** world, konfigurasi server, dan D1 testing. Matikan Paper/Velocity yang lama.
2. Gunakan Paper 26.3 dan Java 25. Jangan jalankan Velocity.
3. Di `server.properties`: `online-mode=true`, `server-port=25565`, `server-ip=127.0.0.1` untuk lokal satu PC. Untuk akses LAN sesuaikan IP setelah uji awal.
4. Di `config/paper-global.yml`: `proxies.velocity.enabled: false`. Di `spigot.yml`: `settings.bungeecord: false`. Jangan biarkan proxy forwarding aktif.
5. Salin artifact `SSCircle-Player-Sync-Paper-10.45.3.jar` ke `Paper/plugins/`, lalu jalankan Paper sekali.
6. Edit `Paper/plugins/SSCirclePlayerSync/config.yml`: ubah `endpoint` menjadi **domain HTTPS website SSCircle** tanpa path.
7. Di Windows **tidak perlu** mengatur environment variable. Jika variabel tersebut tidak ada, plugin V10.45.3 membuat file privat `plugins/SSCirclePlayerSync/server-secret.txt` dengan token acak kuat. Buka file itu secara privat, salin nilainya ke secret `SSCIRCLE_LINK_SERVER_SECRET` di Cloudflare (atau isi file dengan nilai secret Cloudflare yang sudah ada), lalu gunakan `/sscircle reload` sebagai OP atau restart Paper. Jangan menyimpan secret pada `config.yml`.
8. Buka Minecraft Java Premium, Multiplayer → `127.0.0.1:25565`. Perintah `/sscircle status` harus memperlihatkan konfigurasi siap dan Java Premium.
9. Masuk Profile website SSCircle sebagai anggota diterima **dengan password dashboard**, klik Buat kode penghubung, jalankan `/sscircle link SC-...` di Minecraft, lalu kembali ke Profile → Perbarui status → Konfirmasi identitas.

## Perbaikan V10.45.3: tab completion dan diagnosis
- Ketik `/sscircle` lalu **spasi dan Tab** untuk memilih `help`, `status`, `link`; `reload` hanya muncul bagi pemain yang memiliki izin admin/OP.
- Jalankan `/sscircle` tanpa argumen atau `/sscircle help` untuk melihat daftar dan deskripsi perintah.
- Kode sekali pakai **tidak di-autocomplete** karena diambil secara privat dari website.
- `/sscircle status` membedakan **domain HTTPS tidak valid** dari **secret belum terbaca** tanpa menampilkan nilainya.
- Jika server masih offline-mode, buka `server.properties`, set `online-mode=true` untuk Java Premium tanpa proxy, hentikan seluruh proses Paper dan jalankan kembali. `/reload` Minecraft **bukan** pengganti restart Paper.
- Jika website belum lengkap, edit `plugins/SSCirclePlayerSync/config.yml` → `endpoint: "https://domain-kamu.pages.dev"` dan set **`SSCIRCLE_LINK_SERVER_SECRET`** pada environment Windows dan Cloudflare; restart Paper.
- Jika menjalankan Paper melalui panel/hosting, secret harus disetel pada **environment proses Paper** yang dijalankan oleh panel, bukan sekadar di terminal lain.
- Website SSCircle Cloudflare harus sudah dideploy dengan endpoint V10.45+, D1 binding `DB`, dan secret yang sama.

## Kontrol
- `/sscircle help`: tampilkan daftar pilihan perintah.
- `/sscircle status`: status konfigurasi dan jenis identitas yang terbaca, **bukan** bukti akun sudah linked.
- `/sscircle link <kode>`: klaim kode sekali pakai 10 menit; tautan **belum selesai** sampai dikonfirmasi di website.
- `/sscircle reload`: untuk operator; memuat ulang URL website dan file secret lokal tanpa restart. Perubahan environment variable proses masih memerlukan restart.
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

Dokumentasi lengkap pemasangan: `docs/V10.45.3-PAPER-DIRECT.md`.
