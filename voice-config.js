// SSCircle Voice menggunakan VOICE_PUBLIC_URL dari Cloudflare Pages saat _worker.js aktif.
// Fallback hanya untuk alamat Preview SSCircle yang diketahui.
// Alamat ini PUBLIK; jangan pernah memasukkan VOICE_BRIDGE_SECRET dalam file browser.
window.SSCIRCLE_VOICE_GATEWAY =
  window.location.hostname === 'voice-test.sscircle.pages.dev'
    ? 'https://sscircle-cross-voice.locdailymar.workers.dev'
    : '';
