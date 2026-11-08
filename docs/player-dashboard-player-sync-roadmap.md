# SSCircle · Player Dashboard & Player Sync Roadmap

Status: **Perencanaan dan implementasi bertahap**. Dokumen ini bukan klaim bahwa plugin atau sinkronisasi sudah selesai.

## Rilis 1: My SSCircle Foundation (V10.35)
- Memakai tabel `submissions` dan sesi `ssc_player` yang sudah tersedia.
- `/my-sscircle` hanya bisa dibuka oleh pendaftar berstatus `accepted`. Semua penolakan dilakukan server-side sebelum HTML dikirim.
- Menampilkan keanggotaan dan tanggal bergabung; kode pendaftaran tidak ditampilkan utuh.
- Statistik dan akun Minecraft yang belum tersedia diberi label jelas; **tidak** membuat data Minecraft palsu.
- Tidak menambahkan D1 migration, tidak memodifikasi data lama, dan tidak mengizinkan perubahan status atau hasil voting.
- Perubahan akun sensitif dan account linking **belum** tersedia. Kode pendaftaran masih merupakan login yang ada sebelumnya, belum otentikasi kuat untuk mengikat akun Minecraft.

## Rilis 2: Identitas dan keamanan keanggotaan
- Tambah tabel `member_profiles` dengan FK ke `submissions.id` (ID internal stabil).
- Tambah autentikasi kuat (contohnya login satu-kali via email terverifikasi atau passkey), recovery, revoke semua sesi, reauth untuk perubahan identitas.
- Mulai dari halaman profil privat; public profile harus opt-in, pisahkan hak akses pemilik, staff, dan pengunjung.
- Setiap perubahan D1 dibuat sebagai migration terurut, backup sebelum produksi; tidak boleh menghapus tabel pendaftaran.
- Abaikan username sebagai bukti pemilikan akun.

## Implementasi akun aman V10.44 (sebagian Rilis 2)
- Login dashboard tetap memerlukan password yang dibuat setelah verifikasi identitas oleh admin dan kode sekali pakai di Mail Box. Kode pendaftaran **bukan** izin untuk mengganti password.
- Pemulihan password: anggota yang sudah masuk dengan kode pendaftaran mengajukan permintaan melalui Profile; admin memverifikasi identitas melalui kanal terpisah, lalu menerbitkan kode lewat Mail Box. Kode dipakai satu kali untuk mereset password; semua sesi password lama dicabut.
- Anggota aktif dapat mengganti password dengan **bukti password lama** yang diturunkan oleh browser; semua sesi lama dicabut dan dibuatkan sesi baru untuk perangkat ini jika memungkinkan.
- Anggota dapat memberi nama perangkat dan melihat maksimal 40 aktivitas keamanan terbaru. Event dicatat tanpa menyimpan password, kode, token, IP, atau sidik-jari perangkat; log dibatasi 100 per anggota.
- Tabel `member_security_events` dan indeksnya dibuat secara aditif saat sistem keamanan dipakai; tidak menghapus tabel lama. Lakukan cadangan D1 dan uji di staging sebelum deploy produksi.
- **Belum tersedia** pemulihan mandiri via email/passkey dan sistem kepemilikan identitas berbasis email. Jangan menganggap verifikasi admin dapat diganti hanya dengan memasukkan kode pendaftaran.
- Masih wajib pengujian produksi Cloudflare Pages + D1 dengan akun uji: sesi paralel, revoke, pemulihan, rate limit, akses silang akun, dan perangkat HP.

## Rilis 3: Minecraft Account Linking
Buat:
- `minecraft_accounts`: `member_id`, `provider`, `verified_external_id`, `display_name`, `linked_at`, `last_verified_at`; unique(provider, verified_external_id).
- `minecraft_link_challenges`: random secret hash, `member_id`, `expires_at`, `used_at`, `attempt_count`; jangka pendek + sekali pakai.
- API terautentikasi: create/revoke challenge, finish challenge (hanya dari server), get linked identity, unlink with reauthentication.
- Perintah Minecraft `/sscircle link <code>` hanya setelah auth plugin mengonfirmasi pemain sudah login.
- Aturan collision: satu identitas Minecraft tidak boleh diklaim beberapa anggota tanpa prosedur transfer yang aman.

