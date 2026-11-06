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
    const entries=(Array.isArray(settings.homeLeaderboardSeasons)?settings.homeLeaderboardSeasons:[])
      .filter(s=>s?.archivePublished===true);
    $('season-page-empty').hidden=entries.length>0;
    for(const [index,season] of entries.entries()) {
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
      const badge=el('span','season-archive-state',season.archiveStatus==='active'?'Sedang Berlangsung':'Arsip Season');
      heading.append(headText,badge);card.append(heading);
      const detail=el('details','season-archive-details');
      detail.append(el('summary','','Lihat kenangan dan prestasi season ↗'));
      const body=el('div','season-archive-details-body');
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
      const ranking=(Array.isArray(season.entries)?season.entries:[]).filter(r=>r?.name||r?.score);
      if(ranking.length){const section=el('section','season-archive-group');section.append(el('h3','','Leaderboard Season'));
        const list=el('ol','season-archive-ranking');
        for(const entry of ranking){const li=el('li');li.append(el('strong','',entry.name||'Pemain'));
          li.append(el('span','',entry.score||''));list.append(li);}
        section.append(list);body.append(section);
      }
      if(!body.children.length)body.append(el('p','season-archive-note','Cerita season ini sedang dilengkapi oleh pengelola.'));
      detail.append(body);card.append(detail);root.append(card);
    }
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
