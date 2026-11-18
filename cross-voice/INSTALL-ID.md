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

**Pemeriksaan auto-config:** buka `https://DOMAIN-WEBSITE-SSCircle/api/voice/mobile-config`. Respons JSON harus berisi `ready:true`, `origin` yang sama persis dengan domain website, dan `gateway` HTTPS Workers yang benar. Setelah itu, halaman web dan aplikasi sama-sama memakai gateway tersebut tanpa pengaturan manual di HP.

## 6. Pemakaian

Java: pasang Simple Voice Chat mod, lalu berbicara di dalam game seperti biasa.

Bedrock:
1. Masuk ke SSCircle memakai Geyser/Floodgate.
2. Ketik /voice link di chat Minecraft.
3. Masukkan kode delapan karakter ke halaman SSCircle Voice (berlaku 2 menit, satu kali).
4. Klik Connect → Aktifkan mikrofon → berikan izin.
5. Gunakan Push-to-Talk atau Voice Activation; dekati pemain Java/Bedrock lain dan uji dua arah.
6. Coba mute, deafen, whisper, grup dan pindah world.

Browser Android/iOS dapat ditangguhkan ketika Minecraft sedang di depan. **Tidak ada jaminan** voice latar belakang bisa berjalan; perangkat kedua dapat menjadi solusi.

