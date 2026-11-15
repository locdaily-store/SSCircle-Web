# Instalasi SSCircle Cross Voice Cloudflare Edition (tanpa VPS)

**Versi PR #74 masih Draft.** Lakukan uji pada server staging terlebih dahulu. Kompilasi JAR saja bukan bukti audio Minecraft Java dan Bedrock sudah dapat didengar di server nyata.

## 1. Bahan yang harus disiapkan

- Hosting Minecraft Paper 26.3 + JDK 25, dan akses untuk memasang plugin.
- Simple Voice Chat server plugin yang dapat **berjalan nyata** di Paper tersebut, plus mod client bagi pemain Java.
- Geyser/Floodgate untuk pemain Bedrock.
- SSCircleCrossVoice.jar dari GitHub Actions PR #74.
- Akun Cloudflare untuk Workers, Durable Objects (SQLite), dan Pages SSCircle.
- Domain HTTPS untuk website SSCircle. Gateway bisa memakai domain workers.dev gratis atau Custom Domain.
- Komputer dengan Node.js 22+ untuk menjalankan Wrangler **saat deploy saja**. Komputer tidak perlu menyala 24 jam.

**Tidak perlu VPS, Node.js yang menyala terus-menerus, Cloudflare Tunnel, atau port TCP gateway pada hosting Minecraft.** Minecraft cukup dapat mengakses keluar TCP 443 (WSS).

## 2. Download hasil build

Buka https://github.com/locdaily-store/SSCircle-Web/pull/74 dan masuk ke Actions → SSCircle Cross Voice CI → run terakhir yang berhasil → Artifacts.

- SSCircleCrossVoice-JAR: berisi file JAR asli untuk folder plugins.
- SSCircle-Cross-Voice-Distribution: FULL.zip dan ONLY-CHANGES.zip; FULL berisi source Cloudflare gateway.
- Untuk deploy website Pages gunakan artifact paket website dari workflow Cloudflare SSCircle, **bukan FULL.zip source**.

Pastikan Simple Voice Chat native Java↔Java berjalan sebelum memasang Cross Voice.

## 3. Siapkan Cloudflare Worker gateway

Edit file cross-voice/cloudflare/wrangler.toml. Ganti VOICE_ORIGIN menjadi alamat asal website SSCircle yang benar, contohnya:

~~~toml
[vars]
VOICE_ORIGIN = "https://sscircle.domain-saya.com"
VOICE_SERVER_KEY = "sscircle-main"
VOICE_MAX_CLIENTS = "50"
~~~

Jangan ubah deklarasi Durable Object SQLite. Atur domain Preview pada Worker terpisah bila ingin pengujian dengan origin yang berbeda.

Buka terminal di folder akar source project (PC Windows/Linux/macOS):
~~~bash
npx wrangler login
npx wrangler secret put VOICE_BRIDGE_SECRET --config cross-voice/cloudflare/wrangler.toml
npx wrangler deploy --config cross-voice/cloudflare/wrangler.toml
~~~

Saat diminta secret, gunakan string acak **minimal 32 karakter**, misalnya hasil perintah openssl rand -hex 32. Simpan rahasianya sendiri untuk diisikan lagi pada config.yml Paper. Jangan pernah memasukkan secret ke file website, GitHub, atau pesan publik.

Wrangler akan memberikan alamat semacam:
https://sscircle-cross-voice.NAMA-AKUN.workers.dev

Jika ingin memakai voice.domain-saya.com, buat Custom Domain pada pengaturan Worker (Settings → Domains & Routes). Tidak perlu Cloudflare Tunnel.

Buka:
https://sscircle-cross-voice.NAMA-AKUN.workers.dev/api/health

Awalnya ready:false adalah normal sebelum Minecraft berhasil terhubung. Jika ada BRIDGE_NOT_CONFIGURED, ulangi penyiapan secret.

## 4. Hubungkan plugin Paper

Pasang Simple Voice Chat server plugin, Floodgate, Geyser, dan SSCircleCrossVoice.jar pada folder plugins server uji.

Isi plugins/SSCircleCrossVoice/config.yml:

