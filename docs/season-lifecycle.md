# Season Management & Timeline

Season dikelola di **Admin Control → Season & Sejarah**. Editor ini memakai
`homeLeaderboardSeasons`, `statSeasonId`, dan `statSeasonActivatedAt` yang sudah ada.
Tidak ada database Season kedua, penghapusan statistik lama, atau reset dunia Minecraft.

## Membuat dan membuka Season

1. Klik **+ Tambah season**, isi nama/tanggal/sampul, lalu klik **Simpan Season**.
   Entri baru dimulai sebagai **Draft / Direncanakan** dan belum dipublikasikan.
2. Jika diperlukan, pilih **Rencana pembukaan** untuk mencatat tanggal dan jam.
   Centang **Buka Season otomatis** hanya jika Cloudflare Cron Worker sudah
   dipasang dan secret-nya cocok. Jika tidak, jadwal adalah pengingat manual.
   Cron memeriksa tiap menit walaupun tidak ada pengunjung website.
3. Jika jadwal belum tiba tetapi pembukaan tetap diminta, tindakan tersebut
   membutuhkan konfirmasi admin tambahan.
4. Saat **Mulai Season** dikonfirmasi, Worker memastikan tidak ada Season lain
   dengan periode statistik aktif atau status berlangsung. Waktu aktivasi
   berasal dari server, bukan dari browser. Data lama tidak dihapus.

## Menutup Season dengan snapshot akhir

1. Pastikan Player Sync aktif, heartbeat segar di Minecraft Sync, dan server
   Minecraft tersambung. Data final berasal dari D1, bukan RAM Paper.
2. Klik **Persiapkan penutupan**. Worker mengirim perintah `sync_now`
   melalui heartbeat Paper yang ditandatangani. Tunggu plugin membaca data
   dengan batas per-tick dan mengosongkan antrean, tanpa pemindaian blocking.
3. Periksa pratinjau leaderboard, jumlah pemain, total playtime, deaths,
   mob kills, blocks mined, dan kandidat Hall of Fame.
4. Pilih apakah tiga penghargaan dari statistik yang memenuhi syarat akan
   ditambahkan otomatis. Penghargaan dengan kategori yang sudah ada tidak
   diduplikasi, dan penghargaan manual dipertahankan.
5. Klik **Periksa snapshot akhir** sampai tertulis **SIAP**. Worker mewajibkan
   laporan plugin terbaru, bukti perintah sinkronisasi diterima, `pendingCount=0`,
   `captureBacklog=0`, dan status pengiriman sehat. Jika perintah kedaluwarsa,
   klik **Minta ulang sinkronisasi akhir**.
6. Klik **Akhiri Season**, lalu konfirmasi. Worker mengambil snapshot
   terbaru dari tabel `minecraft_account_stat_progress`, menggabungkan
   segmen akun yang sudah dilepas dari `minecraft_account_stat_archive`,
   lalu memakai `player_stat_snapshots` lama hanya sebagai fallback bagi
   anggota yang belum punya data baru. Hasil diarsipkan dan periode dinonaktifkan.
6. Jika belum ada statistik, admin harus mengizinkan penutupan tanpa snapshot
   secara eksplisit. Data leaderboard manual tidak dihapus saat snapshot kosong.

## Season lama

Entri lama yang memiliki status *Sedang berlangsung* tetapi tidak terhubung
ke periode statistik bisa memakai **Arsipkan Season lama**. Tindakan ini
mempertahankan leaderboard manual dan tidak membuat statistik palsu.

## Beberapa Leaderboard dalam satu Season

- Buka **Admin Control → Season & Sejarah**, pilih Season, kemudian bagian
  **Prestasi & pemain → Leaderboard Season**.
- Klik **+ Tambah leaderboard**, isi **Judul leaderboard**, lalu di dalam
  leaderboard tersebut klik **+ Tambah pemain** untuk memasukkan nama dan skor.
- Satu Season mendukung maksimal **8 leaderboard**, masing-masing maksimal
  **20 pemain**. Setiap leaderboard memiliki judul serta isi yang terpisah.
- Papan pertama tetap tersinkron dengan `season.entries` untuk kompatibilitas
  kartu leaderboard Homepage yang sudah ada. Data lama otomatis dibaca sebagai
  papan pertama, tanpa menggandakannya di arsip.
- Ketika Season ditutup dengan snapshot, peringkat dari statistik Minecraft
  masuk ke papan pertama. Papan final tersebut terkunci dari pengeditan pemain,
  sedangkan papan tambahan masih dapat dibuat untuk kategori prestasi manual.
- **Publikasikan season ini** menentukan apakah seluruh leaderboard dapat
  dilihat pengunjung melalui halaman arsip.

### Memilih leaderboard utama untuk Homepage

- Di **Season & Sejarah → Prestasi & pemain → Leaderboard Season**, pilih
  **Leaderboard utama di Homepage** pada Season yang bersangkutan.
