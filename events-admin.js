/* Admin Control: editor Event & Schedule Calendar. Semua field menggunakan API simpan SSCircle yang sama. */
'use strict';
window.SSCircleEventsAdmin = (() => {
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n; };
  let model=null, changed=()=>{}, mobile=false, timer=0, installed=false;
  const uuid=()=> 'event-'+crypto.randomUUID().replace(/-/g,'').slice(0,12);
  function mark(){changed();schedule();}
  function field(label,value,onChange,{multiline=false,max=300,type='text',help=''}={}){
    const row=el('label','field-group');row.append(el('span','field-label',label));
    const input=el(multiline?'textarea':'input');
    if(multiline)input.rows=3;else input.type=type;
    input.maxLength=max;input.value=value??'';
    input.addEventListener('input',()=>{onChange(input.value);mark();});
    row.append(input);if(help)row.append(el('small','field-help',help));
    return row;
  }
  function button(label,handler,kind='secondary'){
    const b=el('button','button '+kind,label);b.type='button';b.onclick=handler;return b;
  }
  function localDatetime(iso){if(!iso)return '';const date=new Date(iso);
    if(Number.isNaN(date.getTime()))return '';
    const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
    return local.toISOString().slice(0,16);
  }
  function fromLocalDatetime(input){if(!input)return '';const date=new Date(input);
    return Number.isNaN(date.getTime())?'':date.toISOString();
  }
  function status(item){const now=Date.now(),start=Date.parse(item.startAt),end=Date.parse(item.endAt);
    return !Number.isFinite(start)||!Number.isFinite(end)?'Belum dijadwalkan':now<start?'Akan Datang':now<end?'Berlangsung':'Selesai';
  }
  function reorder(from,to){const items=model.settings.eventsItems;
    if(to<0||to>=items.length)return;
    items.splice(to,0,items.splice(from,1)[0]);mark();renderEditor();
  }
  function renderEditor(){if(!model)return;
    const s=model.settings,root=$('events-admin-editor');root.replaceChildren();
    s.eventsItems ||= [];
    const settings=el('section','panel rules-admin-panel');
    settings.append(el('h2','','Pengaturan halaman'));
    const toggle=el('label','rules-admin-switch'),check=el('input');check.type='checkbox';check.checked=s.eventsEnabled!==false;
    check.onchange=()=>{s.eventsEnabled=check.checked;mark();};
    toggle.append(check,el('span','','Tampilkan Event Calendar untuk pengunjung'));
    settings.append(toggle,el('p','field-help','Event yang disembunyikan tidak muncul di halaman publik. Data jadwal tetap tersimpan.'));
    for(const [key,label,multi,max] of [
      ['eventsBadge','Label kecil di atas judul',false,90],
      ['eventsTitle','Judul halaman',false,140],
      ['eventsDescription','Keterangan pembuka',true,900],
      ['eventsEmptyText','Pesan jika belum ada event',true,400]
    ])settings.append(field(label,s[key]||'',v=>s[key]=v,{multiline:multi,max}));
    root.append(settings);
    const bar=el('div','rules-admin-toolbar');
    bar.append(el('div','','Daftar event ('+s.eventsItems.length+'/40)'),button('+ Tambah event',()=>{
      if(s.eventsItems.length>=40)return SSCNotice.alert('Maksimal 40 event.');
      const start=new Date(Date.now()+86400000);start.setMinutes(0,0,0);
      const end=new Date(start.getTime()+7200000);
      s.eventsItems.push({id:uuid(),title:'Event baru',description:'',location:'',image:'',startAt:start.toISOString(),endAt:end.toISOString()});
      mark();renderEditor();
    },'primary'));
    root.append(bar);
    if(!s.eventsItems.length)root.append(el('p','panel events-admin-empty','Belum ada event. Klik “+ Tambah event” untuk mulai membuat jadwal.'));
    s.eventsItems.forEach((item,index)=>{
      const details=el('details','rules-admin-category events-admin-event');details.open=index===s.eventsItems.length-1;
      const head=el('summary'),title=el('strong','',item.title||'Event baru');
      head.append(title,el('span','rules-admin-count',status(item)));
      const main=el('div','rules-admin-category-body');
      const actions=el('div','rules-admin-actions');
      actions.append(button('↑ Naik',()=>reorder(index,index-1)),button('↓ Turun',()=>reorder(index,index+1)));
      actions.append(button('Hapus event',async()=>{
        if(!await SSCNotice.confirm('Hapus jadwal “'+item.title+'”?',{danger:true,confirmText:'Hapus'}))return;
        s.eventsItems.splice(index,1);mark();renderEditor();
      }));
      main.append(actions);
      main.append(field('Nama event',item.title,v=>{item.title=v;title.textContent=v||'Event baru';},{max:140}));
      main.append(field('Deskripsi event',item.description,v=>item.description=v,{multiline:true,max:1400}));
      const times=el('div','events-admin-dates');
      const start=field('Mulai',localDatetime(item.startAt),v=>item.startAt=fromLocalDatetime(v),{type:'datetime-local',help:'Gunakan waktu lokal perangkat admin.'});
      const end=field('Selesai',localDatetime(item.endAt),v=>item.endAt=fromLocalDatetime(v),{type:'datetime-local',help:'Status dan hitung mundur mengikuti rentang waktu ini.'});
      times.append(start,end);main.append(times);
      main.append(field('Lokasi / tempat (opsional)',item.location,v=>item.location=v,{max:120}));
      const media=el('div','events-admin-media');
      media.append(el('span','field-label','Poster atau foto event'));
      if(item.image){const pic=el('img','events-admin-photo');pic.src=item.image;pic.alt='Poster '+item.title;pic.referrerPolicy='no-referrer';media.append(pic);
        media.append(button('Hapus gambar',()=>{item.image='';mark();renderEditor();}));}
      window.SSCircleImagePicker?.mount(media,{
        title:'Pilih gambar: Upload / URL / Penyimpanan Media',current:()=>item.image||'',
        onSelect:src=>{item.image=src;mark();renderEditor();},compact:true
      });
      main.append(media);
      details.append(head,main);root.append(details);
    });
  }
  function sizePreview(){const shell=$('events-admin-preview-window'),frame=$('events-admin-preview-frame');if(!shell||!frame)return;
    const width=mobile?390:1150,height=mobile?850:860;
    const scale=Math.min(1,Math.max(190,shell.clientWidth-20)/width);
    frame.style.width=width+'px';frame.style.height=height+'px';frame.style.transform='scale('+scale+')';
    shell.style.height=Math.min(680,height*scale+18)+'px';
    $('events-preview-desktop').classList.toggle('primary',!mobile);
    $('events-preview-mobile').classList.toggle('primary',mobile);
  }
  function post(){if(!model)return;const frame=$('events-admin-preview-frame');
    const settings=structuredClone(model.settings);
    frame?.contentWindow?.postMessage({type:'ssc-events-preview-settings',settings},location.origin);
    frame?.contentWindow?.postMessage({type:'ssc-theme-preview-settings',settings},location.origin);
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(post,130);}
  function render(data,dirty){model=data;changed=dirty;renderEditor();
    if(!installed){installed=true;
      $('events-admin-preview-frame').addEventListener('load',schedule);
      $('events-preview-desktop').onclick=()=>{mobile=false;sizePreview();schedule();};
      $('events-preview-mobile').onclick=()=>{mobile=true;sizePreview();schedule();};
      if('ResizeObserver' in window)new ResizeObserver(sizePreview).observe($('events-admin-preview-window'));
      window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==$('events-admin-preview-frame')?.contentWindow)return;
        if(event.data?.type==='ssc-events-preview-ready'||event.data?.type==='ssc-theme-preview-ready')schedule();
        if(event.data?.type==='ssc-events-preview-applied')$('events-admin-preview-status').textContent='Pratinjau sudah diperbarui.';
      });
    }
    sizePreview();schedule();
  }
  return {render,schedule};
})();
