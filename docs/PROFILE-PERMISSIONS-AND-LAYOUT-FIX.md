# Perbaikan izin profil dan pengaturan kartu sosial

## Perubahan

- Admin Control > Kelola Pemain > Profile Settings kini memiliki dua izin terpisah:
  - **Izinkan profil ditemukan sesama anggota**: mengaktifkan visibilitas `members` di pencarian dan daftar anggota.
  - **Izinkan opsi profil publik**: mengaktifkan opsi `public`. API sosial masih memerlukan status Diterima dan sesi password, sehingga opsi ini **tidak** membuka direktori anonim.
- Pilihan **Pribadi** selalu tersedia. Semua profil tetap Pribadi secara default; admin tidak dapat otomatis membagikan profil anggota.
- Jika sebuah izin dimatikan, profil yang memakai izin tersebut tidak muncul dalam pencarian sampai diaktifkan kembali. Pertemanan yang sudah disetujui tetap memberi akses kepada kedua teman, sesuai perilaku sebelumnya.
- API profil menolak upaya baru memilih visibilitas yang tidak diizinkan. Tab Admin Control lama yang tidak mengirim `allowMembers` tetap mempertahankan pengaturan yang sudah tersimpan.
- Kartu **Member Directory & Manage Friends** dapat diatur melalui Profile Studio, termasuk tombol tampil/sembunyikan, geser posisi dan live preview.
- Konfigurasi tata letak Profile lama yang terdiri dari 7 kartu dipertahankan urutannya, lalu kartu sosial disisipkan tepat sebelum Jelajahi komunitas. Setting lama tidak di-reset.
- Nomor versi runtime Cloudflare, package pengembangan, test readiness, dan ZIP cepat sudah diselaraskan ke 10.51.2.
- Tidak ada perubahan JAR, pairing secret, kode Minecraft, ataupun statistik tersimpan.

## Migrasi D1

Worker menambahkan kolom `member_policy.allow_members INTEGER NOT NULL DEFAULT 1` dengan `PRAGMA table_info` dan `ALTER TABLE` hanya jika belum ada. Ini migrasi aditif: tidak ada DROP, TRUNCATE, atau penimpaan profil, pertemanan, token, maupun statistik. Pengaturan `allow_public` yang lama tetap dipertahankan.

Sebelum mengunggah versi ini ke **Cloudflare produksi**, lakukan backup D1 dan uji pada staging dengan salinan database. Jangan pernah mengganti binding DB, SESSION_SECRET, atau kredensial pairing hanya untuk pembaruan ini.

## Pengujian wajib

1. Dengan `allowMembers=true`, `allowPublic=false`, pilih **Anggota** di Profile. Profil harus muncul di direktori untuk anggota Diterima yang login password; opsi **Publik** tidak dapat dipilih.
2. Dengan `allowMembers=false`, member baru dan lama bertipe Anggota tidak dapat dicari pihak lain, tetapi setting Pribadi masih bisa dipilih. Kembalikan true dan pastikan anggota yang sebelumnya mengizinkan kembali muncul.
3. Dengan `allowMembers=false` dan `allowPublic=true`, periksa hanya profil yang sengaja memilih Publik yang bisa ditemukan oleh anggota lain. Pendaftar Pending/Rejected dan pengunjung anonim tetap tidak boleh membuka API sosial.
4. Cek perubahan izin tidak memutuskan hubungan pertemanan atau membuka kode login. Dua teman yang disetujui masih dapat melihat profil satu sama lain.
5. Uji urutan 7 kartu lama setelah migrasi, perubahan posisi kartu sosial, tombol show/hide serta preview HP/desktop di Profile Studio. Periksa kartu Security tidak bisa disembunyikan.
6. Uji halaman Profile, Mail Box, Minecraft Sync, dan /api/health. Bandingkan versi yang ter-deploy dan lakukan pengujian langsung pada Cloudflare D1 staging.
7. Jalankan seluruh GitHub Actions pada commit yang hendak di-merge. Gunakan ZIP Cloudflare dari run yang berhasil dan jangan gunakan arsip source repository.

## PR lama

- PR #43 adalah implementasi Multi-Account Linking alternatif dengan tabel dan jalur migrasi berbeda dari yang sudah ada di main melalui #44. Tidak boleh di-merge begitu saja.
- PR #51 adalah implementasi sosial alternatif yang menggunakan skema `member_friend_connections`, berbeda dengan `member_friendships` pada main #52 dan #53. Perbaikan Profile Studio lama yang masih berguna dipindahkan ke perubahan ini, tanpa memperkenalkan dua sumber data pertemanan.
- Setelah validasi rilis baru, dua PR tersebut dapat ditutup sebagai superseded sambil mempertahankan arsip kode/komentar PR.
