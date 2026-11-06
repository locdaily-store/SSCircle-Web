/* Editor Season Archive & Hall of Fame SSCircle. Satu sumber: homeLeaderboardSeasons. */
'use strict';
window.SSCircleSeasonsAdmin = (() => {
  const $=id=>document.getElementById(id);
  const el=(tag,cls='',text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  let model=null,changed=()=>{},phone=false,installed=false,timer=0;
  const expanded=new Set();
  const mark=()=>{changed();schedule();};
  const inputField=(label,value,change,{type='text',multiline=false,max=400,help=''}={})=>{
    const wrap=el('label','field-group');wrap.append(el('span','field-label',label));
    const control=el(multiline?'textarea':'input');if(multiline)control.rows=3;else control.type=type;
    if(type!=='date')control.maxLength=max;
    control.value=value??'';
    control.addEventListener('input',()=>{change(control.value);mark();});wrap.append(control);
    if(help)wrap.append(el('small','field-help',help));return wrap;
  };
  const action=(label,onClick,primary=false)=>{const b=el('button','button '+(primary?'primary':'secondary'),label);b.type='button';b.onclick=onClick;return b;};
  const toggle=(label,checked,change)=>{const wrapper=el('label','rules-admin-switch'),check=el('input');check.type='checkbox';check.checked=checked===true;
    check.onchange=()=>{change(check.checked);mark();};wrapper.append(check,el('span','',label));return wrapper;};
  function mediaField(parent,label,object,key,rerender){
    const slot=el('div','season-admin-media');slot.append(el('span','field-label',label));
    if(object[key]){
      const pic=el('img','season-admin-thumbnail');pic.src=object[key];pic.alt=label;pic.loading='lazy';slot.append(pic);
      slot.append(action('Hapus foto',()=>{object[key]='';mark();rerender();}));
    }
    window.SSCircleImagePicker?.mount(slot,{title:'Pilih foto: Upload / URL / Media',current:()=>object[key]||'',compact:true,onSelect:src=>{object[key]=src;mark();rerender();}});
    parent.append(slot);
  }
  function makeSublist(body,season,key,title,max,create,fields,photoKey){
    const section=el('details','season-admin-subsection');section.append(el('summary','',`${title} (${season[key].length}/${max})`));
    const content=el('div','season-admin-subsection-content');section.append(content);
    const listing=el('div','season-admin-sublist');content.append(listing);
    const repaint=()=>{
      listing.replaceChildren();
      season[key].forEach((item,index)=>{
        const card=el('details','season-admin-mini');card.append(el('summary','',`${index+1}. ${item.title||item.caption||item.player||title}`));
        const inner=el('div','season-admin-mini-body');
        for(const [field,label,type,maxLen] of fields)
          inner.append(inputField(label,item[field],v=>item[field]=v,{multiline:type==='textarea',max:maxLen||300}));
        if(photoKey)mediaField(inner,'Foto',item,photoKey,repaint);
        inner.append(action('Hapus',async()=>{
          if(!await window.SSCNotice.confirm(`Hapus data ${title.toLowerCase()} ini?`,{danger:true,confirmText:'Hapus'}))return;
          season[key].splice(index,1);mark();repaint();
        }));card.append(inner);listing.append(card);
      });
      window.SSCircleSort?.attach(listing,{item:'.season-admin-mini',handleTarget:'summary',onMove:(from,to)=>{
        season[key].splice(to,0,season[key].splice(from,1)[0]);mark();repaint();
      }});
    };
    repaint();
    content.append(action('+ Tambah '+title,()=>{
      if(season[key].length>=max)return window.SSCNotice.alert(`Maksimal ${max} ${title.toLowerCase()}.`);
      season[key].push(create());mark();repaint();
      const cards=listing.querySelectorAll('details');cards[cards.length-1]?.setAttribute('open','');
      section.open=true;
    }));body.append(section);
  }
  function seasonCard(season,index){
    const card=el('details','season-admin-season');card.dataset.id=season.id;card.open=expanded.has(season.id);
    card.addEventListener('toggle',()=>{if(card.open)expanded.add(season.id);else expanded.delete(season.id);});
    const summary=el('summary','season-admin-summary');
    summary.append(el('strong','',season.title||'Season '+(index+1)));
    summary.append(el('span','season-admin-count',`${season.archivePublished?'Publik':'Draft'} · ${(season.entries||[]).length} pemain`));
    card.append(summary);
    const body=el('div','season-admin-body');
    body.append(toggle('Publikasikan season ini ke halaman arsip',season.archivePublished,v=>season.archivePublished=v));
    body.append(inputField('Nama season',season.title,v=>{season.title=v;summary.querySelector('strong').textContent=v||'Season';},{max:120}));
    const dates=el('div','season-admin-dates');
    dates.append(inputField('Tanggal mulai',season.archiveStartDate,v=>season.archiveStartDate=v,{type:'date'}));
    dates.append(inputField('Tanggal selesai (opsional)',season.archiveEndDate,v=>season.archiveEndDate=v,{type:'date'}));body.append(dates);
    const status=el('label','field-group');status.append(el('span','field-label','Status season'));
    const choice=el('select');for(const [value,label] of [['active','Sedang berlangsung'],['ended','Selesai / Arsip']]){
      const o=el('option','',label);o.value=value;choice.append(o);
    }choice.value=season.archiveStatus||'ended';choice.onchange=()=>{season.archiveStatus=choice.value;mark();};status.append(choice);body.append(status);
    body.append(inputField('Cerita singkat / highlight season',season.archiveSummary,v=>season.archiveSummary=v,{multiline:true,max:1200}));
    mediaField(body,'Foto sampul season',season,'archiveCover',renderEditor);
    makeSublist(body,season,'archiveMemories','Foto kenangan',12,()=>({src:'',caption:''}),[['caption','Keterangan foto','text',240]],'src');
    makeSublist(body,season,'archiveBuilds','Bangunan terbaik',8,()=>({title:'Bangunan baru',builder:'',src:'',description:''}),[
      ['title','Nama bangunan','text',120],['builder','Nama builder','text',100],['description','Cerita bangunan','textarea',350]],'src');
    makeSublist(body,season,'archiveAwards','Penghargaan',12,()=>({title:'Penghargaan baru',player:'',description:''}),[
      ['title','Kategori penghargaan','text',120],['player','Nama pemain','text',100],['description','Keterangan','textarea',350]]);
    const ranking=el('details','season-admin-subsection');ranking.append(el('summary','','Leaderboard season ('+(season.entries||[]).length+'/20)'));
    const inner=el('div','season-admin-subsection-content');ranking.append(inner);
    const list=el('div','season-admin-sublist');inner.append(list);
    const repaint=()=>{
      list.replaceChildren();
      season.entries.forEach((entry,i)=>{
        const row=el('div','season-admin-rank');row.append(el('span','',String(i+1)+'.'));
        row.append(inputField('Pemain',entry.name,v=>entry.name=v,{max:80}));
        row.append(inputField('Peringkat / skor',entry.score,v=>entry.score=v,{max:80}));
        row.append(action('Hapus',()=>{season.entries.splice(i,1);mark();repaint();}));list.append(row);
      });
      window.SSCircleSort?.attach(list,{item:'.season-admin-rank',onMove:(from,to)=>{
        season.entries.splice(to,0,season.entries.splice(from,1)[0]);mark();repaint();
      }});
    };
    repaint();inner.append(action('+ Tambah pemain',()=>{
      if(season.entries.length>=20)return SSCNotice.alert('Maksimal 20 pemain per season.');
      season.entries.push({name:'',score:''});mark();repaint();ranking.open=true;
    }));
    body.append(ranking);
    body.append(action('Hapus season',async()=>{
      if(!await window.SSCNotice.confirm('Hapus season ini beserta seluruh riwayat dan Leaderboard?',{danger:true,confirmText:'Hapus season'}))return;
      model.settings.homeLeaderboardSeasons.splice(index,1);expanded.delete(season.id);mark();renderEditor();
    }));card.append(body);return card;
  }
  function renderEditor(){if(!model)return;
    const s=model.settings,root=$('seasons-admin-editor');if(!root)return;root.replaceChildren();
    s.homeLeaderboardSeasons ||= [];
    const main=el('section','panel rules-admin-panel');
    main.append(el('h2','','Pengaturan halaman'));
    main.append(toggle('Aktifkan halaman Season Archive untuk publik',s.seasonArchiveEnabled,v=>s.seasonArchiveEnabled=v));
    main.append(inputField('Judul halaman',s.seasonArchiveTitle,v=>s.seasonArchiveTitle=v,{max:160}));
    main.append(inputField('Deskripsi pembuka',s.seasonArchiveDescription,v=>s.seasonArchiveDescription=v,{multiline:true,max:900}));
    main.append(inputField('Pesan saat arsip kosong',s.seasonArchiveEmptyText,v=>s.seasonArchiveEmptyText=v,{max:350}));
    main.append(el('p','field-help','Data season sama dengan Leaderboard lama. Season baru tetap sebagai draft sampai dipublikasikan.'));
    root.append(main);
    const bar=el('div','rules-admin-toolbar');bar.append(el('strong','',`Daftar season (${s.homeLeaderboardSeasons.length}/12)`));
    bar.append(action('+ Tambah season',()=>{
      if(s.homeLeaderboardSeasons.length>=12)return SSCNotice.alert('Maksimal 12 season.');
      const id='season-'+crypto.randomUUID().replace(/-/g,'').slice(0,12);
      s.homeLeaderboardSeasons.push({id,title:'Season '+(s.homeLeaderboardSeasons.length+1),entries:[],archivePublished:false,archiveStatus:'ended',archiveStartDate:'',archiveEndDate:'',archiveSummary:'',archiveCover:'',archiveMemories:[],archiveBuilds:[],archiveAwards:[]});
      expanded.add(id);mark();renderEditor();
    },true));root.append(bar);
    const list=el('div','season-admin-list');root.append(list);
    s.homeLeaderboardSeasons.forEach((season,index)=>{
      season.entries ||= [];season.archiveMemories ||= [];season.archiveBuilds ||= [];season.archiveAwards ||= [];
      list.append(seasonCard(season,index));
    });
    window.SSCircleSort?.attach(list,{item:'.season-admin-season',handleTarget:'summary',onMove:(from,to)=>{
      s.homeLeaderboardSeasons.splice(to,0,s.homeLeaderboardSeasons.splice(from,1)[0]);mark();renderEditor();
    }});
    if(!s.homeLeaderboardSeasons.length)root.append(el('p','field-help','Belum ada season. Tambahkan season pertama untuk mulai mengisi sejarah SSCircle.'));
  }
  function resize(){const shell=$('seasons-admin-preview-window'),frame=$('seasons-admin-preview-frame');if(!shell||!frame)return;
    const width=phone?390:1150,height=phone?850:880,scale=Math.min(1,Math.max(190,shell.clientWidth-20)/width);
    frame.style.width=width+'px';frame.style.height=height+'px';frame.style.transform='scale('+scale+')';
    shell.style.height=Math.min(680,height*scale+18)+'px';
    $('seasons-preview-desktop').classList.toggle('primary',!phone);
    $('seasons-preview-mobile').classList.toggle('primary',phone);
  }
  function post(){if(!model || location.origin === 'null')return;const frame=$('seasons-admin-preview-frame');const settings=structuredClone(model.settings);
    frame?.contentWindow?.postMessage({type:'ssc-season-preview-settings',settings},location.origin);
    frame?.contentWindow?.postMessage({type:'ssc-theme-preview-settings',settings},location.origin);
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(post,130);}
  function render(data,dirty){model=data;changed=dirty;renderEditor();
    if(!installed){installed=true;
      $('seasons-admin-preview-frame').addEventListener('load',schedule);
      $('seasons-preview-desktop').onclick=()=>{phone=false;resize();schedule();};
      $('seasons-preview-mobile').onclick=()=>{phone=true;resize();schedule();};
      if('ResizeObserver' in window)new ResizeObserver(resize).observe($('seasons-admin-preview-window'));
      window.addEventListener('message',event=>{
        if(event.origin!==location.origin||event.source!==$('seasons-admin-preview-frame')?.contentWindow)return;
        if(['ssc-season-preview-ready','ssc-theme-preview-ready'].includes(event.data?.type))schedule();
        if(event.data?.type==='ssc-season-preview-applied')$('seasons-admin-preview-status').textContent='Pratinjau berhasil diperbarui.';
      });
    }
    resize();schedule();
  }
  return {render,schedule};
})();
