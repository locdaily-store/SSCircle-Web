/* SSCircle PR78 • private applicant notification replies.
   All rendering uses textContent, not untrusted HTML. */
'use strict';
window.SSCircleDirectMailbox=(()=>{
 const request=async(path,method='GET',body)=>{
  const r=await fetch(path,{method,credentials:'same-origin',cache:'no-store',
   headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(data.error||'Pesan pribadi tidak dapat diproses.');
  return data;
 };
 const el=(tag,txt,cls)=>{const x=document.createElement(tag);if(txt!==undefined)x.textContent=txt;if(cls)x.className=cls;return x;};
 const make=(tag,placeholder,max)=>{const x=el(tag);if(placeholder)x.placeholder=placeholder;if(max)x.maxLength=max;return x;};
 const fmt=date=>{try{return new Date(date).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'});}catch{return ''}};
 async function render(holder,threadId){
  if(!holder||!threadId)return;
  holder.hidden=false;holder.dataset.directThread=threadId;
  holder.replaceChildren(el('p','Memuat percakapan pribadi...', 'mailbox-direct-info'));
  let thread;
  try{thread=(await request('/api/player/mailbox/direct?id='+encodeURIComponent(threadId))).thread;}
  catch(error){if(holder.dataset.directThread===threadId)holder.replaceChildren(el('p',error.message,'mailbox-direct-error'));return;}
  if(holder.dataset.directThread!==threadId)return;
  const area=el('section',undefined,'mailbox-direct-area');
  area.append(el('h4','Percakapan dengan pengurus'));
  area.append(el('p',thread.status==='open'?'Kamu dapat membalas pesan ini dalam status pendaftaran apa pun.':'Percakapan sudah ditutup pengurus.','mailbox-direct-info'));
  const history=el('div',undefined,'mailbox-direct-history');
  for(const reply of thread.replies||[]){
   const row=el('div',undefined,'mailbox-direct-reply');
   row.append(el('strong',reply.sender==='admin'?'Pengurus SSCircle':'Balasanmu'));
   row.append(el('small',fmt(reply.createdAt)));
   if(reply.content)row.append(el('p',reply.content));
   for(const [id,value] of Object.entries(reply.answers||{})){
    const question=thread.questions?.find(x=>x.id===id);
    if(question)row.append(el('p',question.prompt+': '+String(value),'mailbox-direct-answer'));
   }
   if(reply.appliedAt)row.append(el('small','Revisi sudah diterapkan oleh pengurus.'));
   history.append(row);
  }
  if(history.childElementCount)area.append(history);
  if(thread.status!=='open'){holder.replaceChildren(area);return;}
  const form=el('form',undefined,'mailbox-direct-form');
  form.append(el('h4','Balas atau revisi data pendaftaran'));
  const answers=[];
  for(const q of thread.questions||[]){
   const label=el('label');label.append(el('span',q.prompt));
   if(q.fieldId)label.append(el('small','Usulan revisi akan diperiksa pengurus sebelum diterapkan ke formulir.'));
   const input=make('textarea','Isi jawaban (maks. 500 karakter)',500);input.rows=2;
   label.append(input);form.append(label);answers.push({id:q.id,input});
  }
  const commentLabel=el('label');commentLabel.append(el('span','Pesan tambahan (opsional)'));
  const comment=make('textarea','Ketik pesan untuk pengurus...',1200);comment.rows=3;
  commentLabel.append(comment);form.append(commentLabel);
  const submit=el('button','Kirim balasan','mailbox-primary');submit.type='submit';
  const status=el('p','', 'mailbox-direct-info');status.setAttribute('role','status');
  form.append(submit,status);
  form.addEventListener('submit',async event=>{
   event.preventDefault();
   const map=Object.create(null);
   for(const {id,input} of answers)if(input.value.trim())map[id]=input.value.trim();
   if(!comment.value.trim()&&!Object.keys(map).length){status.textContent='Isi balasan atau jawaban pertanyaan.';return;}
   submit.disabled=true;status.textContent='Mengirim balasan...';
   try{
    await request('/api/player/mailbox/direct/reply','POST',{threadId,message:comment.value.trim(),answers:map});
    await render(holder,threadId);
   }catch(error){status.textContent=error.message;submit.disabled=false;}
  });
  area.append(form);holder.replaceChildren(area);
 }
 function clear(holder){if(holder){holder.dataset.directThread='';holder.replaceChildren();holder.hidden=true;}}
 return {render,clear};
})();