# Pengaturan Voting dan Event Komunitas

Rilis website **10.55.4**, melanjutkan Community Events & Achievements.

## Admin Control → Voting

- **Mode global**: jumlah token yang sama untuk semua pertanyaan.
- **Mode per pertanyaan**: masing-masing pertanyaan memiliki batas token tersendiri.
- Batas token **1 sampai 20**. Satu anggota yang statusnya Diterima mendapatkan jatah terpisah pada setiap pertanyaan.
- Satu token hanya boleh dipakai sekali dan **setiap token wajib memilih pilihan berbeda**. Tidak ada opsi untuk menggandakan suara pada jawaban yang sama.
- Jumlah pilihan minimal sama dengan jumlah token efektif ketika voting aktif.
- Suara lama dipertahankan. Mengurangi jumlah token di bawah suara yang sudah dipakai memerlukan **Reset Voting** melalui Admin Control. Perubahan jumlah token tidak otomatis menghapus rekam voting.
- Pengecekan token, validitas opsi, keanggotaan, dan duplikasi terjadi secara atomik di SQL D1, bukan sekadar validasi frontend.

## Admin Control → Event & Jadwal → Formulir pengajuan

Pengaturan dipisahkan dari daftar jadwal lama. Panel pengajuan event dapat:
- Mengaktifkan atau menutup pengajuan anggota.
- Mengubah jumlah maksimal pengajuan pending per anggota (**1–10**).
- Mengubah kapasitas peserta bawaan (**1–500**).
- Mengubah waktu minimum sebelum event (**1–168 jam**).
- Mengubah jumlah maksimum hadiah Juara (**1–20**).
- Mengubah label, placeholder, kolom wajib, urutan, dan jenis setiap pertanyaan.
- Menambahkan pertanyaan baru dari tipe **teks, paragraf, angka, tanggal, dropdown** dan menyusun dengan tombol atau drag & drop.
- Menghapus pertanyaan tidak esensial, serta memulihkan kolom pelaksana, teknis, dan hadiah melalui tombol preset.

**Nama event dan tanggal mulai** selalu wajib agar pengajuan dapat menjadi kegiatan pada kalender. Jumlah pertanyaan total dibatasi 2–20, opsi dropdown 2–15 tanpa duplikat. Form member mengikuti pengaturan tersimpan secara langsung. Perubahan daftar pertanyaan tidak menghapus jawaban pengajuan lama karena setiap pengajuan menyimpan **snapshot pertanyaan serta jawaban** pada tabel sendiri.

Pengaturan disimpan di D1, dengan revisi agar dua Admin tidak saling menimpa tanpa peringatan. Hanya akun yang berstatus Diterima dan menggunakan sesi password Dashboard yang dapat mengirim event. Pengajuan tetap berstatus pending sampai disetujui Admin.

## Admin Control → Pusat Notifikasi

Setiap pengumuman memiliki pilihan:
- **Arsipkan**: tetap tercatat di riwayat Admin tetapi tidak lagi ditampilkan ke anggota.
- **Hapus permanen**: menghapus pengumuman dan data penerimaan atau status baca terkait.
- **Hapus seluruh arsip**: menghapus maksimal 200 item arsip per operasi. Jalankan lagi jika arsip masih tersisa. Pengumuman aktif tidak terkena operasi ini.

Setiap penghapusan membutuhkan konfirmasi. Tidak ada pemulihan otomatis setelah penghapusan permanen; lakukan backup D1 terlebih dahulu.

## Profile → Pengaturan Akun

Panel riwayat keamanan dihapus dari tampilan agar halaman lebih rapi, termasuk tombol refresh dan request dari frontend. **Riwayat keamanan tetap disimpan pada backend** untuk keperluan audit dan keamanan, bukan ikut dihapus. Keterangan "Tidak mendukung HTML." di Pengaturan Profil juga dihilangkan; sanitasi isi tetap dilakukan pada server.

## Nama file dan organisasi kode

Semua file komunitas berikut tidak lagi memakai akhiran nomor versi:

- \`community-events.js\`
- \`community-events-admin.js\`
- \`community-events.css\`
- \`community-achievements.js\`
- \`community-season-hall.js\`

Referensi dalam halaman Event, Admin Control, Profile, dan Season Archive sudah diperbarui. Versi cache-busting pada parameter URL tetap dipakai agar perangkat menerima file terbaru, bukan file JavaScript lama dari cache.

## Cloudflare / database

- Website 10.55.4. Plugin SSCircle Player Sync 10.54.6 dan SSCircle Skin Bridge 10.49.1.4 **tidak berubah**.
- Tabel pengaturan dan snapshot formulir dibuat secara idempoten oleh Worker saat endpoint digunakan. Tidak ada reset akun, pairing, atau data statistik.
- Backup D1 sebelum deploy, upload ZIP Cloudflare Pages Direct Upload dan pertahankan binding, variabel lingkungan, serta secrets lama.
- Pengujian termasuk voting token global/per pertanyaan, jawaban unik, voting lawas, form builder, izin member, hadiah, dan penghapusan pengumuman.

## Batasan yang masih berlaku

Pendaftaran event belum memiliki waitlist atau pembatalan mandiri. Self-check-in via Minecraft belum tersedia. Hadiah tidak otomatis memberikan item atau rank in-game. Data pencapaian pada Profile masih menggunakan evaluasi progres dari snapshot statistik yang sudah tersinkron, bukan melakukan pekerjaan periodik tambahan pada thread Paper.
