'use strict';
(() => {
const base=[
{id:'registration',label:'Cara Mendaftar',icon:'✎',intro:'Pendaftaran anggota SSCircle dari awal sampai hasil seleksi.',steps:[
{title:'Buka Registration',body:'Pastikan pendaftaran sedang dibuka dan baca penjelasan server.',url:'registration.html',link:'Buka Registration'},
{title:'Isi formulir',body:'Lengkapi data sesuai pertanyaan dari admin, baca Server Rules dan setujui aturan jika diminta.'},
{title:'Simpan kode pendaftaran',body:'Simpan kode setelah formulir berhasil dikirim. Jangan bagikan kode ini ke siapa pun.',tip:'Kode pendaftaran bukan password Dashboard.'},
{title:'Pantau status',body:'Buka Cek Status dan masukkan kode untuk mengetahui apakah pengajuan masih menunggu, diterima atau ditolak.',url:'status.html',link:'Cek Status'}]},
{id:'account',label:'Aktivasi Akun',icon:'♙',intro:'Mengaktifkan Profile dan membuat password Dashboard.',steps:[
{title:'Pastikan diterima',body:'Periksa status pendaftaran lewat kode yang kamu terima. Aktivasi anggota bergantung pada persetujuan admin.',url:'status.html',link:'Periksa Status'},
{title:'Buka Mail Box',body:'Masuk melalui Cek Status, lalu buka ikon amplop di header. Ajukan kode aktivasi jika tersedia.'},
{title:'Aktivasi akun',body:'Ikuti petunjuk verifikasi dari pengurus. Gunakan kode aktivasi yang valid pada bagian Profile. Kode aktivasi bersifat rahasia.',url:'my-sscircle.html',link:'Buka Profile'},
{title:'Buat password Dashboard',body:'Buat password kuat melalui Account & Security, lalu gunakan untuk membuka Dashboard pribadi.',url:'my-sscircle.html',link:'Pengaturan Akun'}]},
{id:'minecraft',label:'Hubungkan Minecraft',icon:'▣',intro:'Panduan Java Premium, Java Non-Premium dan Minecraft Bedrock.',steps:[
{title:'Buka Minecraft Account',body:'Pastikan Profile telah diaktifkan. Buka Profile → Pengaturan Akun → Minecraft Account.',url:'my-sscircle.html',link:'Buka Profile'},
{title:'Pilih jenis akun',body:'Pilih Java Premium, Non-Premium, atau Bedrock sesuai akun yang sebenarnya digunakan.'},
{title:'Ikuti verifikasi server',body:'Masuk ke server dan ikuti proses pairing serta kode atau perintah yang ditampilkan sistem saat itu. Hanya gunakan perintah yang benar-benar tersedia pada plugin aktif.',tip:'Jangan menggunakan perintah dari tutorial lama jika plugin telah berubah.'},
{title:'Periksa status',body:'Periksa identitas Minecraft yang terhubung pada Profile. Statistik dapat diperbarui setelah server dan plugin sinkronisasi aktif.',url:'my-sscircle.html',link:'Periksa Akun'}]},
{id:'playing',label:'Mulai Bermain',icon:'⚒',intro:'Bergabung dan beraktivitas di server.',steps:[
{title:'Gabung Discord',body:'IP Address, port Bedrock, jadwal dan informasi resmi server tersedia di Discord SSCircle Community.',url:'https://discord.gg/vQQSgY2GRS',link:'Buka Discord'},
{title:'Periksa versi',body:'Gunakan versi Minecraft Java atau Bedrock yang sedang didukung menurut pengumuman server.'},
{title:'Masuk dan login',body:'Gunakan IP resmi. Pemain Non-Premium mengikuti sistem login server; pemain Premium dan Bedrock mengikuti autentikasi yang aktif.'},
{title:'Baca peraturan',body:'Pahami aturan sebelum bermain atau mengikuti event.',url:'rules.html',link:'Server Rules'}]},
{id:'community',label:'Fitur Komunitas',icon:'✦',intro:'Kenali fitur website dan komunitas SSCircle.',steps:[
{title:'Profile dan statistik',body:'Lihat anggota, akun Minecraft, playtime, deaths dan statistik lainnya jika sinkronisasi sudah aktif.',url:'my-sscircle.html',link:'Buka Profile'},
{title:'Achievement & Hall of Fame',body:'Pantau penghargaan yang diperoleh atau progresnya, lalu jelajahi pencapaian season.'},
{title:'Friends & Community Events',body:'Cari teman, kelola pertemanan, lihat jadwal dan pengajuan event sesuai izin akun.',url:'events.html',link:'Lihat Event'},
{title:'Voting, Mail Box dan Season',body:'Ikuti voting sesuai ketentuan, baca pesan Mail Box, dan jelajahi arsip Season.'}]},
{id:'help',label:'Bantuan',icon:'?',intro:'Solusi jika pendaftaran, akun atau Minecraft mengalami kendala.',steps:[
{title:'Tidak dapat mendaftar',body:'Pastikan pendaftaran terbuka, semua kolom wajib diisi, dan aturan disetujui.'},
{title:'Login Profile gagal',body:'Periksa status diterima, kode pendaftaran, aktivasi akun dan password Dashboard. Kode dan password tidak sama.',url:'status.html',link:'Cek Status'},
{title:'Minecraft belum terhubung',body:'Periksa jenis akun, ketersediaan server, plugin dan instruksi pairing terbaru.'},
{title:'Statistik tidak tersinkron',body:'Pastikan server dan plugin aktif, lalu perbarui Profile. Jika masih bermasalah hubungi pengurus.',url:'https://discord.gg/vQQSgY2GRS',link:'Bantuan Discord'}]}
];
const faq=[
{question:'Apa beda kode pendaftaran dan password Dashboard?',answer:'Kode pendaftaran digunakan untuk Cek Status dan proses akses awal. Password Dashboard dibuat saat aktivasi untuk masuk ke akun pribadi.'},
{question:'Bisakah membuat akun sebelum diterima?',answer:'Kamu dapat mendaftar, tetapi akses Dashboard pribadi membutuhkan status diterima dan aktivasi yang sesuai.'},
{question:'Mengapa Minecraft Account belum terhubung?',answer:'Pastikan akun website aktif, jenis akun benar, server dan plugin pairing tersedia, lalu ikuti verifikasi terbaru.'},
{question:'Di mana IP server Minecraft?',answer:'Alamat dan port koneksi tersedia di Discord SSCircle Community sesuai kebijakan pengurus.'},
{question:'Mengapa statistik belum diperbarui?',answer:'Statistik memerlukan koneksi server dan plugin yang aktif. Hubungi pengurus jika masalah berlanjut.'}
];
const defaults={enabled:true,title:'How to Play',subtitle:'Getting Started',categories:base,faq};
window.SSCircleHowToPlayDefaults=defaults;
const root=document.getElementById('howto-root');if(!root)return;
const $=id=>document.getElementById(id);
let data=defaults,selected='registration',stepIndex=0,search='',previewApplied=false;
const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;};
const safeLink=url=>typeof url==='string'&&(/^(?:registration|status|my-sscircle|rules|events|how-to-play)\.html(?:#[a-z0-9-]+)?$/i.test(url)||/^https:\/\/(?:discord\.gg|discord\.com)\/[a-zA-Z0-9/-]+$/.test(url));
function render(){
const visible=data.categories.filter(c=>(c.label+' '+c.intro+' '+c.steps.map(s=>s.title+' '+s.body).join(' ')).toLowerCase().includes(search));
if(!visible.some(c=>c.id===selected)){selected=visible[0]?.id||'';stepIndex=0;}
$('howto-count').textContent=visible.length+' panduan';
for(const [id,kind] of [['howto-categories','tab'],['howto-list','list']]){
const host=$(id);host.replaceChildren();for(const c of visible){const b=el('button','',kind==='tab'?c.icon+' '+c.label:c.label);b.type='button';b.setAttribute(kind==='tab'?'aria-pressed':'aria-current',String(c.id===selected));b.onclick=()=>{selected=c.id;stepIndex=0;render();};host.append(b);}
}
const c=data.categories.find(x=>x.id===selected),out=$('howto-content');out.replaceChildren();
if(!c){out.append(el('p','ssc-howto-intro','Tidak ada panduan yang cocok. Coba kata kunci lain.'));$('howto-prev').hidden=$('howto-next').hidden=true;return;}
stepIndex=Math.min(stepIndex,c.steps.length-1);
out.append(el('span','ssc-howto-eyebrow',c.label.toUpperCase()),el('h3','',c.label),el('p','ssc-howto-intro',c.intro||''));
const bar=el('div','ssc-howto-progress');for(let i=0;i<c.steps.length;i++)bar.append(el('span',i<=stepIndex?'is-done':''));out.append(bar);
const s=c.steps[stepIndex],body=el('section','ssc-howto-step');
body.append(el('span','ssc-howto-eyebrow','LANGKAH '+(stepIndex+1)),el('h4','',s.title),el('p','',s.body));
if(s.image&&/^(?:assets\/|\/api\/media\/)/.test(s.image)){const img=el('img');img.src=s.image;img.alt=s.title;img.loading='lazy';body.append(img);}
if(s.video&&/^https:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}/.test(s.video)){const a=el('a','ssc-howto-secondary','Tonton video ↗');a.href=s.video;a.target='_blank';a.rel='noopener noreferrer';body.append(a);}
if(s.tip)body.append(el('div','ssc-howto-tip','ⓘ '+s.tip));
if(safeLink(s.url)){const a=el('a','ssc-howto-primary',s.link||'Buka halaman ↗');a.href=s.url;if(s.url.startsWith('https://')){a.target='_blank';a.rel='noopener noreferrer';}body.append(a);}
out.append(body);
$('howto-prev').hidden=$('howto-next').hidden=false;
$('howto-prev').disabled=stepIndex===0;
$('howto-next').textContent=stepIndex===c.steps.length-1?'Selesai ✓':'Berikutnya →';
$('howto-step-count').textContent=(stepIndex+1)+' / '+c.steps.length;
}
$('howto-search').addEventListener('input',event=>{search=event.target.value.trim().toLowerCase();render();});
$('howto-prev').onclick=()=>{stepIndex=Math.max(0,stepIndex-1);render();};
$('howto-next').onclick=()=>{const c=data.categories.find(x=>x.id===selected);if(stepIndex<c.steps.length-1){stepIndex++;render();}else{const i=data.categories.indexOf(c);if(i<data.categories.length-1){selected=data.categories[i+1].id;stepIndex=0;render();}else location.hash='#faq';}};
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='ssc-howto-preview'||!new URLSearchParams(location.search).has('ssc_theme_preview'))return;const incoming=event.data.howToPlay;if(!incoming||!Array.isArray(incoming.categories))return;previewApplied=true;data={...defaults,...incoming};selected=data.categories[0]?.id||'';stepIndex=0;render();const list=$('howto-faq-list');list.replaceChildren();for(const item of data.faq||[]){const d=el('details');d.append(el('summary','',item.question),el('p','',item.answer));list.append(d);}});
async function init(){
try{const r=await window.SSCircle?.getForm?.();if(r?.settings){const raw=r.settings.howToPlay;if(!previewApplied)data=raw&&Array.isArray(raw.categories)?{...defaults,...raw}:defaults;window.SSCircleTheme?.apply?.(r.settings);const discord=r.settings.homeDiscordUrl;if(/^https:\/\/(?:discord\.gg|discord\.com)\//.test(discord||''))$('howto-discord').href=discord;}}catch{}
if(data.enabled===false){root.replaceChildren(el('p','','Panduan sedang dinonaktifkan oleh pengelola.'));return;}
const category=new URLSearchParams(location.search).get('category');if(data.categories.some(c=>c.id===category))selected=category;
render();const host=$('howto-faq-list');host.replaceChildren();for(const item of data.faq||[]){const details=el('details');details.append(el('summary','',item.question),el('p','',item.answer));host.append(details);}
}
init();
})();