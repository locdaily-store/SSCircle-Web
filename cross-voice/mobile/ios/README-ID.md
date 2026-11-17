# SSCircle Voice untuk iPhone / iPad (native, PR #74)

Proyek native SwiftUI + AVAudioEngine. Berbeda dari website/PWA, audio menggunakan `AVAudioSession.playAndRecord` dengan `UIBackgroundModes=audio` untuk mencoba mempertahankan komunikasi saat Minecraft dibuka atau layar dikunci.

## Status dan persyaratan
- iOS 16 atau lebih baru.
- PR #74 menyertakan source iOS dan workflow **SSCircle Voice iOS Compile** (build simulator tanpa penandatanganan).
- **Tidak ada IPA yang bisa langsung diinstal ke iPhone tanpa code signing Apple**. Untuk memasang pada perangkat, dibutuhkan macOS + Xcode + akun Apple Developer/personal team, atau distribusi TestFlight melalui akun pengembang.
- Interupsi audio Minecraft, telepon, Siri, AirPods/Bluetooth, serta pembatasan iOS tetap harus diuji pada iPhone sungguhan.
- Bukan layanan telepon CallKit, dan tidak memakai trik background task untuk menyembunyikan rekaman.

## Build dan instalasi
1. Pada Mac dengan Xcode, pasang XcodeGen (`brew install xcodegen`).
2. Dari folder `cross-voice/mobile/ios`, jalankan `xcodegen generate --spec project.yml`.
3. Buka `SSCircleVoice.xcodeproj`, pilih target `SSCircleVoice`.
4. Pada tab **Signing & Capabilities**, pilih Team Apple milik sendiri serta Bundle ID yang unik.
5. Pastikan capability **Background Modes → Audio, AirPlay, and Picture in Picture** aktif (sumber Info.plist sudah berisi `UIBackgroundModes=audio`).
6. Pilih iPhone/iPad sebagai run destination dan tekan Run. Beri izin mikrofon.
7. Untuk distribusi umum, buat Archive + TestFlight/App Store menggunakan kredensial Apple yang sah.

## Pemakaian
1. Cloudflare Worker dan Paper plugin harus sudah berjalan dan memakai gateway terbaru yang menyediakan `/api/renew`.
2. Masukkan URL gateway HTTPS dan origin website yang identik dengan `VOICE_ORIGIN` di Worker.
3. Masuk Minecraft Bedrock, jalankan `/voice link` lalu isikan 8 karakter kode ke aplikasi.
4. Tekan **Hubungkan & aktifkan mikrofon**, izinkan akses mic, dan tunggu status terhubung.
5. Buka Minecraft dan uji suara Java↔Bedrock / Bedrock↔Bedrock sambil aplikasi berada di background.
6. Gunakan Mute, Deafen, Whisper, Group dan Putuskan Voice melalui aplikasi.

## Implementasi
- Audio input menggunakan AVAudioEngine mic tap + AVAudioConverter menuju PCM16 LE mono 48kHz.
- Audio output menggunakan AVAudioPlayerNode per sumber untuk mixing, volume attenuation dan pan.
- Input Voice Activation, 960 sample/20ms, batch 3 frame; sesuai dengan Worker PR #74.
- Reconnect WebSocket, pairing satu kali, token bearer 15 menit yang diperbarui secara otomatis sebelum habis.
- Token/kode pairing hanya berada dalam memori, URL publik disimpan dengan AppStorage.
- `AVAudioSession.playAndRecord` mode voiceChat, `.mixWithOthers`, background audio.
- Tidak merekam suara ke berkas. Tidak menyimpan rahasia bridge.
- **Belum dinyatakan siap produksi** sampai compile CI, instalasi dengan signing, dan tes headset/Minecraft latar belakang pada iOS nyata lulus.

Jika Minecraft iOS mengambil alih audio session sepenuhnya, aplikasi akan menampilkan gangguan interupsi. Latar belakang iOS tidak dapat dijamin hanya dengan deklarasi UIBackgroundModes; evaluasi opsi audio session/call integration menurut aturan Apple bila terjadi masalah.
