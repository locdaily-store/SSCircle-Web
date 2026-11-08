# SSCircle Player Sync Paper V10.47.0

Penghubung akun Minecraft ke Profile SSCircle, tanpa Velocity. Plugin memakai HMAC, nonce, kode sekali-pakai 10 menit, dan konfirmasi ulang pada website. Satu anggota saat ini mempunyai **satu** akun Minecraft aktif; multi-account adalah fase berikutnya.

## Dukungan autentikasi

| Konfigurasi | Java Premium | Java dengan AuthMe (termasuk Non-Premium) | Bedrock |
| --- | --- | --- | --- |
| Paper `online-mode=true` | UUID Mojang terverifikasi | Tidak menerima login Non-Premium | XUID Floodgate |
| Paper `online-mode=false` + AuthMe + PacketEvents + SSCircle mixed mode | Dapat masuk via AuthMe Premium Bypass (ditautkan sebagai **Java (AuthMe)**, bukan klaim Mojang Premium) | Login AuthMe wajib | XUID Floodgate |

**Batasan kejujuran identitas:** API publik AuthMe v3 menyatakan apakah pemain terautentikasi, tetapi tidak membuktikan apakah login tertentu memakai password atau handshake Mojang. Karena itu, pada *mixed mode*, SSCircle menyimpan kedua jenis Java sebagai provider `java_offline` dengan label **Java (AuthMe / Server)**. Pemain Premium tetap bisa bermain/link, tetapi SSCircle tidak mengklaim UUID Mojang terverifikasi secara terpisah. Provider `java_premium` hanya dikeluarkan Paper `online-mode=true`. Jangan ubah klasifikasi ini berdasarkan nickname atau UUID v4 pada server offline.

## Jalur A: hanya Java Premium + Bedrock (paling aman untuk produksi saat ini)

1. Backup `world/`, playerdata, `plugins/`, dan D1 Cloudflare.
2. Tetap `online-mode=true` pada `server.properties`, tanpa Velocity/proxy forwarding.
3. Instal **Geyser-Spigot** dan **Floodgate-Spigot** dari situs resmi. Konfigurasikan Geyser dengan `auth-type: floodgate`, lalu restart Paper.
4. Biarkan `authme-mixed-mode.enabled: false` pada konfigurasi SSCircle.
5. Verifikasi Java Premium dan Bedrock dengan `/sscircle status`; OP `/sscircle diagnose`.
6. Buat kode lewat Profile SSCircle (akun diterima + password dashboard aktif), jalankan `/sscircle link SC-...`, konfirmasi nama/edisi dari website.

## Jalur B: Java Premium + Java Non-Premium + Bedrock di satu Paper (uji staging terlebih dahulu)

**Kebutuhan:** Paper 26.3 / Java 25, **AuthMeReloaded terbaru yang kompatibel**, **PacketEvents 2.x**, Geyser dan Floodgate. Jangan memasang plugin login lain (FastLogin, LibreLogin, nLogin, JPremium, EasyAuth, OpeNLogin) bersamaan. Cek kompatibilitas AuthMe dengan Geyser/Floodgate secara langsung.

1. **Jangan ubah server produksi langsung.** Buat salinan server beserta backup world, inventory, statistik, permission dan database D1. Migrasi online-mode dapat mengubah UUID pemain dan nama file playerdata.
2. Pada server **staging** Paper, atur `server.properties` → `online-mode=false`. Pastikan akses jaringan/firewall dan plugin login sudah dikonfigurasi sebelum server diakses publik.
3. Instal `AuthMeReloaded` dan `PacketEvents 2.x` pada `plugins/`. Di `plugins/AuthMe/config.yml`, nyalakan `settings.enablePremium: true`. AuthMe membutuhkan PacketEvents untuk verifikasi Premium Bypass langsung tanpa proxy. Pertahankan `Hooks.bungeecord: false` jika server tidak menggunakan proxy.
4. Instal Geyser + Floodgate pada Paper yang sama. Atur pengaturan Bedrock/Geyser dan autentikasi Floodgate sesuai panduan resmi. **AuthMe dapat menghalangi perintah sebelum login**: pastikan akun Bedrock punya alur autentikasi kompatibel melalui integrasi yang telah diuji, jangan mematikan autentikasi Java untuk semua pemain.
5. Edit `plugins/SSCirclePlayerSync/config.yml`:

   ```yaml
   endpoint: "https://sscircle.pages.dev"
   authme-mixed-mode:
     enabled: true
   ```

   Jangan mengganti `server-secret.txt` jika sudah benar. Sisi Cloudflare harus memakai backend V10.46.0+ dan `SSCIRCLE_LINK_SERVER_SECRET` yang sama. Lakukan restart Paper, tidak cukup `/reload`.
