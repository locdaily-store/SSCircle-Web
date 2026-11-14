/* Public, static explanation only. No sensitive account state. */
'use strict';
(() => {
  const descriptions={
    voting:['Voting sedang ditutup','Voting komunitas saat ini dinonaktifkan oleh pengelola. Kamu masih dapat melihat informasi SSCircle di Homepage.'],
    events:['Halaman Event sedang ditutup','Jadwal dan kegiatan komunitas sedang tidak ditampilkan. Pantau pengumuman terbaru untuk informasi pembukaan berikutnya.'],
    announcements:['Announcement sedang ditutup','Pengumuman dan berita komunitas belum tersedia untuk pengunjung saat ini.'],
    gallery:['Gallery sedang ditutup','Koleksi foto SSCircle sedang tidak ditampilkan.'],
    seasons:['Season Archive sedang ditutup','Halaman Season Archive & Hall of Fame saat ini belum dibuka untuk publik.'],
    guide:['How to Play sedang ditutup','Panduan Getting Started sedang tidak tersedia. Informasi pendaftaran dan bermain dapat dilihat melalui Homepage atau Discord.'],
    registration:['Pendaftaran sedang ditutup','Pendaftaran anggota baru belum dibuka. Ikuti pengumuman komunitas untuk informasi lebih lanjut.']
  };
  const key=new URLSearchParams(location.search).get('section')||'';
  const [title,message]=descriptions[key]||['Halaman sedang tidak tersedia','Halaman ini belum tersedia untuk pengunjung saat ini.'];
  document.getElementById('ssc-closed-title').textContent=title+'.';
  document.getElementById('ssc-closed-description').textContent=message;
  document.title=title+' | SSCircle Server';
  if(key==='guide'){
    const guide=document.querySelector('.ssc-closed-action[href="/how-to-play.html"]');
    if(guide)guide.href='/registration.html';
    if(guide)guide.textContent='Lihat Pendaftaran ↗';
  }
  fetch('/api/form',{credentials:'same-origin',cache:'no-store'})
    .then(r=>r.ok?r.json():null)
    .then(data=>{if(data?.settings)window.SSCircleTheme?.apply?.(data.settings);})
    .catch(()=>{});
})();