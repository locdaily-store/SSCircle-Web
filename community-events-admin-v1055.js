/* V10.55 Admin Control • event moderation, attendance, winners, achievements. */
(()=>{'use strict';
 const root=document.getElementById('community55-admin-root');if(!root)return;
 const el=(tag,klass='',text='')=>{const node=document.createElement(tag);if(klass)node.className=klass;if(text)node.textContent=text;return node;};
 const api=async(path,opt={})=>{const res=await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{'Accept':'application/json',...(opt.body?{'Content-Type':'application/json'}:{})},...opt});const data=await res.json();if(!res.ok)throw Error(data.error||'Permintaan gagal.');return data;};
 const alert=el('p','c55-note','Buka Event & Jadwal untuk memuat daftar pengajuan.');root.append(alert);
 const note=(message,error=false)=>{alert.textContent=message;alert.className='c55-note'+(error?' error':'');};
 const top=el('div','c55-admin-grid');root.append(top);
 const proposalsPanel=el('section','c55-admin-card');proposalsPanel.append(el('h2','','Pengajuan event member'));
 const proposalList=el('div','c55-admin-list');proposalsPanel.append(proposalList);
 const participantsPanel=el('section','c55-admin-card');participantsPanel.append(el('h2','','Peserta & Check-In'));
 const eventSelect=el('select','c55-field-input'),participantList=el('div','c55-admin-list');
 participantsPanel.append(eventSelect,participantList);
 const achievementsPanel=el('section','c55-admin-card');achievementsPanel.append(el('h2','','Pengaturan achievement'));
 const rulesList=el('div','c55-admin-list');achievementsPanel.append(rulesList);
 top.append(proposalsPanel,participantsPanel,achievementsPanel);
 let proposalData=[],publicEvents=[];
 const button=(label,callback,klass='')=>{const b=el('button','button '+(klass||'secondary'),label);b.type='button';b.onclick=callback;return b;};
 const field=(label,kind='text')=>{const wrap=el('label','c55-field');wrap.append(el('span','',label));const input=el('input');input.type=kind;wrap.append(input);return {wrap,input};};
 const fmt=iso=>{try{return new Date(iso).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'});}catch{return iso;}};
 async function load(){
   try{
     const [r,p,a]=await Promise.all([api('/api/admin/community/events'),api('/api/events'),api('/api/admin/community/achievements')]);
     proposalData=r.proposals||[];publicEvents=p.events||[];
     renderProposals();renderSelect();renderRules(a.rules||[]);
     note('Data komunitas diperbarui.');
   }catch(err){note(err.message,true);}
 }
 function renderProposals(){
   proposalList.replaceChildren();
   for(const item of proposalData){
     const card=el('article','c55-mini-card');
     card.append(el('strong','',item.title),el('small','','Dibuat oleh '+item.executor+' · '+fmt(item.start_at)),el('p','',item.technical),
       el('small','','Status: '+item.status));
     const prizes=JSON.parse(item.prizes_json||'[]');for(const p of prizes)card.append(el('small','','Juara '+p.rank+': '+p.prize));
     if(item.status==='pending'){
       const cap=field('Kuota peserta (1–500)','number');cap.input.min='1';cap.input.max='500';cap.input.value='40';
       const reason=field('Alasan penolakan (wajib jika ditolak)');reason.input.maxLength=500;
       card.append(cap.wrap,reason.wrap);
       const actions=el('div','c55-admin-actions');
       const process=async action=>{try{await api('/api/admin/community/events/review',{method:'POST',body:JSON.stringify({id:item.id,action,capacity:Number(cap.input.value),reason:reason.input.value})});await load();}
         catch(e){note(e.message,true);}};
       actions.append(button('Setujui',()=>process('approved'),'primary'),button('Tolak',()=>process('rejected')));
       card.append(actions);
     }else if(item.reason)card.append(el('p','c55-note','Alasan: '+item.reason));
     proposalList.append(card);
   }
   if(!proposalData.length)proposalList.append(el('p','c55-note','Belum ada pengajuan event.'));
 }
 function renderSelect(){
   const previous=eventSelect.value;eventSelect.replaceChildren(el('option','','Pilih event untuk melihat peserta'));
   for(const e of publicEvents){const option=el('option','',e.title+' · '+fmt(e.startAt));option.value=e.id;eventSelect.append(option);}
   if(publicEvents.some(e=>e.id===previous)){eventSelect.value=previous;loadParticipants();}
 }
 async function loadParticipants(){
   const id=eventSelect.value;participantList.replaceChildren();if(!id)return;
   try{
     const data=await api('/api/admin/community/events?eventId='+encodeURIComponent(id));
     for(const p of data.signups||[]){
       const item=el('article','c55-mini-card');
       item.append(el('strong','',p.member_id),el('small','','Status: '+p.state));
       if(p.state==='registered')item.append(button('Tandai hadir',async()=>{
         try{await api('/api/admin/community/events/check-in',{method:'POST',body:JSON.stringify({eventId:id,memberId:p.member_id})});loadParticipants();}
         catch(e){note(e.message,true);}
       }));
       if(p.state==='attended'){
         const row=el('div','c55-admin-actions');const rank=field('Juara nomor','number');rank.input.min='1';rank.input.max='20';rank.input.value='1';
         const label=field('Hadiah / keterangan');row.append(rank.wrap,label.wrap);
         const award=button('Berikan penghargaan',async()=>{try{await api('/api/admin/community/events/award',{method:'POST',body:JSON.stringify({eventId:id,memberId:p.member_id,rank:Number(rank.input.value),label:label.input.value})});note('Penghargaan diberikan.');loadParticipants();}
           catch(e){note(e.message,true);}});
         item.append(row,award);
       }
       participantList.append(item);
     }
     if(!data.signups?.length)participantList.append(el('p','c55-note','Belum ada peserta terdaftar.'));
     if(data.awards?.length){
       participantList.append(el('h3','','Hasil dan penghargaan'));
       for(const a of data.awards)participantList.append(el('p','c55-note','Juara '+a.rank+' · '+a.member_id+' · '+a.label));
     }
   }catch(e){note(e.message,true);}
 }
 eventSelect.addEventListener('change',loadParticipants);
 function renderRules(rules){
   rulesList.replaceChildren();
   const types=[['playtime_seconds','Playtime (detik)'],['mob_kills','Mob kills'],['deaths','Deaths'],['blocks_mined','Blocks mined'],['events_attended','Event dihadiri']];
   function editor(rule){
     const form=el('form','c55-mini-card');
     const id=field('ID unik'),title=field('Nama achievement'),desc=field('Keterangan'),target=field('Target','number');
     id.input.value=rule.id||'';id.input.required=true;id.input.pattern='[a-z0-9_-]{3,60}';
     title.input.value=rule.title||'';title.input.required=true;
     desc.input.value=rule.description||'';target.input.value=rule.target||1;target.input.min='1';target.input.required=true;
     const metric=el('select');for(const [value,label] of types){const opt=el('option','',label);opt.value=value;metric.append(opt);}metric.value=rule.metric||'events_attended';
     const active=el('input');active.type='checkbox';active.checked=rule.enabled!==0;
     const enabled=el('label','c55-field');enabled.append(active,el('span','','Aktif'));
     form.append(id.wrap,title.wrap,desc.wrap,metric,target.wrap,enabled);
     const save=button('Simpan aturan',()=>{},'primary');save.type='submit';form.append(save);
     form.addEventListener('submit',async ev=>{ev.preventDefault();save.disabled=true;try{
       await api('/api/admin/community/achievements',{method:'POST',body:JSON.stringify({id:id.input.value,title:title.input.value,description:desc.input.value,metric:metric.value,target:Number(target.input.value),enabled:active.checked})});note('Aturan achievement tersimpan.');
     }catch(e){note(e.message,true);}finally{save.disabled=false;}});
     return form;
   }
   for(const r of rules)rulesList.append(editor(r));
   const add=button('+ Tambah achievement',()=>{const newRule=editor({});rulesList.prepend(newRule);newRule.scrollIntoView({block:'center',behavior:'smooth'});});
   rulesList.append(add);
 }
 document.querySelector('[data-tab="events-admin"]')?.addEventListener('click',load);
 // When a logged-in admin lands directly on this tab, load on demand.
 if(location.hash.includes('events-admin'))load();
})();