- Homepage tetap menampilkan slider per Season. Papan peringkat yang dipilih
  akan langsung muncul ketika slide Season tersebut dibuka, beserta judul
  kategorinya. Setiap Season boleh memiliki pilihan yang berbeda.
- Papan pertama tetap menjadi referensi snapshot statistik resmi dan
  `season.entries` lama; pilihan Homepage **tidak mengubah** snapshot itu.
- Jika papan pilihan dihapus, sistem memilih papan pertama yang masih ada.
- **Atur Homepage** menampilkan ringkasan kategori dan tautan ke editor
  Season & Sejarah, bukan menyimpan editor leaderboard kedua.
- Data arsip Draft yang belum dipublikasikan tetap tidak dibuka ke publik;
  hanya kategori yang memang dipilih sebagai tampilan Homepage yang
  dikirim untuk slider Homepage.

### Membuka detail Season dari kartu arsip

- Pengunjung dapat menekan seluruh kartu Season Archive. Tombol Enter/Space
  juga membuka pop-up, sedangkan Escape, tombol Tutup, atau area backdrop
  menutupnya.
- Pop-up menampilkan ringkasan Season, foto sampul, milestone timeline,
  kenangan, bangunan, penghargaan dan semua papan leaderboard berjudul.
- Gambar memakai skala **contain** atau dimensi alami. Rasio panorama,
  persegi, potret hingga tangkapan layar tinggi tidak dipotong; pada kartu
  sampul mungkin muncul ruang kosong di sekitar gambar untuk menjaga
  keseluruhan fotonya terlihat.
- Konten pop-up dapat digulir pada layar HP dan fokus keyboard dikembalikan
  ke kartu sesudah pop-up ditutup.

## Mencari anggota penerima penghargaan

- Di bagian **Penghargaan** gunakan kolom pencarian anggota.
- Pencarian menerima nama tampilan, username Minecraft yang sudah tertaut,
  ID anggota penuh, atau sebagian ID.
- Hasil menampilkan nama/username dan ID singkat untuk membedakan anggota
  bernama mirip. Pencarian hanya mengambil data yang boleh diakses Admin.
- Klik nama anggota agar `memberId` penghargaan ditautkan ke Profile.
  Gunakan **Lepas tautan anggota** jika penghargaan hanya untuk arsip publik.
- Data anggota diambil saat pencarian digunakan, bukan otomatis saat halaman
  dibuka. Penghargaan yang sebelumnya sudah memiliki penerima tetap terpilih.

## Timeline dan publikasi

- Tambah maksimal 24 milestone per Season, dengan tanggal, judul,
  penjelasan, dan jenis (umum, event, pembangunan, penghargaan).
- Milestone pembukaan/penutupan otomatis dicatat satu kali.
- **Publikasikan season ini** mengatur tampil/tidaknya entri; **Tampilkan
  Season Archive** mengatur akses halaman publik secara keseluruhan.
- Season berstatus Draft tidak otomatis dipublikasikan.
- Setelah Season ditutup, snapshot akhir dan leaderboard dilindungi dari
  pengeditan melalui form biasa. Konten sejarah/kenangan tetap dapat ditambah.

## Keamanan dan keterbatasan

- API `/api/admin/seasons/lifecycle` memerlukan autentikasi Admin Control.
- Semua mutasi menggunakan revision compare-and-swap untuk mencegah
  overwrite perubahan admin lain; ada batas request.
- Penutupan kini meminta sinkronisasi Paper secara otomatis dan **gagal tertutup**
  bila heartbeat, antrean, atau hasil sinkronisasi tidak sehat. Tidak ada
  bypass paksa dalam alur penutupan statistik biasa. Data mentah Minecraft
  tetap tidak direset.
- Ini adalah penguncian berdasarkan data yang berhasil diterima D1, bukan
  transaksi atomik lintas Paper dan Cloudflare. Hindari aktivitas besar saat
  detik akhir penutupan dan cek angka pratinjau sebelum mengonfirmasi.
- Mengakhiri Season website **tidak** mereset world, inventory, ataupun
  achievement Minecraft in-game. Pembukaan otomatis memerlukan Cron Worker
  terpisah dan konfigurasi secret Cloudflare yang dijelaskan di bawah.
- Percobaan membuka ulang Season yang sudah diarsipkan ditolak.
- Sebelum dipakai produksi, verifikasi pada staging dengan data D1 yang
  representatif, kemudian uji koneksi Paper serta pengiriman statistik.

## Urutan pengujian

1. Jalankan `npm test`, tes browser/layout, dan build Paper lewat CI.
2. Buat Season percobaan sebagai Draft, lalu simpan.
3. Mulai Season, kirim satu statistik uji yang sah, dan verifikasi snapshot.
4. Persiapkan dan akhiri Season. Pastikan hadiah tidak ganda, arsip tetap
   tersedia, dan periode statistik lama tidak aktif.
