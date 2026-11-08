# SSCircle · Melihat Database D1 melalui GitHub

Fitur ini menampilkan **metadata Cloudflare D1 Staging** di halaman GitHub
**Actions → SSCircle · Lihat Database D1 → Run workflow → Summary**.
Collaborator tidak perlu login Cloudflare atau melihat API Token.

## Apa yang bisa dilihat?

- Mode **overview**: nama semua tabel staging dan jumlah tabel.
- Mode **table**: kolom, tipe data, primary key, jumlah baris sebuah tabel.
- Ringkasan agregat aman untuk `submissions` (berdasarkan status) dan
  `minecraft_accounts` (berdasarkan provider), jika tabel tersedia.

**Tidak ada isi baris pribadi, nickname, email, kode aktivasi, password hash,
token login, pesan Mail Box atau backup lengkap** yang dipublikasikan ke GitHub.
Ini disengaja karena repositori dan GitHub Actions dapat terlihat oleh orang
selain collaborator, tergantung pengaturan visibilitas.

## Pengaturan pertama kali (pemilik)

1. Buat D1 *staging* dengan nama `sscircle-staging` di Cloudflare. Jangan
   menggunakan database produksi SSCircle sebagai staging, dan jangan
   mengimpor data pribadi produksi tanpa anonimisasi yang benar.
2. Buka [Settings → Environments](https://github.com/locdaily-store/SSCircle-Web/settings/environments)
   dan buat environment bernama **database-staging**.
3. Pada environment tersebut, tambahkan **Environment secrets**:
   - `CLOUDFLARE_ACCOUNT_ID` = Account ID yang memiliki D1 staging.
   - `CLOUDFLARE_API_TOKEN` = token khusus dengan izin **D1 Read**.
     Token ini untuk inspeksi; jangan gunakan Global API Key atau token
     produksi D1 Edit. Jika sebelumnya memasukkan token D1 Edit pada environment
     ini, sebaiknya ganti dengan D1 Read saja.
4. Jika nama D1 staging berbeda, tambahkan **Environment variable**
   `SSCIRCLE_D1_STAGING_NAME` dengan **nama database**, bukan Database UUID.
   Jika tidak diisi, nama default adalah `sscircle-staging`.
5. Lindungi branch `main` dengan Pull Request wajib + **Require review from
   Code Owners**. Berkas `.github/CODEOWNERS` sudah menetapkan owner untuk
   workflow dan kode inspector. Tanpa mengaktifkan branch protection,
   CODEOWNERS **tidak cukup** untuk mencegah perubahan berbahaya.
6. Jika tersedia pada rencana GitHub, tambahkan *required reviewers* dan
   *deployment branch restrictions* pada environment database-staging.
   Jika reviewer diperlukan, owner perlu menyetujui permintaan akses sebelum
   laporan dibuat.

**Penting:** izin Cloudflare D1 Read dapat berlaku di tingkat akun Cloudflare,
bukan hanya database staging. Untuk memisahkan akses sepenuhnya dari database
produksi, gunakan akun Cloudflare terpisah untuk staging.

## Cara collaborator melihat tabel

1. Buka [Actions SSCircle](https://github.com/locdaily-store/SSCircle-Web/actions).
2. Pilih workflow **SSCircle · Lihat Database D1** di sebelah kiri.
3. Tekan **Run workflow**, pilih branch **main**.
4. Pilih **overview** lalu jalankan.
5. Setelah workflow berhasil, buka run itu dan lihat halaman **Summary**.
6. Untuk memeriksa sebuah tabel, jalankan kembali, pilih mode **table**,
   dan masukkan nama tabel persis dari laporan overview, misalnya
   `minecraft_accounts`.

Collaborator memerlukan izin GitHub yang memadai untuk menjalankan workflow
secara manual. Mereka tidak menerima salinan token.

## Batasan dan troubleshooting

- Fitur **read-only**. Tidak bisa INSERT, UPDATE, DELETE, DROP, maupun
  menjalankan perintah SQL bebas dari GitHub UI.
- Database staging baru biasanya belum memiliki tabel sampai migrasi staging
  dijalankan. Laporan tabel kosong bukan indikasi database produksi terhapus.
- Jika gagal dengan pesan secret tidak tersedia, periksa nama environment:
  **database-staging**, bukan repository-level secret atau environment lain.
- Jika koneksi gagal, periksa Account ID, API Token, izin D1 Read, dan nama DB
  melalui Cloudflare. Log sengaja tidak menampilkan respons mentah dari D1.
- Perubahan skema database sebaiknya dibuat sebagai file migrasi dan PR
  terpisah, diuji staging, lalu diterapkan produksi dengan persetujuan pemilik.
  Sistem migrasi otomatis tersebut **belum** termasuk dalam fitur inspector ini.
- Workflow hanya dapat membaca branch `main`, tidak berjalan otomatis pada
  Pull Request dan tidak menggunakan data kepercayaan dari PR.

GitHub bukan database viewer interaktif untuk isi pribadi. Jika nantinya
collaborator benar-benar perlu mengedit record atau melihat data sensitif,
buat dashboard admin SSCircle dengan login dan role khusus, atau undang ke
Cloudflare D1 secara terkontrol; jangan menampilkan data produksi di Actions.
