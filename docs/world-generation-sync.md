# World baru, restore backup, dan Season SSCircle

SSCircle menyimpan riwayat website secara terpisah dari folder world Minecraft.

Plugin Player Sync terbaru mengirim penanda worldEpoch yang berasal dari UUID world utama Paper dan nilai stats-sync.world-generation pada config.yml. Penanda ikut tersimpan di antrean disk dan dibaca D1, termasuk saat terjadi retry.

World baru yang mendapat UUID baru otomatis mempunyai generasi baru. Jika memulihkan backup dengan uid.dat yang sama, ubah pengaturan stats-sync.world-generation (contoh season-7-reset-2) sebelum restart Paper. Gunakan huruf, angka, garis bawah atau tanda minus, maksimal 32 karakter.

Jika penanda berubah, sampel pertama dari world baru menjadi baseline alih-alih menjumlah ulang angka dari backup. Aktivasi Season juga meminta sync_now melalui heartbeat Paper. Pemindaian statistik tetap dilakukan bertahap demi TPS.

## Urutan

1. Akhiri Season lama setelah sinkronisasi final terverifikasi.
2. Shutdown Paper dan backup world, plugin, serta database D1.
3. Ganti world. Naikkan world-generation jika memakai backup dengan UUID world lama.
4. Pertahankan data akun AuthMe dan konfigurasi pairing SSCircle, kecuali migrasi telah direncanakan.
5. Restart Paper, cek /sscircle status, mulai Season baru dan jalankan /sscircle sync jika perlu.
6. Verifikasi statistik Season baru dan arsip lama sebelum pemain bermain ramai.

Ini tidak otomatis mengubah world, inventori, playerdata atau advancement. Pembacaan pertama setelah aktivasi Season adalah baseline; aktivitas sebelum capture pertama tidak selalu dapat dihitung tepat. Tes di staging terlebih dahulu.
