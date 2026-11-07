# SSCircle Minecraft Link · Velocity (V10.45)

**Implementasi awal:** perintah `/sscircle link <kode>` dari proxy Velocity, request HTTPS bertanda tangan HMAC-SHA256, timestamp Unix, nonce sekali pakai, dan konfirmasi akhir di Profile website.

## Cara menguji
1. Gunakan Velocity online-mode **tanpa plugin yang dapat memaksa login offline untuk sebagian pemain**. Untuk mode campuran LibreLogin, linking diblokir sampai adapter autentikasi diperiksa pada V10.46.
2. Tempatkan JAR hasil `gradle -p minecraft-link-velocity build` ke `plugins/` pada proxy Velocity, lalu restart.
3. Edit `plugins/sscirclelink/link.properties` dan isi `endpoint=https://domain-website-milikmu` tanpa path.
4. Set environment variable `SSCIRCLE_LINK_SERVER_SECRET` di proses Velocity dan secret Cloudflare Pages dengan **nilai acak yang sama**, minimal 32 karakter. Jangan commit atau bagikan nilainya.
5. Setelah Cloudflare baru di-deploy, aktifkan password dashboard anggota lalu buat kode di Profile. Masuk Minecraft, gunakan `/sscircle link <kode>`, kembali ke Profile untuk konfirmasi.

## Batasan keamanan
- Plugin menolak Java Non-Premium dan mode campuran yang membutuhkan verifikasi khusus LibreLogin. **Tidak boleh** menganggap nickname atau offline UUID sebagai autentikasi.
- Bedrock hanya akan diproses apabila Floodgate aktif dan API Floodgate dapat membuktikan XUID pada proxy. Jika API tidak tersedia, semua linking diblokir untuk mencegah salah klasifikasi.
- Pastikan semua server belakang hanya menerima koneksi Velocity dengan modern forwarding dan firewall. Jangan mengekspos server Paper langsung.
- Password Minecraft, kode aktivasi website dan token akun tidak pernah diminta oleh plugin.
- JAR **perlu diuji pada server staging** sebelum produksi, termasuk versi Velocity/Floodgate yang sebenarnya.
- Modul Paper + sinkronisasi statistik termasuk tahap V10.46 dan V10.47, bukan fitur pada plugin ini.
