/* SSCircle V10.51: Member Directory & Friends, protected by Dashboard session. */
'use strict';
(()=>{
 const $=id=>document.getElementById(id),root=$('ssc-social-root');
 if(!root)return;
 let current=null,results=[],friends=[],loading=false,activeTab='friends',directoryOffset=0,directoryMode=false,directoryHasMore=false,profileRequest=0;
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

 // The avatar comes only from the verified server-side skin endpoint. The
 // SSCircle logo stays visible when the player has not synced a valid skin.
 function avatar(accountId,extraClass=''){
   const wrap=node('span',undefined,'ssc-social-photo '+extraClass);
   const fallback=node('img');fallback.src='assets/sscircle-logo.png';
   fallback.alt='Avatar anggota SSCircle';fallback.loading='lazy';
   const canvas=node('canvas');canvas.width=64;canvas.height=64;canvas.hidden=true;
   wrap.append(fallback,canvas);
   if(!escapeId(accountId)||typeof createImageBitmap!=='function')return wrap;
   fetch('/api/player/social/skin?account='+encodeURIComponent(accountId),{
     credentials:'same-origin',cache:'no-store'
   }).then(r=>r.ok?r.blob():null).then(async blob=>{
     if(!blob||!wrap.isConnected)return;
     const image=await createImageBitmap(blob);
     try{
       if(image.width!==64||![32,64].includes(image.height)||!wrap.isConnected)return;
       const ctx=canvas.getContext('2d');if(!ctx)return;
       ctx.imageSmoothingEnabled=false;
       ctx.drawImage(image,8,8,8,8,0,0,64,64);
       if(image.height===64)ctx.drawImage(image,40,8,8,8,0,0,64,64);
       canvas.hidden=false;fallback.hidden=true;
     }finally{image.close?.()}
   }).catch(()=>{});
   return wrap;
 }
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
   $('ssc-social-result-title').textContent=directoryMode?'Semua member terdaftar':'Hasil pencarian';
   $('ssc-social-count').textContent=results.length+' member';
   $('ssc-social-more').hidden=!directoryMode||!directoryHasMore;
   if(!results.length){
     list.append(node('p',directoryMode
       ?'Belum ada member lain yang mengizinkan profilnya ditemukan.'
       :'Tidak ada profil yang cocok. Periksa ID Anggota atau ejaan nama.','player-helper'));
     return;
   }
   for(const r of results){
     const card=button('',()=>openProfile(r.id),'ssc-social-result ssc-social-result-button');
     card.setAttribute('aria-label','Lihat Profile '+r.displayName);
     const info=node('span',undefined,'ssc-social-result-main');
     info.append(node('strong',r.displayName),node('small',r.memberId||'ID belum tersedia'));
     if(r.minecraftName)info.append(node('small','Minecraft: '+r.minecraftName));
     card.append(avatar(r.avatarAccountId),info,node('span','Lihat Profile','ssc-social-view'));
     list.append(card);
   }
 }
 async function search(){
   const q=$('ssc-social-search').value.trim();
   if(q.length<2){message('Ketik minimal 2 karakter untuk mencari anggota.',true);return;}
   if(loading)return;
   loading=true;$('ssc-social-search-button').disabled=true;
   try{
     const res=await api('/api/player/social/search?q='+encodeURIComponent(q));
     directoryMode=false;directoryHasMore=false;
     results=res.items||[];renderResults();
     message(results.length+' anggota ditemukan.');
   }catch(e){
     directoryMode=false;directoryHasMore=false;
     results=[];renderResults();message(e.message,true);
   }finally{loading=false;$('ssc-social-search-button').disabled=false;}
 }
 async function loadDirectory(reset=true){
   if(loading)return;
   loading=true;$('ssc-social-directory').disabled=true;$('ssc-social-more').disabled=true;
   if(reset){directoryOffset=0;results=[];directoryMode=true;$('ssc-social-search').value='';}
   try{
     const data=await api('/api/player/social/directory?offset='+directoryOffset);
     results.push(...(data.items||[]));directoryOffset=data.nextOffset||directoryOffset;
     directoryHasMore=!!data.hasMore;renderResults();
     message('Menampilkan '+results.length+' member yang mengizinkan pencarian.');
   }catch(e){
     if(reset){results=[];directoryHasMore=false;}
     renderResults();message(e.message,true);
   }finally{loading=false;$('ssc-social-directory').disabled=false;$('ssc-social-more').disabled=false;}
 }
 function renderFriends(){
   const counts={friends:0,incoming:0,outgoing:0};
   for(const f of friends)if(f.relationship in counts)counts[f.relationship]++;
   for(const tab of document.querySelectorAll('[data-ssc-friends-tab]')){
     const name=tab.dataset.sscFriendsTab;
     tab.setAttribute('aria-selected',String(name===activeTab));
     tab.tabIndex=name===activeTab?0:-1;
   }
   for(const el of document.querySelectorAll('[data-ssc-friends-count]')){
     el.textContent=String(counts[el.dataset.sscFriendsCount]||0);
   }
   const list=$('ssc-social-friends');list.replaceChildren();
   const visible=friends.filter(f=>f.relationship===activeTab);
   if(!visible.length){
     const empty={friends:'Belum ada teman. Cari member untuk menambah teman.',
       incoming:'Belum ada permintaan pertemanan masuk.',
       outgoing:'Tidak ada permintaan yang menunggu jawaban.'};
     list.append(node('p',empty[activeTab],'player-helper'));return;
   }
   for(const friend of visible){
     const row=node('div',undefined,'ssc-social-friend');
     const info=node('div',undefined,'ssc-social-friend-info');
     info.append(node('strong',friend.displayName),
       node('small',friend.memberId||statusLabel[friend.relationship]));
     row.append(info,button('Lihat Profile',()=>openProfile(friend.id)),actionFor(friend.id,friend.relationship));
     list.append(row);
   }
 }
 async function refreshFriends(){
   try{
     const data=await api('/api/player/social/friends');
     friends=data.items||[];renderFriends();
   }catch(e){
     friends=[];renderFriends();
     $('ssc-social-friends').replaceChildren(node('p',e.message,'player-helper'));
   }
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
   const modal=$('ssc-social-modal'),view=$('ssc-social-detail');
   const requestId=++profileRequest;
   if(!modal.open)modal.showModal();
   view.replaceChildren(node('p','Memuat profil anggota...','player-helper'));
   try{
     const data=await api('/api/player/social/profile?id='+encodeURIComponent(id));
     if(requestId!==profileRequest||!modal.open)return;
     current=data;view.replaceChildren();
     const hero=node('div',undefined,'ssc-social-modal-hero');
     const headAvatar=avatar(data.avatarAccountId,'ssc-social-photo-large');
     const copy=node('div',undefined,'ssc-social-modal-identity');
     copy.append(node('span','SSCircle Member','player-overline'),node('h3',data.displayName),
       node('strong',data.memberId||'ID Anggota tidak tersedia'));
     if(data.joinedAt&&!Number.isNaN(Date.parse(data.joinedAt))){
       copy.append(node('small','Bergabung '+new Date(data.joinedAt)
         .toLocaleDateString('id-ID',{month:'long',year:'numeric'})));
     }
     const close=button('Tutup ✕',()=>modal.close(),'player-action player-action-secondary');
     close.setAttribute('aria-label','Tutup profil anggota');
     hero.append(headAvatar,copy,close);view.append(hero);
     view.append(node('p',data.bio||'Member ini belum menambahkan deskripsi.','ssc-social-bio'));
     const relation=node('div',undefined,'ssc-social-relationship');
     relation.append(node('span',statusLabel[data.relationship]||'Belum berteman'),
       actionFor(id,data.relationship));
     view.append(relation);
     view.append(node('h4','Akun Minecraft','ssc-social-subtitle'));
     const accounts=node('div',undefined,'ssc-social-accounts');
     for(const a of data.accounts||[]){
       const card=node('div',undefined,'ssc-social-account');
       card.append(avatar(a.skinImageStored?a.id:null),
         node('strong',a.username+(a.isPrimary?' ★':'')),
         node('small',accountLabel(a)));
       if(a.skinImageStored){
         card.append(button('Lihat skin 3D',()=>window.SSCircleMinecraftAvatars?.openPreview({
           ...a,socialSkinUrl:'/api/player/social/skin?account='+encodeURIComponent(a.id)
         })));
       }
       accounts.append(card);
     }
     if(!(data.accounts||[]).length)
       accounts.append(node('p','Belum ada akun Minecraft tertaut.','player-helper'));
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
       if(!stats.children.length)
         stats.append(node('p','Statistik belum tersinkron.','player-helper'));
       view.append(stats);
     }else{
       view.append(node('p','Pemilik tidak membagikan statistik permainannya.','player-helper'));
     }
     if(data.achievements?.length){
       view.append(node('h4','Penghargaan SSCircle','ssc-social-subtitle'));
       for(const award of data.achievements.slice(0,15))
         view.append(node('p','🏆 '+award.title+' · '+(award.seasonTitle||'Season'),'player-helper'));
     }
   }catch(e){
     if(requestId!==profileRequest)return;
     current=null;view.replaceChildren(node('p',e.message,'player-helper'),
       button('Tutup',()=>$('ssc-social-modal').close()));
   }
 }
 $('ssc-social-search-button').addEventListener('click',()=>void search());
 $('ssc-social-search').addEventListener('keydown',e=>{
   if(e.key==='Enter'){e.preventDefault();void search();}
 });
 $('ssc-social-directory').addEventListener('click',()=>void loadDirectory(true));
 $('ssc-social-more').addEventListener('click',()=>void loadDirectory(false));
 $('ssc-social-refresh').addEventListener('click',()=>void refreshFriends());
 for(const tab of document.querySelectorAll('[data-ssc-friends-tab]')){
   tab.addEventListener('click',()=>{activeTab=tab.dataset.sscFriendsTab;renderFriends();});
   tab.addEventListener('keydown',e=>{
     if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;
     e.preventDefault();
     const order=['friends','incoming','outgoing'];
     const index=order.indexOf(activeTab);
     activeTab=order[(index+(e.key==='ArrowRight'?1:2))%3];
     renderFriends();
     document.querySelector('[data-ssc-friends-tab="'+activeTab+'"]')?.focus();
   });
 }
 $('ssc-social-modal').addEventListener('close',()=>{profileRequest++;current=null;});
 $('ssc-social-modal').addEventListener('click',e=>{
   if(e.target===$('ssc-social-modal'))$('ssc-social-modal').close();
 });
 document.addEventListener('ssc-social-ready',()=>{
   void refreshFriends();void loadDirectory(true);
 });
 root.addEventListener('focusin',()=>{
   if(!root.dataset.loaded){
     root.dataset.loaded='1';void refreshFriends();
     if(!results.length)void loadDirectory(true);
   }
 },{once:true});
 window.SSCircleSocial={refresh:refreshFriends,openProfile,browse:()=>loadDirectory(true)};
})();
