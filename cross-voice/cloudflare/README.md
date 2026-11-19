# Gateway SSCircle Cloudflare — catatan teknis

Worker ini menggantikan gateway Node.js utama. Cloudflare Worker mengarahkan HTTP dan WebSocket ke satu Durable Object VoiceRoom untuk server Minecraft SSCircle. Tidak perlu VPS atau Cloudflare Tunnel.

## Konfigurasi

File wrangler.toml mendefinisikan:
- VOICE_ORIGIN = asal website HTTPS SSCircle yang tepat, tanpa slash terakhir.
- VOICE_SERVER_KEY = ID tetap untuk satu server Minecraft.
- VOICE_MAX_CLIENTS = batas browser (maksimal 100, default 50).
- VOICE_ROOM = Durable Object binding SQLite.
- VOICE_BRIDGE_SECRET = secret Wrangler yang **tidak** boleh dimasukkan ke wrangler.toml, source, atau website.

Deploy dari akar repositori:
~~~bash
npx wrangler login
npx wrangler secret put VOICE_BRIDGE_SECRET --config cross-voice/cloudflare/wrangler.toml
npx wrangler deploy --config cross-voice/cloudflare/wrangler.toml
~~~

Worker menghasilkan URL workers.dev, atau bisa pakai Custom Domain pada Settings → Domains & Routes. Sesuaikan endpoint wss://.../bridge di config.yml Paper dan VOICE_PUBLIC_URL pada Cloudflare Pages.

## Protokol

- GET /api/health: health, jumlah pemain/sesi, counters.
- POST /api/pair: kode sekali pakai dari Paper yang dipasangkan ke UUID Floodgate; hasilnya token sesi 15 menit.
- POST /api/ticket: token Bearer menjadi ticket sekali pakai (15 detik).
- POST /api/renew: rotasi token Bearer yang masih valid (15 menit baru), memperbarui attachment WebSocket aktif untuk aplikasi native; token lama tidak bisa dipakai kembali. Saat Paper offline sementara, token valid tidak dibatalkan.
- GET /ws?ticket=... dengan Upgrade WebSocket: browser.
- GET /bridge dengan Upgrade WebSocket dan Authorization Bearer secret: plugin Paper.
- POST /api/disconnect: cabut token/session dan tutup koneksi browser.

Audio 48kHz mono PCM 16-bit per 20ms, dibatch 3 frame (60ms). Java→Java tetap memakai Simple Voice Chat aslinya. Di Cloudflare, Audio hanya diteruskan lewat memori, tidak disimpan dalam database atau log. SQLite menyimpan **hash** kode/token serta expiry.

## Pengujian

GitHub Actions menjalankan Wrangler dev lokal dengan Durable Object SQLite dan tes koneksi menggunakan WebSocket sungguhan: pairing, replay, grup, deafen, whisper, world isolation dan frame PCM dua arah. Kompilasi Paper plugin memakai dependency API resmi, bukan stub.

Akses browser mobile di background, kompatibilitas SVC server Paper 26.3, skala 20–50 pemain, latensi dan biaya aktual belum teruji. Cloudflare Free dapat mencapai limit pemrosesan pesan WebSocket saat ramai. Monitor Analytics dan Billing.

Cloudflare official docs:
https://developers.cloudflare.com/durable-objects/best-practices/websockets/
https://developers.cloudflare.com/durable-objects/platform/pricing/
