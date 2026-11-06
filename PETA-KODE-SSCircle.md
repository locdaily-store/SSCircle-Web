# Peta kode SSCircle

Panduan singkat untuk mencari bagian website yang ingin diubah. File website tetap berada di **root repository**, bukan di folder `site/`.

## Halaman HTML

| File | Isi |
| --- | --- |
| `index.html` | Struktur Homepage: header, pembuka, galeri, profil, leaderboard, footer, dan popup. |
| `admin.html` | Struktur Admin Control, sidebar, serta tempat editor pengaturan ditampilkan. |
| `registration.html` | Struktur halaman pendaftaran. |
| `status.html` | Struktur halaman cek status dan kode pendaftar. |
| `voting.html` | Struktur halaman voting yang membutuhkan sesi pendaftar. |
| `voting-preview.html` | Contoh tampilan voting untuk pratinjau warna. |

## JavaScript publik

| File | Isi |
| --- | --- |
| `homepage.js` | Mengisi konten dan mengurutkan bagian Homepage; galeri, profil, leaderboard. |
| `app.js` | Menampilkan dan mengirim formulir pendaftaran. |
| `status.js` | Pemeriksaan kode pendaftaran dan sesi pendaftar. |
| `voting.js` | Memuat pertanyaan voting, mengirim suara, dan menampilkan hasil. |
| `cloudflare-api.js` | Fungsi request ke API SSCircle. |
| `color-theme.js` | Menggunakan pengaturan warna yang sudah disimpan. |
| `social-links.js` | Tautan dan ikon media sosial. |

## JavaScript Admin Control

| File | Isi |
| --- | --- |
| `admin.js` | Login admin, formulir, data pendaftar, dashboard, pengaturan, dan analitik. |
| `homepage-admin.js` | Editor tulisan, gambar, dan konten Homepage. |
| `homepage-builder.js` | Daftar dan susunan kartu Homepage. |
| `vote-admin.js` | Editor soal, pilihan, dan gambar Voting. |
| `color-theme-admin.js` | Editor warna dan gradasi. |
| `image-source-picker.js` | Pemilih Upload, URL, dan media yang sudah tersimpan. |
| `admin-sortable.js` | Drag & drop daftar editor. |
| `admin-notifications.js` | Popup konfirmasi dan pemberitahuan admin. |
| `registration-preview.js` | Pratinjau halaman pendaftaran di editor. |
| `form-insert-rail.js` | Bilah untuk menambah pertanyaan formulir. |
| `spreadsheet.js` | Tampilan tabel serta ekspor data pendaftar. |

## Tampilan dan backend

| File | Isi |
| --- | --- |
| `style.css` | Semua warna, ukuran, posisi, responsivitas, dan animasi dasar. Urutan CSS jangan dibolak-balik tanpa pengujian. |
| `_worker.js` | API, validasi pendaftaran, autentikasi, penyimpanan media, aturan akses dan voting. |
| `_routes.json` | Daftar rute yang diproses Cloudflare Worker. |
| `_headers` | Header HTTP pada Cloudflare Pages. |
| `.github/workflows/validate-and-package.yml` | Pemeriksaan kode dan pembuatan ZIP Cloudflare di GitHub Actions. |
| `.gitignore` | Daftar file lokal dan sensitif yang tidak boleh ikut Git. |

## Cara mencari bagian kode

1. Cari nama bagian di file HTML, misalnya `id="home-profile-dialog"` atau `id="galeri"`.
2. Cari ID atau nama kelas tersebut di file JavaScript dan `style.css`.
3. Gunakan komentar seperti `<!-- Galeri server -->` atau `// Penyimpanan media` untuk pindah ke blok terkait.
4. Ubah pada branch terpisah. Jangan langsung mengganti alur sesi atau `_worker.js` hanya karena sedang mengubah tata letak.
5. Uji sebelum membuat Pull Request. Setelah disetujui, unduh artifact ZIP dari GitHub Actions untuk diunggah ke Cloudflare.

## Catatan penting

- Versi ini hanya merapikan format dan menambahkan komentar. Nomor versi asset `v=10.26.0` tidak diubah supaya perubahan tampilan tidak disalahartikan sebagai fitur baru.
- File JSON tidak diberi komentar karena JSON standar tidak mendukung komentar.
- Comment kode tidak boleh berisi password admin, session secret, token, atau data pribadi pendaftar.
- CSS sengaja tidak dipisahkan menjadi beberapa file agar seluruh referensi lama tetap berfungsi.