5. Buat Season baru, mulai, lalu pastikan catatan sepanjang masa serta
   riwayat Season sebelumnya tetap dapat diakses.

## Mengaktifkan pembukaan otomatis di Cloudflare (satu kali)

Cloudflare Pages menggunakan `_worker.js` dan **tidak** menjalankan Cron
Trigger sendiri. PR ini menyertakan *Worker kedua* di
`cloudflare/season-scheduler/`, bukan JavaScript yang berjalan saat pengunjung
membuka website. Langkah berikut dilakukan setelah menguji staging:

1. Buka **Cloudflare Dashboard → Workers & Pages → Pages → SSCircle**.
   Pada **Settings → Variables and Secrets → Production**, buat secret
   **`SEASON_CRON_TOKEN`** (Type **Secret**) berisi nilai acak minimal 32
   karakter. Contoh menghasilkan token secara lokal:
   `openssl rand -hex 32`. Jangan unggah nilai token ke GitHub.
2. Edit `cloudflare/season-scheduler/wrangler.toml`: isi
   `SSCIRCLE_SITE_URL` dengan origin HTTPS domain Pages **produksi** yang
   sama dengan website. Jangan sertakan path atau slash tambahan.
3. Dari root repo yang terbaru, jalankan
   `npx wrangler secret put SEASON_CRON_TOKEN --config cloudflare/season-scheduler/wrangler.toml`
   dan masukkan **nilai sama persis** dengan Pages secret pada langkah 1.
   CLI mungkin akan menawarkan untuk membuat Worker terlebih dahulu.
4. Jalankan
   `npx wrangler deploy --config cloudflare/season-scheduler/wrangler.toml`.
   Pastikan Cron Trigger `* * * * *` sudah terlihat di Worker
   `sscircle-season-scheduler` pada dashboard. Worker berjalan tiap menit;
   waktu eksekusi dapat meleset sedikit dari menit jadwal.
5. Di Admin Control → Season & Sejarah, simpan rencana pembukaan dan centang
   **Buka Season otomatis**. Sebelum konfigurasi secret langkah 1, backend
   menolak pilihan otomatis dengan pesan jelas. Jika ada Season aktif atau
   lebih dari satu jadwal yang bersamaan, Cron tidak mengaktifkan Season baru
   sampai konflik diselesaikan admin.
6. Uji pada **staging**, menggunakan domain dan database staging terpisah
   (serta secret yang berbeda), sebelum menghubungkan scheduler produksi.
   Cek log Worker dan status Season setelah menit jadwal.

Jangan memasang scheduler kedua dengan domain database produksi yang sama.
Kode endpoint `/api/internal/seasons/tick` menerima POST ber-token saja;
browser biasa tidak dapat menyalakan Season. Jika secret bocor, ganti di
Pages dan Cron Worker secara bersamaan.

## Pemeriksaan produksi sebelum merge

- Backup D1 sebelum migrasi/deploy; jangan menghapus data Seasons lama.
- Verifikasi koneksi Paper melalui `/sscircle status` dan Admin Control
  **Minecraft Sync**. Heartbeat harus aktif serta antrean dan capture backlog
  turun ke nol setelah perintah sinkronisasi final. Pasang JAR Player Sync
  terbaru dari build PR ini supaya plugin dapat melaporkan status
  `STATS_DISABLED` bila `stats-sync.enabled` dimatikan.
- Uji minimal dua akun Minecraft, termasuk pemain yang memiliki lebih dari
  satu akun tertaut, lalu bandingkan total playtime/deaths/mob kills/blocks mined
  di Profile dengan **Periksa snapshot akhir**.
- Jalankan proses tutup dalam staging; coba putuskan plugin saat persiapan.
  Penutupan harus ditolak, bukan menulis arsip kosong. Pulihkan sambungan,
  ulangi persiapan, lalu periksa snapshot akhir dan leaderboard yang dikunci.
- Buka Season berikutnya dan pastikan `statSeasonId`/aktivasi baru, riwayat
  Season lama tetap terlihat, dan metrik sepanjang masa tetap berlanjut.
- Saat pergantian, sampel pertama per pemain menjadi baseline Season baru.
  Dengan interval sampel plugin, waktu di antara aktivasi dan sampel pertama
  tidak selalu bisa diukur secara presisi. Pertimbangkan pembukaan saat
  aktivitas rendah dan pemicu `/sscircle sync` sesudah pembukaan.

**Batas lingkungan:** Sistem monitoring saat ini masih menyimpan satu
heartbeat status untuk satu instalasi Paper aktif. Beberapa server Minecraft
berbeda yang menulis ke D1 sama membutuhkan protokol barrier **per-server**;
jangan menganggap kombinasi dua server sudah aman untuk penutupan Season.
