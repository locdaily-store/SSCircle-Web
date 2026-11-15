# SSCircle Cross Voice — Cloudflare Edition

**PR #74 (Draft). Belum diuji di server Minecraft sungguhan.** Sistem lintas platform untuk Java ↔ Bedrock dan Bedrock ↔ Bedrock menggunakan Simple Voice Chat API, Floodgate, website mikrofon, dan **Cloudflare Worker + Durable Object** sebagai gateway tanpa VPS.

## Struktur

- paper/: source SSCircleCrossVoice.jar Paper 26.3 / Java 25 / Simple Voice Chat API resmi.
- cloudflare/: gateway utama Cloudflare Durable Object berbasis SQLite, protokol audio WebSocket dan pengujian Wrangler lokal.
- gateway/: gateway Node.js lama, **opsional** jika ingin self-hosting; bukan prasyarat Cloudflare Edition.
- File voice.html, voice.js, voice-worklet.js, voice.css di root: UI Voice SSCircle.
- INSTALL-ID.md: panduan instalasi Cloudflare tanpa VPS.
- PLAYER-GUIDE-ID.md dan TROUBLESHOOTING-ID.md: bantuan pengguna.

## Audio

- Java→Java menggunakan Simple Voice Chat native.
- Java→Bedrock: event mikrofon Opus SVC didekode oleh API resmi pada worker audio Paper → PCM → Durable Object → browser.
- Bedrock→Java: browser AudioWorklet → PCM → Durable Object → plugin Paper → Opus via AudioSender API resmi.
- Bedrock→Bedrock: relay langsung di DO berdasarkan world/jarak/grup/deafen, tanpa duplikasi dari Paper.
- Audio PCM 48kHz mono 16-bit dibatch dalam tiga frame per 60ms. Ini mengurangi message count, belum menggunakan kompresi Opus pada browser; konsumsi bandwidth dapat besar saat ramai.
- No recording. Durable Object menyimpan hanya hash kode pairing/token yang terbatas waktu dalam SQLite, tidak menyimpan suara.

## Penggunaan dan keamanan

Bedrock mengetik /voice link → kode satu kali kedaluwarsa → browser pairing → token sesi → ticket WSS sekali pakai. Token dan kode tidak disimpan browser localStorage; gateway mengikat sesi pada UUID yang divalidasi oleh plugin Paper.

Perintah pemain: /voice link, status, mute, unmute, deafen, undeafen, whisper, normal, volume, group, disconnect. Admin: /scvoice status, inspect, mute, unmute, kick, distance, groups, reload.

## Pengujian dan keterbatasan

GitHub Actions mengompilasi Paper JAR menggunakan dependency asli, mengetes gateway Node lama, CSP halaman Cloudflare Pages, dan **menjalankan Wrangler Durable Object lokal + tes pairing/audio WebSocket**. JAR dan ZIP baru dipaketkan setelah semua job berhasil.

Masih perlu uji pada client Minecraft sesungguhnya, Paper 26.3 + plugin SVC server asli, browser Android/iOS background, dan beban 20–50 pengguna. Cloudflare Worker Free mungkin tidak cukup untuk traffic voice ramai. Jangan merge/deploy produksi sebelum uji staging selesai.

Mulai dari INSTALL-ID.md.
