# Cara menggunakan SSCircle Voice

## Minecraft Java
1. Pasang Simple Voice Chat versi client yang kompatibel dengan server dan versi Minecraft-mu.
2. Masuk server dan periksa pengaturan mikrofon Simple Voice Chat.
3. Bicara langsung kepada pemain dekatmu. Tidak perlu membuka SSCircle Voice untuk Java.

## Minecraft Bedrock
1. Masuk SSCircle melalui Geyser/Floodgate, selesaikan autentikasi sebagaimana aturan server.
2. Di chat Minecraft ketik `/voice link`. Catat kode delapan karakter yang berlaku dua menit.
3. Di browser desktop/HP buka halaman **SSCircle Voice** dan masukkan kodenya.
4. Setelah nama dan avatar Minecraft muncul, tekan **Aktifkan mikrofon** dan beri izin browser.
5. Pilih **Voice Activation** jika ingin mencoba tetap berbicara saat berpindah ke Minecraft. **Push-to-Talk** hanya bisa ditekan selama halaman Voice sedang aktif.
6. Gunakan **Mute**, **Deafen**, **Whisper**, **Group**, dan kontrol volume sesuai kebutuhan.
7. Biarkan tab Voice terbuka saat berpindah aplikasi. Jika koneksi atau mikrofon dihentikan OS, kembali ke tab Voice dan tekan **Pulihkan Voice**. Bila browser meminta izin lagi, izinkan mikrofon.
8. Tekan **Disconnect** jika selesai. Jika token habis, gunakan `/voice link` untuk kode baru.

### Indikator mikrofon pemain Bedrock (v0.2.4)

Jika sudah menjalankan `/voice link` dan benar-benar **terhubung ke Voice SSCircle** lewat aplikasi Android/iOS atau website, ikon status pemain Bedrock di samping nama pada **client Java yang memasang Simple Voice Chat** akan mengikuti koneksi aktif. SSCircle Cross Voice memakai API bawaan Simple Voice Chat `VoicechatConnection.setConnected(true)`. Tidak ada mod tambahan pada client Java selama SVC mendukung indikator tersebut.

Penting: indikator berubah hanya setelah websocket audio berstatus aktif, **bukan** saat kode pairing sekadar dibuat atau diterima. Saat disconnect, keluar server, atau gateway kehilangan koneksi, ikon kembali ke status standar. Warna/bentuk ikon ditentukan oleh versi dan konfigurasi client Simple Voice Chat; ini bukan tanda berbicara real-time dan tidak mengubah ikon Bedrock UI secara langsung.

### Saat berpindah aplikasi atau layar dikunci

- Halaman tidak lagi sengaja menutup WebSocket/mikrofon saat masuk latar belakang. Saat kembali, halaman mencoba reconnect WebSocket dan melanjutkan AudioContext; jika mikrofon dimatikan OS, tekan **Pulihkan Voice** untuk mengaktifkannya kembali.
- **Android/iOS membatasi proses latar belakang.** Tidak ada JavaScript/PWA yang dapat menjamin mikrofon dan speaker terus berjalan bila sistem menghentikan atau membekukan browser. Kunci layar, mode hemat baterai, berpindah browser, dan menutup tab dapat memutus suara.
- Gunakan **Voice Activation** untuk percakapan tanpa menahan tombol. PTT dinonaktifkan ketika halaman kehilangan fokus agar suara tidak terkirim tanpa disengaja.
- Biarkan browser tetap terbuka. Memasang situs sebagai PWA dapat memudahkan akses, tetapi **tidak menghapus kebijakan latar belakang**.
- Token sesi sementara hanya disimpan di memori halaman. Jika browser dimatikan, sesi habis, atau halaman dimuat ulang, gunakan `/voice link` lagi.
- Jika OS tetap menghentikan audio ketika Minecraft aktif, **gunakan perangkat kedua** untuk website Voice. Minecraft Bedrock vanilla tidak mengizinkan website mengakses mikrofon in-game.

## English quick guide
Java users install Simple Voice Chat on their game client. Bedrock users run `/voice link` in Minecraft, enter the eight-character code on SSCircle Voice, grant microphone access and use Push-to-Talk or Voice Activation. Use Voice Activation for background use. The website keeps the session and retries on resume, and the Restore Voice button recovers microphone/audio when supported. Browser audio running in the background is not guaranteed on iOS or Android.
