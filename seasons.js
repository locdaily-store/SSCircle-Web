/* Season Archive SSCircle: data publik berasal dari pengaturan Leaderboard yang sama. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const el = (tag, cls = '', text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const preview = new URLSearchParams(location.search).has('ssc_season_preview');
  function dateLabel(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '';
    return new Date(iso + 'T12:00:00Z').toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
  }
  function image(src,alt) {
    if(!src || !/^(?:assets\/(?:gallery\/sscircle-0[1-9]\.webp|[\w-]+\.png)|\/api\/media\/[0-9a-f-]{36}|https:\/\/)/i.test(src)) return null;
    const pic=el('img');pic.src=src;pic.alt=alt;pic.loading='lazy';pic.referrerPolicy='no-referrer';return pic;
  }
  function render(settings={}) {
    $('season-page-title').textContent=settings.seasonArchiveTitle||'Season Archive & Hall of Fame';
    $('season-page-description').textContent=settings.seasonArchiveDescription||'';
    $('season-page-empty').textContent=settings.seasonArchiveEmptyText||'Belum ada cerita season yang dipublikasikan.';
    window.SSCircleTheme?.apply(settings);
    window.SSCircleShell?.apply(settings);
    const root=$('season-archive-list');root.replaceChildren();
    // One accessible modal for all cards, including the live Admin preview.
    const previous=$('season-archive-dialog');
    if(previous){if(previous.open)previous.close();previous.remove();}
    document.body.classList.remove('season-modal-open');
    const dialog=el('dialog','season-archive-modal');
    dialog.id='season-archive-dialog';
    dialog.setAttribute('aria-modal','true');
    dialog.setAttribute('aria-labelledby','season-archive-dialog-title');
    const shell=el('div','season-archive-modal-shell');
    const toolbar=el('div','season-archive-modal-toolbar');
    const modalTitle=el('h2','season-archive-modal-title');
    modalTitle.id='season-archive-dialog-title';
    const closeButton=el('button','season-archive-modal-close','Tutup ✕');
    closeButton.type='button';
    closeButton.setAttribute('aria-label','Tutup detail Season');
    closeButton.onclick=()=>dialog.close();
    toolbar.append(modalTitle,closeButton);
    const modalContent=el('div','season-archive-modal-content');
    shell.append(toolbar,modalContent);
    dialog.append(shell);
    document.body.append(dialog);
    let previousTrigger=null;
    dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
    dialog.addEventListener('close',()=>{
      document.body.classList.remove('season-modal-open');
      if(previousTrigger?.isConnected)previousTrigger.focus({preventScroll:true});
    });
    const entries=(Array.isArray(settings.homeLeaderboardSeasons)?settings.homeLeaderboardSeasons:[])
      .filter(s=>s?.archivePublished===true);
    $('season-page-empty').hidden=entries.length>0;
    let shown=0;
    const renderBatch=()=>{
    const batch=entries.slice(shown,shown+20);
    for(const [batchIndex,season] of batch.entries()) {
      const index=shown+batchIndex;
      const card=el('article','season-archive-card');
      const heading=el('div','season-archive-card-head');
      const cover=image(season.archiveCover,'Sampul '+season.title);
      if(cover) {const figure=el('div','season-archive-cover');figure.append(cover);card.append(figure);}
      const headText=el('div','season-archive-heading-text');
      headText.append(el('span','season-archive-kicker','CHAPTER '+String(index+1).padStart(2,'0')));
      headText.append(el('h2','',season.title||'Season SSCircle'));
      const dates=[dateLabel(season.archiveStartDate),dateLabel(season.archiveEndDate)].filter(Boolean);
      if(dates.length)headText.append(el('p','season-archive-dates',dates.join(' – ')));
      const summary=typeof season.archiveSummary==='string'?season.archiveSummary.trim():'';
      if(summary)headText.append(el('p','season-archive-summary',summary));
      if(season.archiveStatus==='planned'&&season.archiveScheduledAt){
        const when=new Date(season.archiveScheduledAt);
        if(Number.isFinite(when.getTime()))
          headText.append(el('p','season-archive-dates',
            'Rencana pembukaan: '+when.toLocaleString('id-ID')));
      }
      const badge=el('span','season-archive-state',season.archiveStatus==='active'
        ?'Sedang Berlangsung':season.archiveStatus==='planned'?'Akan Datang':'Arsip Season');
      heading.append(headText,badge);card.append(heading);
      card.setAttribute('role','button');
      card.setAttribute('tabindex','0');
      card.setAttribute('aria-label','Lihat detail lengkap '+(season.title||'Season SSCircle'));
      card.append(el('span','season-archive-card-action','Lihat cerita, foto dan prestasi season ↗'));
      const body=el('div','season-archive-details-body');
      const timeline=Array.isArray(season.archiveTimeline)?season.archiveTimeline.filter(item=>item?.title):[];
      if(timeline.length){
        const section=el('section','season-archive-group season-archive-timeline');
        section.append(el('h3','','Timeline Season'));
        const list=el('ol','season-timeline-list');
        for(const item of [...timeline].sort((a,b)=>(a.date||'').localeCompare(b.date||''))){
          const entry=el('li','season-timeline-entry');
          if(item.date)entry.append(el('time','season-timeline-date',dateLabel(item.date)));
          const labels={opening:'Pembukaan',closing:'Penutupan',event:'Event',
            build:'Pembangunan',award:'Penghargaan',milestone:'Milestone'};
          entry.append(el('span','season-timeline-type',labels[item.kind]||'Milestone'));
          entry.append(el('strong','',item.title));
          if(item.description)entry.append(el('p','',item.description));
          list.append(entry);
        }
        section.append(list);body.append(section);
      }
      if(season.archiveStatus==='ended'&&season.archiveSnapshot?.capturedAt){
        const snapshot=season.archiveSnapshot;
        const section=el('section','season-archive-group season-archive-final');
        section.append(el('h3','','Rekap Akhir Season'));
        section.append(el('p','',String(snapshot.playerCount||0)+' pemain · '+
          Math.floor((snapshot.playtimeSeconds||0)/3600)+' jam bermain · '+
          (snapshot.deaths||0)+' deaths · '+(snapshot.mobKills||0)+' mob kills'));
        body.append(section);
      }
      const memories=Array.isArray(season.archiveMemories)?season.archiveMemories:[];
      if(memories.length){
        const section=el('section','season-archive-group');section.append(el('h3','','Foto & Kenangan'));
        const grid=el('div','season-archive-gallery');
        for(const item of memories){const photo=image(item.src,item.caption||'Foto kenangan');if(!photo)continue;
          const tile=el('figure','season-archive-photo');tile.append(photo);
          if(item.caption)tile.append(el('figcaption','',item.caption));grid.append(tile);
        }
        section.append(grid);body.append(section);
      }
      const builds=Array.isArray(season.archiveBuilds)?season.archiveBuilds:[];
      if(builds.length){const section=el('section','season-archive-group');section.append(el('h3','','Bangunan Terbaik'));
        const grid=el('div','season-archive-gallery');
        for(const build of builds){const tile=el('article','season-archive-feature');const picture=image(build.src,build.title);
          if(picture)tile.append(picture);
          tile.append(el('strong','',build.title||'Bangunan'));
          if(build.builder)tile.append(el('span','', 'Builder: '+build.builder));
          if(build.description)tile.append(el('p','',build.description));grid.append(tile);
        }section.append(grid);body.append(section);
      }
      const awards=Array.isArray(season.archiveAwards)?season.archiveAwards:[];
      if(awards.length){const section=el('section','season-archive-group');section.append(el('h3','','Hall of Fame'));
        const grid=el('div','season-archive-awards');
        for(const award of awards){const tile=el('article','season-archive-award');tile.append(el('span','','★ '+(award.title||'Penghargaan')));
          if(award.player)tile.append(el('strong','',award.player));
          if(award.description)tile.append(el('p','',award.description));grid.append(tile);
        }section.append(grid);body.append(section);
      }
      const boards=Array.isArray(season.archiveLeaderboards)?season.archiveLeaderboards:
        (Array.isArray(season.entries)&&season.entries.length
          ?[{id:'main',title:'Leaderboard Season',entries:season.entries}]:[]);
      if(boards.length){
        const section=el('section','season-archive-group season-archive-leaderboards');
        section.append(el('h3','','Leaderboard Season'));
        const collection=el('div','season-archive-leaderboard-grid');
        for(const board of boards){
          const panel=el('article','season-archive-leaderboard');
          panel.append(el('h4','',board.title||'Leaderboard'));
          const ranking=(Array.isArray(board.entries)?board.entries:[]).filter(r=>r?.name||r?.score);
          if(ranking.length){
            const list=el('ol','season-archive-ranking');
            for(const entry of ranking){
              const li=el('li');
              li.append(el('strong','',entry.name||'Pemain'));
              li.append(el('span','',entry.score||''));
              list.append(li);
            }
            panel.append(list);
          }else panel.append(el('p','season-archive-note','Belum ada peringkat yang ditampilkan.'));
          collection.append(panel);
        }
        section.append(collection);body.append(section);
      }
      if(!body.children.length)body.append(el('p','season-archive-note','Cerita season ini sedang dilengkapi oleh pengelola.'));
      const openDetails=()=>{
        if(dialog.open)return;
        previousTrigger=card;
        modalTitle.textContent=season.title||'Season SSCircle';
        const intro=el('div','season-archive-modal-intro');
        const fullCover=image(season.archiveCover,'Sampul lengkap '+(season.title||'Season SSCircle'));
        if(fullCover){
          const figure=el('figure','season-archive-modal-cover');
          figure.append(fullCover);intro.append(figure);
        }
        const overview=el('div','season-archive-modal-overview');
        overview.append(el('span','season-archive-state',badge.textContent));
        if(dates.length)overview.append(el('p','season-archive-dates',dates.join(' – ')));
        if(summary)overview.append(el('p','season-archive-summary',summary));
        intro.append(overview);
        modalContent.replaceChildren(intro,body);
        modalContent.scrollTop=0;
        dialog.showModal();
        document.body.classList.add('season-modal-open');
        closeButton.focus();
      };
      card.addEventListener('click',openDetails);
      card.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' '){
          event.preventDefault();openDetails();
        }
      });
      root.append(card);
    }
    shown+=batch.length;
    if(shown<entries.length){
      const more=el('button','button secondary','Tampilkan 20 Season berikutnya ('+shown+'/'+entries.length+')');
      more.type='button';more.onclick=()=>{more.remove();renderBatch();};
      root.append(more);
    }
    };
    renderBatch();
    if(preview&&window.parent!==window)parent.postMessage({type:'ssc-season-preview-applied'},location.origin);
  }
  if(preview) {
    window.addEventListener('message',event=>{
      if(event.origin!==location.origin||event.source!==parent) return;
      if(event.data?.type==='ssc-season-preview-settings')render(event.data.settings||{});
      if(event.data?.type==='ssc-theme-preview-settings')render(event.data.settings||{});
    });
    queueMicrotask(()=>{if(parent!==window)parent.postMessage({type:'ssc-season-preview-ready'},location.origin);});
  } else {
    fetch('/api/form',{credentials:'same-origin',cache:'no-store'})
      .then(r=>r.ok?r.json():Promise.reject(Error('Tidak dapat memuat arsip')))
      .then(data=>render(data.settings||{}))
      .catch(()=>{$('season-page-empty').hidden=false;$('season-page-empty').textContent='Arsip sementara belum dapat dimuat. Coba muat ulang halaman.';});
  }
  window.SSCircleSeasonArchive = { render };
})();
