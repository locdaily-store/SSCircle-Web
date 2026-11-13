# Announcement & News dan Ringkasan Admin

Pembaruan website 10.55.5, sebelum roadmap Production Readiness & Stability.

## Fitur
- Halaman publik Announcement dengan daftar berita, pencarian, kategori, sorotan, artikel detail, galeri, dan URL artikel.
- Admin Control → Announcement untuk menambah, menyunting, menghapus, menandai sorotan, menjadwalkan penerbitan, serta membuat draft.
- Pengaturan teks header/hero, label, pesan kosong dan aktif/nonaktif halaman.
- Gambar menggunakan SSCircleImagePicker yang sudah ada: upload, sumber media, atau URL HTTPS langsung.
- Live Preview desktop dan HP untuk konten; halaman Announcement masuk pratinjau Warna Website dan pilihan objek warna khusus.
- Ringkasan Admin menjadi dashboard dengan statistik yang berasal dari data sebenarnya, aktivitas terbaru, pintasan, dan status penerbitan.

## API dan keamanan
- GET /api/announcements: hanya artikel terbit yang jadwalnya sudah sampai.
- GET/POST/PUT/DELETE /api/admin/announcements: membutuhkan sesi Admin.
- PUT /api/admin/announcements/settings: pengaturan halaman, dicek menggunakan revision.
- Tabel D1 aditif: site_announcements dan site_announcement_config dibuat secara idempoten.
- Batas maksimum delapan foto galeri per artikel dan validasi URL HTTPS.
- Isi teks berita dirender sebagai teks biasa, bukan HTML yang bisa menjalankan skrip.
- Pengumuman pribadi Mail Box dan Pusat Notifikasi tetap terpisah.

## Pemasangan
1. Backup D1 sebelum memperbarui website.
2. Gunakan ZIP website dari GitHub Actions Periksa dan kemas SSCircle untuk Cloudflare.
3. Unggah melalui Cloudflare Pages Direct Upload, dengan D1 binding dan secrets yang sudah ada.
4. Tes berita draft/publik/terjadwal, pilihan gambar, pratinjau dan warna website.
5. Plugin SSCircle Player Sync dan Skin Bridge tidak berubah, sehingga JAR sebelumnya tetap digunakan.
