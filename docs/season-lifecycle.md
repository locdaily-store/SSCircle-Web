# Season Management & Timeline

Season dikelola di **Admin Control → Season & Sejarah**. Editor ini memakai
`homeLeaderboardSeasons`, `statSeasonId`, dan `statSeasonActivatedAt` yang sudah ada.
Tidak ada database Season kedua, penghapusan statistik lama, atau reset dunia Minecraft.

## Membuat dan membuka Season

1. Klik **+ Tambah season**, isi nama/tanggal/sampul, lalu klik **Simpan Season**.
   Entri baru dimulai sebagai **Draft / Direncanakan** dan belum dipublikasikan.
2. Jika diperlukan, pilih **Rencana pembukaan** untuk mencatat tanggal dan jam.
   **Catatan:** jadwal ini belum menjalankan aktivasi otomatis. SSCircle berjalan
   di Cloudflare Pages dan belum memiliki scheduler terpisah. Admin harus
   menekan **Mulai Season** ketika waktu pembukaan tiba.
3. Jika jadwal belum tiba tetapi pembukaan tetap diminta, tindakan tersebut
   membutuhkan konfirmasi admin tambahan.
4. Saat **Mulai Season** dikonfirmasi, Worker memastikan tidak ada Season lain
   dengan periode statistik aktif atau status berlangsung. Waktu aktivasi
   berasal dari server, bukan dari browser. Data lama tidak dihapus.

## Menutup Season dengan snapshot akhir

1. Biarkan plugin Player Sync mengirim data terbaru. Periksa terakhir sinkron
   pada **Periksa snapshot akhir**. Snapshot hanya mencakup data yang telah
   berhasil diterima D1, tidak membaca statistik langsung dari RAM Paper.
2. Klik **Persiapkan penutupan**. Persiapan disimpan dengan waktu server.
3. Periksa pratinjau leaderboard, jumlah pemain, total playtime, deaths,
   mob kills, blocks mined, dan kandidat Hall of Fame.
4. Pilih apakah tiga penghargaan dari statistik yang memenuhi syarat akan
   ditambahkan otomatis. Penghargaan dengan kategori yang sudah ada tidak
   diduplikasi, dan penghargaan manual dipertahankan.
5. Klik **Akhiri Season**, lalu konfirmasi. Server menyalin snapshot dan
   leaderboard ke arsip, mengunci hasil akhir, mencatat timestamp penutupan,
   menonaktifkan periode statistik Season dan menambahkan milestone penutupan.
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
- Tidak ada sinkronisasi paksa otomatis ke plugin sebelum menutup Season.
  Pastikan antrean Player Sync normal dan catat waktu lastSyncedAt.
- Mengakhiri Season website **tidak** mereset world, inventory, achievement
  Minecraft in-game, atau membuka Season secara otomatis pada jam tertentu.
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
