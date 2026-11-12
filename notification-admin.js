/* SSCircle Notification Center: official announcements. */
'use strict';
window.SSCircleNotificationAdmin=(()=>{
 const $=id=>document.getElementById(id);
 const root=$('ssc-notification-admin-root');
 if(!root)return {load:async()=>{}};
 const el=(tag,text,cls)=>{
  const node=document.createElement(tag);
  if(text!==undefined)node.textContent=text;
  if(cls)node.className=cls;
  return node;
 };
 const api=async(method='GET',data)=>{
  const r=await fetch('/api/admin/notifications',{method,credentials:'same-origin',cache:'no-store',
   headers:{Accept:'application/json',...(data?{'Content-Type':'application/json'}:{})},
   ...(data?{body:JSON.stringify(data)}:{})});
  const response=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(r.status>=500?'Layanan pengumuman sementara tidak tersedia.':response.error||'Pengumuman belum berhasil diproses.');
  return response;
 };
 let loading=false,form=null,list=null,status=null;
 const field=(label,node,full=false)=>{
  const wrap=el('label',undefined,full?'full':undefined);
  wrap.append(el('span',label),node);return wrap;
 };
 const input=(name,max)=>{
  const node=el('input');node.name=name;node.type='text';
  if(max)node.maxLength=max;return node;
 };
 const select=(name,values)=>{
  const node=el('select');node.name=name;
  for(const [value,label] of values){const option=el('option',label);option.value=value;node.append(option)}
  return node;
 };
 function drawForm(){
  const panel=el('section',undefined,'ssc-notice-admin-form');
  panel.append(el('h3','Buat pengumuman'));
  const fields=el('div',undefined,'ssc-notice-admin-fields');
  const title=input('title',120),content=el('textarea');content.name='content';content.maxLength=1500;content.rows=4;
  const priority=select('priority',[['normal','Biasa'],['important','Penting'],['urgent','Mendesak']]);
  const audience=select('audience',[['accepted','Anggota diterima'],['all','Seluruh pendaftar'],['member','Anggota tertentu']]);
  const target=input('targetId',48);target.placeholder='SSC-MXXXXXXXXXXXX';
  const targetField=field('ID Anggota penerima',target,true);
  targetField.hidden=true;
  audience.addEventListener('change',()=>{targetField.hidden=audience.value!=='member'});
  const link=select('link',[['','Tanpa tautan'],['/events.html','Event & Jadwal'],['/rules.html','Peraturan Server'],['/seasons.html','Season Archive'],['/my-sscircle','Profile'],['/mailbox','Pusat Notifikasi'],['/','Beranda']]);
  const publish=el('input');publish.name='publishAt';publish.type='datetime-local';
  const expires=el('input');expires.name='expiresAt';expires.type='datetime-local';
  fields.append(field('Judul',title,true),field('Isi pengumuman',content,true),
   field('Tingkat kepentingan',priority),field('Penerima',audience),targetField,
   field('Buka halaman',link),field('Terbitkan pada (kosong = sekarang)',publish),
   field('Akhiri pada (opsional)',expires));
  form=el('form');form.append(fields);
  const controls=el('div',undefined,'ssc-notice-admin-actions');
  const submit=el('button','Terbitkan pengumuman','button primary');submit.type='submit';
  status=el('p','', 'field-help');status.setAttribute('role','status');
  controls.append(submit,status);form.append(controls);
  form.addEventListener('submit',async event=>{
   event.preventDefault();
   const fd=new FormData(form);
   const title=String(fd.get('title')||'').trim(),content=String(fd.get('content')||'').trim();
   if(title.length<3||content.length<5){status.textContent='Lengkapi judul dan isi pengumuman.';return;}
   const date=value=>value?new Date(value).toISOString():'';
   const data={title,content,priority:fd.get('priority'),audience:fd.get('audience'),
    targetId:fd.get('targetId'),link:fd.get('link'),
    publishAt:date(fd.get('publishAt')),expiresAt:date(fd.get('expiresAt'))};
   submit.disabled=true;status.textContent='Menyimpan pengumuman...';
   try{await api('POST',data);form.reset();targetField.hidden=true;
    status.textContent='Pengumuman berhasil disimpan.';await refreshList();}
   catch(e){status.textContent=e.message}
   finally{submit.disabled=false}
  });
  panel.append(form);root.append(panel);
 }
 async function refreshList(){
  if(!list)return;
  const data=await api();list.replaceChildren();
  const now=Date.now();
  for(const item of data.items||[]){
   const row=el('article',undefined,'ssc-notice-entry');
   const info=el('div');
   info.append(el('strong',item.title));
   const stage=item.archivedAt?'Diarsipkan':Date.parse(item.publishAt)>now?'Terjadwal':
    item.expiresAt&&Date.parse(item.expiresAt)<now?'Selesai':'Terbit';
   info.append(el('small',stage+' · '+(item.priority==='urgent'?'Mendesak':item.priority==='important'?'Penting':'Biasa')+
    ' · '+new Date(item.publishAt).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'})));
   info.append(el('p',item.content));
   row.append(info);
   const actions=el('div',undefined,'ssc-notice-head-actions');
   if(!item.archivedAt){
     const archive=el('button','Arsipkan','button secondary');archive.type='button';
     archive.addEventListener('click',async()=>{
       const yes=window.SSCNotice?.confirm
         ?await window.SSCNotice.confirm('Arsipkan pengumuman ini?',{confirmText:'Arsipkan'})
         :window.confirm('Arsipkan pengumuman ini?');
       if(!yes)return;
       archive.disabled=true;
       try{
         await api('DELETE',{id:item.id,mode:'archive'});
         await refreshList();
         status.textContent='Pengumuman dipindahkan ke arsip.';
       }catch(error){archive.disabled=false;status.textContent=error.message;}
     });
     actions.append(archive);
   }
   const remove=el('button','Hapus permanen','button secondary');remove.type='button';
   remove.addEventListener('click',async()=>{
     const message='Hapus permanen pengumuman "'+item.title+'"? Pengumuman dan riwayat bacanya tidak bisa dipulihkan.';
     const yes=window.SSCNotice?.confirm
       ?await window.SSCNotice.confirm(message,{danger:true,confirmText:'Hapus permanen'})
       :window.confirm(message);
     if(!yes)return;
     remove.disabled=true;
     try{
       await api('DELETE',{id:item.id,mode:'delete'});
       await refreshList();
       status.textContent='Pengumuman dan riwayat baca berhasil dihapus.';
     }catch(error){remove.disabled=false;status.textContent=error.message;}
   });
   actions.append(remove);
   row.append(actions);
   list.append(row);
  }
  if(!list.childElementCount)list.append(el('p','Belum ada pengumuman.','field-help'));
 }
 async function load(){
  if(loading)return;
  loading=true;
  if(!form){
   root.replaceChildren();drawForm();
   const panel=el('section',undefined,'ssc-notice-admin-list');
   const head=el('div',undefined,'ssc-notice-head-actions');
   head.append(el('h3','Riwayat pengumuman'));
   const clear=el('button','Hapus seluruh arsip','button secondary');clear.type='button';
   clear.addEventListener('click',async()=>{
     const question='Hapus permanen semua pengumuman yang sudah diarsipkan beserta status bacanya?';
     const yes=window.SSCNotice?.confirm
       ?await window.SSCNotice.confirm(question,{danger:true,confirmText:'Hapus seluruh arsip'})
       :window.confirm(question);
     if(!yes)return;
     clear.disabled=true;
     try{
       const result=await api('DELETE',{mode:'delete-archived',confirmation:'HAPUS RIWAYAT'});
       await refreshList();
       status.textContent=String(result.deleted||0)+' pengumuman arsip dihapus permanen.';
     }catch(error){status.textContent=error.message;}
     finally{clear.disabled=false;}
   });
   head.append(clear);
   panel.append(head);
   list=el('div');
   panel.append(list);root.append(panel);
  }
  try{await refreshList()}catch(e){status.textContent=e.message}
  finally{loading=false}
 }
 return {load};
})();