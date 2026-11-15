# Instalasi SSCircle Cross Voice (Cloudflare + Paper)

## Prasyarat
- Paper 26.3 dengan Java/JDK 25 dan **Simple Voice Chat server plugin yang sudah diuji kompatibel untuk versi Paper sebenarnya**.
- Plugin Geyser/Floodgate pada server Paper.
- Hosting Node.js 22+ yang dapat menjalankan proses selalu aktif (VPS/container/server tambahan). Hosting Paper yang hanya mengizinkan unggah .jar dan tidak memberi akses proses Node tidak cukup untuk gateway.
- Domain HTTPS untuk website SSCircle Pages dan subdomain voice yang dapat menjalankan WSS.

## 1. Jangan langsung menggunakan produksi
Cadangkan world Minecraft, file plugin, konfigurasi Geyser/Floodgate, dan website. Validasi plugin SVC pada Paper 26.3 terlebih dulu; jika SVC sendiri gagal start, Cross Voice juga tidak akan aktif. Tidak ada launcher otomatis atau reset world.

## 2. Jalankan gateway
Salin folder `cross-voice/gateway` ke VPS. Instal dependensi:

```bash
cd cross-voice/gateway
npm install --omit=dev
export VOICE_HOST=127.0.0.1
export VOICE_PORT=8788
export VOICE_ORIGIN=https://website-sscircle.example.com
export VOICE_BRIDGE_SECRET="$(openssl rand -hex 32)"
npm start
```

Ganti origin sesuai domain website SSCircle. Simpan nilai `VOICE_BRIDGE_SECRET` secara aman dan gunakan nilai sama di konfigurasi plugin. Jangan menaruh secret di GitHub, Pages, HTML, atau `voice-config.js`.

Untuk produksi sebaiknya pakai systemd atau system manager terpercaya agar gateway otomatis restart. Batasi proses ke localhost dan gunakan firewall.

## Konfigurasi Cloudflare Pages untuk halaman Voice

Pada **Workers & Pages → SSCircle Pages → Settings → Variables and Secrets**
tambahkan variabel **Production** bernama `VOICE_PUBLIC_URL`, isi
`https://voice.domain-saya.com` tanpa path. **Bukan secret**: URL ini memang
harus bisa dilihat browser. Worker SSCircle menggunakan variabel ini untuk
menyajikan `voice-config.js` dan mengizinkan sambungan WSS HTTPS ke domain
tersebut dalam Content Security Policy.

Halaman Voice mendapat `Permissions-Policy: microphone=(self)` secara khusus,
sementara halaman lain tetap melarang mikrofon. Kebijakan `_headers` global
tetap ketat; jangan memperbolehkan mikrofon ke seluruh website.

Untuk **Preview** konfigurasi terpisah sesuai domain staging. Deploy situs
terbaru agar `_worker.js` mengenali variabel dan route Voice.

## 3. Cloudflare Tunnel untuk HTTPS/WSS
Anda bisa membuat **Public Hostname** pada Cloudflare Zero Trust → Networks → Tunnels (nama menu dapat berubah), misalnya `voice.domain-saya.com`, dengan Service HTTP `http://127.0.0.1:8788` pada host gateway. Cloudflare Tunnel meneruskan WebSocket Upgrade yang dipakai gateway.

**Alternatif:** Nginx/Caddy reverse proxy yang sudah memiliki TLS. Proxy harus meneruskan header `Upgrade`, `Connection`, `Origin`, dan Authorization (untuk sambungan plugin) serta menonaktifkan caching pada endpoint pairing.

Pengaturan domain gateway:
- `VOICE_ORIGIN` = origin website Pages yang diizinkan (contoh `https://sscircle.example.com`).
- `voice-config.js`: `window.SSCIRCLE_VOICE_GATEWAY = "https://voice.domain-saya.com";`
- `gateway.websocket-url` plugin: `wss://voice.domain-saya.com/bridge`

**Jika Cloudflare Tunnel berjalan pada mesin yang sama dengan gateway,**
set `VOICE_TRUST_CF=true` pada environment gateway agar rate limiting pairing
memakai IP pengunjung asli dari header `CF-Connecting-IP`, bukan satu alamat
lokal Tunnel untuk seluruh pemain. Hanya aktifkan opsi itu jika gateway **tidak
dapat diakses langsung dari internet** dan semua permintaan publik memang
melewati Cloudflare Tunnel yang kamu kelola.

Jika menggunakan reverse proxy sendiri, biarkan `VOICE_TRUST_CF=false` sampai
proxy dan IP source yang dipercaya dikonfigurasi dengan aman.

**Catatan:** Cloudflare Pages tidak menjalankan proses Node permanen atau relai audio berlatensi rendah. Halaman HTML/JS boleh di Pages, gateway wajib terpisah. Paket ZIP website dari workflow Pages dapat diunggah setelah aset Voice masuk.

## 4. Pasang Paper plugin
Dari GitHub Actions Cross Voice CI, unduh artifact **SSCircleCrossVoice-JAR** hanya setelah job Gradle berhasil. Letakkan jar asli di `plugins/`. Instal `voicechat` dan Floodgate sesuai rilis resmi; restart Paper.

Pada `plugins/SSCircleCrossVoice/config.yml`:
```yaml
gateway:
  websocket-url: "wss://voice.domain-saya.com/bridge"
  secret: "SECRET_GATEWAY_SAMA_PERSIS"
  reconnect-seconds: 5
audio:
  distance: 32.0
  whisper-distance: 8.0
  max-queued-frames: 256
  allow-groups: true
  max-player-sessions: 50
security:
  pairing-expiry-seconds: 120
```

Gunakan LuckPerms untuk memberikan permission terpisah ke pemain/admin. Cek `/scvoice status` setelah restart.

## 5. Buka port yang benar
| Komponen | Contoh | Protokol |
|---|---|---|
| Server Minecraft Java | 25565 | TCP |
| Geyser / Minecraft Bedrock | 19132 | UDP |
| Simple Voice Chat | 24454 | UDP |
| Gateway SSCircle Voice | 8788 localhost | TCP HTTP+WebSocket, bukan publik langsung |
| Subdomain Voice | 443 Cloudflare Tunnel | HTTPS+WSS |

Port dapat berbeda mengikuti hosting. Cloudflare Tunnel untuk gateway tidak menggantikan akses UDP Simple Voice Chat atau UDP Bedrock.

## 6. Pengujian sebelum produksi
1. Cek gateway `https://voice.domain-saya.com/api/health` mengembalikan `ready` setelah Paper tersambung.
2. Bedrock mengetik `/voice link`; masukkan kode 8 karakter ke halaman Voice; browser menampilkan akun yang benar.
3. Beri izin mikrofon, coba komunikasi dengan Java yang memasang mod Simple Voice Chat. Uji arah balik.
4. Uji dua Bedrock, pindah world, whisper, PTT, voice activation, deafen, group, block IP salah, reconnect.
5. Uji Android/iOS dalam background. **Tidak ada jaminan audio browser tetap hidup ketika Minecraft menjadi aplikasi foreground.**
6. Amati TPS, penggunaan CPU, bandwith, audio delay, dan memory selama simulasi 20–50 pemain. Jangan memberi status produksi sebelum aman.

## Pengelolaan secret
Jika secret bocor, buat secret baru di gateway dan `config.yml`, restart kedua sisi. Pairing dan token sesi hanya tersimpan sementara dalam memori gateway; restart akan memutus semua sesi, bukan memulihkan sesi lama.
