/* PR78 • Direct notification and applicant corrections, administered separately from broadcasts. */
'use strict';
window.SSCircleDirectAdmin=(()=>{
 const $=id=>document.getElementById(id),node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
 const input=(tag,max)=>{const el=node(tag);if(max)el.maxLength=max;return el;};
 const api=async(method='GET',payload,id='',lookup=false)=>{
  const url='/api/admin/notifications/direct'+(lookup?'/lookup?code='+encodeURIComponent(id):id?'?id='+encodeURIComponent(id):'');
  const r=await fetch(url,{method,credentials:'same-origin',cache:'no-store',
   headers:{Accept:'application/json',...(payload?{'Content-Type':'application/json'}:{})},
   ...(payload?{body:JSON.stringify(payload)}:{})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(data.error||'Tidak dapat memproses pesan pribadi.');
  return data;
 };
 const field=(name,control)=>{const label=node('label');label.append(node('span',name),control);return label;};
 let started=false,root,history,detail,alert,recipient=null,questionRows=[],activeId='';
 const fmt=date=>{try{return new Date(date).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'});}catch{return ''}};
 function questionForm(){
  if(questionRows.length>=5){alert.textContent='Maksimal lima pertanyaan.';return;}
  const block=node('div',undefined,'ssc-direct-reply'),prompt=input('textarea',240),select=node('select');
  prompt.rows=2;prompt.placeholder='Pertanyaan untuk pendaftar...';
  const none=node('option','Hanya pertanyaan (bukan revisi data)');none.value='';select.append(none);
  for(const q of recipient?.questions||[]){const option=node('option',q.title||q.id);option.value=q.id;select.append(option);}
  const remove=node('button','Hapus','button secondary');remove.type='button';
  const row={block,prompt,select};
  remove.addEventListener('click',()=>{block.remove();questionRows=questionRows.filter(x=>x!==row);});
  block.append(field('Pertanyaan',prompt),field('Kolom revisi formulir (opsional)',select),remove);
  $('ssc-direct-question-list').append(block);questionRows.push(row);
 }
 function clearQuestions(){questionRows=[];$('ssc-direct-question-list').replaceChildren();}
 async function removeThread(id){
  const message='Hapus percakapan pribadi ini beserta semua balasan dan pesan dari Mail Box pendaftar? Revisi yang sudah diterapkan tidak dibatalkan.';
  const confirmed=window.SSCNotice?.confirm
    ?await window.SSCNotice.confirm(message,{confirmText:'Hapus percakapan',cancelText:'Batal',danger:true})
    :window.confirm(message);
  if(!confirmed)return;
  try{
   await api('POST',{action:'delete',threadId:id});
   if(activeId===id){activeId='';detail.replaceChildren();}
   alert.textContent='Percakapan dan pesan Mail Box telah dihapus.';
   await list();
  }catch(error){alert.textContent=error.message;}
 }
 async function list(){
  try{
   const res=await api(),target=history;target.replaceChildren();
   for(const thread of res.items||[]){
    const row=node('article',undefined,'ssc-notice-entry'),info=node('div');
    info.append(node('strong',thread.title));
    info.append(node('small',(thread.recipientName||'Pendaftar')+' · '+thread.recipientCode+' · '+thread.recipientStatus+' · '+thread.replies+' balasan'));
    const buttons=node('div',undefined,'ssc-direct-entry-actions');
    const open=node('button','Buka percakapan','button secondary');open.type='button';
    open.addEventListener('click',()=>void show(thread.id));
    const remove=node('button','Hapus','button secondary ssc-direct-delete');remove.type='button';
    remove.setAttribute('aria-label','Hapus percakapan '+thread.title);
    remove.addEventListener('click',()=>void removeThread(thread.id));
    buttons.append(open,remove);row.append(info,buttons);target.append(row);
   }
   if(!target.childElementCount)target.append(node('p','Belum ada pesan pribadi.','field-help'));
  }catch(error){alert.textContent=error.message;}
 }
 async function show(id){
  activeId=id;
  detail.replaceChildren(node('p','Memuat percakapan...'));let thread;
  try{thread=(await api('GET',null,id)).thread;}catch(error){if(activeId===id)detail.textContent=error.message;return;}
  if(activeId!==id)return;
  detail.replaceChildren(node('h3',thread.title),
   node('p',(thread.recipientName||'Pendaftar')+' · '+thread.recipientCode+' · '+thread.recipientStatus+' · '+thread.status,'ssc-direct-meta'),
   node('p',thread.content));
  for(const reply of thread.replies||[]){
   const row=node('div',undefined,'ssc-direct-reply');
   row.append(node('strong',reply.sender==='member'?'Pendaftar':'Pengurus'),node('small',fmt(reply.createdAt),'ssc-direct-meta'));
   if(reply.content)row.append(node('p',reply.content));
   for(const [qid,value] of Object.entries(reply.answers||{})){
    const q=thread.questions?.find(x=>x.id===qid);
    if(q)row.append(node('p',q.prompt+': '+value));
   }
   const corrections=(thread.questions||[]).filter(q=>q.fieldId&&reply.answers&&Object.prototype.hasOwnProperty.call(reply.answers,q.id));
   if(reply.sender==='member'&&corrections.length&&!reply.appliedAt){
    const apply=node('button','Terapkan revisi jawaban','button secondary');apply.type='button';
    apply.addEventListener('click',async()=>{
     const yes=window.SSCNotice?.confirm?await window.SSCNotice.confirm('Terapkan '+corrections.length+' revisi jawaban ke formulir pendaftaran?',{confirmText:'Terapkan revisi'}):true;
     if(!yes)return;
     apply.disabled=true;
     try{await api('POST',{action:'apply',threadId:id,replyId:reply.id});await show(id);}catch(error){alert.textContent=error.message;apply.disabled=false;}
    });
    row.append(apply);
   }
   if(reply.appliedAt)row.append(node('small','Revisi diterapkan: '+fmt(reply.appliedAt)));
   detail.append(row);
  }
  const actions=node('div',undefined,'ssc-direct-thread-actions');
  const remove=node('button','Hapus percakapan','button secondary ssc-direct-delete');remove.type='button';
  remove.addEventListener('click',()=>void removeThread(id));
  if(thread.status!=='open'){actions.append(remove);detail.append(actions);return;}
  const message=input('textarea',1800);message.rows=3;message.placeholder='Balasan atau pertanyaan lanjutan...';
  const send=node('button','Kirim balasan pengurus','button primary');send.type='button';
  send.addEventListener('click',async()=>{
   if(!message.value.trim())return;
   send.disabled=true;
   try{await api('POST',{action:'reply',threadId:id,message:message.value.trim()});await show(id);}catch(error){alert.textContent=error.message;send.disabled=false;}
  });
  const close=node('button','Tandai selesai','button secondary');close.type='button';
  close.addEventListener('click',async()=>{
   close.disabled=true;
   try{await api('POST',{action:'close',threadId:id});await show(id);await list();}catch(error){alert.textContent=error.message;close.disabled=false;}
  });
  actions.append(send,close,remove);
  detail.append(message,actions);
 }
 function init(){
  root=$('ssc-notification-admin-root');if(!root||started)return;started=true;
  const section=node('section',undefined,'ssc-notice-admin-form ssc-direct-admin');
  section.append(node('h3','Kirim pesan pribadi ke pendaftar'));
  section.append(node('p','Pesan khusus untuk satu pendaftar, menggunakan kode dari Jawaban Pendaftar. Berlaku untuk Menunggu, Diterima, dan Ditolak.','field-help'));
  const form=node('form'),fields=node('div',undefined,'ssc-notice-admin-fields ssc-direct-compact-fields');
  const code=input('input',50);code.placeholder='Kode pendaftaran';
  const check=node('button','Periksa kode','button secondary');check.type='button';
  const info=node('p','Periksa kode sebelum mengirim.','field-help');
  const row=node('div',undefined,'ssc-direct-code-controls');row.append(code,check,info);
  fields.append(field('Kode pendaftaran penerima',row));
  const title=input('input',120);title.placeholder='Judul pesan pribadi';
  const content=input('textarea',2400);content.rows=4;content.placeholder='Isi pesan untuk pendaftar...';
  fields.append(field('Judul',title),field('Isi pesan',content));
  const questions=node('div');questions.id='ssc-direct-question-list';questions.className='ssc-direct-questions';
  const add=node('button','+ Tambahkan pertanyaan / revisi','button secondary');add.type='button';add.addEventListener('click',questionForm);
  const send=node('button','Kirim ke Mail Box pendaftar','button primary');send.type='submit';
  alert=node('p','', 'field-help');alert.setAttribute('role','status');
  form.append(fields,add,questions,send,alert);section.append(form);root.append(section);
  check.addEventListener('click',async()=>{
   check.disabled=true;info.textContent='Memeriksa kode...';
   try{recipient=await api('GET',null,code.value,true);info.textContent=(recipient.username||'Pendaftar')+' · '+recipient.status+' · '+recipient.code;clearQuestions();}
   catch(error){recipient=null;info.textContent=error.message;clearQuestions();}
   finally{check.disabled=false;}
  });
  code.addEventListener('input',()=>{recipient=null;info.textContent='Tekan Periksa kode.';});
  form.addEventListener('submit',async event=>{
   event.preventDefault();
   if(!recipient){alert.textContent='Periksa kode pendaftaran terlebih dahulu.';return;}
   const questions=questionRows.map(q=>({prompt:q.prompt.value.trim(),fieldId:q.select.value}));
   if(questions.some(q=>q.prompt.length<3)){alert.textContent='Lengkapi pertanyaan atau hapus baris yang kosong.';return;}
   send.disabled=true;alert.textContent='Mengirim pesan pribadi...';
   try{
    await api('POST',{action:'send',code:code.value,title:title.value.trim(),content:content.value.trim(),questions});
    alert.textContent='Pesan dikirim ke satu Mail Box pendaftar.';
    title.value='';content.value='';clearQuestions();await list();
   }catch(error){alert.textContent=error.message;}finally{send.disabled=false;}
  });
  const panel=node('section',undefined,'ssc-notice-admin-list ssc-direct-admin');
  panel.append(node('h3','Percakapan pribadi dan balasan'));
  const refresh=node('button','Perbarui percakapan','button secondary');refresh.type='button';refresh.addEventListener('click',()=>void list());
  history=node('div');detail=node('div',undefined,'ssc-direct-thread-panel');
  panel.append(refresh,history,detail);root.append(panel);
 }
 async function load(){init();if(started)await list();}
 return {load};
})();