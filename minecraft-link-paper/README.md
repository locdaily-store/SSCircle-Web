# SSCircle Player Sync Paper V10.48.3 (Web V10.48.2+)

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

**Kebutuhan:** Paper 26.3 / Java 25, **AuthMeReloaded terbaru yang kompatibel**, **PacketEvents 2.x**, Geyser dan Floodgate. Jangan memasang **FastLogin dan FastLoginPlus bersamaan**. Jika memakai FastLoginPlus sebagai adapter Premium, AuthMe tetap harus menjadi autentikator lokal. Jangan memasang LibreLogin, nLogin, JPremium, EasyAuth, atau OpeNLogin bersamaan. Cek kompatibilitas AuthMe dengan Geyser/Floodgate secara langsung.

1. **Jangan ubah server produksi langsung.** Buat salinan server beserta backup world, inventory, statistik, permission dan database D1. Migrasi online-mode dapat mengubah UUID pemain dan nama file playerdata.
2. Pada server **staging** Paper, atur `server.properties` → `online-mode=false`. Pastikan akses jaringan/firewall dan plugin login sudah dikonfigurasi sebelum server diakses publik.
3. Instal `AuthMeReloaded` dan `PacketEvents 2.x` pada `plugins/`. Jika memakai **FastLoginPlus**, pasang pula `ProtocolLib` yang kompatibel dan biarkan FastLoginPlus mengintegrasikan dukungan Premium dengan AuthMe menurut dokumentasi versinya; hindari dua sistem auto-premium yang saling bertabrakan. Pertahankan `Hooks.bungeecord: false` jika server tidak menggunakan proxy.
4. Instal Geyser + Floodgate pada Paper yang sama. Atur pengaturan Bedrock/Geyser dan autentikasi Floodgate sesuai panduan resmi. **AuthMe dapat menghalangi perintah sebelum login**: pastikan akun Bedrock punya alur autentikasi kompatibel melalui integrasi yang telah diuji, jangan mematikan autentikasi Java untuk semua pemain.
5. Edit `plugins/SSCirclePlayerSync/config.yml`:

   ```yaml
   endpoint: "https://sscircle.pages.dev"
   authme-mixed-mode:
     enabled: true
   ```

   Jangan mengganti `server-secret.txt` jika sudah benar. Sisi Cloudflare harus memakai backend V10.46.0+ dan `SSCIRCLE_LINK_SERVER_SECRET` yang sama. Lakukan restart Paper, tidak cukup `/reload`.
6. Java Non-Premium: `/register` satu kali dan `/login` di sesi berikutnya melalui AuthMe. SSCircle memeriksa API `isAuthenticated`, `isRegistered`, dan `!isUnrestricted` sebelum mengizinkan linking.
7. Java Premium: gunakan verifikasi sesi asli oleh FastLoginPlus, lalu reconnect bila diperlukan. **Jangan menjadikan `/premium`, `/flp premium`, nickname atau entri database sebagai bukti bahwa koneksi saat ini sudah lolos Mojang.** SSCircle hanya memberi label Java Premium jika API sesi FastLoginPlus benar-benar mengembalikan `PREMIUM`; jika belum tersedia, statusnya tidak terverifikasi.
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

## V10.47.2: Low-TPS + Season stats

Pembacaan kategori blok dibagi ke beberapa tick (24 pembacaan/tick default, untuk seluruh plugin), file antrean ditulis di background tiap 10 detik, dan sinkron HTTP tetap asynchronous. Admin mengatur Season aktif di halaman **Season Archive & Hall of Fame**; snapshot pertama menjadi baseline, reset world tidak menghapus statistik lama. Lima kartu statistik kini mempunyai ikon dan pilihan Season di Profile. Konfigurasi tambahan: `stats-sync.block-reads-per-tick: 24`, `stats-sync.queue-flush-seconds: 10`, dan mode adaptif (>=30 pemain online = sampling berkala setiap 10 menit, dapat dimatikan). Lihat `docs/V10.47.2-SEASON-PERFORMANCE.md` untuk pengujian, backup, dan batasan.

## V10.48.0 — Monitoring via Admin Control

- Tab **Minecraft Sync** pada website menampilkan heartbeat terakhir, estimasi TPS satu menit (bukan hasil profil TPS), online players yang *terlapor terakhir*, snapshot tertunda, jumlah akun tertaut, daftar akun tanpa statistik, serta histori status pengiriman. Tab privat hanya dapat dibuka oleh admin login.
- Plugin mengirim heartbeat HMAC lewat HTTPS keluar setiap 120 detik; tidak perlu membuka port Paper atau mengaktifkan Velocity. `sync-monitor.interval-seconds: 120` dalam `plugins/SSCirclePlayerSync/config.yml` dapat diatur 60–600 detik.
- Tombol **Minta sinkronisasi** membuat permintaan `sync_now` sekali pakai yang berlaku 10 menit. Plugin mengambil permintaan dalam respons heartbeat, melakukan `stats.triggerNow()` di thread server, dan melaporkan selesai pada heartbeat berikutnya. Perintah tersebut tetap bisa dijalankan langsung dari server dengan `/sscircle sync` (OP).
- Permintaan dibatasi dua menit antar-permintaan, maksimal satu aktif, dengan pemeriksaan autentikasi admin dan anti-replay HMAC bagi plugin. Tidak ada endpoint untuk menjalankan perintah Minecraft bebas.
- Website akan menampilkan **laporan terlambat/status belum diketahui**, tidak otomatis menebak server offline. Tidak ada password/secret mentah maupun isi chat dalam riwayat.
- Deploy ZIP Cloudflare V10.48.0 dan JAR Paper V10.48.0 bersama. Konfigurasi yang sudah berhasil, world, playerdata, serta database D1 tetap dipertahankan.
- Jika heartbeat tidak muncul, cek `/sscircle status` OP lalu periksa secret, HTTPS endpoint, dan log Paper privat. Lihat `docs/V10.48-SYNC-MONITORING.md`.