## Implementasi V10.45 (pondasi linking yang sudah dikerjakan)
- Website memiliki endpoint anggota untuk membuat kode, membatalkan, mengecek status, mengonfirmasi hasil verifikasi server, dan memutuskan tautan dengan password dashboard. Setiap kode hanya tampil saat dibuat.
- Backend mengharuskan tanda tangan HMAC dari plugin, timestamp pendek, nonce satu kali, dan verifikasi identitas dari sumber terautentikasi. Identitas tidak langsung terhubung sebelum anggota menekan konfirmasi pada Profile.
- Data kompatibel dengan tabel `minecraft_accounts` dan `minecraft_link_challenges` yang sudah tersedia. Tabel tambahan `minecraft_link_claims` dan `minecraft_link_nonces` dibuat otomatis secara aditif.
- Admin Control memiliki daftar baca-saja identitas Minecraft tertaut, tanpa menyediakan input UUID/XUID bebas.
- Source plugin Velocity dapat dibangun secara terpisah, mendukung Java Premium dengan online-mode proxy yang jelas dan Bedrock hanya ketika Floodgate memberi XUID terverifikasi. Akun Java Non-Premium tetap **diblokir** sampai adapter LibreLogin diverifikasi pada V10.46.
- Bukti build/test CI belum cukup untuk menjamin server produksi: wajib uji Velocity + Floodgate + Cloudflare Pages/D1 di staging sebelum publik.
- Secret `SSCIRCLE_LINK_SERVER_SECRET` disetel di Cloudflare dan proses Velocity. Jangan mengunggahnya sebagai file website atau menaruhnya di frontend.

## Implementasi V10.45.1 (Paper langsung, tanpa Velocity)
- Disediakan proyek dan JAR **SSCircle Player Sync Paper** untuk Paper 26.3 (Java 25) dengan perintah `/sscircle link`, `/sscircle status` dan reload konfigurasi oleh admin. Plugin menggunakan endpoint/backend V10.45 yang sama sehingga website tidak membutuhkan kode login baru.
- Konfigurasi Paper langsung: `online-mode=true`, `proxies.velocity.enabled=false`, `settings.bungeecord=false`. Tidak memerlukan `forwarding.secret`, Velocity, atau program Java lain selain Paper.
- Identitas Java Premium diambil dari UUID sesi online-mode Paper. Mode offline dan plugin autentikasi campuran yang belum diverifikasi **ditolak**. Bedrock dibaca dari XUID Floodgate jika API tersedia; tidak dipastikan bekerja sebelum tes staging.
- Plugin memakai secret lingkungan `SSCIRCLE_LINK_SERVER_SECRET` bersama dengan Cloudflare, HTTPS HMAC-SHA256, timestamp dan nonce. Tidak ada secret di konfigurasi website atau plugin.
- Pengiriman HTTPS dijalankan asinkron dan hasil ditampilkan pada main thread; tidak memasukkan kode ke log.
- Dokumentasi instalasi Windows dan pengujian localhost terdapat pada `docs/V10.45.1-PAPER-DIRECT.md`.
- Plugin Paper V10.45.1 **belum** mengirim statistik atau mengaktifkan Java Non-Premium. Tes manual server sesungguhnya, Cloudflare Pages, Floodgate, dan recovery tetap diperlukan.

## Rilis 4: Plugin SSCircle Player Sync
Dua modul:
1. **Velocity Bridge**: membaca status autentikasi terpercaya dari plugin login, mengklasifikasi Java Premium / Java Non-Premium / Bedrock. Data tidak boleh ditebak dari username atau offline UUID saja.
2. **Paper Module**: membaca event/statistik, antrean pengiriman, konfigurasi, `/sscircle status`, `/sscircle link`, retry. Gunakan Paper API resmi, hindari NMS.

Ketentuan operasional:
- Karena server menargetkan Java Premium, Java Non-Premium, dan Bedrock, uji kompatibilitas LibreLogin/Floodgate/Geyser secara khusus. Geyser tidak menjamin dukungan konfigurasi offline-mode.
- Premium: UUID resmi hanya jika autentikasi Microsoft benar-benar terverifikasi.
- Non-Premium: ID akun internal stabil yang terikat ke hasil login plugin, bukan klaim username.
- Bedrock: XUID yang dibuktikan Floodgate.
- Backend Paper harus diproteksi dari akses langsung; Velocity forwarding/authentication harus aman.
- Plugin API menggunakan HTTPS dan credential server-side terpisah, nonce/timestamp/anti-replay, tidak ditaruh di frontend.
- Target minimum Paper 26.3; versi setelahnya diuji per rilis, tidak dijamin selalu cocok.

## Rilis 5: Statistik otomatis
- Tabel `player_stat_snapshots`, `player_season_stats`, dan `sync_ingestions` untuk idempotency.
- Snapshot cumulative + sequence per server/player; jangan menjumlah dua kali ketika retry.
- Perubahan statistik di Minecraft dibaca pada tick/thread yang sesuai. HTTP, database, dan retry secara asynchronous agar TPS tidak turun.
- Saat Cloudflare tidak terhubung: antrean lokal bertahan sampai berhasil, exponential backoff, ukuran antrean dibatasi, fail-safe tidak menghapus data.
- Pisahkan data seumur hidup vs per-season. Rekap sejarah season tidak dihapus saat season berakhir.
- Dashboard hanya menampilkan data yang benar-benar diverifikasi dan tersimpan, plus waktu sinkronisasi terakhir.

