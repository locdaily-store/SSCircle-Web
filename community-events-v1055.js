/* V10.55 • member-created events, registrations and five-question request form. */
(()=>{'use strict';
 const root=document.getElementById('community55-events-root');
 if(!root||new URLSearchParams(location.search).has('ssc_events_preview'))return;
 const el=(tag,klass='',text='')=>{const n=document.createElement(tag);if(klass)n.className=klass;if(text)n.textContent=text;return n;};
 const api=async(path,options={})=>{const res=await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{'Accept':'application/json',...(options.body?{'Content-Type':'application/json'}:{})},...options});const json=await res.json();if(!res.ok)throw Error(json.error||'Layanan tidak tersedia.');return json;};
 let accepted=false,joined=new Set(),pending=[],publicEvents=[];
 const status=el('p','c55-note','Memeriksa akses anggota...');
 root.append(status);
 const notice=(message,error=false)=>{status.textContent=message;status.className='c55-note'+(error?' error':'');};
 const form=el('form','c55-form');const heading=el('h2','','Buat event komunitasmu');const hint=el('p','','Anggota SSCircle yang sudah Diterima dapat mengajukan event. Pengajuan akan diperiksa Admin Control sebelum tampil di kalender.');
 const field=(title,type,max=140)=>{const label=el('label','c55-field');label.append(el('span','',title));const input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.required=true;if(type==='textarea')input.rows=5;input.maxLength=max;label.append(input);return {label,input};};
 const executor=field('1. Nama pelaksana / pembuat / staff event','text',120);
 const title=field('2. Nama event yang dibuat','text',140);
 const technical=field('3. Teknis / sistem pelaksanaan event','textarea',1800);
 const date=field('4. Kapan event dimulai? (tanggal dan jam setempat)','datetime-local');
 const prizeGroup=el('div','c55-prizes'),prizeHeading=el('div','c55-field-head');
 prizeHeading.append(el('strong','','5. Hadiah untuk para pemenang'),el('small','','Atur Juara 1 hingga peringkat berikutnya.'));
 const prizeInputs=el('div','c55-prizes-list');
 const addPrize=el('button','c55-button secondary','+ Tambah Juara');addPrize.type='button';
 const prizeRows=[];
 const appendPrize=()=>{if(prizeRows.length>=20)return;const i=prizeRows.length+1;
   const f=field('Juara '+i,'text',180);f.input.placeholder='Hadiah untuk Juara '+i;
   prizeRows.push(f);prizeInputs.append(f.label);
 };
 appendPrize();addPrize.addEventListener('click',appendPrize);prizeGroup.append(prizeHeading,prizeInputs,addPrize);
 const submit=el('button','c55-button','Ajukan event ke Admin');submit.type='submit';
 form.append(heading,hint,executor.label,title.label,technical.label,date.label,prizeGroup,submit);
 form.addEventListener('submit',async ev=>{ev.preventDefault();submit.disabled=true;notice('Mengirim pengajuan ke Admin Control...');
   try{const values=prizeRows.map(f=>f.input.value.trim()).filter(Boolean);
     if(values.length!==prizeRows.length)throw Error('Isi semua hadiah Juara yang ditambahkan.');
     const startAt=new Date(date.input.value);
     if(!Number.isFinite(startAt.getTime()))throw Error('Tanggal dan jam event tidak valid.');
     const result=await api('/api/community/events/propose',{method:'POST',body:JSON.stringify({executor:executor.input.value,title:title.input.value,technical:technical.input.value,startAt:startAt.toISOString(),prizes:values})});
     notice(result.message);form.reset();renderMine();
   }catch(e){notice(e.message,true);}finally{submit.disabled=false;}
 });
 const mine=el('section','c55-my-events'),myHeading=el('h2','','Pengajuan dan pendaftaran saya');mine.append(myHeading);
 const proposals=el('div','c55-my-list');mine.append(proposals);
 root.append(form,mine);
 async function renderMine(){
   try{const me=await api('/api/community/events/my');
     joined=new Set(me.joined.map(v=>v.event_id));
     pending=me.proposals||[];
     proposals.replaceChildren();
     for(const item of pending.slice(0,20)){
       const card=el('div','c55-mini-card');
       card.append(el('strong','',item.title),el('span','',item.status==='pending'?'Menunggu persetujuan':item.status==='approved'?'Disetujui':'Ditolak'));
       if(item.reason)card.append(el('p','',item.reason));
       proposals.append(card);
     }
     if(!pending.length)proposals.append(el('p','c55-note','Belum ada pengajuan event.'));
     decorate();
   }catch(err){proposals.replaceChildren(el('p','c55-note',err.message));}
 }
 async function init(){
   try{const me=await api('/api/player/me');accepted=me.authenticated===true&&me.status==='accepted';
     form.hidden=!accepted;mine.hidden=!accepted;
     if(accepted){notice('Kamu dapat mendaftarkan diri dan mengajukan event.');await renderMine();}
     else notice('Pendaftaran event dan pengajuan kegiatan hanya untuk anggota berstatus Diterima. Masuk melalui Profile SSCircle terlebih dahulu.');
   }catch{form.hidden=true;mine.hidden=true;notice('Masuk melalui Profile SSCircle untuk mendaftar dan membuat event.');}
   try{const all=await api('/api/events');publicEvents=all.events||[];decorate();}catch{}
 }
 function decorate(){
   const cards=document.querySelectorAll('#events-list .events-card');
   for(const card of cards){
     if(card.querySelector('.c55-event-join'))continue;
     const id=card.querySelector('.events-countdown')?.dataset.eventId;
     if(!id)continue;
     const event=publicEvents.find(e=>e.id===id);
     if(!event||!accepted||Date.parse(event.startAt)<=Date.now())continue;
     const b=el('button','c55-button c55-event-join',joined.has(id)?'Sudah terdaftar':'Daftar sebagai peserta');
     b.type='button';b.disabled=joined.has(id);
     b.addEventListener('click',async()=>{b.disabled=true;try{
       const r=await api('/api/community/events/join',{method:'POST',body:JSON.stringify({eventId:id})});
       joined.add(id);b.textContent='Sudah terdaftar';notice(r.message);
     }catch(e){notice(e.message,true);b.disabled=false;}});
     card.append(b);
   }
 }
 const observer=new MutationObserver(decorate),host=document.getElementById('events-list');
 if(host)observer.observe(host,{childList:true});
 init();
})();