/* SSCircle V10.51: Member Directory & Friends, protected by Dashboard session. */
'use strict';
(()=>{
 const $=id=>document.getElementById(id),root=$('ssc-social-root');
 if(!root)return;
 let current=null,results=[],friends=[],loading=false;
 const escapeId=id=>/^[0-9a-f-]{36}$/.test(id||'');
 const output=$('ssc-social-feedback');
 function message(text,bad=false){output.textContent=text;output.dataset.error=String(bad)}
 async function api(path,options={}){
   const res=await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{
     Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})},...options});
   const body=await res.json().catch(()=>({}));
   if(!res.ok)throw new Error(body.error||'Permintaan gagal (HTTP '+res.status+').');
   return body;
 }
 const node=(tag,text,className)=>{
   const el=document.createElement(tag);if(text!==undefined)el.textContent=text;
   if(className)el.className=className;return el;
 };
 const button=(label,click,cls='player-action player-action-secondary')=>{
   const el=node('button',label,cls);el.type='button';el.onclick=click;return el;
 };
 const statusLabel={friends:'Berteman',incoming:'Permintaan masuk',outgoing:'Menunggu jawaban',none:'Belum berteman'};
 function accountLabel(a){
   if(a.edition==='bedrock')return 'Bedrock';
   if(a.edition==='java_premium')return 'Java Premium';
   if(a.edition==='java_non_premium')return 'Java (sesi offline)';
   return 'Java · belum terverifikasi';
 }
 async function act(id,action){
   if(!escapeId(id))return;
   const wording={request:'Kirim permintaan pertemanan',accept:'Terima permintaan',decline:'Tolak permintaan',
     cancel:'Batalkan permintaan',remove:'Hapus pertemanan'};
   if(['remove','decline'].includes(action)&&!confirm(wording[action]+'?'))return;
   try{
     const response=await api('/api/player/social/action',{method:'POST',body:JSON.stringify({id,action})});
     message((wording[action]||'Tindakan')+' berhasil.'+(response.noticeDelivered===false?' Namun notifikasi Mail Box belum terkirim.':''));
     await refreshFriends();
     if(current?.id===id)await openProfile(id);
     else renderResults();
     window.SSCircleMailbox?.refresh?.();
   }catch(e){message(e.message,true)}
 }
 function actionFor(id,rel){
   if(rel==='none')return button('Tambah teman',()=>act(id,'request'),'player-action player-action-primary');
   if(rel==='incoming'){
     const box=node('div',undefined,'ssc-social-actions');
     box.append(button('Terima',()=>act(id,'accept'),'player-action player-action-primary'),
       button('Tolak',()=>act(id,'decline')));return box;
   }
   if(rel==='outgoing')return button('Batalkan permintaan',()=>act(id,'cancel'));
   return button('Hapus teman',()=>act(id,'remove'));
 }
 function renderResults(){
   const list=$('ssc-social-results');list.replaceChildren();
   if(!results.length){list.append(node('p','Tidak ada profil yang cocok atau bersedia tampil dalam pencarian.','player-helper'));return;}
   for(const r of results){
     const card=node('article',undefined,'ssc-social-result');
     const info=node('div');info.append(node('strong',r.displayName),node('small',r.minecraftName?'Minecraft: '+r.minecraftName:'Profil SSCircle'));
     card.append(info,button('Lihat profil',()=>openProfile(r.id)));list.append(card);
   }
 }
 async function search(){
   const q=$('ssc-social-search').value.trim();
   if(q.length<2){message('Ketik minimal 2 karakter untuk mencari anggota.',true);return;}
   if(loading)return;loading=true;$('ssc-social-search-button').disabled=true;
   try{const res=await api('/api/player/social/search?q='+encodeURIComponent(q));
     results=res.items||[];renderResults();message(results.length+' anggota ditemukan.');
   }catch(e){results=[];renderResults();message(e.message,true)}
   finally{loading=false;$('ssc-social-search-button').disabled=false}
 }
 function renderFriends(){
   const root=$('ssc-social-friends');root.replaceChildren();
   if(!friends.length){root.append(node('p','Belum ada teman atau permintaan masuk.','player-helper'));return;}
   const groups=[['incoming','Permintaan masuk'],['friends','Daftar teman'],['outgoing','Permintaan terkirim']];
   for(const [relation,title] of groups){
     const matches=friends.filter(x=>x.relationship===relation);
     if(!matches.length)continue;
     root.append(node('h3',title,'ssc-social-subtitle'));
     for(const friend of matches){
       const line=node('div',undefined,'ssc-social-friend');
       const info=node('div');info.append(node('strong',friend.displayName),node('small',statusLabel[friend.relationship]));
       line.append(info,button('Profil',()=>openProfile(friend.id)),actionFor(friend.id,relation));
       root.append(line);
     }
   }
 }
 async function refreshFriends(){
   try{const data=await api('/api/player/social/friends');friends=data.items||[];renderFriends()}
   catch(e){$('ssc-social-friends').replaceChildren(node('p',e.message,'player-helper'))}
 }
 function detailStat(rec){
   const box=node('div',undefined,'ssc-social-stat');
   box.append(node('strong',rec.seasonTitle||'Sepanjang masa'));
   const items=[['Waktu bermain',(Number(rec.playtimeSeconds||0)/3600).toFixed(1)+' jam'],
     ['Deaths',String(rec.deaths||0)],['Mob kills',String(rec.mobKills||0)],
     ['Blocks mined',String(rec.blocksMined||0)]];
   for(const [label,val] of items){const el=node('span');el.append(node('small',label),node('b',val));box.append(el);}
   return box;
 }
 async function openProfile(id){
   if(!escapeId(id))return;
   const view=$('ssc-social-detail');view.hidden=false;view.replaceChildren(node('p','Memuat profil anggota...','player-helper'));
   try{
     const data=await api('/api/player/social/profile?id='+encodeURIComponent(id));current=data;
     view.replaceChildren();
     const heading=node('div',undefined,'ssc-social-detail-head');
     const copy=node('div');copy.append(node('span','MEMBER PROFILE','player-overline'),
       node('h3',data.displayName),node('small',new Date(data.joinedAt).toLocaleDateString('id-ID',{year:'numeric',month:'long'})));
     heading.append(copy,button('Tutup',()=>{view.hidden=true;current=null}));
     view.append(heading,node('p',data.bio||'Belum menambahkan deskripsi.','player-helper'));
     const relationship=node('div',undefined,'ssc-social-relationship');
     relationship.append(node('span',statusLabel[data.relationship]||'Belum berteman'),actionFor(id,data.relationship));
     view.append(relationship);
     view.append(node('h4','Akun Minecraft','ssc-social-subtitle'));
     const accounts=node('div',undefined,'ssc-social-accounts');
     for(const a of data.accounts||[]){
       const card=node('div',undefined,'ssc-social-account');
       card.append(node('strong',a.username+(a.isPrimary?' ★':'')),node('small',accountLabel(a)));
       if(a.skinImageStored){
         const avatar=node('canvas',undefined,'ssc-social-avatar');avatar.width=64;avatar.height=64;
         card.prepend(avatar);
         const src='/api/player/social/skin?account='+encodeURIComponent(a.id);
         fetch(src,{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.blob():null).then(async blob=>{
           if(!blob)return;
           const dataUrl=await new Promise(resolve=>{
             const reader=new FileReader();reader.onload=()=>resolve(reader.result);
             reader.onerror=()=>resolve(null);reader.readAsDataURL(blob);
           });
           if(typeof dataUrl!=='string')return;
           const img=new Image();img.onload=()=>{if(img.naturalWidth!==64||![32,64].includes(img.naturalHeight))return;
             const ctx=avatar.getContext('2d');if(ctx){
               ctx.imageSmoothingEnabled=false;ctx.drawImage(img,8,8,8,8,0,0,64,64);
               if(img.naturalHeight===64)ctx.drawImage(img,40,8,8,8,0,0,64,64);
             }};
           img.src=dataUrl;
         }).catch(()=>{});
         card.append(button('Lihat skin 3D',()=>window.SSCircleMinecraftAvatars?.openPreview({
           ...a,socialSkinUrl:src
         })));
       }
       accounts.append(card);
     }
     if(!(data.accounts||[]).length)accounts.append(node('p','Belum ada akun Minecraft tertaut.','player-helper'));
     view.append(accounts);
     view.append(node('h4','Statistik permainan','ssc-social-subtitle'));
     if(data.statsVisible){
       const stats=node('div',undefined,'ssc-social-stats');
       for(const a of data.accounts||[]){
         const rows=(data.statistics||[]).filter(x=>x.accountId===a.id);
         if(!rows.length)continue;
         const group=node('section');group.append(node('h5',a.username));
         rows.forEach(x=>group.append(detailStat(x)));stats.append(group);
       }
       if(!stats.children.length)stats.append(node('p','Statistik belum tersinkron.','player-helper'));
       view.append(stats);
     }else view.append(node('p','Pemilik tidak membagikan statistik permainannya.','player-helper'));
     if(data.achievements?.length){
       view.append(node('h4','Penghargaan SSCircle','ssc-social-subtitle'));
       for(const award of data.achievements.slice(0,15))
         view.append(node('p','🏆 '+award.title+' · '+(award.seasonTitle||'Season'),'player-helper'));
     }
   }catch(e){current=null;view.replaceChildren(node('p',e.message,'player-helper'));}
 }
 $('ssc-social-search-button').addEventListener('click',search);
 $('ssc-social-search').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void search()}});
 $('ssc-social-refresh').addEventListener('click',refreshFriends);
 document.addEventListener('ssc-social-ready',()=>{void refreshFriends()});
 // Security state may be activated after page load; retry on explicit user action.
 root.addEventListener('focusin',()=>{if(!root.dataset.loaded){root.dataset.loaded='1';void refreshFriends()}},{once:true});
 window.SSCircleSocial={refresh:refreshFriends,openProfile};
})();