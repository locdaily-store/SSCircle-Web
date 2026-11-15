# SSCircle Cross Voice

**Status: PR Draft / belum teruji di server nyata.** Sistem ini dibuat dari awal dan tidak mengubah PR Season #73.

## Komponen
- `paper/`: SSCircleCrossVoice.jar, integrasi resmi Simple Voice Chat API 2.6.25, Floodgate API, Java 25/Paper 26.3.
- `gateway/`: server Node.js WebSocket yang hidup terus (bukan Cloudflare Pages), autentikasi pairing sekali pakai, relay audio PCM 48 kHz 16-bit mono per 20 ms dan sesi 15 menit.
- Aset root `voice.html`, `voice.js`, `voice.css`, `voice-worklet.js`, `voice-config.js`: SSCircle Voice responsif dengan header/footer yang sama seperti halaman lain.

## Alur audio
1. **Java→Java**: Simple Voice Chat mengirim paket sendiri; SSCircle tidak menggandakan audio ini.
2. **Java→Bedrock**: server menerima MicrophonePacketEvent berisi Opus, codec official API mengubahnya menjadi PCM dan mengirim frame melalui WSS gateway ke browser Bedrock dalam world/jarak yang sama.
3. **Bedrock→Java**: AudioWorklet di browser mengirim PCM ke gateway. Plugin menerima PCM, mengkodekannya ke Opus menggunakan Simple Voice Chat API lalu menyalurkannya lewat AudioSender atas identitas Floodgate player.
4. **Bedrock→Bedrock**: Gateway meneruskan PCM dalam world/jarak yang sama secara langsung. Ini mencegah duplikasi akibat pengiriman ulang dari audio sender.
5. **Whisper**: jarak lebih pendek dan flag whisper AudioSender.
6. **Group**: kelompok Simple Voice Chat dibagikan berdasarkan ID group, bukan nama. Group berpassword tidak boleh dimasuki lewat jalur browser.

Seluruh data posisi dan identitas pemain berasal dari plugin Paper. Browser tidak dapat mengaku sebagai UUID orang lain lewat username. Tidak ada rekaman suara yang disimpan.

## Command Minecraft
Pemain Bedrock: `/voice link`, `/voice status`, `/voice mute`, `/voice unmute`, `/voice deafen`, `/voice undeafen`, `/voice whisper`, `/voice normal`, `/voice volume <0..200>`, `/voice group <nama|leave>`, `/voice disconnect`.

Admin: `/scvoice status`, `/scvoice inspect <pemain>`, `/scvoice mute <pemain>`, `/scvoice unmute <pemain>`, `/scvoice kick <pemain>`, `/scvoice distance <2..100>`, `/scvoice groups on|off`, `/scvoice reload`.

Permission: `sscircle.voice.use`, `sscircle.voice.group`, `sscircle.voice.admin`, `sscircle.voice.admin.mute`, `sscircle.voice.admin.disconnect`, `sscircle.voice.admin.reload`, `sscircle.voice.admin.configure`.

## Pengujian
- Node.js: `cd cross-voice/gateway && npm install && npm test`.
- Gradle: `gradle -p cross-voice/paper clean build` (Java 25, Paper 26.3 API asli, Simple Voice Chat API asli). JAR hanya dianggap valid jika berhasil pada GitHub Actions dan uji server.
- Website: perlu HTTPS dan izin mikrofon browser. Perlu uji desktop, Android dan iOS.
- Uji langsung Java/Bedrock dan stabilitas 20–50 pemain **BELUM** selesai.

**Pengingat kompatibilitas:** daftar resmi Simple Voice Chat plugin server yang diperiksa saat pengembangan belum memuat Paper 26.3. Mod client 26.3 didukung, tetapi itu bukan bukti plugin server sudah mendukung Paper 26.3. Pastikan sebelum produksi: https://modrepo.de/minecraft/voicechat/wiki/supported_versions

Baca `INSTALL-ID.md`, `PLAYER-GUIDE-ID.md`, dan `TROUBLESHOOTING-ID.md`.