## V10.48.3: FastLoginPlus terverifikasi dan sinkron dengan Web V10.48.2

Rilis plugin ini mempertahankan kontrak HMAC, nonce, `authSource` dan API Web SSCircle V10.48.2. **Tidak ada migrasi database, perubahan UUID, pergantian akun tertaut, ataupun perubahan website yang wajib khusus untuk V10.48.3.**

### Untuk Paper offline-mode + Java Premium/Non-Premium (tanpa Velocity)

1. **Backup sebelum upgrade:** seluruh `world/playerdata`, folder `plugins/SSCirclePlayerSync/` (termasuk `server-secret.txt` dan `stats-queue.properties`), konfigurasi/DB AuthMe, dan D1 Cloudflare. Jangan membagikan kunci.
2. Gunakan Paper **26.3** dengan Java **25**, `online-mode=false`, `AuthMeReloaded` yang kompatibel, `PacketEvents 2.x`, `ProtocolLib` yang kompatibel, dan **FastLoginPlus**. Untuk Bedrock tambahkan Geyser + Floodgate. FastLoginPlus merupakan pengganti FastLogin, **bukan plugin yang dipasang bersamaan**.
3. Pada `plugins/SSCirclePlayerSync/config.yml`, pastikan `endpoint` mengarah ke deployment Cloudflare SSCircle terbaru dan `authme-mixed-mode.enabled: true`. Pertahankan secret yang sama dengan `SSCIRCLE_LINK_SERVER_SECRET` di Cloudflare. Jangan mengganti file secret saat upgrade.
4. Hentikan Paper sepenuhnya, gantikan JAR SSCircle lama dengan `SSCircle-Player-Sync-Paper-10.48.3.jar` dari artifact GitHub Actions, lalu mulai Paper lagi. Pastikan tidak ada dua JAR SSCircle lama dan baru di folder `plugins/`.
5. Saat pemain Java masuk, AuthMe harus memastikan autentikasi selesai. FastLoginPlus melaporkan status per sesi `PREMIUM`, `CRACKED`, atau `UNKNOWN`; SSCircle tidak menyimpulkan Premium dari nickname, API Mojang publik, ataupun offline UUID.
6. OP/pemain jalankan `/sscircle status`. Ini menampilkan nama adapter terdeteksi dan edisi sesi aktif. OP jalankan `/sscircle diagnose` untuk memeriksa HMAC/HTTPS, lalu `/sscircle sync` bila ingin mempercepat pengambilan statistik pemain online.
7. Pastikan akun pemain **sudah terhubung dan dikonfirmasi** di Profile website. Setelah snapshot berhasil terkirim, menu `Jenis Minecraft` dan **Admin Control → Minecraft Sync** akan menggunakan bukti autentikasi terbaru dari backend.

### Perubahan dari V10.48.2

- Fix: snapshot baru dibuat ketika `authSource` berubah (`authme-session` → `fastlogin-premium` atau `fastlogin-cracked`), **meskipun playtime/deaths/kills/blocks tidak berubah**. Ini menghindari label Premium lama/UNKNOWN yang bertahan akibat deduplikasi statistik.
- Kompatibilitas dengan API sesi resmi `FastLoginBukkit.getStatus(UUID)` dari FastLogin dan fork FastLoginPlus tetap dipertahankan; pembacaan tidak membuat HTTP Mojang per tick.
- Jika FastLogin **dan** FastLoginPlus sama-sama aktif, SSCircle tidak memilih salah satu secara acak dan tidak mengklaim sesi Premium terverifikasi. Singkirkan salah satu plugin lalu restart Paper.
- Pengujian Java/JUnit memverifikasi perpindahan bukti Premium/Cracked dan status UNKNOWN; pengujian CI juga memeriksa konfigurasi dan kontrak website.

**Batasan penting:** status `UNKNOWN` tetap tampil sebagai belum terverifikasi jika adapter belum memperoleh hasil atau status sesi belum ada. Bukti CI/build bukan pengganti tes nyata 1 akun Premium + 1 akun Non-Premium + 1 akun Bedrock dan TPS pada hosting. Pada mode campuran, identitas SSCircle untuk Java tetap berbasis ID AuthMe stabil, **bukan** otomatis berpindah ke UUID Mojang. Mengubah `premiumUuid` FastLoginPlus dapat memengaruhi inventory/plugin lain; jangan lakukan tanpa rencana migrasi.

Referensi upstream: https://github.com/Hayston1001/FastLoginPlus