## Rilis 6: Admin Control dan komunitas
- Menu **Kelola Pemain**: identitas tertaut, status sinkronisasi, recovery, kebijakan privasi, audit log.
- Hubungkan pemain ke leaderboard dan award berdasarkan ID internal, bukan hanya teks username.
- Kelola penghapusan pendaftaran/akun sesuai kebijakan data, termasuk FK dan data historis.
- Rollout bertahap: 1 akun Premium, 1 akun Non-Premium, 1 akun Bedrock di staging sebelum publik.

## Matriks uji wajib
- Guest/Pending/Rejected tidak bisa membaca dashboard HTML/API.
- Pemain diterima membaca datanya sendiri, bukan data anggota lain.
- Premium tidak bisa ditiru melalui Non-Premium dengan nickname sama.
- Bedrock prefix/XUID tidak tertukar dengan Java.
- Login proxy, join/quit SMP, reconnect dan transfer server tidak menggandakan statistik.
- Kode link kedaluwarsa, salah, ditebak, replay, sudah dipakai, dan link ganda ditolak.
- D1 rollback, deploy Cloudflare, logout/revoke, browser HP dan desktop.
- Perubahan versi Paper diuji sebelum update server produksi.

## Kenapa urutan ini?
Dashboard pertama memberi nilai langsung tanpa migrasi berisiko. Akun yang terverifikasi adalah pondasi semua statistik. Mengirim data Minecraft sebelum identitas aman justru berpotensi menempelkan statistik ke orang yang salah.


## Implementasi V10.46.0 — Akun campuran tanpa Velocity (beta, perlu uji server)

Penyelesaian kode (bukan klaim validasi produk pada hosting):
- **Java Premium online-mode:** jalur Mojang yang sudah ada dipertahankan. `java_premium` hanya boleh berasal dari koneksi Paper yang memang `online-mode=true`.
- **Bedrock:** Floodgate XUID diverifikasi sebelum pemeriksaan Java agar `online-mode=false` tidak otomatis menolak Bedrock. Tetap memerlukan Geyser + Floodgate dan tes command AuthMe pada klien Bedrock.
- **Java AuthMe (termasuk Non-Premium):** mode opt-in `authme-mixed-mode.enabled`, membutuhkan AuthMeReloaded + PacketEvents 2.x. SSCircle memverifikasi `AuthMeApi.isAuthenticated`, `isRegistered`, dan penolakan `isUnrestricted`; ID lokal diturunkan deterministik dari nama akun AuthMe yang dinormalisasi. ID tersebut **tidak** dianggap sebagai bukti Mojang Premium.
- **Pengguna Premium saat mixed mode:** AuthMe Premium Bypass dapat memverifikasi Mojang pada proses login, tetapi API publik AuthMe tidak memberikan bukti eksplisit per-sesi kepada SSCircle. Karena itu, pada mode campuran SSCircle menautkan kedua jenis Java sebagai `java_offline` dengan label **Java (AuthMe / Server)**. Keaslian identitas Premium terpisah tetap menjadi target adapter yang bisa dibuktikan secara kriptografis, bukan sekadar cek UUID/nickname.
- **Website:** backend menerima klaim `authme-session` yang ditandatangani HMAC, format UUID v3, dan nama Java tervalidasi. Klaim `java_premium` palsu dengan sumber AuthMe ditolak. Alur kode sekali-pakai, nonce anti-replay, dan konfirmasi ulang tetap berlaku.
- **Pengujian otomatis:** tes ID Java, kontrak AuthMe/Floodgate/Paper, klaim nonpremium, pemalsuan Premium, dan regresi Bedrock; verifikasi JAR dan ZIP menggunakan CI.
- **Belum selesai:** uji end-to-end ketiga jenis klien di Paper 26.3, perilaku AuthMe+Floodgate, proses migrasi UUID/playerdata dari online ke mixed mode, dan deploy Cloudflare produksi yang benar. Jangan menyebut fitur siap produksi sebelum tes-tes tersebut lolos.

### Tahap selanjutnya setelah V10.46.0
1. **Pengujian integrasi runtime:** Paper 26.3 + AuthMe + PacketEvents + Geyser + Floodgate; login, logout, reconnect, tab completion, kode penghubung, dan konfirmasi di website. Rekam hasil serta versi masing-masing plugin.
2. **Pencegahan pengambilalihan dan migrasi:** uji spoof nama Java, bypass sebelum login, sesi AuthMe kadaluarsa, klaim XUID palsu, perubahan nickname, konflik UUID, serta perencanaan migrasi inventory/permissions/playerdata saat ganti online-mode.
3. **Verified Premium adapter:** tambahkan bukti autentikasi Mojang per-sesi yang benar-benar dapat dikonsumsi SSCircle pada mixed mode, dengan fallback ditolak jika bukti tidak ada.
4. **V10.47 Player Stats Sync:** playtime, deaths, mob kills, transaksi sinkronisasi yang ditandatangani, antrean ulang saat offline dan idempotensi; statistik tidak boleh dibuat-buat.
5. **V10.48–V10.49:** monitoring/admin hubungan akun, keamanan pemutusan tautan, Multi-Account Linking per anggota, skin/avatar dan informasi profil, serta integrasi Season/Hall of Fame.
