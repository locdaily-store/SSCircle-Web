/* SSCircle Server • Cloudflare Pages Functions Advanced Mode
   DB: D1 binding, MEDIA: R2 binding, ADMIN_PASSWORD and SESSION_SECRET: encrypted secrets.
   Never put the admin password in this file. */

// Cloudflare Worker: autentikasi, pengaturan, media, dan voting.

const COOKIE = 'ssc_s6_admin';
const SESSION_SECONDS = 8 * 60 * 60;
const TYPES = new Set([
  'short',
  'long',
  'single',
  'multi',
  'select',
  'image_upload'
]);
const STATUSES = new Set(['pending', 'accepted', 'rejected']);
const MAX_FILE = 3 * 1024 * 1024;
const TIKTOK_BUILTIN_SIZE = 11163;
const OTHER_PREFIX = '__SSC_OTHER__:';
const OTHER_LIMIT = 140;
// Without R2, images are stored as small base64 BLOB-equivalents inside D1 (220 KiB binary).
const D1_IMAGE_LIMIT = 220 * 1024;
// Batas unggah cinematic tanpa penyimpanan berbayar. Potongan tersimpan pada media_blobs lama.
const VIDEO_LIMIT = 16 * 1024 * 1024;
const VIDEO_CHUNK = 512 * 1024;
const VIDEO_PARTS = Math.ceil(VIDEO_LIMIT / VIDEO_CHUNK);
const videoChunkKey = (id, index) => 'video:' + id + ':' + String(index).padStart(3, '0');
const videoReference = id => '/api/media/' + id;
const videoIdFromURL = value => /^\/api\/media\/([0-9a-f-]{36})(?:\?format=(?:mp4|webm))?$/.exec(String(value || ''))?.[1] || '';
const MAX_IMAGES_PER_APPLICATION = 3;
const VOTING_ACCEPTED_STATUS = 'accepted';
const DEFAULT_COOLDOWN_MINUTES = 30;
const MAX_COOLDOWN_MINUTES = 10080; // 7 days
const J = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  }
});
const bad = (message, status = 400) => J({ error: message }, status);
const s = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const parse = v => {
  try {
    return JSON.parse(v);
  }
  catch {
    return null;
  }
};
const uid = () => crypto.randomUUID();
function b64(v) {
  const b = v instanceof Uint8Array ? v : new TextEncoder().encode(v);
  let t = '';
  for (const x of b)
    t += String.fromCharCode(x);
  return btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64(v) {
  return new TextDecoder().decode(Uint8Array.from(atob(v.replace(/-/g, '+').replace(/_/g, '/')), x => x.charCodeAt(0)));
}
async function digest(v) {
  return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))));
}
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))));
}
function safeEq(a, b) {
  if (a.length !== b.length)
    return false;
  let x = 0;
  for (let i = 0; i < a.length; i++)
    x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
function cookie(req) {
  return (req.headers.get('Cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || '';
}
const setCookie = (v, age) => `${COOKIE}=${v}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
async function sign(env) {
  const p = b64(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS, nonce: uid() }));
  return p + '.' + await hmac(env.SESSION_SECRET + '|' + env.ADMIN_PASSWORD, p);
}
async function admin(req, env) {
  if (!env.SESSION_SECRET || !env.ADMIN_PASSWORD)
    return false;
  const parts = cookie(req).split('.');
  if (parts.length !== 2)
    return false;
  const correct = await hmac(env.SESSION_SECRET + '|' + env.ADMIN_PASSWORD, parts[0]);
  if (!safeEq(parts[1], correct))
    return false;
  try {
    const exp = JSON.parse(unb64(parts[0])).exp;
    if (!(Number.isFinite(exp) && exp > Math.floor(Date.now() / 1000)))
      return false;
    const revoked = await env.DB.prepare('SELECT token_hash FROM revoked_sessions WHERE token_hash=?').bind(await digest(cookie(req))).first();
    return !revoked;
  }
  catch {
    return false;
  }
}
// Sesi pemain bersumber dari kode pendaftaran, tanpa akun palsu berbasis username.
const PLAYER_COOKIE = 'ssc_player';
const PLAYER_SESSION_SECONDS = 90 * 24 * 60 * 60;
// Cookie pemain harus berlaku pada /voting.html juga, bukan hanya /api.
// Atribut HttpOnly/Secure/SameSite tetap dipertahankan untuk keamanan.
const playerCookie = (value, age) => `${PLAYER_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
const oldPlayerCookie = (value, age) => `${PLAYER_COOKIE}=${value}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
function playerCookieResponse(payload, token, age, status = 200) {
  const response = J(payload, status);
  response.headers.append('Set-Cookie', playerCookie(token, age));
  // Hapus sesi Path=/api versi lama agar tidak bertabrakan dengan cookie Path=/.
  response.headers.append('Set-Cookie', oldPlayerCookie('', 0));
  return response;
}
function readPlayerCookie(req) {
  return (req.headers.get('Cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(PLAYER_COOKIE + '='))?.slice(PLAYER_COOKIE.length + 1) || '';
}
async function signPlayer(env, id) {
  const part = b64(JSON.stringify({ id, exp: Math.floor(Date.now() / 1000) + PLAYER_SESSION_SECONDS, nonce: uid() }));
  return part + '.' + await hmac(env.SESSION_SECRET + '|player-session', part);
}
async function playerSession(req, env) {
  if (!env.SESSION_SECRET)
    return null;
  const token = readPlayerCookie(req), parts = token.split('.');
  if (parts.length !== 2)
    return null;
  const expected = await hmac(env.SESSION_SECRET + '|player-session', parts[0]);
  if (!safeEq(parts[1], expected))
    return null;
  try {
    const payload = JSON.parse(unb64(parts[0]));
    if (!/^[0-9a-f-]{36}$/.test(payload.id) || !Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000))
      return null;
    const revoked = await env.DB.prepare('SELECT token_hash FROM revoked_sessions WHERE token_hash=?').bind(await digest(token)).first();
    if (revoked)
      return null;
    return await env.DB.prepare('SELECT id,tracking_code,submitted_at,status FROM submissions WHERE id=?').bind(payload.id).first();
  }
  catch {
    return null;
  }
}
async function applicationByCode(env, raw) {
  const code = s(raw, 50).toUpperCase().replace(/[\s-]/g, '');
  if (/^[0-9A-F]{20}$/.test(code))
    return await env.DB.prepare('SELECT id,tracking_code,submitted_at,status FROM submissions WHERE tracking_code=?').bind(code).first();
  if (!/^[0-9A-F]{8}$/.test(code))
    return null;
  const r = await env.DB.prepare('SELECT id,tracking_code,submitted_at,status FROM submissions WHERE UPPER(SUBSTR(id,1,8))=? AND tracking_code IS NULL LIMIT 2').bind(code).all();
  return (r.results || []).length === 1 ? r.results[0] : null;
}
const playerPublicInfo = app => ({ code: app.tracking_code || app.id.slice(0, 8).toUpperCase(), status: app.status, submittedAt: app.submitted_at });
const sameOrigin = req => !req.headers.get('Origin') || req.headers.get('Origin') === new URL(req.url).origin;
async function body(req, limit = 250000) {
  if (Number(req.headers.get('Content-Length') || 0) > limit)
    throw Error('Data terlalu besar.');
  const t = await req.text();
  if (t.length > limit)
    throw Error('Data terlalu besar.');
  const v = parse(t);
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw Error('Data yang dikirim tidak sesuai.');
  return v;
}
async function cooldownKey(env, req) {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  return digest(env.SESSION_SECRET + '|registration-cooldown|' + ip);
}
async function cooldownLeft(env, req) {
  const key = await cooldownKey(env, req), row = await env.DB.prepare('SELECT expires_at FROM rate_limits WHERE key=?').bind(key).first();
  return Math.max(0, Number(row?.expires_at || 0) - Math.floor(Date.now() / 1000));
}
async function claimCooldown(env, req, seconds) {
  if (seconds <= 0)
    return { claimed: false, remainingSeconds: 0 };
  const now = Math.floor(Date.now() / 1000), expires = now + seconds, key = await cooldownKey(env, req);
  const result = await env.DB.prepare(`INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?)
 ON CONFLICT(key) DO UPDATE SET count=1,expires_at=excluded.expires_at
 WHERE rate_limits.expires_at<=?`).bind(key, expires, now).run();
  if ((result.meta?.changes || 0) > 0)
    return { claimed: true, key, expires, remainingSeconds: seconds };
  return { claimed: false, remainingSeconds: await cooldownLeft(env, req) };
}
async function releaseCooldown(env, claim) {
  if (claim?.claimed)
    await env.DB.prepare('DELETE FROM rate_limits WHERE key=? AND expires_at=?').bind(claim.key, claim.expires).run();
}
const cooldownResponse = seconds => J({
  error: 'Pendaftaran berikutnya belum tersedia. Coba lagi setelah hitung mundur selesai.',
  remainingSeconds: seconds
}, 429, { 'Retry-After': String(Math.max(1, seconds)) });
async function rateLimit(env, req, purpose, max, window) {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const key = await digest(env.SESSION_SECRET + '|' + purpose + '|' + ip), now = Math.floor(Date.now() / 1000), expires = now + window;
  await env.DB.prepare(`INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END`).bind(key, expires, now, now, expires).run();
  const r = await env.DB.prepare('SELECT count FROM rate_limits WHERE key=?').bind(key).first();
  return Number(r?.count || 0) <= max;
}
function videoUrl(raw) {
  const value = s(raw, 500);
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:')
      return null;
    const h = u.hostname.toLowerCase().replace(/^www\./, '');
    let id = '';
    if (h === 'youtu.be') {
      id = u.pathname.split('/')[1] || '';
    }
    else if (h === 'youtube.com' || h === 'm.youtube.com' || h === 'youtube-nocookie.com') {
      if (u.pathname === '/watch')
        id = u.searchParams.get('v') || '';
      else if (/^\/(shorts|embed)\//.test(u.pathname))
        id = u.pathname.split('/')[2] || '';
    }
    if (/^[\w-]{11}$/.test(id))
      return 'https://www.youtube-nocookie.com/embed/' + id;
    if (h === 'vimeo.com' || h === 'player.vimeo.com') {
      const seg = u.pathname.split('/').filter(Boolean).pop();
      if (/^\d{6,12}$/.test(seg || ''))
        return 'https://player.vimeo.com/video/' + seg;
    }
  }
  catch { }
  return null;
}
const DEFAULT_GALLERY = [
  ['assets/gallery/sscircle-01.webp', 'SSCircle Community', 'Bangunan dan cerita yang tumbuh bersama komunitas.'],
  ['assets/gallery/sscircle-02.webp', 'Castle of SSCircle', 'Arsitektur megah, dibangun dengan detail.'],
  ['assets/gallery/sscircle-03.webp', 'Dunia yang luas', 'Setiap perjalanan membawa kisah baru.'],
  ['assets/gallery/sscircle-04.webp', 'Sudut Kota', 'Bangunan unik yang mewarnai dunia.'],
  ['assets/gallery/sscircle-05.webp', 'Hanami District', 'Kawasan dengan sentuhan sakura.'],
  ['assets/gallery/sscircle-06.webp', 'The Ancient Circle', 'Pemandangan misterius dari ketinggian.'],
  ['assets/gallery/sscircle-07.webp', 'Community Hall', 'Cerita yang lahir dari pertemuan.'],
  ['assets/gallery/sscircle-08.webp', 'Gather Together', 'Berkumpul, membangun, dan bertualang.'],
  ['assets/gallery/sscircle-09.webp', 'Memories', 'Kenangan berharga di dalam server.']
].map(([src, title, caption]) => ({ src, title, caption }));
const SOCIAL_DEFAULTS = [
  {
    id: 'tiktok-owner',
    title: 'JasitS',
    description: 'TikTok Owner SSCircle Server',
    url: 'https://www.tiktok.com/@jasitsaja',
    icon: 'assets/tiktok-logo.png',
    showHome: true,
    showRegistration: true
  },
  {
    id: 'tiktok-community',
    title: 'SSCircle Community',
    description: 'TikTok resmi SSCircle Community',
    url: 'https://www.tiktok.com/@sscircle.id',
    icon: 'assets/tiktok-logo.png',
    showHome: true,
    showRegistration: true
  }
];
const SOCIAL_BUILTIN_ICONS = new Set(['assets/tiktok-logo.png', 'assets/discord-logo.png', 'assets/sscircle-community-icon.png']);
// URL eksternal untuk <img>. Tolak protokol berbahaya, alamat lokal, IP langsung,
// kredensial, serta karakter yang berpotensi merusak atribut HTML/CSS.
function externalImageUrl(raw) {
  const value = s(raw, 700);
  if (!value || typeof raw !== 'string' || raw.length !== value.length || /[\u0000-\u001f\u007f<>"'\\]/.test(value))
    return false;
  try {
    const u = new URL(value), host = u.hostname.toLowerCase();
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && host.includes('.') &&
      host !== 'localhost' && !host.endsWith('.localhost') && !host.endsWith('.local') && !host.endsWith('.internal') &&
      !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) && !host.startsWith('[');
  }
  catch {
    return false;
  }
}
const IMAGE_BUILTINS = /^(?:assets\/gallery\/sscircle-0[1-9]\.webp|assets\/(?:sscircle-logo|sscircle-community-icon|tiktok-logo|discord-logo)\.png)$/;
function imageSource(value, label = 'Gambar') {
  const src = s(value, 700);
  if (IMAGE_BUILTINS.test(src) || /^\/api\/media\/[0-9a-f-]{36}$/.test(src) || externalImageUrl(src))
    return src;
  throw Error(label + ' harus berupa gambar bawaan, media tersimpan, atau URL HTTPS publik yang valid.');
}
function safeSocialIcon(value) {
  const icon = s(value, 700);
  return (IMAGE_BUILTINS.test(icon) || /^\/api\/media\/[0-9a-f-]{36}$/.test(icon) || externalImageUrl(icon)) ? icon : 'assets/tiktok-logo.png';
}
function validSocialLinks(input) {
  if (!Array.isArray(input) || input.length > 20)
    throw Error('Maksimal 20 tautan media sosial.');
  const ids = new Set();
  return input.map((link, i) => {
    if (!link || typeof link !== 'object')
      throw Error('Tautan sosial tidak valid.');
    let id = s(link.id, 64);
    if (!/^[a-z0-9_-]{1,64}$/i.test(id))
      id = 'social-' + i + '-' + uid().slice(0, 8);
    if (ids.has(id))
      throw Error('Tautan sosial duplikat.');
    ids.add(id);
    const title = s(link.title, 90), description = s(link.description, 240), url = s(link.url, 500);
    if (!title || !url)
      throw Error('Isi judul dan URL media sosial.');
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname.includes('.'))
        throw Error();
    }
    catch {
      throw Error('Tautan media sosial harus menggunakan alamat HTTPS yang valid.');
    }
    return {
      id,
      title,
      description,
      url,
      icon: safeSocialIcon(link.icon),
      showHome: link.showHome === true,
      showRegistration: link.showRegistration === true
    };
  });
}
const HOME_DEFAULTS = {
  homeEnabled: true,
  homeVideoEnabled: true,
  homeVideoUrl: 'assets/sscircle-cinematic.mp4',
  homeVideoOverlay: 59,
  homeHeroHeight: 94,
  homePauseOffscreen: true,
  homePoster: 'assets/gallery/sscircle-01.webp',
  homeEyebrow: 'MINECRAFT SMP · JAVA & BEDROCK',
  homeTitle: 'SSCircle Server',
  homeSubtitle: 'Setiap blok menyimpan cerita. Setiap pemain adalah bagian darinya.',
  homePrimaryCTA: 'Daftar Sekarang',
  homeSecondaryCTA: 'Jelajahi Server',
  homeStatusCTA: 'Cek Pendaftaran',
  homeStatusEyebrow: 'SUDAH MENDAFTAR?',
  homeStatusTitle: 'Pantau ceritamu berikutnya.',
  homeStatusDescription: '',
  homeAboutEyebrow: 'OUR WORLD',
  homeAboutTitle: 'Tempat cerita dimulai.',
  homeAboutText: 'Bangun duniamu, temukan teman baru, dan ciptakan momen yang akan selalu diingat. SSCircle adalah rumah untuk petualangan yang kita bentuk bersama.',
  homeAboutTagsEnabled: true,
  homeAboutTags: [{ symbol: '✧', text: 'Survival Community' }, { symbol: '✧', text: 'Java & Bedrock' }, { symbol: '✧', text: 'Petualangan Bersama' }],
  homeGalleryEyebrow: 'MOMENTS & MEMORIES',
  homeGalleryTitle: 'SSCircle Gallery',
  homeGalleryText: 'Sejumlah sudut dan kenangan dari perjalanan komunitas kami.',
  homeProcessTitle: 'Join our Circle',
  homeProcessText: 'Daftar, tunggu hasil seleksi, lalu mulai cerita barumu di server.',
  homeDiscordTitle: 'Temukan komunitasmu.',
  homeDiscordText: 'Pengumuman, informasi pendaftaran, dan obrolan pemain tersedia di Discord SSCircle Community.',
  homeDiscordUrl: 'https://discord.gg/vQQSgY2GRS',
  homeDonateEnabled: true,
  homeDonateTitle: 'Jika ingin mendukung server ini',
  homeDonateText: 'Donasi kalian akan sangat membantu dalam memperpanjang dan memperbaiki server ini. Terima kasih banyak atas dukungan kalian!',
  homeDonateButton: 'Donasi Sekarang ↗',
  homeDonateUrl: 'https://sociabuzz.com/jasits',
  homeDonateIcon: 'assets/sscircle-community-icon.png',
  homeVotingEnabled: false,
  homeVotingTitle: 'Voting Komunitas',
  homeVotingQuestion: 'Menurutmu, apa yang paling cocok untuk SSCircle?',
  homeVotingText: 'Ikuti voting komunitas SSCircle dan pilih opsi favoritmu.',
  homeVotingButton: 'Vote Sekarang ↗',
  homeVotingDeadlineLabel: 'Voting akan ditutup pada waktunya.',
  homeVotingPermanent: false,
  homeVotingEndsAt: '',
  homeVotingShowImage: true,
  homeVotingImage: '',
  homeVotingResultsMode: 'after_end',
  homeVotingRequireCode: true,
  homeVotingSessionId: 'voting-1',
  homeVotingImages: [],
  homeVotingOptions: [{ id: 'opsi-1', label: 'Pilihan 1' }, { id: 'opsi-2', label: 'Pilihan 2' }],
  homeVotingVotes: [],
  homeLeaderboardEnabled: false,
  homeLeaderboardTitle: 'Leaderboard Komunitas',
  homeLeaderboardText: 'Riwayat pemain terbaik dari setiap season SSCircle.',
  homeLeaderboardSeasons: [
    { id: 'season-1', title: 'Leaderboard S1', entries: [{ name: '', score: '' }, { name: '', score: '' }, { name: '', score: '' }] },
    { id: 'season-2', title: 'Leaderboard S2', entries: [{ name: '', score: '' }, { name: '', score: '' }, { name: '', score: '' }] }
  ],
  homeProfileEnabled: false,
  homeShowProfile: false,
  homeProfileEyebrow: 'PROFILE / HISTORY',
  homeProfileTitle: 'Cerita di balik SSCircle',
  homeProfileSubtitle: 'Dari pemain, untuk komunitas.',
  homeProfileText: 'Kenali perjalanan dan sosok di balik komunitas SSCircle Server.',
  homeProfileImage: 'assets/sscircle-logo.png',
  homeProfileItems: [],
  homeProfileCardSize: 'normal',
  homeFooterText: 'One circle. Endless stories.',
  homeClosedMessage: 'Pendaftaran sedang ditutup, coba lagi lain kali dan tunggu informasi lebih lanjut dari Discord dan Admin Server',
  homeGallery: DEFAULT_GALLERY,
  homeExternalImages: [], // Bookmark URL saja; tidak menyimpan file atau mengurangi kuota media.
  homeSocialLinks: SOCIAL_DEFAULTS,
  homeShowAbout: true,
  homeShowGallery: true,
  homeShowProcess: true,
  homeShowDiscord: true,
  homeShowDonate: true,
  homeShowVoting: false,
  homeShowLeaderboard: false,
  homeLayout: [
    { id: "about", kind: "builtin" },
    { id: "gallery", kind: "builtin" },
    { id: "process", kind: "builtin" },
    { id: "community", kind: "builtin" },
    { id: "profile", kind: "builtin" },
    { id: "leaderboard", kind: "builtin" },
    { id: "status", kind: "builtin" }
  ]
};
const DEFAULTS = {
  ...HOME_DEFAULTS,
  title: 'Pendaftaran SSCircle Server',
  subtitle: 'Your story starts here.',
  description: 'Bergabung dengan komunitas Minecraft SSCircle Server.',
  open: true,
  brandName: 'SSCircle Server',
  brandLabel: 'REGISTRATION',
  headerBadge: 'PENDAFTARAN DIBUKA',
  heroBadgeLeft: 'SSCIRCLE / SERVER',
  heroBadgeRight: 'REGISTRATION',
  heroEyebrow: 'THE NEXT CHAPTER',
  heroTitle: 'SSCircle Server',
  heroTagline: 'Petualangan baru. Cerita baru.',
  heroSubtitle: 'Komunitas yang sama.',
  heroFootnote: 'MINECRAFT SMP · JAVA + BEDROCK',
  heroStep1: 'DAFTAR',
  heroStep2: 'SELEKSI',
  heroStep3: 'BERMAIN',
  formEyebrow: 'APPLICATION FORM',
  sectionIndex: '001 — SSCIRCLE',
  pageLabel: 'REGISTRATION',
  availabilityOpen: 'PENDAFTARAN DIBUKA',
  availabilityClosed: 'PENDAFTARAN DITUTUP',
  formHint: 'Isi formulir di bawah dengan lengkap dan jujur.',
  submitTitle: 'Siap bergabung dengan SSCircle Server?',
  submitDescription: 'Pilih Lanjut untuk melihat halaman berikutnya, atau Kirim untuk menyelesaikan pendaftaran.',
  privacyNote: 'Jawaban hanya bisa dilihat tim admin SSCircle Server.',
  footerText: 'One circle. Endless stories.',
  footerNote: '© 2026 SSCircle Server',
  successTitle: 'Pendaftaran berhasil dikirim.',
  successDescription: 'Jawabanmu sudah tersimpan dan masuk ke dashboard admin.',
  successEyebrow: 'APPLICATION RECEIVED',
  backHomeText: 'Kembali ke beranda',
  buttonBack: 'Kembali',
  buttonNext: 'Lanjut ke halaman berikutnya',
  buttonSend: 'Kirim pendaftaran',
  logoMediaId: '',
  logoImageUrl: '',
  heroImageUrl: '',
  introLogoImageUrl: '',
  heroMediaId: '',
  introLogoMediaId: '',
  accentColor: '#bc91f5',
  secondaryColor: '#8069bf',
  backgroundColor: '#0c0815',
  backgroundEndColor: '#1b1030',
  textColor: '#f5efff',
  mutedColor: '#b8a5ca',
  panelColor: '#20142f',
  borderColor: '#62457d',
  inputColor: '#130b20',
  buttonTextColor: '#1e0d35',
  gradientStartColor: '#3a2056',
  gradientEndColor: '#1b102d',
  highlightColor: '#b29ad6',
  successColor: '#b6e2ce',
  dangerColor: '#ff9caf',
  headerBackgroundColor: '#120b20',
  headerTextColor: '#f5efff',
  footerBackgroundColor: '#0c0815',
  footerTextColor: '#b8a5ca',
  headingColor: '#f5efff',
  linkColor: '#bc91f5',
  linkHoverColor: '#dfcbff',
  badgeBackgroundColor: '#3a2056',
  badgeTextColor: '#dfcbff',
  placeholderColor: '#76698b',
  dividerColor: '#62457d',
  inputBorderColor: '#62457d',
  inputFocusColor: '#bc91f5',
  inputTextColor: '#f5efff',
  primaryButtonColor: '#bc91f5',
  primaryButtonEndColor: '#8069bf',
  secondaryButtonColor: '#20142f',
  secondaryButtonTextColor: '#f5efff',
  cardGradientStartColor: '#20142f',
  cardGradientEndColor: '#20142f',
  selectedBackgroundColor: '#8069bf',
  selectedTextColor: '#ffffff',
  shadowColor: '#7147ba',
  warningColor: '#f0c785',
  heroTitleColor: '#ffffff',
  heroOverlayColor: '#0c0815',
  themeGradientAngle: 135,
  pageBackgroundMode: 'gradient',
  pageBackgroundAngle: 160,
  cardGradientEnabled: false,
  adminThemeEnabled: false,
  themeOverrides: [],
  introEnabled: true,
  introTitle: 'SSCircle Server',
  introSubtitle: 'REGISTRATION',
  introDuration: 2300,
  statusEyebrow: 'APPLICATION TRACKER',
  statusHeading: 'Cek status pendaftaran.',
  statusDescription: 'Masukkan kode pendaftaran untuk melihat apakah kamu sedang menunggu, diterima, atau ditolak beserta alasannya.',
  statusButtonText: 'Periksa status',
  statusOwnCodeEnabled: true,
  statusOwnCodeTitle: 'Lihat kode pendaftaran saya',
  statusOwnCodeDescription: 'Jika sesi akun masih aktif, kode pendaftaranmu bisa dilihat dan disalin tanpa masuk ulang.',
  statusOwnCodeHelp: 'Jika sudah keluar, masuk satu kali dengan kode asli atau hubungi admin untuk verifikasi.',
  statusOwnCodeLoginText: 'Masuk & lihat kode',
  statusOwnCodeCopyText: 'Salin kode',
  statusOwnCodeCheckText: 'Cek status saya',
  statusOwnCodeLogoutText: 'Keluar akun',
  cooldownMinutes: DEFAULT_COOLDOWN_MINUTES
};
function safeDonateIcon(value) {
  const icon = s(value, 700);
  return (IMAGE_BUILTINS.test(icon) || /^\/api\/media\/[0-9a-f-]{36}$/.test(icon) || externalImageUrl(icon)) ? icon : 'assets/sscircle-community-icon.png';
}
function validVotingOptions(input) {
  const options = Array.isArray(input) ? input : [];
  if (options.length < 1 || options.length > 20)
    throw Error('Voting membutuhkan 1 sampai 20 pilihan.');
  const used = new Set();
  return options.map((item, index) => {
    const id = s(item?.id, 64) || ('vote-' + (index + 1));
    const cleanId = id.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || ('vote-' + (index + 1));
    if (used.has(cleanId))
      throw Error('Pilihan voting duplikat.');
    used.add(cleanId);
    const label = s(item?.label, 120);
    if (!label)
      throw Error('Label pilihan voting wajib diisi.');
    const description = s(item?.description, 500);
    const imagesRaw = Array.isArray(item?.images) ? item.images : [];
    if (imagesRaw.length > 6)
      throw Error('Maksimal 6 gambar untuk satu pilihan voting.');
    const images = [...new Set(imagesRaw.map(src => imageSource(src, 'Gambar pilihan voting')))];
    return { id: cleanId, label, description, images };
  });
}
function validVotingVotes(input, options) {
  const votes = Array.isArray(input) ? input : [];
  const seen = new Set();
  return votes.slice(0, 5000).flatMap(v => {
    const account = s(v?.account, 40).replace(/\s+/g, ' ').trim();
    const optionId = s(v?.optionId, 64);
    const voterKey = s(v?.voterKey, 128) || ('name:' + account.toLowerCase());
    if (!voterKey || !optionId || seen.has(voterKey))
      return [];
    seen.add(voterKey);
    return [{ account, optionId, voterKey, createdAt: s(v?.createdAt, 40) || new Date().toISOString() }];
  });
}
function validLeaderboard(input) {
  const seasons = Array.isArray(input) ? input : [];
  if (seasons.length > 12)
    throw Error('Maksimal 12 season leaderboard.');
  const seen = new Set();
  return seasons.map((season, index) => {
    const rawId = s(season?.id, 64) || ('season-' + (index + 1));
    const id = rawId.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || ('season-' + (index + 1));
    if (seen.has(id))
      throw Error('ID leaderboard season duplikat.');
    seen.add(id);
    const title = s(season?.title, 120) || ('Leaderboard S' + (index + 1));
    const entriesRaw = Array.isArray(season?.entries) ? season.entries : [];
    const entries = entriesRaw.slice(0, 20).map(entry => ({ name: s(entry?.name, 80), score: s(entry?.score, 80) })).filter(entry => entry.name || entry.score);
    return { id, title, entries };
  }).filter(season => season.title);
}
function votingRuntime(settings) {
  const now = Date.now();
  const endsAt = settings.homeVotingPermanent ? 0 : Date.parse(settings.homeVotingEndsAt || '');
  const hasEnd = Number.isFinite(endsAt) && endsAt > 0;
  const expired = hasEnd && endsAt <= now;
  const active = settings.homeVotingEnabled === true && (!hasEnd || !expired || settings.homeVotingPermanent === true);
  const options = Array.isArray(settings.homeVotingOptions) ? settings.homeVotingOptions : [];
  const votes = Array.isArray(settings.homeVotingVotes) ? settings.homeVotingVotes : [];
  const counts = {};
  for (const option of options)
    counts[option.id] = 0;
  for (const vote of votes)
    if (Object.hasOwn(counts, vote.optionId))
      counts[vote.optionId]++;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const results = options.map(option => ({
    id: option.id,
    label: option.label,
    count: counts[option.id] || 0,
    percent: total ? Math.round(((counts[option.id] || 0) / total) * 1000) / 10 : 0
  }));
  const resultsMode = ['always', 'after_end', 'hidden'].includes(settings.homeVotingResultsMode) ? settings.homeVotingResultsMode : 'after_end';
  const showResults = resultsMode === 'always' || (resultsMode === 'after_end' && (!active || expired));
  return {
    active,
    expired,
    hasEnd,
    endsAt: hasEnd ? new Date(endsAt).toISOString() : '',
    options,
    votes,
    results,
    total,
    showResults,
    resultsMode
  };
}
async function readSettingsRow(env) {
  return await env.DB.prepare('SELECT * FROM form_config WHERE id=1').first();
}
async function publicVotingPayload(env) {
  const form = formFrom(await readSettingsRow(env));
  const settings = form.settings;
  const runtime = votingRuntime(settings);
  return {
    enabled: settings.homeVotingEnabled === true,
    title: settings.homeVotingTitle,
    question: settings.homeVotingQuestion,
    text: settings.homeVotingText,
    button: settings.homeVotingButton,
    images: settings.homeVotingShowImage !== false ? (settings.homeVotingImages || []) : [],
    requireCode: true,
    permanent: settings.homeVotingPermanent === true,
    endsAt: runtime.endsAt,
    active: runtime.active,
    expired: runtime.expired,
    deadlineLabel: settings.homeVotingDeadlineLabel,
    options: runtime.options,
    results: runtime.showResults ? runtime.results : [],
    showResults: runtime.showResults,
    totalVotes: runtime.showResults ? runtime.total : 0
  };
}
// Pemeriksaan dan penyimpanan suara
async function submitVote(env, req) {
  if (!(await rateLimit(env, req, 'vote', 8, 900)))
    return bad('Terlalu banyak percobaan voting. Coba lagi nanti.', 429);
  const input = await body(req, 2400);
  const optionId = s(input.optionId, 64);
  const row = await readSettingsRow(env);
  if (!row)
    return bad('Voting belum tersedia.', 404);
  const settings = normalSettings(parse(row.settings) || {}), runtime = votingRuntime(settings);
  if (settings.homeVotingEnabled !== true)
    return bad('Voting sedang ditutup.', 403);
  if (!runtime.active)
    return bad(runtime.expired ? 'Voting sudah berakhir.' : 'Voting sedang tidak tersedia.', 403);
  if (!runtime.options.some(option => option.id === optionId))
    return bad('Pilihan voting tidak valid.', 400);
  const application = await playerSession(req, env);
  if (!application)
    return bad('Masuk menggunakan kode pendaftaran terlebih dahulu.', 401);
  if (application.status !== VOTING_ACCEPTED_STATUS)
    return bad('Hanya pendaftar berstatus Diterima yang dapat mengikuti voting.', 403);
  const voterKey = 'app:' + application.id;
  const safeAccount = 'Pendaftar ' + application.id.slice(0, 8).toUpperCase();
  const now = new Date().toISOString(), vote = { voterKey, account: safeAccount, optionId, createdAt: now };
  if (runtime.votes.some(v => v.voterKey === voterKey || (!v.voterKey && String(v.account || '').toLowerCase() === safeAccount.toLowerCase())))
    return bad('Akun ini sudah menggunakan hak votingnya.', 409);
  if (runtime.votes.length >= 5000)
    return bad('Jumlah suara sudah mencapai batas voting. Hubungi admin.', 409);
  // One atomic JSON append prevents lost votes and duplicate keys under concurrent requests.
  const res = await env.DB.prepare(`UPDATE form_config
 SET settings=json_set(settings,'$.homeVotingVotes',json(json_insert(COALESCE(json_extract(settings,'$.homeVotingVotes'),'[]'),'$[#]',json(?))))
 WHERE id=1
 AND COALESCE(json_extract(settings,'$.homeVotingSessionId'),'voting-1')=?
 AND json_extract(settings,'$.homeVotingEnabled')=1
 AND (json_extract(settings,'$.homeVotingPermanent')=1 OR json_extract(settings,'$.homeVotingEndsAt') IS NULL OR json_extract(settings,'$.homeVotingEndsAt')='' OR json_extract(settings,'$.homeVotingEndsAt')>?)
 AND json_array_length(COALESCE(json_extract(settings,'$.homeVotingVotes'),'[]'))<5000
 AND EXISTS (SELECT 1 FROM submissions WHERE id=? AND status='accepted')
 AND NOT EXISTS (SELECT 1 FROM json_each(COALESCE(json_extract(settings,'$.homeVotingVotes'),'[]'))
 WHERE json_extract(value,'$.voterKey')=? OR (json_extract(value,'$.voterKey') IS NULL AND lower(json_extract(value,'$.account'))=?))`)
    .bind(JSON.stringify(vote), settings.homeVotingSessionId || 'voting-1', now, application.id, voterKey, safeAccount.toLowerCase()).run();
  if (!Number(res.meta?.changes || 0))
    return bad('Voting tidak tersimpan. Akun sudah memilih atau sesi telah berubah. Muat ulang halaman.', 409);
  const payload = await publicVotingPayload(env);
  return J({
    ok: true,
    message: 'Voting berhasil dikirim.',
    results: payload.results,
    showResults: payload.showResults,
    totalVotes: payload.totalVotes
  });
}
// Validasi pengaturan dari Admin Control
function settingsValid(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw Error('Pengaturan formulir tidak valid.');
  const out = { ...DEFAULTS };
  const sizes = {
    title: 100,
    subtitle: 160,
    description: 1500,
    brandName: 60,
    brandLabel: 40,
    headerBadge: 80,
    heroBadgeLeft: 80,
    heroBadgeRight: 80,
    heroEyebrow: 90,
    heroTitle: 90,
    heroTagline: 160,
    heroSubtitle: 160,
    heroFootnote: 100,
    heroStep1: 45,
    heroStep2: 45,
    heroStep3: 45,
    formEyebrow: 80,
    sectionIndex: 80,
    pageLabel: 80,
    availabilityOpen: 80,
    availabilityClosed: 80,
    formHint: 220,
    submitTitle: 140,
    submitDescription: 280,
    privacyNote: 180,
    footerText: 160,
    footerNote: 150,
    successTitle: 120,
    successDescription: 250,
    successEyebrow: 80,
    backHomeText: 90,
    buttonBack: 70,
    buttonNext: 100,
    buttonSend: 100,
    introTitle: 90,
    introSubtitle: 130,
    statusEyebrow: 80,
    statusHeading: 120,
    statusDescription: 280,
    statusButtonText: 80,
    statusOldHint: 150,
    statusOwnCodeTitle: 110,
    statusOwnCodeDescription: 350,
    statusOwnCodeHelp: 350,
    statusOwnCodeLoginText: 80,
    statusOwnCodeCopyText: 80,
    statusOwnCodeCheckText: 80,
    statusOwnCodeLogoutText: 80
  };
  for (const [key, max] of Object.entries(sizes))
    if (Object.hasOwn(input, key))
      out[key] = s(input[key], max);
  if (!out.title)
    throw Error('Judul formulir wajib diisi.');
  if (!out.brandName)
    throw Error('Nama website wajib diisi.');
  out.statusOwnCodeEnabled = input.statusOwnCodeEnabled !== false;
  out.open = input.open === true;
  out.introEnabled = input.introEnabled !== false;
  for (const key of ['logoMediaId', 'heroMediaId', 'introLogoMediaId']) {
    out[key] = s(input[key], 64);
    if (out[key] && !/^[0-9a-f-]{36}$/.test(out[key]))
      throw Error('ID gambar tidak valid.');
  }
  for (const key of ['logoImageUrl', 'heroImageUrl', 'introLogoImageUrl']) {
    const value = s(input[key], 700);
    out[key] = value ? imageSource(value, key) : '';
  }
  for (const key of [
    'accentColor',
    'secondaryColor',
    'backgroundColor',
    'backgroundEndColor',
    'textColor',
    'mutedColor',
    'panelColor',
    'borderColor',
    'inputColor',
    'buttonTextColor',
    'gradientStartColor',
    'gradientEndColor',
    'highlightColor',
    'successColor',
    'dangerColor',
    'headerBackgroundColor',
    'headerTextColor',
    'footerBackgroundColor',
    'footerTextColor',
    'headingColor',
    'linkColor',
    'linkHoverColor',
    'badgeBackgroundColor',
    'badgeTextColor',
    'placeholderColor',
    'dividerColor',
    'inputBorderColor',
    'inputFocusColor',
    'inputTextColor',
    'primaryButtonColor',
    'primaryButtonEndColor',
    'secondaryButtonColor',
    'secondaryButtonTextColor',
    'cardGradientStartColor',
    'cardGradientEndColor',
    'selectedBackgroundColor',
    'selectedTextColor',
    'shadowColor',
    'warningColor',
    'heroTitleColor',
    'heroOverlayColor'
  ]) {
    const color = s(input[key] || DEFAULTS[key], 7);
    if (!/^#[0-9a-fA-F]{6}$/.test(color))
      throw Error('Warna harus format HEX #RRGGBB.');
    out[key] = color.toLowerCase();
  }
  // Component-level color overrides. Only simple selectors/HEX colors are accepted.
  const rawTheme = input.themeOverrides === undefined ? [] : input.themeOverrides;
  if (!Array.isArray(rawTheme) || rawTheme.length > 80)
    throw Error('Maksimal 80 warna khusus komponen.');
  const validStates = ['hover', 'focus', 'focus-visible', 'active', 'checked', 'disabled', 'focus-within'];
  const validSelector = selector => {
    if (!/^(?=.{1,140}$)[a-zA-Z.#][a-zA-Z0-9_.# >+~:*\-]*$/.test(selector) || /\.{2,}|#{2,}/.test(selector))
      return false;
    const normalized = selector.replace(/::(?:before|after|placeholder|selection)\b/g, '');
    if (normalized.includes('::'))
      return false;
    return normalized.split(':').slice(1).every(part => validStates.some(state => part === state || part.startsWith(state + ' ') || part.startsWith(state + '>')));
  };
  const validProperties = new Set(['text', 'background', 'border', 'outline', 'gradient', 'shadow', 'highlight']);
  out.themeOverrides = rawTheme.map((rule, i) => {
    if (!rule || typeof rule !== 'object')
      throw Error('Pengaturan warna komponen ke-' + (i + 1) + ' tidak valid.');
    const selector = s(rule.selector, 140), property = s(rule.property, 30);
    const value = s(rule.value, 7).toLowerCase(), value2 = s(rule.value2 || value, 7).toLowerCase();
    const angle = Number(rule.angle === undefined ? 135 : rule.angle);
    if (!validSelector(selector) || !validProperties.has(property) || !/^#[0-9a-f]{6}$/.test(value) || !/^#[0-9a-f]{6}$/.test(value2) || !Number.isFinite(angle) || angle < 0 || angle > 360)
      throw Error('Selector, properti, atau warna pada aturan ke-' + (i + 1) + ' tidak valid.');
    return { selector, property, value, value2, angle: Math.round(angle) };
  });
  const themeAngle = Number(input.themeGradientAngle ?? 135);
  if (!Number.isFinite(themeAngle) || themeAngle < 0 || themeAngle > 360)
    throw Error('Sudut gradasi harus 0–360 derajat.');
  out.themeGradientAngle = Math.round(themeAngle);
  out.pageBackgroundMode = input.pageBackgroundMode === 'solid' ? 'solid' : 'gradient';
  const pageAngle = Number(input.pageBackgroundAngle ?? 160);
  if (!Number.isFinite(pageAngle) || pageAngle < 0 || pageAngle > 360)
    throw Error('Sudut latar halaman harus 0–360 derajat.');
  out.pageBackgroundAngle = Math.round(pageAngle);
  out.cardGradientEnabled = input.cardGradientEnabled === true;
  out.adminThemeEnabled = input.adminThemeEnabled === true;
  const duration = Number(input.introDuration);
  out.introDuration = Number.isFinite(duration) ? Math.max(800, Math.min(6000, Math.round(duration))) : 2300;
  const cooldown = input.cooldownMinutes === undefined ? DEFAULT_COOLDOWN_MINUTES : Number(input.cooldownMinutes);
  if (!Number.isFinite(cooldown) || !Number.isInteger(cooldown) || cooldown < 0 || cooldown > MAX_COOLDOWN_MINUTES)
    throw Error('Cooldown harus antara 0 dan 10080 menit.');
  out.cooldownMinutes = cooldown;
  for (const key of [
    'homeEnabled',
    'homeVideoEnabled',
    'homePauseOffscreen',
    'homeAboutTagsEnabled',
    'homeShowAbout',
    'homeShowGallery',
    'homeShowProcess',
    'homeShowDiscord',
    'homeShowDonate',
    'homeShowVoting',
    'homeShowLeaderboard',
    'homeShowProfile',
    'homeProfileEnabled',
    'homeDonateEnabled',
    'homeVotingEnabled',
    'homeVotingPermanent',
    'homeVotingShowImage',
    'homeVotingRequireCode',
    'homeLeaderboardEnabled'
  ])
    out[key] = input[key] === undefined ? HOME_DEFAULTS[key] : input[key] === true;
  const homeTextSizes = {
    homeEyebrow: 100,
    homeTitle: 120,
    homeSubtitle: 500,
    homePrimaryCTA: 70,
    homeSecondaryCTA: 70,
    homeStatusCTA: 70,
    homeStatusEyebrow: 90,
    homeStatusTitle: 160,
    homeStatusDescription: 400,
    homeAboutEyebrow: 80,
    homeAboutTitle: 140,
    homeAboutText: 1400,
    homeGalleryEyebrow: 80,
    homeGalleryTitle: 140,
    homeGalleryText: 450,
    homeProcessTitle: 140,
    homeProcessText: 500,
    homeDiscordTitle: 140,
    homeDiscordText: 500,
    homeDonateTitle: 160,
    homeDonateText: 500,
    homeDonateButton: 90,
    homeVotingTitle: 160,
    homeVotingQuestion: 200,
    homeVotingText: 500,
    homeVotingButton: 90,
    homeVotingDeadlineLabel: 180,
    homeLeaderboardTitle: 160,
    homeLeaderboardText: 500,
    homeProfileEyebrow: 90,
    homeProfileTitle: 160,
    homeProfileSubtitle: 220,
    homeProfileText: 1000,
    homeFooterText: 180,
    homeClosedMessage: 500
  };
  for (const [key, max] of Object.entries(homeTextSizes))
    out[key] = s(input[key] === undefined ? HOME_DEFAULTS[key] : input[key], max);
  // Setiap tag Tentang Server adalah teks murni; tidak pernah ditafsirkan sebagai HTML.
  const aboutTags = input.homeAboutTags === undefined ? HOME_DEFAULTS.homeAboutTags : input.homeAboutTags;
  if (!Array.isArray(aboutTags) || aboutTags.length > 16)
    throw Error('Maksimal 16 label Tentang Server.');
  out.homeAboutTags = aboutTags.map(item => ({
    symbol: s(item?.symbol === undefined ? '✧' : item.symbol, 8),
    text: s(item?.text, 65)
  })).filter(item => item.text);
  if (out.homeProcessTitle === 'Bergabung dalam lingkaran.')
    out.homeProcessTitle = 'Join our Circle';
  const overlay = Number(input.homeVideoOverlay);
  out.homeVideoOverlay = Number.isFinite(overlay) ? Math.min(85, Math.max(20, Math.round(overlay))) : HOME_DEFAULTS.homeVideoOverlay;
  const height = Number(input.homeHeroHeight);
  out.homeHeroHeight = Number.isFinite(height) ? Math.min(100, Math.max(70, Math.round(height))) : HOME_DEFAULTS.homeHeroHeight;
  const url = s(input.homeVideoUrl === undefined ? HOME_DEFAULTS.homeVideoUrl : input.homeVideoUrl, 500);
  if (url !== 'assets/sscircle-cinematic.mp4' && !videoIdFromURL(url) && url && !/^https:\/\/[a-z0-9][^\s<>"']+\.(mp4|webm)(\?[^<>"']*)?$/i.test(url))
    throw Error('Pilih video dari Penyimpanan Media atau gunakan URL HTTPS langsung.');
  out.homeVideoUrl = url;
  const safeImage = (value) => imageSource(value);
  out.homePoster = safeImage(input.homePoster || HOME_DEFAULTS.homePoster);
  const profileImage = imageSource(input.homeProfileImage || HOME_DEFAULTS.homeProfileImage, 'Foto profil');
  out.homeProfileImage = profileImage;
  const profileItems = input.homeProfileItems === undefined
    ? [{ src: profileImage, title: 'SSCircle Server', subtitle: 'Profil & Sejarah' }]
    : input.homeProfileItems;
  if (!Array.isArray(profileItems) || profileItems.length > 24)
    throw Error('Profil & Sejarah maksimal 24 foto.');
  out.homeProfileItems = profileItems.map(item => ({
    src: imageSource(item?.src, 'Foto Profil & Sejarah'),
    title: s(item?.title, 110), subtitle: s(item?.subtitle, 240),
    detailEnabled: item?.detailEnabled === true,
    detailDescriptionEnabled: item?.detailDescriptionEnabled !== false,
    detailTitle: s(item?.detailTitle, 160),
    detailDescription: s(item?.detailDescription, 3000),
    detailImage: item?.detailImage ? imageSource(item.detailImage, 'Foto popup Profil & Sejarah') : ''
  }));
  const sizesProfile = ['compact', 'normal', 'wide'];
  out.homeProfileCardSize = sizesProfile.includes(input.homeProfileCardSize)
    ? input.homeProfileCardSize : 'normal';
  const gallery = input.homeGallery === undefined ? DEFAULT_GALLERY : input.homeGallery;
  if (!Array.isArray(gallery) || gallery.length > 24)
    throw Error('Galeri maksimal 24 gambar.');
  out.homeGallery = gallery.map(item => ({ src: safeImage(item?.src), title: s(item?.title, 110), caption: s(item?.caption, 280) }));
  const bookmarks = input.homeExternalImages === undefined ? [] : input.homeExternalImages;
  if (!Array.isArray(bookmarks) || bookmarks.length > 80)
    throw Error('Maksimal 80 bookmark foto eksternal.');
  out.homeExternalImages = bookmarks.map(item => {
    if (!externalImageUrl(item?.src))
      throw Error('Bookmark gambar harus berupa URL HTTPS publik yang valid.');
    return { src: s(item.src, 700), title: s(item.title, 110) };
  });
  const discord = s(input.homeDiscordUrl || HOME_DEFAULTS.homeDiscordUrl, 320);
  try {
    const u = new URL(discord);
    if (u.protocol !== 'https:' || !['discord.gg', 'discord.com'].includes(u.hostname.toLowerCase()) || !u.pathname.match(/^\/(invite\/)?[A-Za-z0-9-]{3,}/))
      throw Error();
  }
  catch {
    throw Error('Tautan Discord harus URL undangan resmi.');
  }
  out.homeDiscordUrl = discord;
  out.homeSocialLinks = validSocialLinks(input.homeSocialLinks === undefined ? SOCIAL_DEFAULTS : input.homeSocialLinks);
  out.homeDonateUrl = s(input.homeDonateUrl || HOME_DEFAULTS.homeDonateUrl, 500);
  try {
    const donate = new URL(out.homeDonateUrl);
    if (donate.protocol !== 'https:' || donate.username || donate.password || !donate.hostname.includes('.'))
      throw Error();
  }
  catch {
    throw Error('Tautan donasi harus menggunakan HTTPS yang valid.');
  }
  out.homeDonateIcon = safeDonateIcon(input.homeDonateIcon === undefined ? HOME_DEFAULTS.homeDonateIcon : input.homeDonateIcon);
  const votingImageRaw = s(input.homeVotingImage || '', 700);
  out.homeVotingImage = votingImageRaw ? (safeImage(votingImageRaw)) : '';
  const votingImagesRaw = Array.isArray(input.homeVotingImages) ? input.homeVotingImages : (votingImageRaw ? [votingImageRaw] : []);
  if (votingImagesRaw.length > 8)
    throw Error('Maksimal 8 gambar untuk pertanyaan voting.');
  out.homeVotingImages = [...new Set(votingImagesRaw.map(v => safeImage(v)))];
  out.homeVotingImage = out.homeVotingImages[0] || '';
  const session = s(input.homeVotingSessionId || HOME_DEFAULTS.homeVotingSessionId, 64);
  if (!/^[a-z0-9_-]{1,64}$/i.test(session))
    throw Error('ID sesi voting tidak valid.');
  out.homeVotingSessionId = session;
  out.homeVotingShowImage = input.homeVotingShowImage !== false;
  out.homeVotingPermanent = input.homeVotingPermanent === true;
  const votingEndsAt = s(input.homeVotingEndsAt || '', 40);
  if (votingEndsAt && Number.isNaN(Date.parse(votingEndsAt)))
    throw Error('Waktu akhir voting tidak valid.');
  out.homeVotingEndsAt = votingEndsAt;
  out.homeVotingResultsMode = ['always', 'after_end', 'hidden'].includes(input.homeVotingResultsMode) ? input.homeVotingResultsMode : HOME_DEFAULTS.homeVotingResultsMode;
  out.homeVotingOptions = validVotingOptions(input.homeVotingOptions === undefined ? HOME_DEFAULTS.homeVotingOptions : input.homeVotingOptions);
  if (out.homeVotingEnabled && !out.homeVotingQuestion)
    throw Error('Isi pertanyaan voting sebelum mengaktifkannya.');
  out.homeVotingRequireCode = true;
  out.homeVotingVotes = validVotingVotes(input.homeVotingVotes === undefined ? HOME_DEFAULTS.homeVotingVotes : input.homeVotingVotes, out.homeVotingOptions);
  out.homeLeaderboardSeasons = validLeaderboard(input.homeLeaderboardSeasons === undefined ? HOME_DEFAULTS.homeLeaderboardSeasons : input.homeLeaderboardSeasons);
  // Homepage Builder: bagian asli dan kartu tambahan, diproses sepenuhnya di server.
  const defaultLayout = HOME_DEFAULTS.homeLayout;
  const sourceLayout = input.homeLayout === undefined ? defaultLayout : input.homeLayout;
  const rawLayout = Array.isArray(sourceLayout) ? sourceLayout.filter(item => item?.id !== 'donate' && item?.id !== 'voting') : sourceLayout;
  if (!Array.isArray(rawLayout) || rawLayout.length > 26)
    throw Error('Maksimal 26 bagian pada Homepage.');
  const builtinIds = [
    'about',
    'gallery',
    'process',
    'community',
    'profile',
    'leaderboard',
    'status'
  ];
  const seenLayout = new Set();
  let customCount = 0;
  out.homeLayout = rawLayout.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw Error('Bagian Homepage tidak valid.');
    const id = s(entry.id, 64), kind = s(entry.kind, 12);
    if (!/^[a-z0-9_-]{1,64}$/i.test(id) || seenLayout.has(id))
      throw Error('ID bagian Homepage duplikat atau tidak valid.');
    seenLayout.add(id);
    if (kind === 'builtin') {
      if (!builtinIds.includes(id))
        throw Error('Bagian Homepage bawaan tidak dikenal.');
      return { id, kind };
    }
    if (kind !== 'custom' || !/^custom-[a-z0-9-]{8,48}$/i.test(id))
      throw Error('ID kartu tambahan tidak valid.');
    if (++customCount > 18)
      throw Error('Maksimal 18 kartu tambahan pada Homepage.');
    const type = s(entry.type, 24);
    if (!['text', 'button', 'image', 'feature', 'divider'].includes(type))
      throw Error('Jenis kartu Homepage tidak dikenali.');
    const validHref = (raw) => {
      const href = s(raw, 500);
      if (!href)
        return 'registration.html';
      if ([
        'registration.html',
        'status.html',
        'voting.html',
        '/voting',
        '#tentang',
        '#galeri',
        '#komunitas',
        '#proses',
        '#donasi',
        '#voting',
        '#leaderboard',
        '#status-quick'
      ].includes(href))
        return href;
      try {
        const u = new URL(href);
        if (u.protocol === 'https:' && !u.username && !u.password && u.hostname.includes('.'))
          return u.href;
      }
      catch { }
      throw Error('Alamat tombol harus HTTPS atau halaman SSCircle.');
    };
    const imagesRaw = Array.isArray(entry.images) ? entry.images : (entry.image ? [{ src: entry.image, caption: entry.caption || '' }] : []);
    const buttonsRaw = Array.isArray(entry.buttons) ? entry.buttons : (['button', 'feature'].includes(type) ? [{ label: entry.buttonText || 'Selengkapnya', href: entry.href || 'registration.html' }] : []);
    if (imagesRaw.length > 8 || buttonsRaw.length > 8)
      throw Error('Maksimal 8 foto dan 8 tombol per kartu.');
    const images = imagesRaw.map(img => ({ src: safeImage(img?.src || ''), caption: s(img?.caption, 240) }));
    const buttons = buttonsRaw.map(btn => ({ label: s(btn?.label, 90) || 'Selengkapnya', href: validHref(btn?.href) }));
    const width = entry.width === 'half' ? 'half' : 'full';
    const align = entry.align === 'center' ? 'center' : 'left';
    const appearance = entry.appearance === 'plain' ? 'plain' : 'card';
    return {
      id,
      kind,
      type,
      title: s(entry.title, 160),
      description: s(entry.description, 1400),
      images,
      buttons,
      width,
      align,
      appearance
    };
  });
  // Wajib mempertahankan bagian awal agar tidak menghilangkan CTA atau galeri tanpa sengaja.
  for (const id of builtinIds)
    if (!seenLayout.has(id))
      out.homeLayout.push({ id, kind: 'builtin' });
  return out;
}
function legacyPublicText(txt) {
  return String(txt ?? '').replace(/SSCircle S6/gi, 'SSCircle Server').replace(/SSCircle Season 6/gi, 'SSCircle Server');
}
// Old season badges and the old 8-character username prompt are display text,
// not database identifiers. Keep historical records and keys unchanged.
function cleanOutdatedLabel(txt) {
  return legacyPublicText(txt)
    .replace(/USERNAME\s+MINECRAFT\s*\(\s*HANYA\s+UNTUK\s+KODE\s+LAMA\s+8\s+KARAKTER\s*\)/gi, '')
    .replace(/\bSeason\s*6\b/gi, '')
    .replace(/\bS6\b/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
function normalSettings(raw) {
  const input = raw && typeof raw === 'object' ? { ...raw } : {};
  for (const key of Object.keys(input)) {
    if (typeof input[key] !== 'string' || ['logoMediaId', 'heroMediaId', 'introLogoMediaId'].includes(key))
      continue;
    input[key] = /(?:Title|Text|Description|Subtitle|CTA|Label|Hint|Heading|Eyebrow|Notice|Button|Footer|brandName|^title$)/i.test(key)
      ? cleanOutdatedLabel(input[key])
      : legacyPublicText(input[key]);
  }
  if (Array.isArray(input.homeLeaderboardSeasons)) {
    input.homeLeaderboardSeasons = input.homeLeaderboardSeasons.map(season => season && typeof season === 'object'
      ? { ...season, title: cleanOutdatedLabel(season.title) }
      : season);
  }
  if (input.homeProcessTitle === 'Bergabung dalam lingkaran.')
    input.homeProcessTitle = 'Join our Circle';
  if (!Array.isArray(input.homeProfileItems)) {
    // Migrasi otomatis konfigurasi satu foto pada versi sebelumnya.
    input.homeProfileItems = [{
        src: input.homeProfileImage || 'assets/sscircle-logo.png',
        title: 'SSCircle Server',
        subtitle: 'Profil & Sejarah'
      }];
  }
  return { ...DEFAULTS, ...input };
}
// Validasi susunan pertanyaan
function pagesValid(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 24)
    throw Error('Jumlah halaman harus 1–24.');
  const ids = new Set(), qids = new Set();
  let count = 0;
  const pages = raw.map((p, i) => {
    if (!p || typeof p !== 'object')
      throw Error('Data halaman tidak valid.');
    const id = s(p.id, 64), title = s(p.title, 140);
    if (!/^[\w-]{1,64}$/.test(id) || ids.has(id))
      throw Error('ID halaman duplikat/tidak valid.');
    ids.add(id);
    if (!title)
      throw Error('Judul halaman ' + (i + 1) + ' wajib diisi.');
    if (!Array.isArray(p.blocks) || p.blocks.length > 30)
      throw Error('Maksimal 30 blok per halaman.');
    const blocks = p.blocks.map((b, k) => {
      count++;
      if (count > 160)
        throw Error('Maksimal 160 blok per formulir.');
      if (!b || typeof b !== 'object')
        throw Error('Blok tidak valid.');
      const type = s(b.type, 30), bid = s(b.id, 64) || uid();
      if (type === 'text')
        return { id: bid, type, title: s(b.title, 160), description: s(b.description, 2000) };
      if (type === 'image') {
        const imageId = s(b.imageId, 64);
        const imageUrl = s(b.imageUrl, 700);
        if (imageUrl)
          imageSource(imageUrl, 'Foto formulir');
        if (!imageUrl && !/^[0-9a-f-]{36}$/.test(imageId))
          throw Error('Pilih gambar terlebih dahulu.');
        return { id: bid, type, imageId: imageUrl ? '' : imageId, imageUrl, caption: s(b.caption, 300) };
      }
      if (type === 'video') {
        const url = videoUrl(b.url);
        if (!url)
          throw Error('Video harus URL YouTube/Vimeo HTTPS yang valid.');
        return { id: bid, type, url, title: s(b.title, 140) };
      }
      if (type !== 'question')
        throw Error('Jenis blok tidak dikenali.');
      const q = b.question || {};
      const qid = s(q.id, 64), qt = s(q.title, 180), qtType = s(q.type, 32);
      if (!/^[\w-]{1,64}$/.test(qid) || qids.has(qid) || !qt || !TYPES.has(qtType))
        throw Error('Pertanyaan pada halaman ' + (i + 1) + ' tidak valid atau duplikat.');
      qids.add(qid);
      const options = Array.isArray(q.options) ? q.options.map(o => s(o, 140)).filter(Boolean) : [];
      if (options.length > 30 || new Set(options).size !== options.length || options.some(x => x.startsWith(OTHER_PREFIX) || x === '__SSC_OTHER_CHOICE__'))
        throw Error('Pilihan harus unik, maksimal 30, dan tidak memakai awalan khusus jawaban lainnya.');
      if (['single', 'select', 'multi'].includes(qtType) && options.length < 1)
        throw Error('Pertanyaan ' + qt + ' membutuhkan pilihan.');
      return {
        id: bid,
        type,
        question: {
          id: qid,
          title: qt,
          type: qtType,
          required: q.required === true,
          placeholder: s(q.placeholder, 200),
          options,
          allowOther: ['single', 'multi', 'select'].includes(qtType) && q.allowOther === true
        }
      };
    });
    return {
      id,
      title,
      description: s(p.description, 1500),
      blocks,
      routeQuestionId: s(p.routeQuestionId, 64),
      routes: typeof p.routes === 'object' && p.routes && !Array.isArray(p.routes) ? p.routes : {}
    };
  });
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const rq = p.blocks.filter(b => b.type === 'question').map(b => b.question).find(q => q.id === p.routeQuestionId);
    if (p.routeQuestionId && !rq)
      throw Error('Pertanyaan percabangan tidak ada pada halaman ' + p.title + '.');
    if (rq) {
      if (!['single', 'select'].includes(rq.type) || !rq.required)
        throw Error('Percabangan hanya berlaku untuk pilihan tunggal/dropdown yang wajib dijawab.');
    }
    const normalized = {};
    for (const [option, target] of Object.entries(p.routes)) {
      if (!rq || !rq.options.includes(option))
        throw Error('Opsi percabangan tidak cocok pada halaman ' + p.title + '.');
      if (typeof target !== 'string')
        throw Error('Tujuan halaman tidak valid.');
      if (target !== 'end' && target !== 'next' && pages.findIndex(x => x.id === target) <= i)
        throw Error('Tujuan percabangan harus ke halaman setelah halaman saat ini.');
      normalized[option] = target;
    }
    p.routes = rq ? normalized : {};
    if (!rq)
      p.routeQuestionId = '';
  }
  return pages;
}
function flatQuestions(pages) {
  return pages.flatMap(p => p.blocks.filter(b => b.type === 'question').map(b => ({ ...b.question, pageTitle: p.title })));
}
function fromLegacy(row) {
  let pages = parse(row.pages);
  if (Array.isArray(pages) && pages.length)
    return pages;
  const questions = parse(row.questions) || [];
  return [{
      id: 'page-1',
      title: 'Pendaftaran',
      description: '',
      blocks: questions.map(q => ({ id: uid(), type: 'question', question: q })),
      routeQuestionId: '',
      routes: {}
    }];
}
function formFrom(row) {
  if (!row)
    throw Error('Formulir belum tersedia. Hubungi pengelola.');
  return { settings: normalSettings(parse(row.settings)), pages: fromLegacy(row) };
}
function nextIndex(pages, index, answers) {
  const p = pages[index];
  const match = p.routeQuestionId ? p.routes?.[String(answers[p.routeQuestionId] || '')] : null;
  if (match === 'end')
    return -1;
  if (match && match !== 'next') {
    const found = pages.findIndex(x => x.id === match);
    return found > index ? found : -1;
  }
  return index + 1 < pages.length ? index + 1 : -1;
}
function validOther(q, v) {
  if (!q.allowOther || typeof v !== 'string' || !v.startsWith(OTHER_PREFIX))
    return false;
  const t = v.slice(OTHER_PREFIX.length);
  return t.length > 0 && t.length <= OTHER_LIMIT && t.trim() === t && t.trim().length > 0 && !/[\u0000-\u001F\u007F]/.test(t);
}
function validateFlow(pages, answers, files) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers))
    throw Error('Jawaban tidak valid.');
  const accepted = {}, visited = [], snapshot = [], validFiles = new Set();
  let pos = 0;
  for (let step = 0; pos !== -1 && step < pages.length; step++) {
    const p = pages[pos];
    visited.push(p.id);
    for (const b of p.blocks) {
      if (b.type !== 'question')
        continue;
      const q = b.question, v = answers[q.id];
      snapshot.push({ ...q, pageTitle: p.title });
      if (q.type === 'image_upload') {
        const file = files?.get('file_' + q.id);
        if (file && typeof file !== 'string' && file.size > 0) {
          if (v !== undefined && v !== null && v !== '')
            throw Error('Pilih file atau URL, bukan keduanya.');
          validFiles.add('file_' + q.id);
          accepted[q.id] = null;
        }
        else if (typeof v === 'string' && externalImageUrl(v)) {
          accepted[q.id] = { imageUrl: v };
        }
        else if (v !== undefined && v !== '' && v !== null) {
          throw Error('URL gambar tidak valid untuk: ' + q.title);
        }
        else if (q.required)
          throw Error('Unggah gambar atau masukkan URL untuk: ' + q.title);
        else
          accepted[q.id] = null;
        continue;
      }
      if (q.type === 'multi') {
        if (v !== undefined && !Array.isArray(v))
          throw Error('Format checkbox tidak valid: ' + q.title);
        const opts = v || [];
        if (opts.some(x => typeof x !== 'string') || opts.length > q.options.length + 1 || new Set(opts).size !== opts.length)
          throw Error('Opsi checkbox tidak valid: ' + q.title);
        const others = opts.filter(x => x.startsWith(OTHER_PREFIX));
        if (others.length > 1 || opts.some(x => !q.options.includes(x) && !validOther(q, x)))
          throw Error('Pilihan checkbox tidak valid: ' + q.title);
        if (q.required && !opts.length)
          throw Error('Wajib dijawab: ' + q.title);
        accepted[q.id] = opts;
        continue;
      }
      if (v !== undefined && typeof v !== 'string')
        throw Error('Jawaban tidak valid: ' + q.title);
      const value = String(v || '').trim();
      if (q.required && !value)
        throw Error('Wajib dijawab: ' + q.title);
      if (['single', 'select'].includes(q.type) && value && !q.options.includes(value) && !validOther(q, value))
        throw Error('Opsi tidak valid: ' + q.title);
      if (value.length > (q.type === 'long' ? 2000 : 240))
        throw Error('Jawaban terlalu panjang: ' + q.title);
      accepted[q.id] = value;
    }
    pos = nextIndex(pages, pos, accepted);
  }
  for (const key of Object.keys(answers))
    if (!(key in accepted))
      throw Error('Ada jawaban untuk halaman yang tidak dilalui. Muat ulang formulir.');
  if (files) {
    for (const [key, value] of files.entries())
      if (key.startsWith('file_') && !validFiles.has(key) && value && typeof value !== 'string' && value.size > 0)
        throw Error('File untuk pertanyaan tersembunyi tidak diizinkan.');
  }
  return { answers: accepted, visited, snapshot, validFiles };
}
function detectedType(bytes) {
  const b = new Uint8Array(bytes);
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a)
    return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return 'image/jpeg';
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP')
    return 'image/webp';
  if (b.length > 6 && ['GIF87a', 'GIF89a'].includes(String.fromCharCode(...b.slice(0, 6))))
    return 'image/gif';
  return null;
}
async function checkImage(file) {
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function' || !file.size || file.size > MAX_FILE)
    throw Error('Gambar harus JPG, PNG, WEBP, atau GIF dengan ukuran maksimal 3 MB.');
  const ab = await file.arrayBuffer();
  const type = detectedType(ab);
  if (!type)
    throw Error('Format gambar tidak valid (JPG/PNG/WEBP/GIF).');
  return { ab, type };
}
function base64Array(bytes) {
  let str = '';
  for (let i = 0; i < bytes.length; i += 8192)
    str += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(str);
}
function bytesFromBase64(text) {
  const raw = atob(text);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
// Penyimpanan gambar dan media
async function saveMedia(env, file, { publicMedia, submissionId = null }) {
  const { ab, type } = await checkImage(file);
  if ((!env.MEDIA || env.MEDIA_MODE === 'D1') && ab.byteLength > D1_IMAGE_LIMIT)
    throw Error('Gambar masih terlalu besar. Coba gambar dengan ukuran lebih kecil.');
  const id = uid(), useR2 = !!env.MEDIA && env.MEDIA_MODE !== 'D1', key = useR2 ? 'sscircle/' + id : 'd1/' + id;
  if (useR2) {
    await env.MEDIA.put(key, ab, { httpMetadata: { contentType: type } });
  }
  else
    await env.DB.prepare('INSERT INTO media_blobs(id,data) VALUES(?,?)').bind(id, base64Array(new Uint8Array(ab))).run();
  return {
    id,
    key,
    type,
    filename: s(file.name, 120) || 'gambar',
    size: ab.byteLength,
    publicMedia,
    submissionId
  };
}
function mediaRecord(env, m) {
  return env.DB.prepare('INSERT INTO media (id,object_key,mime_type,filename,size,visibility,submission_id,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(m.id, m.key, m.type, m.filename, m.size, m.publicMedia ? 'public' : 'private', m.submissionId, new Date().toISOString());
}
// Video diunggah per bagian, supaya setiap baris tetap di bawah batas D1.
function expectedChunkSize(total, index) {
  return Math.min(VIDEO_CHUNK, total - index * VIDEO_CHUNK);
}
function checkVideoSignature(bytes, mime) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (mime === 'video/mp4')
    return b.length > 12 && String.fromCharCode(...b.slice(4, 8)) === 'ftyp';
  if (mime === 'video/webm')
    return b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
  return false;
}
async function sendVideo(req, env, row, head = false) {
  const size = Number(row.size), count = Math.ceil(size / VIDEO_CHUNK), range = req.headers.get('Range');
  let first = 0, last = size - 1, partial = false;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match || (match[1] === '' && match[2] === ''))
      return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
    if (match[1] === '') {
      const suffix = Number(match[2]);
      if (!Number.isSafeInteger(suffix) || suffix <= 0)
        return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
      first = Math.max(0, size - suffix);
    }
    else {
      first = Number(match[1]);
      if (!Number.isSafeInteger(first) || first >= size)
        return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
    }
    if (match[1] && match[2])
      last = Math.min(size - 1, Number(match[2]));
    if (last < first)
      return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
    // Browser dapat melanjutkan mengambil potongan berikutnya tanpa mengunduh seluruh video lagi.
    last = Math.min(last, first + 2 * VIDEO_CHUNK - 1);
    partial = true;
  }
  const headers = {
    'Content-Type': row.mime_type,
    'Accept-Ranges': 'bytes',
    'Content-Length': String(last - first + 1),
    'Cache-Control': 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff'
  };
  if (partial)
    headers['Content-Range'] = `bytes ${first}-${last}/${size}`;
  if (head)
    return new Response(null, { status: partial ? 206 : 200, headers });
  let pos = first;
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        if (pos > last) {
          controller.close();
          return;
        }
        const index = Math.floor(pos / VIDEO_CHUNK);
        if (index >= count)
          throw Error('Bagian video tidak ditemukan.');
        const result = await env.DB.prepare('SELECT data FROM media_blobs WHERE id=?').bind(videoChunkKey(row.id, index)).first();
        if (!result)
          throw Error('Bagian video tidak tersedia.');
        const chunk = bytesFromBase64(result.data), start = pos % VIDEO_CHUNK, end = Math.min(chunk.length, start + last - pos + 1);
        if (end <= start)
          throw Error('Bagian video tidak lengkap.');
        controller.enqueue(chunk.slice(start, end));
        pos += end - start;
      }
      catch (e) {
        controller.error(e);
      }
    }
  });
  return new Response(stream, { status: partial ? 206 : 200, headers });
}
async function clearVideo(env, id) {
  const prefix = 'video:' + id + ':';
  await env.DB.prepare('DELETE FROM media_blobs WHERE id>=? AND id<?').bind(prefix, prefix + '~').run();
}
async function getMedia(req, env, id, protectedOnly) {
  if (!/^[0-9a-f-]{36}$/.test(id))
    return bad('Gambar tidak ditemukan.', 404);
  const row = await env.DB.prepare('SELECT * FROM media WHERE id=?').bind(id).first();
  if (!row)
    return bad('Gambar tidak ditemukan.', 404);
  if (protectedOnly) {
    if (!(await admin(req, env)))
      return bad('Akses admin diperlukan.', 401);
  }
  else if (row.visibility !== 'public')
    return bad('Gambar tidak ditemukan.', 404);
  if (row.object_key.startsWith('d1video/'))
    return row.mime_type.startsWith('video/') ? sendVideo(req, env, row, req.method === 'HEAD') : bad('Video belum tersedia.', 404);
  let payload;
  if (row.object_key.startsWith('d1/')) {
    const obj = await env.DB.prepare('SELECT data FROM media_blobs WHERE id=?').bind(id).first();
    if (!obj)
      return bad('File gambar tidak ada.', 404);
    payload = bytesFromBase64(obj.data);
  }
  else {
    if (!env.MEDIA)
      return bad('Gambar ini sedang tidak dapat ditampilkan.', 503);
    const obj = await env.MEDIA.get(row.object_key);
    if (!obj)
      return bad('File gambar tidak ada.', 404);
    payload = obj.body;
  }
  return new Response(payload, {
    headers: {
      'Content-Type': row.mime_type,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': protectedOnly ? 'private, no-store' : 'public, max-age=600',
      'Content-Disposition': 'inline'
    }
  });
}
function activePublicMedia(row) {
  const active = new Set();
  const settings = parse(row?.settings) || {};
  for (const key of ['logoMediaId', 'heroMediaId', 'introLogoMediaId'])
    if (typeof settings[key] === 'string' && settings[key])
      active.add(settings[key]);
  for (const gallery of settings.homeGallery || [])
    if (typeof gallery.src === 'string' && gallery.src.startsWith('/api/media/'))
      active.add(gallery.src.split('/').pop());
  if (typeof settings.homePoster === 'string' && settings.homePoster.startsWith('/api/media/'))
    active.add(settings.homePoster.split('/').pop());
  for (const link of settings.homeSocialLinks || SOCIAL_DEFAULTS) {
    if (/^\/api\/media\/[0-9a-f-]{36}$/.test(link.icon || ''))
      active.add(link.icon.split('/').pop());
  }
  if (typeof settings.homeDonateIcon === 'string' && settings.homeDonateIcon.startsWith('/api/media/'))
    active.add(settings.homeDonateIcon.split('/').pop());
  for (const src of settings.homeVotingImages || [])
    if (typeof src === 'string' && src.startsWith('/api/media/'))
      active.add(src.split('/').pop());
  for (const option of settings.homeVotingOptions || [])
    for (const src of option.images || [])
      if (typeof src === 'string' && src.startsWith('/api/media/'))
        active.add(src.split('/').pop());
  if (typeof settings.homeProfileImage === 'string' && settings.homeProfileImage.startsWith('/api/media/'))
    active.add(settings.homeProfileImage.split('/').pop());
  for (const item of settings.homeProfileItems || []) {
    for (const src of [item.src, item.detailImage])
      if (typeof src === 'string' && src.startsWith('/api/media/'))
        active.add(src.split('/').pop());
  }
  if (typeof settings.homeVotingImage === 'string' && settings.homeVotingImage.startsWith('/api/media/'))
    active.add(settings.homeVotingImage.split('/').pop());
  for (const block of settings.homeLayout || [])
    if (block.kind === 'custom') {
      for (const img of block.images || [])
        if (/^\/api\/media\/[0-9a-f-]{36}$/.test(img.src || ''))
          active.add(img.src.split('/').pop());
      if (/^\/api\/media\/[0-9a-f-]{36}$/.test(block.image || ''))
        active.add(block.image.split('/').pop());
    }
  const homeVideo = videoIdFromURL(settings.homeVideoUrl);
  if (homeVideo)
    active.add(homeVideo);
  const pages = parse(row?.pages) || [];
  for (const p of pages)
    for (const b of p.blocks || [])
      if (b.type === 'image' && b.imageId)
        active.add(b.imageId);
  return active;
}
async function route(req, env) {
  const url = new URL(req.url), path = url.pathname, method = req.method;
  // Proteksi juga dokumen HTML, bukan hanya tombol UI: URL voting langsung tidak bisa dibuka oleh kode Pending/Rejected.
  if ((path === '/voting.html' || path === '/voting') && (method === 'GET' || method === 'HEAD')) {
    if (!env.DB || !env.SESSION_SECRET)
      return Response.redirect(new URL('/status.html?akses-voting=belum-tersedia#kode-milikku', url), 302);
    const application = await playerSession(req, env);
    if (!application || application.status !== VOTING_ACCEPTED_STATUS) {
      const status = application?.status === 'pending' ? 'menunggu' : application?.status === 'rejected' ? 'ditolak' : 'perlu-masuk';
      return new Response(null, {
        status: 302,
        headers: {
          Location: '/status.html?akses-voting=' + status + '#kode-milikku',
          'Cache-Control': 'no-store'
        }
      });
    }
    // Cloudflare Pages canonicalizes `/voting.html` -> `/voting`.
    // Never fetch `/voting.html` from `/voting`: Pages will redirect back to
    // `/voting` and the browser will loop forever (ERR_TOO_MANY_REDIRECTS).
    // Both entry URLs must pass the same server-side session/status check.
    if (path === '/voting.html') {
      return new Response(null, {
        status: 302,
        headers: {
          Location: '/voting' + url.search,
          'Cache-Control': 'private, no-store',
          Vary: 'Cookie'
        }
      });
    }
    // Request the canonical extensionless path. Pages serves voting.html
    // internally as a 200 without adding another redirect.
    const response = await env.ASSETS.fetch(req);
    // Fail closed rather than forwarding a same-page redirect from assets.
    // This prevents future Pages routing changes from silently reintroducing
    // an infinite browser redirect loop.
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location');
      if (location) {
        const target = new URL(location, url);
        if (target.origin === url.origin && (target.pathname === '/voting' || target.pathname === '/voting.html')) {
          console.error('[SSCircle] Voting asset redirect loop prevented:', location);
          return new Response('Halaman Voting gagal dimuat karena pengalihan aset. Hubungi admin server.', {
            status: 502,
            headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
          });
        }
      }
    }
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'private, no-store');
    headers.set('Vary', 'Cookie');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  if (!path.startsWith('/api/'))
    return env.ASSETS.fetch(req);
  if (!env.DB)
    return bad('Layanan pendaftaran sedang tidak tersedia. Silakan coba lagi nanti.', 503);
  if (!['GET', 'HEAD'].includes(method) && !sameOrigin(req))
    return bad('Asal permintaan ditolak.', 403);
  if (![
    'GET',
    'HEAD',
    'POST',
    'PUT',
    'PATCH',
    'DELETE'
  ].includes(method))
    return bad('Metode tidak tersedia.', 405);
  if (path === '/api/form' && method === 'GET') {
    const f = formFrom(await env.DB.prepare('SELECT * FROM form_config WHERE id=1').first());
    delete f.settings.homeVotingVotes;
    return J(f);
  }
  if (path === '/api/registration-cooldown' && method === 'GET') {
    if (!env.SESSION_SECRET)
      return bad('Layanan belum tersedia.', 503);
    const f = formFrom(await env.DB.prepare('SELECT * FROM form_config WHERE id=1').first());
    return J({ remainingSeconds: f.settings.cooldownMinutes > 0 ? await cooldownLeft(env, req) : 0 });
  }
  if (path === '/api/voting' && method === 'GET') {
    const application = await playerSession(req, env);
    if (!application)
      return bad('Masuk dengan kode pendaftaran yang sudah Diterima untuk membuka voting.', 401);
    if (application.status !== VOTING_ACCEPTED_STATUS)
      return bad('Voting hanya untuk pendaftar berstatus Diterima.', 403);
    return J(await publicVotingPayload(env));
  }
  if (path === '/api/voting/vote' && method === 'POST')
    return await submitVote(env, req);
  if (path.startsWith('/api/media/') && ['GET', 'HEAD'].includes(method))
    return getMedia(req, env, path.split('/')[3], false);
  if (path.startsWith('/api/admin/media/') && ['GET', 'HEAD'].includes(method))
    return getMedia(req, env, path.split('/')[4], true);
  if (path === '/api/player/me' && method === 'GET') {
    const application = await playerSession(req, env);
    if (!application)
      return J({ authenticated: false }, 401);
    // Migrasi otomatis untuk pengunjung yang masih memiliki cookie V10.23 (Path=/api).
    const token = readPlayerCookie(req);
    const exp = JSON.parse(unb64(token.split('.')[0])).exp;
    return playerCookieResponse({ authenticated: true, ...playerPublicInfo(application) }, token, Math.max(0, exp - Math.floor(Date.now() / 1000)));
  }
  if (path === '/api/player/login' && method === 'POST') {
    if (!env.SESSION_SECRET)
      return bad('Login belum tersedia.', 503);
    if (!(await rateLimit(env, req, 'player-login', 8, 900)))
      return bad('Terlalu banyak percobaan. Coba lagi nanti.', 429);
    const input = await body(req, 300), code = s(input.code, 50).toUpperCase().replace(/[\s-]/g, '');
    if (code.length === 8 && !(await rateLimit(env, req, 'player-login-legacy', 4, 900)))
      return bad('Terlalu banyak percobaan. Coba lagi nanti.', 429);
    const application = await applicationByCode(env, code);
    if (!application)
      return bad('Kode pendaftaran tidak ditemukan.', 401);
    return playerCookieResponse({ authenticated: true, ...playerPublicInfo(application) }, await signPlayer(env, application.id), PLAYER_SESSION_SECONDS);
  }
  if (path === '/api/player/logout' && method === 'POST') {
    const token = readPlayerCookie(req);
    if (token && await playerSession(req, env)) {
      try {
        const payload = JSON.parse(unb64(token.split('.')[0]));
        await env.DB.prepare('INSERT OR IGNORE INTO revoked_sessions(token_hash,expires_at) VALUES (?,?)').bind(await digest(token), payload.exp).run();
      }
      catch { }
    }
    return playerCookieResponse({ ok: true }, '', 0);
  }
  if (path === '/api/status-check' && method === 'POST') {
    if (!env.SESSION_SECRET)
      return bad('Layanan belum dapat digunakan. Silakan coba lagi nanti.', 503);
    if (!(await rateLimit(env, req, 'status', 12, 900)))
      return bad('Terlalu banyak pemeriksaan. Coba lagi setelah 15 menit.', 429);
    const input = await body(req, 1000), code = s(input.code, 40).toUpperCase().replace(/[\s-]/g, '');
    if (!/^[0-9A-F]{20}$/.test(code) && !/^[0-9A-F]{8}$/.test(code))
      return bad('Kode pendaftaran tidak valid.', 400);
    let row = null;
    if (code.length === 20) {
      row = await env.DB.prepare('SELECT id,submitted_at,status,rejection_reason,tracking_code FROM submissions WHERE tracking_code=?').bind(code).first();
    }
    else {
      // Legacy 8-character references are less resistant to guessing; tightly rate-limit.
      if (!(await rateLimit(env, req, 'status-legacy', 5, 900)))
        return bad('Terlalu banyak percobaan. Coba lagi nanti.', 429);
      const legacy = await env.DB.prepare('SELECT id,submitted_at,status,rejection_reason FROM submissions WHERE UPPER(SUBSTR(id,1,8))=? AND tracking_code IS NULL LIMIT 2').bind(code).all();
      if ((legacy.results || []).length > 1)
        return bad('Kode lama tidak bisa dikenali secara unik. Hubungi admin.', 409);
      row = legacy.results?.[0] || null;
    }
    if (!row)
      return bad('Kode atau data pendaftaran tidak ditemukan.', 404);
    return J({
      status: row.status,
      reason: row.status === 'rejected' ? (row.rejection_reason || 'Tidak ada alasan tambahan dari admin.') : '',
      submittedAt: row.submitted_at
    });
  }
  if (path === '/api/apply' && method === 'POST') {
    if (!env.SESSION_SECRET)
      return bad('Layanan belum dapat digunakan. Silakan coba lagi nanti.', 503);
    if (Number(req.headers.get('Content-Length') || 0) > 14 * 1024 * 1024)
      return bad('Ukuran data melebihi 14 MB.', 413);
    const earlySettings = formFrom(await env.DB.prepare('SELECT * FROM form_config WHERE id=1').first()).settings;
    if (earlySettings.cooldownMinutes > 0) {
      const initialCooldown = await cooldownLeft(env, req);
      if (initialCooldown > 0)
        return cooldownResponse(initialCooldown);
    }
    if (!(await rateLimit(env, req, 'apply', 5, 900)))
      return bad('Terlalu banyak pendaftaran. Coba lagi setelah 15 menit.', 429);
    let files = null, payload;
    if ((req.headers.get('Content-Type') || '').includes('multipart/form-data')) {
      files = await req.formData();
      payload = parse(String(files.get('payload') || ''));
    }
    else
      payload = await body(req, 200000);
    if (!payload || typeof payload !== 'object' || payload.website)
      throw Error('Formulir tidak valid.');
    const f = formFrom(await env.DB.prepare('SELECT * FROM form_config WHERE id=1').first());
    if (!f.settings.open)
      return bad('Pendaftaran sedang ditutup.', 403);
    const flow = validateFlow(f.pages, payload.answers, files);
    const imageFields = [...flow.validFiles];
    const referencedImages = Object.values(flow.answers).filter(value => value && typeof value === 'object' && value.imageUrl).length;
    if (imageFields.length + referencedImages > MAX_IMAGES_PER_APPLICATION)
      throw Error('Maksimal 3 gambar dalam satu pendaftaran.');
    const cooldownSeconds = f.settings.cooldownMinutes * 60;
    const cooldownClaim = await claimCooldown(env, req, cooldownSeconds);
    if (cooldownSeconds > 0 && !cooldownClaim.claimed)
      return cooldownResponse(cooldownClaim.remainingSeconds);
    const id = uid(), trackingCode = uid().replace(/-/g, '').slice(0, 20).toUpperCase(), uploaded = [];
    try {
      for (const field of imageFields) {
        const qid = field.slice(5), file = files.get(field);
        const m = await saveMedia(env, file, { publicMedia: false, submissionId: id });
        uploaded.push(m);
        flow.answers[qid] = { mediaId: m.id, filename: m.filename };
      }
      const statements = uploaded.map(m => mediaRecord(env, m));
      statements.push(env.DB.prepare('INSERT INTO submissions(id,submitted_at,status,answers,question_snapshot,tracking_code,rejection_reason) VALUES(?,?,?,?,?,?,?)').bind(id, new Date().toISOString(), 'pending', JSON.stringify(flow.answers), JSON.stringify(flow.snapshot), trackingCode, ''));
      await env.DB.batch(statements);
    }
    catch (e) {
      for (const m of uploaded)
        try {
          if (m.key.startsWith('d1/'))
            await env.DB.prepare('DELETE FROM media_blobs WHERE id=?').bind(m.id).run();
          else if (env.MEDIA)
            await env.MEDIA.delete(m.key);
        }
        catch { }
      await releaseCooldown(env, cooldownClaim);
      throw e;
    }
    return J({ ok: true, reference: trackingCode, remainingSeconds: cooldownSeconds }, 201, { 'Set-Cookie': playerCookie(await signPlayer(env, id), PLAYER_SESSION_SECONDS) });
  }
  if (path === '/api/admin/login' && method === 'POST') {
    if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET)
      return bad('Login admin sedang tidak tersedia.', 503);
    if (!(await rateLimit(env, req, 'login', 10, 900)))
      return bad('Terlalu banyak percobaan login. Coba lagi nanti.', 429);
    const reqBody = await body(req, 4096);
    const entered = typeof reqBody.password === 'string' ? reqBody.password : '';
    if (!entered || entered.length > 200 || !safeEq(await digest(entered), await digest(env.ADMIN_PASSWORD)))
      return bad('Password admin salah.', 401);
    return J({ ok: true }, 200, { 'Set-Cookie': setCookie(await sign(env), SESSION_SECONDS) });
  }
  if (path === '/api/admin/session' && method === 'GET')
    return await admin(req, env) ? J({ admin: true }) : bad('Silakan login.', 401);
  if (path === '/api/admin/logout' && method === 'POST') {
    const token = cookie(req);
    if (token && await admin(req, env)) {
      const exp = JSON.parse(unb64(token.split('.')[0])).exp;
      await env.DB.prepare('INSERT OR IGNORE INTO revoked_sessions (token_hash,expires_at) VALUES (?,?)').bind(await digest(token), exp).run();
    }
    return J({ ok: true }, 200, { 'Set-Cookie': setCookie('', 0) });
  }
  if (path.startsWith('/api/admin/')) {
    if (!(await admin(req, env)))
      return bad('Akses admin diperlukan. Login ulang.', 401);
    if (path === '/api/admin/form' && method === 'GET') {
      const row = await env.DB.prepare('SELECT * FROM form_config WHERE id=1').first();
      return J({ ...formFrom(row), revision: row.updated_at || '' });
    }
    if (path === '/api/admin/voting' && method === 'GET') {
      const form = formFrom(await readSettingsRow(env));
      const settings = form.settings;
      const runtime = votingRuntime(settings);
      const ranking = [...runtime.results].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'id'));
      return J({
        enabled: settings.homeVotingEnabled === true,
        sessionId: settings.homeVotingSessionId || 'voting-1',
        totalVotes: runtime.total,
        top10: ranking.slice(0, 10),
        results: ranking,
        question: settings.homeVotingQuestion || '',
        active: runtime.active,
        endsAt: runtime.endsAt
      });
    }
    if (path === '/api/admin/voting/reset' && method === 'POST') {
      const requestBody = await body(req, 400);
      if (requestBody.confirmation !== 'RESET VOTING')
        return bad('Konfirmasi reset voting tidak sesuai.', 400);
      const session = 'poll-' + uid().replace(/-/g, '').slice(0, 20);
      const result = await env.DB.prepare("UPDATE form_config SET settings=json_set(settings,'$.homeVotingVotes',json('[]'),'$.homeVotingSessionId',?),updated_at=? WHERE id=1").bind(session, new Date().toISOString()).run();
      return J({ ok: true, sessionId: session, totalVotes: 0, changed: Number(result.meta?.changes || 0) });
    }
    if (path === '/api/admin/form' && method === 'PUT') {
      const input = await body(req, 280000);
      if (typeof input.revision !== 'string' || input.revision.length > 100)
        return bad('Versi pengaturan tidak tersedia. Muat ulang Admin Control lalu coba lagi.', 428);
      const current = await env.DB.prepare('SELECT settings, updated_at FROM form_config WHERE id=1').first();
      if (!current || (current.updated_at || '') !== input.revision)
        return bad('Pengaturan sudah diperbarui oleh admin lain. Muat ulang halaman sebelum menyimpan.', 409);
      const settings = settingsValid(input.settings), pages = pagesValid(input.pages);
      const persistedVoting = parse(current.settings) || {};
      const usedVotingOptions = new Set((persistedVoting.homeVotingVotes || []).map(v => v.optionId).filter(Boolean));
      const requestedOptions = new Set(settings.homeVotingOptions.map(v => v.id));
      if ([...usedVotingOptions].some(id => !requestedOptions.has(id)))
        return bad('Pilihan yang sudah memiliki suara tidak dapat dihapus. Mulai sesi voting baru terlebih dahulu.', 409);
      const activeVideoId = videoIdFromURL(settings.homeVideoUrl);
      if (activeVideoId) {
        const video = await env.DB.prepare("SELECT id FROM media WHERE id=? AND visibility='public' AND mime_type IN ('video/mp4','video/webm')").bind(activeVideoId).first();
        if (!video)
          throw Error('Video cinematic belum selesai diunggah atau sudah dihapus.');
      }
      const mediaIds = [
        ...new Set([
          ...pages.flatMap(p => p.blocks.filter(b => b.type === 'image').map(b => b.imageId)),
          settings.logoMediaId,
          settings.heroMediaId,
          settings.introLogoMediaId,
          ...settings.homeGallery.map(g => g.src.startsWith('/api/media/') ? g.src.split('/').pop() : '').filter(Boolean),
          settings.homePoster.startsWith('/api/media/') ? settings.homePoster.split('/').pop() : '',
          settings.homeDonateIcon?.startsWith('/api/media/') ? settings.homeDonateIcon.split('/').pop() : '',
          settings.homeVotingImage?.startsWith('/api/media/') ? settings.homeVotingImage.split('/').pop() : '',
          ...(settings.homeVotingImages || []).map(src => src.startsWith('/api/media/') ? src.split('/').pop() : '').filter(Boolean),
          ...settings.homeVotingOptions.flatMap(o => (o.images || []).filter(src => src.startsWith('/api/media/')).map(src => src.split('/').pop())),
          settings.homeProfileImage?.startsWith('/api/media/') ? settings.homeProfileImage.split('/').pop() : '',
          ...(settings.homeProfileItems || []).flatMap(item => [item.src, item.detailImage].filter(src => src?.startsWith('/api/media/')).map(src => src.split('/').pop())),
          ...settings.homeSocialLinks.map(link => link.icon?.startsWith('/api/media/') ? link.icon.split('/').pop() : ''),
          ...settings.homeLayout.filter(block => block.kind === 'custom').flatMap(block => [...(block.images || []).map(img => img.src), block.image].filter(src => src?.startsWith('/api/media/')).map(src => src.split('/').pop()))
        ].filter(Boolean))
      ];
      for (const imageId of mediaIds) {
        const m = await env.DB.prepare("SELECT id FROM media WHERE id=? AND visibility='public'").bind(imageId).first();
        if (!m)
          throw Error('Gambar formulir tidak ditemukan. Upload ulang.');
      }
      // Cegah penyimpanan dua admin saling menimpa tanpa peringatan.
      const revision = new Date().toISOString() + '-' + uid();
      const saved = await env.DB.prepare("UPDATE form_config SET settings=json_set(json_set(?, '$.homeVotingVotes', json(COALESCE(json_extract(settings,'$.homeVotingVotes'),'[]'))), '$.homeVotingSessionId', COALESCE(json_extract(settings,'$.homeVotingSessionId'),'voting-1')), pages=?,questions=?,updated_at=? WHERE id=1 AND COALESCE(updated_at,'')=?").bind(JSON.stringify(settings), JSON.stringify(pages), JSON.stringify(flatQuestions(pages)), revision, input.revision).run();
      if (!Number(saved.meta?.changes || 0))
        return bad('Pengaturan berubah saat disimpan. Muat ulang Admin Control, lalu ulangi perubahanmu.', 409);
      return J({ ok: true, revision });
    }
    if (path === '/api/admin/media' && method === 'POST') {
      const length = Number(req.headers.get('Content-Length') || 0);
      if (length > MAX_FILE + 2500)
        return bad('Ukuran gambar melebihi batas unggahan.', 413);
      const input = await req.formData();
      const file = input.get('file');
      const m = await saveMedia(env, file, { publicMedia: true });
      try {
        await mediaRecord(env, m).run();
      }
      catch (e) {
        if (m.key.startsWith('d1/'))
          await env.DB.prepare('DELETE FROM media_blobs WHERE id=?').bind(m.id).run();
        else if (env.MEDIA)
          await env.MEDIA.delete(m.key);
        throw e;
      }
      return J({ id: m.id, url: '/api/media/' + m.id, filename: m.filename }, 201);
    }
    // Unggah video melalui Admin Control; tetap berada di penyimpanan yang sama dengan gambar.
    if (path === '/api/admin/video/start' && method === 'POST') {
      const input = await body(req, 1600), filename = s(input.filename, 120), size = Number(input.size), mime = s(input.type, 30);
      if (!['video/mp4', 'video/webm'].includes(mime) || !Number.isSafeInteger(size) || size < 1024 || size > VIDEO_LIMIT)
        return bad('Gunakan video MP4/WebM berukuran maksimal 16 MB.', 413);
      if (!/\.(mp4|webm)$/i.test(filename))
        return bad('Nama file harus berakhiran .mp4 atau .webm.');
      if ((mime === 'video/mp4' && !/\.mp4$/i.test(filename)) || (mime === 'video/webm' && !/\.webm$/i.test(filename)))
        return bad('Ekstensi dan format video tidak sesuai.');
      const id = uid(), parts = Math.ceil(size / VIDEO_CHUNK);
      await env.DB.prepare('INSERT INTO media (id,object_key,mime_type,filename,size,visibility,submission_id,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id, 'd1video/' + id + '/' + parts, 'application/x-ssc-upload-' + mime.slice(6), filename, size, 'public', null, new Date().toISOString()).run();
      return J({ id, chunkSize: VIDEO_CHUNK, chunks: parts, maxSize: VIDEO_LIMIT }, 201);
    }
    if (path.startsWith('/api/admin/video/chunk/') && method === 'PUT') {
      const parts = path.split('/'), id = parts[5], index = Number(parts[6]);
      if (!/^[0-9a-f-]{36}$/.test(id) || !Number.isInteger(index) || index < 0 || index >= VIDEO_PARTS)
        return bad('Bagian video tidak valid.');
      const m = await env.DB.prepare("SELECT size,mime_type FROM media WHERE id=? AND object_key LIKE 'd1video/%'").bind(id).first();
      if (!m || !m.mime_type.startsWith('application/x-ssc-upload-'))
        return bad('Sesi unggah video sudah tidak berlaku.', 409);
      const expected = expectedChunkSize(m.size, index);
      if (expected <= 0)
        return bad('Bagian video tidak valid.');
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (bytes.byteLength !== expected)
        return bad('Bagian video tidak lengkap. Ulangi unggahan.', 400);
      if (index === 0 && !checkVideoSignature(bytes, 'video/' + m.mime_type.split('application/x-ssc-upload-')[1]))
        return bad('File ini bukan video MP4/WebM yang valid.', 400);
      await env.DB.prepare('INSERT OR REPLACE INTO media_blobs(id,data) VALUES(?,?)').bind(videoChunkKey(id, index), base64Array(bytes)).run();
      return J({ ok: true, index });
    }
    if (path === '/api/admin/video/finish' && method === 'POST') {
      const input = await body(req, 1000), id = s(input.id, 64);
      if (!/^[0-9a-f-]{36}$/.test(id))
        return bad('Video tidak valid.');
      const m = await env.DB.prepare("SELECT * FROM media WHERE id=? AND mime_type LIKE 'application/x-ssc-upload-%' AND object_key LIKE 'd1video/%'").bind(id).first();
      if (!m)
        return bad('Sesi unggah video tidak ditemukan.', 404);
      const expected = Math.ceil(m.size / VIDEO_CHUNK), prefix = 'video:' + id + ':';
      const c = await env.DB.prepare('SELECT COUNT(*) AS total FROM media_blobs WHERE id>=? AND id<?').bind(prefix, prefix + '~').first();
      if (Number(c?.total) !== expected)
        return bad('Masih ada bagian video yang belum diunggah.', 409);
      const first = await env.DB.prepare('SELECT data FROM media_blobs WHERE id=?').bind(videoChunkKey(id, 0)).first();
      const actualMime = 'video/' + m.mime_type.split('application/x-ssc-upload-')[1];
      if (!first || !checkVideoSignature(bytesFromBase64(first.data), actualMime))
        return bad('Format video tidak cocok.', 400);
      await env.DB.prepare("UPDATE media SET mime_type=? WHERE id=? AND mime_type LIKE 'application/x-ssc-upload-%'").bind(actualMime, id).run();
      return J({
        id,
        url: videoReference(id) + (actualMime === 'video/webm' ? '?format=webm' : '?format=mp4'),
        filename: m.filename,
        size: m.size,
        type: actualMime
      });
    }
    if (path === '/api/admin/video/cancel' && method === 'POST') {
      const input = await body(req, 1000), id = s(input.id, 64);
      if (!/^[0-9a-f-]{36}$/.test(id))
        return bad('ID video tidak valid.');
      const m = await env.DB.prepare("SELECT id FROM media WHERE id=? AND mime_type LIKE 'application/x-ssc-upload-%' AND object_key LIKE 'd1video/%'").bind(id).first();
      if (!m)
        return J({ ok: true });
      await clearVideo(env, id);
      await env.DB.prepare("DELETE FROM media WHERE id=? AND mime_type LIKE 'application/x-ssc-upload-%'").bind(id).run();
      return J({ ok: true });
    }
    // Media library is admin-only; active media are protected against accidental deletion.
    if (path === '/api/admin/media-library' && method === 'GET') {
      const row = await env.DB.prepare('SELECT settings,pages FROM form_config WHERE id=1').first();
      const active = activePublicMedia(row);
      const result = await env.DB.prepare("SELECT id,object_key,filename,size,mime_type,visibility,submission_id,created_at FROM media ORDER BY created_at DESC,id DESC LIMIT 2000").all();
      const files = (result.results || []).map(m => ({
        id: m.id,
        name: m.filename,
        size: m.size || 0,
        type: m.mime_type.startsWith('application/x-ssc-upload-') ? 'video/' + m.mime_type.split('application/x-ssc-upload-')[1] : (m.mime_type || ''),
        visibility: m.mime_type.startsWith('application/x-ssc-upload-') ? 'uploading' : m.visibility,
        createdAt: m.created_at,
        used: active.has(m.id),
        source: 'upload',
        submissionId: m.submission_id || null
      }));
      const size = files.reduce((sum, m) => sum + m.size, 0);
      const sums = await env.DB.prepare('SELECT visibility, COUNT(*) AS total, COALESCE(SUM(size),0) AS bytes FROM media GROUP BY visibility').all();
      const byVisibility = Object.fromEntries((sums.results || []).map(x => [x.visibility, { count: Number(x.total || 0), bytes: Number(x.bytes || 0) }]));
      const builtIn = [
        { name: 'Video cinematic bawaan', path: 'assets/sscircle-cinematic.mp4', size: 6882882, type: 'video/mp4' },
        { name: 'Logo SSCircle', path: 'assets/sscircle-logo.png', size: 4246, type: 'image/png' },
        { name: 'Logo Discord', path: 'assets/discord-logo.png', size: 9645, type: 'image/png' },
        { name: 'Logo TikTok', path: 'assets/tiktok-logo.png', size: TIKTOK_BUILTIN_SIZE, type: 'image/png' },
        { name: 'Logo SSCircle Community', path: 'assets/sscircle-community-icon.png', size: 154336, type: 'image/png' },
        ...[
          113340,
          102532,
          157240,
          67698,
          127560,
          65826,
          91960,
          264878,
          160074
        ].map((size, index) => ({
          name: 'SSCircle Gallery ' + (index + 1),
          path: 'assets/gallery/sscircle-' + String(index + 1).padStart(2, '0') + '.webp',
          size,
          type: 'image/webp'
        }))
      ];
      for (const item of builtIn) {
        item.id = 'built-in:' + item.path;
        item.source = 'built-in';
        item.visibility = 'public';
        item.used = item.path === 'assets/sscircle-cinematic.mp4' ? (row && parse(row.settings)?.homeVideoUrl || HOME_DEFAULTS.homeVideoUrl) === item.path : (item.path.includes('gallery/') ? (parse(row?.settings)?.homeGallery || DEFAULT_GALLERY).some(i => i.src === item.path) || (parse(row?.settings)?.homePoster || HOME_DEFAULTS.homePoster) === item.path : true);
      }
      const all = [...files, ...builtIn];
      // Size reported by SQLite is estimated page allocation. Media byte totals are shown separately.
      let allocatedBytes = null;
      try {
        const [pages, bytesPerPage] = await Promise.all([
          env.DB.prepare('PRAGMA page_count').first(),
          env.DB.prepare('PRAGMA page_size').first()
        ]);
        const count = Number(pages?.page_count), pageSize = Number(bytesPerPage?.page_size);
        if (Number.isFinite(count) && Number.isFinite(pageSize) && count >= 0 && pageSize > 0)
          allocatedBytes = count * pageSize;
      }
      catch { /* Estimated media usage is available even if page statistics are unavailable. */ }
      const storageLimitBytes = Math.max(1, Math.min(10000, Number(env.STORAGE_LIMIT_MB) || 500)) * 1000000;
      return J({
        storageLimitBytes,
        allocatedBytes,
        uploadedBytes: size,
        files: all,
        limited: files.length === 2000,
        count: byVisibility.public?.count || 0,
        bytes: byVisibility.public?.bytes || 0,
        privateCount: byVisibility.private?.count || 0,
        privateBytes: byVisibility.private?.bytes || 0,
        videoCount: all.filter(x => x.type.startsWith('video/')).length,
        videoBytes: all.filter(x => x.type.startsWith('video/')).reduce((n, m) => n + m.size, 0),
        totalFiles: all.length,
        totalBytes: all.reduce((n, m) => n + m.size, 0),
        unused: files.filter(m => m.visibility === 'public' && !m.used).length,
        unusedBytes: files.filter(m => m.visibility === 'public' && !m.used).reduce((n, m) => n + m.size, 0)
      });
    }
    if (path === '/api/admin/media-cleanup' && method === 'POST') {
      const input = await body(req, 6000);
      if (input.confirmation !== 'HAPUS MEDIA')
        return bad('Konfirmasi penghapusan gambar tidak sesuai.', 400);
      if (!Array.isArray(input.ids) || input.ids.length < 1 || input.ids.length > 50 || new Set(input.ids).size !== input.ids.length || input.ids.some(x => typeof x !== 'string' || !/^[0-9a-f-]{36}$/.test(x)))
        return bad('Maksimal 50 ID gambar yang valid.', 400);
      const row = await env.DB.prepare('SELECT settings,pages FROM form_config WHERE id=1').first();
      const active = activePublicMedia(row);
      const targets = [];
      for (const id of input.ids) {
        if (active.has(id))
          return bad('Ada media yang masih digunakan di website. Ganti pilihan aktif dan simpan terlebih dahulu.', 409);
        const m = await env.DB.prepare("SELECT id,object_key,visibility FROM media WHERE id=? AND visibility='public'").bind(id).first();
        if (!m)
          return bad('Media tidak ditemukan atau tidak diizinkan.', 404);
        targets.push(m);
      }
      let deleted = 0;
      const failures = [];
      for (const m of targets) {
        try {
          if (m.object_key.startsWith('d1video/'))
            await clearVideo(env, m.id);
          else if (!m.object_key.startsWith('d1/')) {
            if (!env.MEDIA)
              throw Error('Media lama belum dapat dihapus.');
            await env.MEDIA.delete(m.object_key);
          }
          await env.DB.batch([env.DB.prepare('DELETE FROM media_blobs WHERE id=?').bind(m.id), env.DB.prepare("DELETE FROM media WHERE id=? AND visibility='public'").bind(m.id)]);
          deleted++;
        }
        catch (e) {
          failures.push({ id: m.id, reason: String(e.message || 'Gagal menghapus') });
        }
      }
      return J({ ok: failures.length === 0, deleted, failures });
    }
    if (path === '/api/admin/submissions' && method === 'GET') {
      const offset = Math.min(Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0), 1000000);
      const r = await env.DB.prepare('SELECT id,submitted_at,status,rejection_reason,tracking_code,answers,question_snapshot FROM submissions ORDER BY submitted_at ASC,id ASC LIMIT 251 OFFSET ?').bind(offset).all();
      const arr = r.results || [];
      return J({
        items: arr.slice(0, 250).map(x => ({
          id: x.id,
          at: x.submitted_at,
          status: x.status,
          reason: x.rejection_reason || '',
          trackingCode: x.tracking_code || x.id.slice(0, 8).toUpperCase(),
          answers: parse(x.answers) || {},
          questions: parse(x.question_snapshot) || []
        })),
        hasMore: arr.length > 250
      });
    }
    if (path === '/api/admin/delete-submissions' && method === 'POST') {
      const input = await body(req, 12000);
      if (input.scope !== 'selected' && input.scope !== 'all')
        throw Error('Pilihan penghapusan tidak valid.');
      let ids = [];
      if (input.scope === 'all') {
        if (input.confirmation !== 'HAPUS SEMUA')
          return bad('Ketik HAPUS SEMUA untuk menghapus seluruh pendaftaran.', 400);
        const batch = await env.DB.prepare('SELECT id FROM submissions ORDER BY submitted_at ASC LIMIT 100').all();
        ids = (batch.results || []).map(x => x.id);
      }
      else {
        if (input.confirmation !== 'HAPUS')
          return bad('Konfirmasi penghapusan diperlukan.', 400);
        if (!Array.isArray(input.ids) || input.ids.length < 1 || input.ids.length > 100 || input.ids.some(x => typeof x !== 'string' || !/^[0-9a-f-]{36}$/.test(x)) || new Set(input.ids).size !== input.ids.length)
          throw Error('Daftar ID penghapusan tidak valid (maksimal 100).');
        ids = input.ids;
      }
      if (!ids.length)
        return J({ ok: true, deleted: 0, more: false, mediaErrors: 0 });
      const placeholders = ids.map(() => '?').join(',');
      const mediaRows = await env.DB.prepare(`SELECT id,object_key FROM media WHERE visibility='private' AND submission_id IN (${placeholders})`).bind(...ids).all();
      const sqls = [
        env.DB.prepare(`DELETE FROM media_blobs WHERE id IN (SELECT id FROM media WHERE visibility='private' AND submission_id IN (${placeholders}))`).bind(...ids),
        env.DB.prepare(`DELETE FROM media WHERE visibility='private' AND submission_id IN (${placeholders})`).bind(...ids),
        env.DB.prepare(`DELETE FROM submissions WHERE id IN (${placeholders})`).bind(...ids)
      ];
      const res = await env.DB.batch(sqls);
      const deleted = Number(res[2]?.meta?.changes || 0);
      let mediaErrors = 0;
      const objects = (mediaRows.results || []).map(m => m.object_key).filter(k => !k.startsWith('d1/'));
      if (objects.length) {
        if (!env.MEDIA)
          mediaErrors = objects.length;
        else
          try {
            await env.MEDIA.delete(objects.length === 1 ? objects[0] : objects);
          }
          catch {
            mediaErrors = objects.length;
          }
      }
      const rest = await env.DB.prepare('SELECT id FROM submissions LIMIT 1').first();
      return J({ ok: true, deleted, more: input.scope === 'all' && !!rest, mediaErrors });
    }
    if (path === '/api/admin/status' && method === 'PATCH') {
      const v = await body(req, 5000);
      if (!/^[0-9a-f-]{36}$/.test(v.id || '') || !STATUSES.has(v.status))
        throw Error('ID/status tidak valid.');
      const reason = v.status === 'rejected' ? s(v.reason, 1000) : '';
      if (v.status === 'rejected' && !reason)
        throw Error('Alasan penolakan wajib diisi.');
      const r = await env.DB.prepare('UPDATE submissions SET status=?,rejection_reason=? WHERE id=?').bind(v.status, reason, v.id).run();
      if (!(r.meta?.changes > 0))
        return bad('Pendaftaran tidak ditemukan.', 404);
      return J({ ok: true });
    }
  }
  return bad('Endpoint tidak ditemukan.', 404);
}
export default {
  async fetch(req, env) {
    try {
      return await route(req, env);
    }
    catch (e) {
      console.error('[SSCircle]', e);
      if (/tidak valid|Wajib|Gambar|gambar|Pertanyaan|pertanyaan|Blok|blok|Pilihan|pilihan|Opsi|opsi|halaman|Halaman|Homepage|kartu|Kartu|Bagian|bagian|warna|Warna|gradasi|Selector|Tautan|tautan|Data terlalu|Jumlah|Maksimal|harus|Format|percabangan|Percabangan|Unggah|Unggah|Jawaban|jawaban|diperlukan|besar|video|Video|Judul|Alasan|alasan|File|File gambar/.test(e.message || ''))
        return bad(e.message, 400);
      return bad('Layanan sedang mengalami gangguan. Silakan coba lagi nanti.', 503);
    }
  }
};
