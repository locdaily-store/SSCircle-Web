# SSCircle Voice untuk Android (native, PR #74)

Aplikasi Android terpisah dari website SSCircle. Tidak memakai WebView/PWA untuk suara.
Koneksi langsung ke Cloudflare Worker + Durable Object yang sudah dipakai oleh SSCircle Cross Voice.

## Status
- Implementasi sumber Android + workflow build APK debug ada di branch PR #74.
- Tidak ada APK yang dinyatakan lolos sebelum workflow **SSCircle Voice Android APK** sukses.
- Android 8.0+ (API 26), target Android 15 (API 35).
- iPhone tidak bisa menginstal APK; perlu proyek iOS tersendiri.
- Layanan voice background mengikuti batasan Android, tidak menjamin bertahan saat *force stop*, izin mikrofon dicabut, atau proses dibunuh OS.

## Download APK (sesudah build berhasil)
1. Workflow **SSCircle Voice Android APK** mengompilasi kode Android 8.0+ menjadi **APK debug asli**, memverifikasinya sebagai arsip APK, dan mengunggah artifact.
2. Setelah build sukses pada branch PR #74, workflow mencoba menerbitkan prerelease GitHub dengan **nama berkas tetap**: `SSCircle-Voice-Android.apk`.
3. **URL unduh langsung (baru berfungsi setelah rilis berhasil diterbitkan):** https://github.com/locdaily-store/SSCircle-Web/releases/download/sscircle-voice-android-preview/SSCircle-Voice-Android.apk
4. Jika prerelease tidak tersedia, buka https://github.com/locdaily-store/SSCircle-Web/actions/workflows/cross-voice-android.yml → run berhasil → Artifacts → `SSCircle-Voice-Android-APK`; ekstrak ZIP dan pasang `SSCircle-Voice-Android.apk`.
5. APK debug khusus uji; distribusi publik perlu **release signing key** dan uji perangkat. Jangan berbagi APK yang belum dibangun untuk menghindari berkas palsu.

## Tombol unduh pada halaman Voice
Di Cloudflare Pages → SSCircle Web → Settings → Variables and Secrets, setelah APK sudah tersedia, tambahkan:
```
VOICE_ANDROID_APK_URL=https://github.com/locdaily-store/SSCircle-Web/releases/download/sscircle-voice-android-preview/SSCircle-Voice-Android.apk
```
Untuk iOS, **hanya setelah App Store/TestFlight siap**, tambahkan misalnya:
```
VOICE_IOS_APP_URL=https://testflight.apple.com/join/KODE_RESMI_APPLE
```
Ganti `KODE_RESMI_APPLE` dengan kode undangan TestFlight yang benar. **Jangan gunakan contoh ini secara langsung**. Redeploy Pages agar `/voice-config.js` menyajikan dua tautan yang telah divalidasi. Tanpa variabel yang valid, halaman tetap menampilkan dua pilihan, tetapi diarahkan ke daftar build Android dan panduan instalasi iOS, bukan APK/IPA palsu.

## Cara pakai
1. Deploy gateway pada `cross-voice/cloudflare` dan plugin Paper seperti `cross-voice/INSTALL-ID.md`. Gunakan gateway terbaru **yang sudah mendukung POST /api/renew**.
2. Buka aplikasi SSCircle Voice di HP.
3. Masukkan **Gateway Cloudflare**: URL HTTPS Worker, misalnya `https://sscircle-cross-voice.<akun>.workers.dev` (tanpa `/ws`, `/bridge`, atau `/api`).
4. Masukkan **Origin website**: harus SAMA PERSIS dengan `VOICE_ORIGIN` di `cross-voice/cloudflare/wrangler.toml`, misalnya `https://sscircle.example.com`. Ini adalah konfigurasi CORS gateway, **bukan** secret.
5. Login ke server Minecraft Bedrock melalui Geyser/Floodgate, ketik `/voice link`.
6. Masukkan kode 8 karakter dan tekan **Hubungkan & mulai Voice**. Izinkan akses mikrofon saat diminta.
7. Setelah status **Terhubung**, masuk Minecraft. Mikrofon tetap aktif melalui layanan Android dengan notifikasi permanen, saat Android mengizinkan.
8. Kontrol **Mute, Deafen, Whisper, Group** dapat dibuka kembali dari aplikasi. Tombol notifikasi **Putuskan** menghentikan sesi.
9. Bila koneksi gagal dan token habis, lakukan `/voice link` ulang. Alamat gateway/origin disimpan, kode dan token **tidak** disimpan.

## Peringatan penggunaan
- **Jangan** memakai URL HTTP. Semua request menggunakan HTTPS/WSS, TLS normal (tanpa bypass sertifikat).
- Aplikasi tidak meminta secret Bridge Paper. Credential tersebut tidak boleh dimasukkan ke aplikasi.
- Native Android mengirim header Origin yang sesuai nilai VOICE_ORIGIN untuk kompatibilitas gateway. **Origin bukan autentikasi**; pairing satu kali dan bearer session tetap harus divalidasi server.
- Sesi di-*renew* setiap menjelang kedaluwarsa dan token lama dirotasi secara atomik; WebSocket terus aktif.
- Mode Voice Activation (RMS) dipakai karena PTT dari aplikasi lain tidak tersedia saat Minecraft memiliki fokus.
- Suara yang terdengar bercampur lewat mixer stereo dengan pan/jarak sederhana; bukan HRTF penuh.
- Audio PCM mentah 48 kHz dapat memakai bandwidth cukup besar. Uji 2 HP, headset Bluetooth, switching ke Minecraft, layar kunci, panggilan masuk, penghemat baterai, dan 20–50 pengguna secara nyata.
- Pengaturan baterai masing-masing vendor dapat menghentikan layanan meskipun foreground service aktif. Jangan mengklaim 100% kompatibel tanpa pengujian HP nyata.
- Jika perangkat Android tidak mendukung capture/output 48kHz yang dibutuhkan, aplikasi menampilkan kesalahan perangkat audio.

## Build sendiri
Perlu JDK 17, Android SDK 35, Gradle 8.11.1, dan internet untuk dependensi:
```bash
gradle -p cross-voice/mobile/android :app:assembleDebug --no-daemon
```
APK ada di `cross-voice/mobile/android/app/build/outputs/apk/debug/app-debug.apk`.
Buka folder `cross-voice/mobile/android` sebagai proyek di Android Studio jika perlu menandatangani release.

## Kompatibilitas dan privasi
- Endpoint gateway: `/api/pair`, `/api/ticket`, `/api/renew`, `/api/disconnect`, `/ws`.
- Format audio kompatibel dengan `voice.js`: PCM16 LE, mono, 48 kHz, 960 sample/20 ms, base64, batch 3 frame.
- Ada notifikasi ongoing yang bisa menghentikan mikrofon, izin mikrofon, mode voice activation, reconnect bertahap, dan wakelock terbatas.
- Aplikasi tidak menyimpan rekaman, pairing code, maupun bearer token di penyimpanan permanen.
- Proyek harus diuji secara langsung dengan plugin Paper/SVC pada versi Minecraft target sebelum digunakan di server produksi.
