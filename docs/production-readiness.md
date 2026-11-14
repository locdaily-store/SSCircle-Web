# Production Readiness & Stability

Status: **belum dinyatakan siap produksi** sampai semua gate di bawah lulus pada commit yang sama.

## Alur perubahan

1. Audit hanya file dan endpoint terkait laporan masalah.
2. Lakukan perubahan dalam branch, jalankan pengujian unit yang relevan, lalu simpan checkpoint commit.
3. Jalankan seluruh pengujian `validate-and-package`, pengujian browser, kontrak D1 dan build plugin.
4. Pastikan workflow lengkap sukses pada SHA yang akan di-merge. Paket dari workflow cepat **bukan** bukti lolos pemeriksaan lengkap.
5. Merge tanpa force push, ambil paket dari SHA yang lulus, gunakan staging, lalu periksa produksi.

## Gate wajib

- **Security**: autentikasi, otorisasi tiap endpoint, isolasi data member, rate limiting, validasi upload, larangan secret di repository dan artefak.
- **Data**: migrasi D1 aditif, uji upgrade dari snapshot staging, backup dan rencana restore, idempotensi pengajuan, voting dan achievement.
- **Minecraft**: uji Paper 26.3 dan Java 25, kirim ulang antrean setelah restart/timeout, deduplikasi payload, seluruh HTTP/SQLite/file I/O tidak dijalankan pada main thread.
- **UI**: pengujian 320/390/768/1280/1920 px, navigasi aktif, badge publik serta hamburger ketika ditutup, tema dan status halaman dinonaktifkan.
- **Kinerja**: ukur LCP/INP/CLS dan durasi respons Worker/D1 pada perangkat/koneksi yang realistis; catat baseline sebelum optimasi.
- **E2E**: pendaftaran, approval/rejection, notifikasi, pairing, statistik, achievement, voting, event, dan akun tidak berizin.
- **CI**: tes terarah lalu seluruh suite; artefak rilis wajib berasal dari SHA dengan semua pemeriksaan wajib sukses.
- **Operasional**: health check, error logging tanpa data rahasia, alarm antrean sinkronisasi, rollback website dan D1 restore yang teruji.

## Kriteria TPS server

Target server Minecraft ialah TPS stabil mendekati **20.0** dalam pengujian beban yang disepakati. Tidak ada plugin yang dapat menjamin TPS selalu tepat 20.0 pada semua kondisi.

Uji sedikitnya keadaan idle, pemain bergabung/keluar, 20–50 pemain simulasi (jika infrastruktur memungkinkan), sinkronisasi massal, Worker gagal/timeout, dan restart Paper. Rekam TPS (rerata dan p95 MSPT), CPU, heap, GC, panjang antrean, serta timing pekerjaan plugin. Target praktis: p95 MSPT tetap di bawah 50 ms dan tidak ada network I/O blocking di main thread. Kegagalan pengujian berarti optimasi plugin masih diperlukan, **bukan** klaim selesai.

## Catatan gate terakhir sebelum perbaikan

Pada PR #71, workflow lengkap gagal 1 dari 247 tes: nama kunci localStorage pada tes navigasi lama berbeda dari implementasi (`ssc-nav-seen-v1-` vs `sscircle-nav-seen-v1-`). Perbaikan assertion ini mengoreksi kontrak tes, **tidak** sendiri membuktikan fitur bebas bug. Uji browser dan CI lengkap tetap wajib.

## Prosedur staging dan rollback

1. Catat SHA branch, status keempat job GitHub Actions, nama artifact, dan daftar migrasi yang akan diterapkan.
2. Ambil backup D1 dengan metode resmi yang tersedia pada akun Cloudflare dan verifikasi backup dapat dibaca. Jangan menyimpan dump produksi di Git.
3. Terapkan migrasi pada salinan database **staging** terlebih dahulu. Verifikasi jumlah data penting sebelum dan sesudah migrasi, lalu uji login, pendaftaran, voting, Mail Box, dan pairing.
4. Uji paket website pada lingkungan staging yang menggunakan bindings dan secrets terpisah dari produksi. Lakukan pemeriksaan HTTP, sesi, pembatasan akses, dan cache PWA setelah deploy.
5. Lakukan deploy produksi hanya setelah persetujuan dan semua gate lulus. Simpan versi deploy sebelumnya untuk rollback.
6. Jika halaman/API gagal, kembalikan deployment website ke revisi sehat terakhir. **Rollback kode tidak otomatis membatalkan migrasi D1**: jangan melakukan rollback skema destruktif tanpa rencana restore yang telah diuji.
7. Jika plugin Minecraft harus diganti, backup folder konfigurasi dan antrean statistik privat; matikan server secara bersih melalui panel, pasang JAR kompatibel, lalu jalankan kembali dan pantau log, TPS/MSPT, serta progres antrean.
8. Jika sinkronisasi gagal, hentikan perubahan lebih lanjut dan periksa kode status serta antrean sebelum mengulang pengiriman. Jangan hapus `stats-queue.properties` untuk "memperbaiki" keadaan.

## Bukti penerimaan rilis

Rekam hasil per-SHA: tes unit, browser, Java build, pemeriksaan secret, hasil migrasi staging, smoke test deployment, pengukuran TPS/MSPT, dan cara kembali ke versi sehat. Status **siap rilis** hanya boleh diberikan setelah seluruh bukti tersedia. Proses administrasi berbasis dokumen ini tidak menggantikan pengujian nyata.
