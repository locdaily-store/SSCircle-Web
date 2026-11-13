/* Berita publik SSCircle. Konten pengguna dipasang sebagai teks, bukan HTML. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const el = (tag, cls = '', value) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (value !== undefined) n.textContent = String(value);
    return n;
  };
  const fallback = {
    settings: { enabled: true, eyebrow: 'SSCIRCLE / LATEST STORIES',
      title: 'Announcement & News', subtitle: 'Kabar terbaru SSCircle Server.',
      featuredLabel: 'SOROTAN UTAMA', emptyText: 'Belum ada pengumuman yang diterbitkan.' },
    items: []
  };
  const preview = new URLSearchParams(location.search).has('ssc_announcements_preview');
  let state = fallback, category = 'Semua', query = '', page = 0, activeId = new URL(location.href).searchParams.get('id') || '';
  const PER_PAGE = 9;
  const date = v => {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Makassar'}).format(d) : '';
  };
  const validImage = src => typeof src === 'string' &&
    (/^https:\/\/[^<>\s]+$/i.test(src) || /^\/api\/media\/[0-9a-f-]{36}$/i.test(src) || /^assets\/(?:gallery\/[\w.-]+|[\w.-]+)$/i.test(src));
  const image = (src, alt) => {
    const n = el('img');
    n.loading = 'lazy';
    n.decoding = 'async';
    n.referrerPolicy = 'no-referrer';
    n.alt = alt || 'Foto berita SSCircle';
    if (validImage(src)) n.src = src;
    return n;
  };
  const linkTo = id => 'announcements.html?id=' + encodeURIComponent(id);
  function openArticle(id) {
    activeId = id;
    if (!preview) history.pushState({id}, '', id ? linkTo(id) : 'announcements.html');
    render();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function categoryTag(item) {
    const tag = el('span','ann-tag',item.category || 'Informasi');
    return tag;
  }
  function storyCard(item, featured = false) {
    const a = el('a',featured ? 'ann-feature-card' : 'ann-story-card');
    a.href = linkTo(item.id);
    a.addEventListener('click',event => { event.preventDefault(); openArticle(item.id); });
    const media = el('div','ann-story-media');
    if (validImage(item.imageUrl)) media.append(image(item.imageUrl,item.imageAlt||item.title));
    else media.append(el('div','ann-no-image','✦'));
    const text = el('div','ann-story-content');
    const meta = el('div','ann-story-meta');
    meta.append(categoryTag(item), el('time','',date(item.publishedAt)));
    text.append(meta,el(featured?'h2':'h3','',item.title),el('p','',item.excerpt || item.content.slice(0,180)));
    const bottom = el('span','ann-read-more',featured ? 'Baca sorotan  ↗' : 'Baca selengkapnya  ↗');
    text.append(bottom);
    a.append(media,text);
    return a;
  }
  function renderDetail(item) {
    const root=$('ann-detail');
    root.replaceChildren();
    const back=el('button','ann-back','← Semua pengumuman');
    back.type='button';
    back.onclick=()=>openArticle('');
    root.append(back);
    if (!item) {
      root.append(el('h2','','Pengumuman tidak ditemukan'),el('p','','Artikel mungkin masih draft, dijadwalkan, atau sudah dihapus.'));
      return;
    }
    const meta=el('div','ann-detail-meta');
    meta.append(categoryTag(item),el('time','',date(item.publishedAt)));
    if(item.pinned)meta.append(el('span','ann-feature-mark','SOROTAN'));
    root.append(meta,el('h2','',item.title));
    if(item.excerpt)root.append(el('p','ann-detail-lead',item.excerpt));
    if(validImage(item.imageUrl)) {
      const figure=el('figure','ann-detail-cover');
      figure.append(image(item.imageUrl,item.imageAlt||item.title));
      if(item.imageAlt)figure.append(el('figcaption','',item.imageAlt));
      root.append(figure);
    }
    const body=el('div','ann-detail-body');
    String(item.content||'').split(/\n\s*\n/).forEach(paragraph=>{
      if(paragraph.trim())body.append(el('p','',paragraph.trim()));
    });
    root.append(body);
    if(Array.isArray(item.images)&&item.images.some(validImage)) {
      const gallery=el('div','ann-detail-gallery');
      item.images.filter(validImage).forEach(src=>{
        const a=el('a','ann-gallery-item');a.href=src;a.target='_blank';a.rel='noopener noreferrer';
        a.append(image(src,'Foto tambahan '+item.title));gallery.append(a);
      });
      root.append(el('h3','ann-gallery-heading','Galeri foto'),gallery);
    }
    const actions=el('div','ann-detail-actions'),copy=el('button','ann-copy-link','Salin tautan artikel');
    copy.type='button';copy.onclick=async()=>{
      try { await navigator.clipboard.writeText(new URL(linkTo(item.id),location.href).href);copy.textContent='Tautan disalin ✓'; }
      catch {copy.textContent='Buka artikel dan salin URL dari browser';}
    };
    actions.append(copy);
    root.append(actions);
  }
  function render() {
    const config=state.settings || fallback.settings;
    $('ann-eyebrow').textContent=config.eyebrow || fallback.settings.eyebrow;
    $('ann-title').textContent=config.title || fallback.settings.title;
    $('ann-subtitle').textContent=config.subtitle || '';
    const items=Array.isArray(state.items)?state.items:[];
    const detail=activeId ? (items.find(item=>item.id===activeId) || (state.article?.id===activeId?state.article:null)) : null;
    $('ann-count').textContent=items.length + ' kabar komunitas';
    $('ann-detail').hidden=!activeId;
    $('ann-list-section').hidden=!!activeId;
    if(activeId){$('ann-featured').replaceChildren();renderDetail(detail);return;}
    const featured=items.find(item=>item.pinned);
    const feature=$('ann-featured');
    feature.replaceChildren();
    if(featured && config.enabled!==false) {
      const wrap=el('section','ann-featured');
      wrap.append(el('div','ann-section-kicker',config.featuredLabel || 'SOROTAN UTAMA'),storyCard(featured,true));
      feature.append(wrap);
    }
    const available=items.filter(item=>!query || [item.title,item.excerpt,item.content,item.category].some(v=>String(v||'').toLocaleLowerCase('id').includes(query)));
    const cats=['Semua',...new Set(items.map(item=>item.category||'Informasi'))];
    if(!cats.includes(category))category='Semua';
    const categories=$('ann-categories');
    categories.replaceChildren();
    cats.forEach(name=>{
      const chip=el('button','ann-filter'+(category===name?' is-active':''),name);
      chip.type='button';chip.setAttribute('aria-pressed',String(category===name));
      chip.onclick=()=>{category=name;page=0;render();};
      categories.append(chip);
    });
    const filtered=available.filter(item=>category==='Semua'||item.category===category);
    const count=Math.ceil(filtered.length/PER_PAGE);
    page=Math.max(0,Math.min(page,Math.max(0,count-1)));
    $('ann-list-count').textContent=filtered.length+' artikel';
    const root=$('ann-list');
    root.replaceChildren();
    if(!filtered.length)root.append(el('p','ann-empty',query?'Tidak ada berita yang sesuai pencarian.':config.emptyText||fallback.settings.emptyText));
    else filtered.slice(page*PER_PAGE,(page+1)*PER_PAGE).forEach(item=>root.append(storyCard(item)));
    const nav=$('ann-pagination');
    nav.replaceChildren();
    if(count>1){
      const prev=el('button','ann-page-button','← Sebelumnya');
      prev.type='button';prev.disabled=page===0;prev.onclick=()=>{page--;render();};
      const next=el('button','ann-page-button','Berikutnya →');
      next.type='button';next.disabled=page>=count-1;next.onclick=()=>{page++;render();};
      nav.append(prev,el('span','',String(page+1)+' / '+count),next);
    }
  }
  $('ann-search').addEventListener('input', e=>{query=e.target.value.trim().toLocaleLowerCase('id');page=0;render();});
  window.addEventListener('popstate',()=>{activeId=new URL(location.href).searchParams.get('id')||'';render();});
  if(preview){
    window.addEventListener('message',event=>{
      if(event.origin!==location.origin || event.source!==parent || event.data?.type!=='ssc-announcement-preview-state')return;
      state={settings:event.data.settings||fallback.settings,items:Array.isArray(event.data.items)?event.data.items:[]};
      window.SSCircleShell?.apply(event.data.theme||{});
      activeId=event.data.activeId||'';
      query='';category='Semua';page=0;
      render();
    });
    queueMicrotask(()=>{if(parent!==window)parent.postMessage({type:'ssc-announcement-preview-ready'},location.origin);});
  }
  window.SSCircleTheme?.load?.();
  render();
  fetch('/api/announcements'+(activeId?'?id='+encodeURIComponent(activeId):''),{cache:'no-store',credentials:'same-origin'})
    .then(r=>r.ok?r.json():Promise.reject(Error('Berita belum dapat dimuat. Coba lagi nanti.')))
    .then(v=>{if(!preview||state===fallback){state=v;render();}})
    .catch(err=>{if(!preview){$('ann-list').replaceChildren(el('p','ann-empty',err.message));}});
})();
