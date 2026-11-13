/* Ringkasan admin: data nyata, diagram status, kegiatan terbaru, dan pintasan. */
'use strict';
window.SSCircleOverview = (() => {
  const $ = id => document.getElementById(id);
  const el = (tag,cls='',value) => {
    const n=document.createElement(tag);
    if(cls)n.className=cls;
    if(value!==undefined)n.textContent=String(value);
    return n;
  };
  let requestCount=0;
  const labels={pending:'Menunggu review',accepted:'Diterima',rejected:'Ditolak'};
  const go = id => document.querySelector('.dashboard-sidebar [data-tab="'+id+'"]')?.click();
  function link(label,id) {
    const b=el('button','button secondary',label);
    b.type='button';b.onclick=()=>go(id);return b;
  }
  function row(label,value,cls='') {
    const wrap=el('div','ssc-overview-status-row '+cls);
    wrap.append(el('span','',label),el('strong','',value));
    return wrap;
  }
  function render(data) {
    const root=$('overview-insights');
    if(!root)return;
    const list=Array.isArray(data?.submissions)?data.submissions:[];
    const total=list.length;
    const accepted=list.filter(s=>s.status==='accepted').length;
    const pending=list.filter(s=>s.status==='pending').length;
    const rejected=list.filter(s=>s.status==='rejected').length;
    const pct=n=>total?Math.round(n/total*100):0;
    root.replaceChildren();
    const area=el('div','ssc-overview-grid');
    const chartCard=el('section','panel ssc-overview-card');
    const chartTop=el('div','ssc-overview-card-head');
    chartTop.append(el('div','ssc-overview-label','MEMBERSHIP ANALYTICS'),el('span','ssc-overview-pill','Real-time snapshot'));
    chartCard.append(chartTop,el('h2','','Komposisi pendaftaran'));
    const content=el('div','ssc-overview-chart-content');
    const donut=el('div','ssc-overview-donut');
    const acceptedEnd=pct(accepted),pendingEnd=Math.min(100,acceptedEnd+pct(pending));
    donut.style.background='conic-gradient(var(--ssc-success,#b6e2ce) 0% '+acceptedEnd+'%, var(--ssc-warning,#dfc589) '+acceptedEnd+'% '+pendingEnd+'%, var(--ssc-danger,#ff9caf) '+pendingEnd+'% 100%)';
    const center=el('div','ssc-overview-donut-middle');
    center.append(el('strong','',String(total)),el('small','','Total akun'));
    donut.append(center);
    const breakdown=el('div','ssc-overview-breakdown');
    breakdown.append(row('Diterima',accepted+' · '+pct(accepted)+'%','is-accepted'),
      row('Menunggu',pending+' · '+pct(pending)+'%','is-pending'),
      row('Ditolak',rejected+' · '+pct(rejected)+'%','is-rejected'));
    content.append(donut,breakdown);chartCard.append(content);
    const activity=el('section','panel ssc-overview-card');
    activity.append(el('div','ssc-overview-label','LATEST ACTIVITY'),el('h2','','Aktivitas pendaftaran'));
    const recent=[...list].sort((a,b)=>Date.parse(b.submitted_at||b.at||0)-Date.parse(a.submitted_at||a.at||0)).slice(0,5);
    if(!recent.length)activity.append(el('p','field-help','Belum ada pendaftaran masuk.'));
    else {
      const stream=el('div','ssc-overview-feed');
      for(const entry of recent) {
        const item=el('div','ssc-overview-feed-row');
        const pill=el('span','ssc-overview-feed-dot is-'+(entry.status||'pending'));
        const text=el('div');
        const d=new Date(entry.submitted_at||entry.at||0);
        text.append(el('strong','',labels[entry.status]||'Aktivitas pendaftaran'),
          el('small','',Number.isFinite(d.getTime())?new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d):'Tanggal belum tersedia'));
        item.append(pill,text);stream.append(item);
      }
      activity.append(stream);
    }
    activity.append(link('Kelola pendaftar →','answers'));
    area.append(chartCard,activity);
    const second=el('div','ssc-overview-grid ssc-overview-grid-bottom');
    const operations=el('section','panel ssc-overview-card');
    operations.append(el('div','ssc-overview-label','QUICK ACTIONS'),el('h2','','Akses cepat'));
    const shortcuts=el('div','ssc-overview-shortcuts');
    shortcuts.append(link('✧ Pengumuman','announcements-admin'),link('▦ Event & Jadwal','events-admin'),
      link('♢ Pusat Notifikasi','notifications-admin'),link('◐ Warna Website','theme'),link('↻ Minecraft Sync','minecraft-sync-admin'));
    operations.append(shortcuts);
    const publication=el('section','panel ssc-overview-card');
    publication.append(el('div','ssc-overview-label','CONTENT OVERVIEW'),el('h2','','Publikasi & berita'));
    const numbers=el('div','ssc-overview-publications');
    numbers.id='ssc-overview-publications';
    numbers.append(el('span','field-help','Mengambil data Announcement...'));
    publication.append(numbers,link('Buka editor Announcement →','announcements-admin'));
    second.append(operations,publication);
    root.append(area,second);
    const turn=++requestCount;
    fetch('/api/admin/announcements',{credentials:'same-origin',cache:'no-store'})
      .then(r=>r.ok?r.json():Promise.reject(Error('Tidak tersedia')))
      .then(json=>{
        if(turn!==requestCount||!document.contains(numbers))return;
        numbers.replaceChildren(row('Total berita',String(json.counts?.total??0)),
          row('Sudah diterbitkan',String(json.counts?.published??0)),
          row('Masih draft',String(json.counts?.draft??0)));
      })
      .catch(()=>{if(turn===requestCount && document.contains(numbers))numbers.replaceChildren(el('span','field-help','Status artikel belum tersedia.'));});
  }
  return {render};
})();
