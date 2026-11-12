/* SSCircle official notification preferences, separate from profile form. */
'use strict';
(()=>{
 const form=document.getElementById('ssc-notice-preferences-form');
 if(!form)return;
 const message=document.getElementById('ssc-notice-preferences-message');
 const save=document.getElementById('ssc-notice-preferences-save');
 const api=async(method,payload)=>{
  const response=await fetch('/api/player/notifications/preferences',{method,
   credentials:'same-origin',cache:'no-store',
   headers:{Accept:'application/json',...(payload?{'Content-Type':'application/json'}:{})},
   ...(payload?{body:JSON.stringify(payload)}:{})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(response.status===403?'Aktifkan akun dan masuk ke Profile untuk menyimpan pengaturan.':
   response.status>=500?'Pengaturan sementara tidak tersedia. Coba lagi nanti.':data.error||'Pengaturan belum berhasil.');
  return data;
 };
 async function load(){
  try{
   const data=await api('GET');
   for(const name of ['announcements','events','community','awards'])
    form.elements[name].checked=data.preferences[name]!==false;
   form.elements.reminderMode.value=data.preferences.reminderMode||'both';
   save.disabled=false;message.textContent='';
  }catch(e){save.disabled=true;message.textContent=e.message;}
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();save.disabled=true;message.textContent='Menyimpan...';
  const preferences={};
  for(const name of ['announcements','events','community','awards'])
   preferences[name]=!!form.elements[name].checked;
  preferences.reminderMode=form.elements.reminderMode.value;
  try{await api('PUT',preferences);message.textContent='Pengaturan notifikasi berhasil disimpan.';}
  catch(e){message.textContent=e.message;}
  finally{save.disabled=false;}
 });
 void load();
 document.addEventListener('ssc-social-ready',()=>void load());
})();