6. Java Non-Premium: `/register` satu kali dan `/login` di sesi berikutnya melalui AuthMe. SSCircle memeriksa API `isAuthenticated`, `isRegistered`, dan `!isUnrestricted` sebelum mengizinkan linking.
7. Java Premium: pemain yang telah login AuthMe dapat menjalankan `/premium` lalu reconnect untuk mekanisme verifikasi Mojang milik AuthMe. SSCircle akan menautkannya sebagai **Java (AuthMe)** pada mode campuran agar tidak membuat klaim Mojang yang belum dapat dibuktikan dari API.
8. Bedrock: masuk melalui Geyser/Floodgate, dan pastikan AuthMe tidak mengunci command `/sscircle`. Identitas website berasal dari XUID **Floodgate** yang diverifikasi, bukan username.
9. OP jalankan `/sscircle status` dan `/sscircle diagnose`. Di Profile akun anggota Diterima yang telah login dengan password dashboard, buat kode baru, jalankan `/sscircle link <kode>`, perbarui Profile, dan **Konfirmasi**.

## Pengaturan website dan secret

- Website menggunakan Cloudflare Pages + D1, `DB`, `SESSION_SECRET`, `ADMIN_PASSWORD`, dan `SSCIRCLE_LINK_SERVER_SECRET`. URL website dapat diuji di `/api/health`.
- `plugins/SSCirclePlayerSync/server-secret.txt` (satu baris ASCII 32–256 karakter) memiliki prioritas atas environment Windows. Nilainya harus sama dengan secret Cloudflare **Production**. Jangan commit, log, screenshot atau live-stream nilainya.
- Kunci HMAC tidak menggantikan autentikasi AuthMe/Floodgate. Tidak ada bypass login untuk Java yang belum terautentikasi.
- Status akun dan kode tersimpan privat di website; kode linking tidak di-autocomplete.

## Perintah

- `/sscircle help` menampilkan bantuan dan autocomplete.
- `/sscircle status` menampilkan mode server dan jenis bukti identitas pemain.
- `/sscircle diagnose` (OP) menguji HTTPS, HMAC, dan konfigurasi Cloudflare.
- `/sscircle link SC-...` mengirim klaim kode sekali-pakai setelah autentikasi.
- `/sscircle reload` (OP) memuat ulang konfigurasi/file kunci. Mengubah plugin AuthMe/PacketEvents memerlukan restart.

## Jika tidak berhasil

- Java di offline-mode tetap ditolak: cek `authme-mixed-mode.enabled=true`, `AuthMe`, `packetevents` dan autentikasi login pengguna. Aktifkan **di staging saja**.
- Bedrock tidak terdeteksi: cek Floodgate, Geyser, XUID dan urutan plugin; AuthMe mungkin membatasi command sebelum login.
- HTTP 401: periksa kesamaan secret + jam server.
- HTTP 503: jalankan `/api/health` dan lihat apakah binding Minecraft sudah `ready`.
- `Kode sudah dipakai`: perbarui Profile dan konfirmasi; jika kedaluwarsa buat kode baru.
- Paket plugin ini tidak mengubah data pemain lama atau otomatis memigrasi UUID, statistik maupun inventory.
- Bukti CI/build bukan bukti sudah teruji pada servermu. Ketiga jenis akun harus diuji secara end-to-end di staging sebelum dipublikasikan.

## V10.47: Statistik asli Minecraft, antrean dan retry

Pada rilis ini, SSCircle mengirim empat statistik vanilla Paper untuk identitas **yang sudah terverifikasi dan ditautkan di website**: waktu bermain, kematian, mob dikalahkan, dan blok ditambang. Data diambil saat bergabung (setelah autentikasi), tiap lima menit, saat keluar, dan ketika plugin berhenti.

- `/sscircle sync` (OP): ambil statistik pemain yang online sekarang dan mulai pengiriman.
- `/sscircle status` (OP): periksa jumlah identitas dalam antrean dan status pengiriman terakhir.
- `stats-sync.enabled: true` dan `stats-sync.interval-seconds: 300` di `plugins/SSCirclePlayerSync/config.yml`.
- Jika koneksi HTTPS/Cloudflare mati, snapshot terbaru disimpan secara lokal di `stats-queue.properties`, dikirim kembali dengan backoff hingga lima menit.
- Jika pemain belum tertaut ke website, data **tidak** diterapkan kepada anggota lain. Setelah link berhasil, ambil snapshot baru menggunakan `/sscircle sync`.
- D1 `minecraft_stat_receipts` menyimpan bukti event pernah diproses, sementara `player_stat_snapshots` menyimpan total kumulatif. Retry tak boleh menggandakan angka atau menurunkannya.
- Semua request menggunakan signature HMAC, timestamp dan nonce; jangan simpan secret di GitHub atau stream.

**Instalasi:** upload ZIP Cloudflare V10.47.0 lebih dahulu, lalu ganti JAR SSCircle dengan V10.47.0. Jangan hapus `config.yml` atau `server-secret.txt`. Panduan lengkap: `docs/V10.47-PLAYER-STATS.md`.

**Batasan:** angka dari dunia yang direset belum punya epoch season. Total di D1 tidak dikurangi walaupun file statistik vanilla di-reset; target berikutnya adalah season baseline dan uji runtime di server staging.