**Ketahanan background (PR #74):** WebSocket dan mikrofon tidak sengaja ditutup ketika halaman berpindah ke background. Gunakan **Voice Activation** untuk mencoba berbicara sambil membuka Minecraft (PTT hanya ketika halaman dapat ditekan). Saat kembali ke tab, halaman mencoba menyambung ulang WebSocket dan AudioContext. Jika browser menghentikan mikrofon, tekan tombol **Pulihkan Voice** untuk meminta akses ulang. Jangan tutup tab. Browser/OS tetap dapat menangguhkan proses dan tidak bisa dipaksa aktif oleh JavaScript atau PWA.

## 6A. Ikon mikrofon asli Simple Voice Chat untuk Bedrock

Plugin Paper **SSCircleCrossVoice v0.2.4** memanggil `VoicechatConnection.setConnected(true)` pada pemain Floodgate/Bedrock ketika mendapat event `session connected:true` dari gateway dan sesi browser/aplikasi benar-benar hidup. Ketika `session connected:false`, pemain logout, server voice restart, atau jembatan Cloudflare putus, plugin memulihkan `setConnected(false)`. Pengecekan dilakukan setiap 5 tick pada thread utama, tanpa mengubah prefix LuckPerms, scoreboard team, atau TAB.

Konfigurasi tambahan di `plugins/SSCircleCrossVoice/config.yml`:

```yaml
indicators:
  bedrock-native-icon: true
```

`false` menonaktifkan penggantian indikator. **Ikon berasal dari mod Simple Voice Chat di client Java**, bukan ikon buatan plugin, dan hanya terlihat pada client yang memasang mod dengan `show_nametag_icons=true`. Ikon status connected tidak sama dengan animasi indikator *sedang bicara*. Pemain Bedrock tanpa mod tetap melihat UI Minecraft Bedrock standar. Sebagian mod pengubah nametag dan versi client SVC tertentu dapat menyembunyikannya.

**Pemasangan:** ganti **JAR SSCircleCrossVoice** di folder `plugins/`, restart server, pasangkan kode baru, dan coba menggunakan satu client Java yang memasang Simple Voice Chat. **Tidak perlu mengubah file Cloudflare atau APK hanya untuk fitur ikon ini**.

## 6B. Badge mikrofon yang selalu terlihat setelah pairing Bedrock (v0.2.5)

Plugin menampilkan **TextDisplay badge mikrofon** di dekat sisi kanan nickname pemain Bedrock pada client Java setelah gateway mengirim event `session connected:true` (WebSocket audio aktif). Bukan saat kode pairing sekadar dibuat. Saat disconnect, pemain keluar, gateway mati, atau pergantian dunia, badge dihapus. Nickname, LuckPerms, scoreboard, dan TAB tidak ditimpa.

**Resource pack Java wajib untuk menampilkan gambar mikrofon:** `SSCircle-Mic-Glyph-Java-26.3.zip`, disediakan dalam artifact distribusi CI dan dapat dibangun ulang dengan `python3 cross-voice/paper/create_mic_resourcepack.py`. File pack menyediakan font `sscircle:voice`, karakter `U+E401`, dan gambar mikrofon pixel art. Tanpa pack, ikon bisa terlihat sebagai kotak. Tidak diperlukan mod Java tambahan untuk badge ini.

**Instalasi client Java:** Options > Resource Packs > Open Pack Folder, masukkan ZIP tersebut (jangan diekstrak), lalu aktifkan. Untuk distribusi otomatis, host ZIP dengan HTTPS dan gunakan `resource-pack` serta `resource-pack-sha1` pada `server.properties`. Jika server sudah menggunakan resource pack, **gabungkan** folder `assets/sscircle/` ke pack lama dan perbarui SHA-1, jangan mengganti pack server lain.

Konfigurasi `plugins/SSCircleCrossVoice/config.yml`:

```yaml
indicators:
  bedrock-native-icon: true
  bedrock-mic-badge: true
  badge-height: 2.42
  badge-scale: 0.70
  badge-view-distance: 48
```

Badge ini merupakan entitas terpisah yang mengikuti kepala pemain, sehingga posisi di samping nametag **perkiraan**, dan bisa berbeda tergantung pose/nama/font. Ikon menunjukkan **Voice terhubung**, bukan pemain sedang berbicara. Badge hanya ditampilkan kepada client Java dalam radius konfigurasi, tidak kepada client Bedrock.

**Untuk deploy:** perbarui JAR SSCircleCrossVoice v0.2.5 pada folder `plugins/`, restart Paper, aktifkan resource pack pada client Java. Tidak perlu memperbarui Cloudflare Worker ataupun APK untuk ikon ini.

## 7. Port dan jaringan

| Koneksi | Contoh port | Protokol |
| --- | --- | --- |
| Minecraft Java masuk | 25565 | TCP |
| Bedrock/Geyser | 19132 (bergantung hosting/transport) | UDP, dan TCP bila diperlukan |
| Simple Voice Chat native | 24454 | UDP |
| Paper → Cloudflare gateway | 443 keluar | WSS TCP |
| Browser → Cloudflare gateway | 443 | HTTPS/WSS |
| Node VPS / Cloudflare Tunnel | tidak ada | tidak diperlukan |

## 8. Aplikasi khusus Android dan iPhone

PR #74 sekarang menyediakan sumber aplikasi native yang **terpisah dari halaman Voice**:

- Android (API 26+): `cross-voice/mobile/android/`, panduan `cross-voice/mobile/android/README-ID.md`. Workflow `SSCircle Voice Android APK` menghasilkan `SSCircle-Voice-Android-APK` setelah build sukses. APK debug ditandatangani otomatis untuk pengujian.
- iPhone/iPad (iOS 16+): `cross-voice/mobile/ios/`, panduan `cross-voice/mobile/ios/README-ID.md`. Memerlukan Xcode dan Apple signing atau TestFlight; APK Android **tidak** dapat dipasang di iOS.
- Keduanya menggunakan Cloudflare Worker yang sama (tanpa VPS) dan bukan WebView. Native audio memakai PCM16 48kHz sesuai protokol PR #74.
- Aplikasi sekarang **otomatis** mengambil URL Worker dan Origin dari `https://WEBSITE-SSCircle/api/voice/mobile-config`; pemain cukup memasukkan kode `/voice link`. Website mengambil `VOICE_PUBLIC_URL` dari Pages dan meneruskan Origin sesuai domain HTTPS yang sedang digunakan. URL ini adalah konfigurasi publik, **bukan** credential.
- Domain app preview bawaan adalah `https://voice-test.sscircle.pages.dev`. Untuk domain produksi berbeda, admin menyetel `-PvoiceSiteOrigin` pada build Android atau `SSCVoiceBootstrapURL` di Info.plist iOS satu kali. Jangan memakai domain contoh ketika sudah produksi.
- Worker versi terbaru menyediakan `POST /api/renew` agar sesi native dirotasi otomatis tanpa menutup audio. Deploy ulang Worker dari branch PR #74 untuk aplikasi mobile.
- Tetap **wajib pengujian pada HP fisik** saat Minecraft aktif, termasuk headset, screen lock, interupsi panggilan, kualitas dua arah, baterai dan latensi.

## 9. Sebelum produksi

- Pastikan status SVC server plugin sendiri kompatibel dengan Paper 26.3. Daftar mod client yang mendukung 26.3 bukan sertifikasi plugin server.
- Tes otomatis CI meliputi real Wrangler local runtime, pairing sekali pakai, WebSocket PCM Bedrock→Java, Java→Bedrock, Bedrock→Bedrock, world isolation, whisper, grup, deafen, autentikasi dan build JAR nyata.
- **Belum diverifikasi:** percakapan audio langsung di client Minecraft asli, kestabilan 20–50 pemain, latency/biaya penggunaan Cloudflare, dan audio mobile saat Minecraft di foreground.
- Voice audio PCM dibatch 3×20ms untuk mengurangi jumlah pesan, **bukan** total bandwidth. Cloudflare Workers Free punya kuota; voice ramai bisa melebihi kuota Free. Periksa Analytics, Billing, dan uji beban.
- Tidak ada perekaman audio. Database Durable Object hanya menyimpan hash kode pairing/token sementara.

Cloudflare docs:
https://developers.cloudflare.com/durable-objects/best-practices/websockets/
https://developers.cloudflare.com/durable-objects/platform/pricing/
