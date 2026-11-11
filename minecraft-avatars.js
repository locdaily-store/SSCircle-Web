/* SSCircle V10.49.1.5 | Verified account skins + distortion-free 3D preview.
   Skin textures are cosmetic. Never trust name/UUID alone to claim ownership.
   Native Canvas 2D 3D renderer: no remote scripts, CDN, WebGL dependency, or trackers. */
'use strict';
(() => {
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const cache=new Map();
  let currentPrimary=0;
  const premiumFallback=a=>Boolean(a&&a.edition==='java_premium'&&(
    (a.provider==='java_premium'&&UUID.test(a.providerId||''))||
    (a.provider==='java_offline'&&Number.isFinite(Date.parse(a.identityProofAt))
      &&Date.now()>=Date.parse(a.identityProofAt)-300000
      &&Date.now()-Date.parse(a.identityProofAt)<7*86400000)));
  // Any server-linked account can request its own private skin. The Worker
  // enforces password session, ownership and data availability, not the UI.
  const eligible=a=>Boolean(a&&UUID.test(a.id||''));
  const urlForAccount=a=>eligible(a)?(typeof a.socialSkinUrl==='string'&&/^\/api\/player\/social\/skin\?account=[0-9a-f-]{36}$/.test(a.socialSkinUrl)?a.socialSkinUrl:'/api/player/minecraft/skin/'+encodeURIComponent(a.id)):null;
  const errorHint=(status,code)=>{
    if(status===404)return 'Skin belum diterima Cloudflare. Setelah login Minecraft, website akan memeriksa otomatis. Jika masih kosong, minta OP melihat /ssskin inspect <pemain>.';
    if(status===403)return 'Sesi Profile perlu login ulang dengan password Dashboard.';
    if(status===503)return 'Cloudflare belum bisa mengambil gambar dari Mojang. Pastikan Skin Bridge 10.49.1.3 mengirim PNG dan /ssskin inspect melaporkan SKIN_GAMBAR_TERSIMPAN_HTTP_200.';
    return 'Gagal mengambil tekstur (HTTP '+status+(code?' · '+code:'')+'). Periksa /ssskin inspect <pemain>.';
  };
  function loadSkin(a,force=false){
    const url=urlForAccount(a);
    if(!url)return Promise.resolve({image:null,model:'classic',source:null,
      error:'Akun belum terhubung. Hubungkan akun Minecraft ke SSCircle terlebih dahulu.'});
    const key=url+'|'+(a.skinUpdatedAt||'')+'|'+Boolean(a.skinImageStored);
    if(force)cache.delete(key);
    if(!cache.has(key)){
      cache.set(key,(async()=>{
        try{
          const response=await fetch(url+(a.skinUpdatedAt?'?v='+encodeURIComponent(a.skinUpdatedAt):''),
            {credentials:'same-origin',cache:force?'no-store':'default'});
          if(!response.ok){
            let code='';try{const data=await response.json();code=data.code||'';}catch{}
            return {image:null,error:errorHint(response.status,code)};
          }
          const blob=await response.blob();
          if(blob.size<67||blob.size>1048576)return {image:null,error:'File skin tidak valid.'};
          // Data URLs are already allowed by SSCircle's strict img-src CSP;
          // blob: URLs would be blocked on the deployed Cloudflare pages.
          const dataURL=await new Promise(resolve=>{
            const reader=new FileReader();reader.onload=()=>resolve(reader.result);
            reader.onerror=()=>resolve(null);reader.readAsDataURL(blob);
          });
          if(typeof dataURL!=='string')return {image:null,error:'PNG tidak dapat dibaca oleh browser.'};
          const image=await new Promise(resolve=>{
            const img=new Image();
            img.onload=()=>resolve(img.naturalWidth===64&&[32,64].includes(img.naturalHeight)?img:null);
            img.onerror=()=>resolve(null);
            img.src=dataURL;
          });
          return {image,model:response.headers.get('X-SSC-Skin-Model')||a.skinModel||'classic',
            source:response.headers.get('X-SSC-Skin-Source')||a.skinSource||null,
            error:image?null:'Gambar PNG tidak berukuran skin Minecraft 64 × 64 atau 64 × 32.'};
        }catch{return {image:null,error:'Tidak dapat menghubungi website. Periksa koneksi lalu coba lagi.'};}
      })().then(result=>{if(!result.image)cache.delete(key);return result;}));
    }
    return cache.get(key);
  }
  const face=(image,canvas)=>{
    const ctx=canvas.getContext('2d');if(!ctx)return false;
    canvas.width=64;canvas.height=64;ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,64,64);
    ctx.drawImage(image,8,8,8,8,0,0,64,64);
    if(image.naturalHeight===64)ctx.drawImage(image,40,8,8,8,0,0,64,64);
    return true;
  };
  function renderPrimary(accounts){
    const fallback=document.getElementById('player-avatar-image');if(!fallback)return;
    const holder=fallback.parentElement;
    let canvas=holder.querySelector('.ssc-primary-avatar');
    if(!canvas){canvas=document.createElement('canvas');canvas.className='ssc-primary-avatar';
      canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Avatar skin Minecraft akun utama');
      holder.append(canvas);}
    const ticket=++currentPrimary;canvas.hidden=true;fallback.hidden=false;
    const a=(accounts||[]).find(x=>x.isPrimary)||accounts?.[0];
    loadSkin(a).then(result=>{if(ticket!==currentPrimary||!result.image)return;
      if(face(result.image,canvas)){canvas.hidden=false;fallback.hidden=true;}});
  }
  function cardAvatar(a){
    const holder=document.createElement('span');holder.className='ssc-minecraft-avatar';
    const fallback=document.createElement('span');fallback.className='ssc-minecraft-avatar-fallback';
    fallback.textContent='MC';holder.append(fallback);
    if(eligible(a)){
      const canvas=document.createElement('canvas');canvas.hidden=true;holder.append(canvas);
      canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Avatar '+a.username);
      loadSkin(a).then(result=>{if(!holder.isConnected||!result.image)return;
        if(face(result.image,canvas)){fallback.hidden=true;canvas.hidden=false;}});
    }
    return holder;
  }
  function openPreview(a){
    if(!a?.id)return;
    let dialog=document.getElementById('ssc-minecraft-skin-dialog');
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='ssc-minecraft-skin-dialog';dialog.className='ssc-skin-dialog';
      dialog.innerHTML=`<div class="ssc-skin-dialog-content">
        <h2 id="ssc-skin-dialog-heading">Skin Minecraft</h2><p class="ssc-skin-dialog-caption"></p>
        <div class="ssc-skin-viewer" role="img" aria-label="Model 3D skin; seret untuk memutar, scroll atau cubit untuk zoom, lapisan luar dapat dinyalakan dan dimatikan" tabindex="0">
          <canvas class="ssc-skin-render-canvas" aria-hidden="true"></canvas>
          <div class="ssc-skin-empty" hidden><strong>Skin belum tersedia</strong><span>Periksa sinkronisasi dari server Minecraft.</span></div></div>
        <p class="ssc-skin-dialog-message" role="status"></p>
        <p class="ssc-skin-dialog-source" hidden></p>
        <div class="ssc-skin-controls"><button type="button" data-skin-action="outer" aria-pressed="true">Lapisan luar: Aktif</button><button type="button" data-skin-action="left">Putar kiri</button>
          <button type="button" data-skin-action="right">Putar kanan</button>
          <button type="button" data-skin-action="zoom-out" aria-label="Perkecil model">−</button>
          <button type="button" data-skin-action="reset">Reset</button>
          <button type="button" data-skin-action="zoom-in" aria-label="Perbesar model">+</button></div>
        <button type="button" class="player-action player-action-secondary" data-skin-action="refresh">Periksa skin lagi</button>
        <button type="button" class="player-action player-action-secondary" data-skin-action="close">Tutup</button></div>`;
      dialog.setAttribute('aria-labelledby','ssc-skin-dialog-heading');
      document.body.append(dialog);
      const viewer=dialog.querySelector('.ssc-skin-viewer');
      const canvas=dialog.querySelector('.ssc-skin-render-canvas');
      const renderer=window.SSCircleSkin3D?.create(canvas)||null;
      let yaw=25,pitch=-10,zoom=1,outer=true,pressed=false,lastX=0,lastY=0;
      const fingers=new Map();let pinch=0;
      const paint=()=>renderer?.setView({yaw,pitch,zoom,outer});
      const reset=()=>{yaw=25;pitch=-10;zoom=1;paint();};
      dialog._skinRenderer=renderer;
      dialog._skinLoad=(img,model)=>renderer?.setSkin(img,model)===true;
      dialog._skinReset=reset;
      viewer.addEventListener('pointerdown',e=>{
        if(e.pointerType==='mouse'&&e.button!==0)return;
        fingers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        pressed=true;lastX=e.clientX;lastY=e.clientY;
        viewer.setPointerCapture(e.pointerId);
        if(fingers.size>1)pinch=0;
      });
      viewer.addEventListener('pointermove',e=>{
        if(!fingers.has(e.pointerId))return;
        fingers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(fingers.size===2){
          const [p,q]=[...fingers.values()];
          const distance=Math.hypot(p.x-q.x,p.y-q.y);
          if(pinch>0)zoom=Math.max(.6,Math.min(2.25,zoom*distance/pinch));
          pinch=distance;lastX=e.clientX;lastY=e.clientY;paint();return;
        }
        pinch=0;
        if(pressed){
          yaw+=(e.clientX-lastX)*.52;
          pitch=Math.max(-60,Math.min(60,pitch-(e.clientY-lastY)*.35));
          lastX=e.clientX;lastY=e.clientY;paint();
        }
      });
      const release=e=>{fingers.delete(e.pointerId);pressed=fingers.size>0;
        pinch=0;if(pressed){const p=fingers.values().next().value;lastX=p.x;lastY=p.y;}};
      viewer.addEventListener('pointerup',release);
      viewer.addEventListener('pointercancel',release);
      viewer.addEventListener('lostpointercapture',release);
      viewer.addEventListener('wheel',e=>{
        e.preventDefault();zoom=Math.max(.6,Math.min(2.25,zoom*Math.exp(-e.deltaY*.0012)));paint();
      },{passive:false});
      viewer.addEventListener('keydown',e=>{
        if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','=','0'].includes(e.key))return;
        e.preventDefault();if(e.key==='ArrowLeft')yaw-=15;if(e.key==='ArrowRight')yaw+=15;
        if(e.key==='ArrowUp')pitch=Math.min(60,pitch+10);
        if(e.key==='ArrowDown')pitch=Math.max(-60,pitch-10);
        if(['+','='].includes(e.key))zoom=Math.min(2.25,zoom*1.1);
        if(e.key==='-')zoom=Math.max(.6,zoom/1.1);
        if(e.key==='0'){reset();return;}paint();
      });
      const resizeObserver=typeof ResizeObserver==='function'
        ?new ResizeObserver(()=>renderer?.draw()):null;
      resizeObserver?.observe(viewer);
      dialog._skinResizeObserver=resizeObserver;
      const outerButton=dialog.querySelector('[data-skin-action="outer"]');
      dialog.querySelectorAll('[data-skin-action]').forEach(button=>button.addEventListener('click',()=>{
        switch(button.dataset.skinAction){case 'outer':outer=!outer;outerButton.setAttribute('aria-pressed',String(outer));outerButton.textContent='Lapisan luar: '+(outer?'Aktif':'Nonaktif');paint();break;case 'left':yaw-=45;paint();break;
          case 'right':yaw+=45;paint();break;
          case 'zoom-out':zoom=Math.max(.6,zoom/1.14);paint();break;
          case 'zoom-in':zoom=Math.min(2.25,zoom*1.14);paint();break;
          case 'reset':reset();break;
          case 'refresh':void dialog._skinRefresh?.();break;case 'close':dialog.close();break;}}));
      dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
    }
    const info=dialog.querySelector('.ssc-skin-dialog-message');
    const source=dialog.querySelector('.ssc-skin-dialog-source');
    const renderer=dialog._skinRenderer;
    const empty=dialog.querySelector('.ssc-skin-empty');
    const controls=dialog.querySelector('.ssc-skin-controls');
    let currentAccount=a,loadTicket=0;
    const epoch=dialog._skinEpoch=(dialog._skinEpoch||0)+1;
    const display=async(account,force)=>{
      const ticket=++loadTicket;
      currentAccount=account;
      dialog.dataset.accountId=account.id;
      dialog.querySelector('.ssc-skin-dialog-caption').textContent=account.username+' · '+(account.skinModel==='slim'?'Slim':'Classic');
      renderer?.clear?.();empty.hidden=true;controls.hidden=true;source.hidden=true;
      info.textContent='Mengambil tekstur skin Minecraft...';
      const result=await loadSkin(account,force);
      if(ticket!==loadTicket||dialog._skinEpoch!==epoch||!dialog.open||dialog.dataset.accountId!==account.id)return;
      if(result.image){
        if(!renderer||!dialog._skinLoad(result.image,result.model)){
          empty.hidden=false;info.textContent='Renderer 3D tidak tersedia di browser ini. Periksa dukungan Canvas 2D.';return;
        }
        controls.hidden=false;
        dialog.querySelector('.ssc-skin-dialog-caption').textContent=account.username+' · '+(result.model==='slim'?'Slim':'Classic');
        source.hidden=false;
        source.textContent=result.source==='mojang-fallback'
          ?'Sumber: Mojang Premium (sementara). Skin custom di server akan digunakan setelah berhasil disinkronkan.'
          :'Sumber: skin aktif yang dibaca server SSCircle.';
        info.textContent='Seret untuk memutar. Scroll, cubit layar, atau tekan +/− untuk zoom. Lapisan luar bisa diaktifkan atau disembunyikan.';
      }else{
        empty.hidden=false;
        info.textContent=result.error||'Skin belum dapat dimuat. Periksa /ssskin inspect <pemain>.';
      }
    };
    dialog._skinRefresh=async()=>{
      info.textContent='Memeriksa data skin terbaru di Cloudflare...';
      try{
        const response=await fetch('/api/player/minecraft/link/state',{credentials:'same-origin',cache:'no-store'});
        if(response.ok){
          const state=await response.json();
          currentAccount=state.accounts?.find(x=>x.id===currentAccount.id)||currentAccount;
        }
      }catch{/* Keep current account; loading still reports a useful error. */}
      void display(currentAccount,true);
    };
    if(!dialog.open)dialog.showModal();dialog._skinReset();
    void display(a,false);
  }
  window.SSCircleMinecraftAvatars=Object.freeze({eligible,urlForAccount,renderPrimary,cardAvatar,openPreview});
})();
