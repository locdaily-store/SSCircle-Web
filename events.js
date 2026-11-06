/* Kalender dan daftar event publik SSCircle. Semua data berasal dari pengaturan admin. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const preview = new URLSearchParams(location.search).has('ssc_events_preview') ||
    new URLSearchParams(location.search).has('ssc_theme_preview');
  const fallback = { enabled: true, badge: 'SSCIRCLE / COMMUNITY EVENTS', title: 'Event & Schedule',
    description: 'Lihat kegiatan komunitas dan catat tanggal pentingmu di sini.',
    emptyText: 'Belum ada jadwal event yang diumumkan. Pantau terus halaman ini.', events: [] };
  let state = fallback, currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let previewHasData = false;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  function status(event, now = Date.now()) {
    if (now < Date.parse(event.startAt)) return ['upcoming', 'Akan Datang'];
    if (now < Date.parse(event.endAt)) return ['ongoing', 'Berlangsung'];
    return ['finished', 'Selesai'];
  }
  function clock(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'Jadwal belum valid';
    return new Intl.DateTimeFormat('id-ID', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(date);
  }
  function countdown(event, now = Date.now()) {
    const until = now < Date.parse(event.startAt) ? Date.parse(event.startAt) : Date.parse(event.endAt);
    const diff = until - now;
    if (diff <= 0) return 'Event telah selesai';
    const days = Math.floor(diff / 86400000), hours = Math.floor(diff % 86400000 / 3600000), minutes = Math.floor(diff % 3600000 / 60000);
    return (now < Date.parse(event.startAt) ? 'Mulai dalam ' : 'Berakhir dalam ') +
      (days ? days + ' hari ' : '') + String(hours).padStart(2, '0') + ' jam ' + String(minutes).padStart(2, '0') + ' menit';
  }
  function eventCard(event) {
    const card = el('article', 'events-card');
    if (event.image) {
      const img = el('img', 'events-image');
      img.src = event.image;
      img.alt = 'Poster: ' + event.title;
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      card.append(img);
    }
    const body = el('div', 'events-card-body'), top = el('div', 'events-card-top');
    const badge = el('span', 'events-status');
    const [key, title] = status(event); badge.dataset.status = key; badge.textContent = title;
    top.append(badge, el('span', 'events-date', clock(event.startAt)));
    body.append(top, el('h2', '', event.title));
    if (event.description) body.append(el('p', 'events-card-description', event.description));
    const meta = el('div', 'events-meta');
    meta.append(el('span', '', 'Mulai: ' + clock(event.startAt)), el('span', '', 'Selesai: ' + clock(event.endAt)));
    if (event.location) meta.append(el('span', '', 'Tempat: ' + event.location));
    const count = el('div', 'events-countdown', countdown(event)); count.dataset.eventId = event.id;
    body.append(meta, count); card.append(body); return card;
  }
  function eventsList() {
    const root = $('events-list'); root.replaceChildren();
    const all = Array.isArray(state.events) ? [...state.events].sort((a,b) => Date.parse(a.startAt) - Date.parse(b.startAt)) : [];
    const monthStart = currentMonth.getTime();
    const monthEnd = new Date(currentMonth.getFullYear(),currentMonth.getMonth()+1,1).getTime();
    const matches = all.filter(event => Date.parse(event.startAt) < monthEnd && Date.parse(event.endAt) > monthStart);
    // Daftar event terpilih menunjukkan bulan aktif; kalender dapat memilih bulan berbeda.
    $('events-list-heading').textContent = 'Jadwal ' + new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric'}).format(currentMonth);
    if (!state.enabled || !matches.length) { root.append(el('p','events-empty',state.enabled ? state.emptyText : 'Jadwal event belum ditampilkan.')); return; }
    matches.forEach(item => root.append(eventCard(item)));
  }
  function renderCalendar() {
    $('events-month-label').textContent = new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric'}).format(currentMonth);
    const root=$('events-month-grid'); root.replaceChildren();
    for(const name of ['Sen','Sel','Rab','Kam','Jum','Sab','Min']) root.append(el('span','events-weekday',name));
    const offset=(currentMonth.getDay()+6)%7;
    const days=new Date(currentMonth.getFullYear(),currentMonth.getMonth()+1,0).getDate();
    const all=state.enabled && Array.isArray(state.events) ? state.events : [];
    for (let i=0;i<offset;i++) root.append(el('span','events-day-placeholder'));
    for(let day=1;day<=days;day++){
      const today=new Date(currentMonth.getFullYear(),currentMonth.getMonth(),day);
      const button=el('button','events-day',String(day));button.type='button';
      if(new Date().toDateString()===today.toDateString())button.classList.add('is-today');
      const count=all.filter(e=>{const start=new Date(e.startAt),end=new Date(e.endAt);
        // Tandai semua hari yang bersinggungan dengan rentang event.
        return start < new Date(today.getFullYear(),today.getMonth(),today.getDate()+1) && end > today;}).length;
      if(count){button.classList.add('has-event');button.append(el('span','events-day-dot',count+' event'));}
      button.setAttribute('aria-label',day+' '+$('events-month-label').textContent+(count?' · '+count+' event':''));
      button.addEventListener('click',()=>{const endOfDay=new Date(today.getFullYear(),today.getMonth(),today.getDate()+1);
        const relevant=all.filter(e=>Date.parse(e.startAt)<new Date(currentMonth.getFullYear(),currentMonth.getMonth()+1,1).getTime() && Date.parse(e.endAt)>currentMonth.getTime());
        const match=relevant.find(e=>Date.parse(e.startAt)<endOfDay.getTime()&&Date.parse(e.endAt)>today.getTime());
        if(match){const sorted=relevant.sort((a,b)=>Date.parse(a.startAt)-Date.parse(b.startAt));
          $('events-list').children[sorted.indexOf(match)]?.scrollIntoView({behavior:'smooth',block:'center'});}
      });
      root.append(button);
    }
  }
  function render(data) {
    state = { ...fallback, ...data };
    $('events-badge').textContent=state.badge || fallback.badge;
    $('events-title').textContent=state.title || fallback.title;
    $('events-description').textContent=state.description || '';
    renderCalendar();eventsList();
  }
  $('events-prev').addEventListener('click',()=>{ currentMonth=new Date(currentMonth.getFullYear(),currentMonth.getMonth()-1,1);renderCalendar();eventsList(); });
  $('events-next').addEventListener('click',()=>{ currentMonth=new Date(currentMonth.getFullYear(),currentMonth.getMonth()+1,1);renderCalendar();eventsList(); });
  if(preview){window.addEventListener('message',event=>{if(event.origin!==location.origin || event.source!==parent || event.data?.type!=='ssc-events-preview-settings')return;
    previewHasData=true;const s=event.data.settings||{};
    render({enabled:s.eventsEnabled!==false,badge:s.eventsBadge,title:s.eventsTitle,description:s.eventsDescription,emptyText:s.eventsEmptyText,events:s.eventsItems});
    window.SSCircleShell?.apply(s);parent.postMessage({type:'ssc-events-preview-applied'},location.origin);
  });}
  render(fallback);
  fetch('/api/events',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(new Error('Gagal memuat jadwal event.')))
    .then(data=>{if(!previewHasData)render(data);}).catch(err=>{if(!previewHasData)$('events-list').replaceChildren(el('p','events-empty',err.message));});
  setInterval(()=>{if(!document.hidden) for(const node of document.querySelectorAll('.events-countdown')){
    const event=state.events?.find(e=>e.id===node.dataset.eventId);if(event)node.textContent=countdown(event);
    const badge=node.closest('.events-card')?.querySelector('.events-status');
    if(badge&&event){const [key,label]=status(event);badge.dataset.status=key;badge.textContent=label;}
  }},30000);
  if(preview) queueMicrotask(()=>parent!==window&&parent.postMessage({type:'ssc-events-preview-ready'},location.origin));
})();
