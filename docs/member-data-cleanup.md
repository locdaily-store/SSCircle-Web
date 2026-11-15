# Penghapusan data anggota SSCircle

Fitur ini menghapus data website secara permanen, bukan menggantikan ban Paper.

## Prosedur Admin Control

1. Backup Cloudflare D1 terlebih dahulu.
2. Jika pemain sudah diban di Minecraft, ubah status pendaftaran website menjadi **Ditolak**. Ban Minecraft tidak otomatis mengubah status SSCircle.
3. Buka Admin Control → Kelola Pemain → Daftar Anggota. Cari ID/nama anggota dan pilih **Hapus seluruh data anggota**.
4. Periksa pratinjau jumlah akun serta statistik, lanjutkan konfirmasi, lalu ketik kalimat **HAPUS DATA XXXXXXXX** sesuai kode yang ditampilkan.
5. Server memverifikasi sesi admin, status Ditolak dan revisi pengaturan sebelum melakukan transaksi D1. Periksa laporan file R2 jika ada yang gagal dihapus.

## Yang dibersihkan

Pendaftaran dan jawaban, akun Minecraft tertaut, bukti autentikasi, statistik D1 per akun dan riwayatnya, gambar skin, sesi, data sosial, badge, mailbox, dan referensi berkunci ID anggota. Referensi leaderboard/award dengan memberId dibersihkan; suara voting yang terhubung lewat voterKey juga dibersihkan.

**Pengecualian:** Nama yang dulu diketik manual tanpa ID anggota tidak bisa dipastikan kepemilikannya, sehingga perlu diperiksa manual. Rekap agregat Season bukan statistik pribadi dan tetap disimpan. Data world, playerdata, ban list Paper, AuthMe, Discord, backup D1 lama, dan layanan eksternal tidak dihapus oleh aksi website.

Penghapusan tidak menjamin file database fisik langsung mengecil. Lakukan tes staging dengan dua anggota berbeda untuk memeriksa tidak ada data anggota lain yang ikut terhapus.
