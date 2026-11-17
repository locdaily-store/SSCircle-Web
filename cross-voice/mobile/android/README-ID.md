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

## Cara pakai (konfigurasi otomatis)
1. Deploy gateway Cloudflare terbaru dan plugin Paper; gateway harus mendukung `/api/renew` dan halaman SSCircle Pages harus memiliki `/api/voice/mobile-config`.
2. **Admin server** mengatur satu kali `VOICE_PUBLIC_URL` pada Cloudflare Pages dan `VOICE_ORIGIN` pada Worker. Origin harus sama dengan domain website yang benar.
3. Pasang aplikasi SSCircle Voice. **Tidak perlu mengisi alamat gateway atau Origin**; aplikasi membaca keduanya melalui endpoint HTTPS website resmi.
4. Login ke Minecraft Bedrock melalui Geyser/Floodgate, jalankan `/voice link`, dan ketik kode 8 karakter di aplikasi.
5. Tekan **Hubungkan ke Voice**, izinkan mikrofon dan tunggu status terhubung. Lalu buka Minecraft.
6. Tombol Mute, Deafen, Whisper, Group, dan Disconnect berada dalam kartu berwarna gelap yang mengikuti tema halaman SSCircle Voice.
7. Kode pairing dan session token tidak disimpan ke penyimpanan permanen. Sesi kadaluarsa membutuhkan kode baru.

### Domain website bawaan aplikasi
APK Preview saat ini mengenali website staging resmi `https://voice-test.sscircle.pages.dev`. Untuk **domain SSCircle produksi yang berbeda**, admin harus menyetel satu variabel saat build, bukan meminta setiap pemain mengisinya:
```bash
gradle -p cross-voice/mobile/android :app:assembleDebug -PvoiceSiteOrigin=https://DOMAIN-WEBSITE-SSCircle --no-daemon
```
Ganti contoh `DOMAIN-WEBSITE-SSCircle` dengan domain HTTPS website aktual, tanpa trailing path. Setelah domain dibangun ke APK, pembaruan Worker/gateway berikutnya diambil **otomatis** dari `/api/voice/mobile-config`, tanpa membangun ulang aplikasi hanya karena URL Worker berubah. Hindari menebak domain produksi.

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
- Hanya domain HTTPS SSCircle yang sudah ditentukan saat build yang boleh menjadi sumber konfigurasi otomatis. Tidak ada URL manual yang dapat dipakai untuk mengalihkan pengguna ke situs asing.
- Proyek harus diuji secara langsung dengan plugin Paper/SVC pada versi Minecraft target sebelum digunakan di server produksi.