~~~yaml
gateway:
  websocket-url: "wss://sscircle-cross-voice.NAMA-AKUN.workers.dev/bridge"
  secret: "SECRET_SAMA_PERSIS_DENGAN_WORKER"
  reconnect-seconds: 5

audio:
  distance: 32.0
  whisper-distance: 8.0
  max-queued-frames: 256
  allow-groups: true
  max-player-sessions: 50

security:
  pairing-expiry-seconds: 120
~~~

Restart Paper, jalankan /scvoice status. Gateway harus TERHUBUNG, Simple Voice Chat READY. Pastikan hosting mengizinkan trafik keluar TCP 443 menuju domain Cloudflare.

## 5. Aktifkan halaman SSCircle Voice pada Cloudflare Pages

PR #74 masih Draft, jadi kode website Voice belum otomatis berada di deployment produksi. Gunakan deployment Preview branch terlebih dahulu atau deploy setelah merge ketika pengujian selesai.

Di Cloudflare Pages → proyek SSCircle → Settings → Variables and Secrets tambahkan:

~~~text
VOICE_PUBLIC_URL=https://sscircle-cross-voice.NAMA-AKUN.workers.dev
~~~

Ganti dengan URL Worker yang benar, tanpa slash terakhir. Variable ini **publik** dan bukan secret. Deploy halaman Pages dengan file voice.html, voice.js, voice.css, voice-worklet.js, serta perubahan _worker.js dan _routes.json dari PR.

Halaman /voice.html harus diberikan izin mikrofon khusus oleh Worker Pages, sementara halaman lain tetap dibatasi.

## 6. Pemakaian

Java: pasang Simple Voice Chat mod, lalu berbicara di dalam game seperti biasa.

Bedrock:
1. Masuk ke SSCircle memakai Geyser/Floodgate.
2. Ketik /voice link di chat Minecraft.
3. Masukkan kode delapan karakter ke halaman SSCircle Voice (berlaku 2 menit, satu kali).
4. Klik Connect → Aktifkan mikrofon → berikan izin.
5. Gunakan Push-to-Talk atau Voice Activation; dekati pemain Java/Bedrock lain dan uji dua arah.
6. Coba mute, deafen, whisper, grup dan pindah world.

Browser Android/iOS bisa ditangguhkan ketika Minecraft sedang di depan. **Tidak ada jaminan** voice latar belakang bisa berjalan; perangkat kedua dapat menjadi solusi.

## 7. Port dan jaringan

| Koneksi | Contoh port | Protokol |
| --- | --- | --- |
| Minecraft Java masuk | 25565 | TCP |
| Bedrock/Geyser | 19132 (bergantung hosting/transport) | UDP, dan TCP bila diperlukan |
| Simple Voice Chat native | 24454 | UDP |
| Paper → Cloudflare gateway | 443 keluar | WSS TCP |
| Browser → Cloudflare gateway | 443 | HTTPS/WSS |
| Node VPS / Cloudflare Tunnel | tidak ada | tidak diperlukan |

## 8. Sebelum produksi

- Pastikan status SVC server plugin sendiri kompatibel dengan Paper 26.3. Daftar mod client yang mendukung 26.3 bukan sertifikasi plugin server.
- Tes otomatis CI meliputi real Wrangler local runtime, pairing sekali pakai, WebSocket PCM Bedrock→Java, Java→Bedrock, Bedrock→Bedrock, world isolation, whisper, grup, deafen, autentikasi dan build JAR nyata.
- **Belum diverifikasi:** percakapan audio langsung di client Minecraft asli, kestabilan 20–50 pemain, latency/biaya penggunaan Cloudflare, dan audio mobile saat Minecraft di foreground.
- Voice audio PCM dibatch 3×20ms untuk mengurangi jumlah pesan, **bukan** total bandwidth. Cloudflare Workers Free punya kuota; voice ramai bisa melebihi kuota Free. Periksa Analytics, Billing, dan uji beban.
- Tidak ada perekaman audio. Database Durable Object hanya menyimpan hash kode pairing/token sementara.

Cloudflare docs:
https://developers.cloudflare.com/durable-objects/best-practices/websockets/
https://developers.cloudflare.com/durable-objects/platform/pricing/
