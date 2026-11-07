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

## Rilis 3: Minecraft Account Linking
Buat:
- `minecraft_accounts`: `member_id`, `provider`, `verified_external_id`, `display_name`, `linked_at`, `last_verified_at`; unique(provider, verified_external_id).
- `minecraft_link_challenges`: random secret hash, `member_id`, `expires_at`, `used_at`, `attempt_count`; jangka pendek + sekali pakai.
- API terautentikasi: create/revoke challenge, finish challenge (hanya dari server), get linked identity, unlink with reauthentication.
- Perintah Minecraft `/sscircle link <code>` hanya setelah auth plugin mengonfirmasi pemain sudah login.
- Aturan collision: satu identitas Minecraft tidak boleh diklaim beberapa anggota tanpa prosedur transfer yang aman.

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
