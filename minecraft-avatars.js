/* SSCircle V10.49.1: skin display is a cosmetic feature, not proof of account ownership.
   Only a server-linked Mojang online-mode UUID can request a skin texture.
   Offline/AuthMe UUIDs and Floodgate XUIDs deliberately use the SSCircle fallback. */
'use strict';
(() => {
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const cache=new Map();
  let primaryTicket=0;
  const eligible=account=>Boolean(account && account.provider==='java_premium'
    && account.edition==='java_premium' && UUID.test(account.providerId||'')
    && UUID.test(account.id||''));
  const urlForAccount=account=>eligible(account)
    ?'/api/player/minecraft/skin/'+encodeURIComponent(account.id):null;

  function loadSkin(account){
    const url=urlForAccount(account);
    if(!url)return Promise.resolve(null);
    if(!cache.has(url)){
      const promise=new Promise(resolve=>{
        const image=new Image();
        image.onload=()=>resolve(image.naturalWidth===64
          && (image.naturalHeight===64||image.naturalHeight===32)?image:null);
        image.onerror=()=>resolve(null);
        image.src=url;
      });
      cache.set(url,promise);
    }
    return cache.get(url);
  }
  function head(image,canvas){
    const ctx=canvas.getContext('2d');
    if(!ctx)return false;
    canvas.width=64;canvas.height=64;
    ctx.imageSmoothingEnabled=false;
    ctx.clearRect(0,0,64,64);
    ctx.drawImage(image,8,8,8,8,0,0,64,64);
    ctx.drawImage(image,40,8,8,8,0,0,64,64);
    return true;
  }
  function body(image,canvas){
    const ctx=canvas.getContext('2d');
    if(!ctx)return false;
    canvas.width=96;canvas.height=128;
    ctx.imageSmoothingEnabled=false;
    ctx.clearRect(0,0,96,128);
    const part=(sx,sy,w,h,dx,dy)=>ctx.drawImage(image,sx,sy,w,h,dx*4,dy*4,w*4,h*4);
    const modern=image.naturalHeight===64;
    // Classic 64x32 skins reuse the right limbs; 64x64 skins have independent limbs.
    part(8,8,8,8,8,0);
    part(20,20,8,12,8,8);
    part(44,20,4,12,4,8);
    part(modern?36:44,modern?52:20,4,12,16,8);
    part(4,20,4,12,8,20);
    part(modern?20:4,modern?52:20,4,12,12,20);
    part(40,8,8,8,8,0); // hat/hair overlay
    if(modern){
      part(20,36,8,12,8,8);
      part(44,36,4,12,4,8);
      part(52,52,4,12,16,8);
      part(4,36,4,12,8,20);
      part(4,52,4,12,12,20);
    }
    return true;
  }
  function renderPrimary(accounts){
    const fallback=document.getElementById('player-avatar-image');
    if(!fallback)return;
    const holder=fallback.parentElement;
    let canvas=holder.querySelector('.ssc-primary-avatar');
    if(!canvas){
      canvas=document.createElement('canvas');
      canvas.className='ssc-primary-avatar';
      canvas.setAttribute('role','img');
      canvas.setAttribute('aria-label','Wajah skin Minecraft dari akun utama');
      holder.append(canvas);
    }
    const ticket=++primaryTicket;
    canvas.hidden=true;
    fallback.hidden=false;
    const account=(Array.isArray(accounts)?accounts:[]).find(a=>a.isPrimary)
      ||(Array.isArray(accounts)?accounts[0]:null);
    if(!eligible(account))return;
    loadSkin(account).then(image=>{
      if(ticket!==primaryTicket||!image)return;
      if(head(image,canvas)){canvas.hidden=false;fallback.hidden=true;}
    });
  }
  function cardAvatar(account){
    const wrap=document.createElement('span');
    wrap.className='ssc-minecraft-avatar';
    const icon=document.createElement('span');
    icon.className='ssc-minecraft-avatar-fallback';
    icon.textContent='MC';
    icon.setAttribute('aria-hidden','true');
    wrap.append(icon);
    if(eligible(account)){
      const canvas=document.createElement('canvas');
      canvas.hidden=true;
      canvas.setAttribute('role','img');
      canvas.setAttribute('aria-label','Wajah skin '+account.username);
      wrap.append(canvas);
      loadSkin(account).then(image=>{
        if(!wrap.isConnected||!image)return;
        if(head(image,canvas)){icon.hidden=true;canvas.hidden=false;}
      });
    }
    return wrap;
  }
  function openPreview(account){
    if(!eligible(account))return;
    let dialog=document.getElementById('ssc-minecraft-skin-dialog');
    if(!dialog){
      dialog=document.createElement('dialog');
      dialog.id='ssc-minecraft-skin-dialog';
      dialog.className='ssc-skin-dialog';
      const content=document.createElement('div');
      content.className='ssc-skin-dialog-content';
      const heading=document.createElement('h2');
      heading.id='ssc-skin-dialog-heading';
      heading.textContent='Skin Minecraft';
      dialog.setAttribute('aria-labelledby',heading.id);
      const caption=document.createElement('p');
      caption.className='ssc-skin-dialog-caption';
      const canvas=document.createElement('canvas');
      canvas.className='ssc-skin-full';
      canvas.setAttribute('role','img');
      canvas.setAttribute('aria-label','Tampilan depan skin Minecraft');
      const message=document.createElement('p');
      message.className='ssc-skin-dialog-message';
      message.setAttribute('role','status');
      const close=document.createElement('button');
      close.type='button';close.className='player-action player-action-secondary';
      close.textContent='Tutup';
      close.addEventListener('click',()=>dialog.close());
      content.append(heading,caption,canvas,message,close);
      dialog.append(content);document.body.append(dialog);
      dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
    }
    const name=dialog.querySelector('.ssc-skin-dialog-caption');
    const message=dialog.querySelector('.ssc-skin-dialog-message');
    const canvas=dialog.querySelector('.ssc-skin-full');
    name.textContent=account.username+' · Java Premium terverifikasi';
    message.textContent='Mengambil tekstur skin dari Mojang...';
    canvas.hidden=true;
    dialog.dataset.accountId=account.id;
    if(!dialog.open)dialog.showModal();
    loadSkin(account).then(image=>{
      if(dialog.dataset.accountId!==account.id||!dialog.open)return;
      if(image&&body(image,canvas)){
        canvas.hidden=false;
        message.textContent='Pratinjau tampak depan. Skin bisa berbeda jika baru saja diganti di Minecraft.';
      }else message.textContent='Skin belum tersedia dari Mojang. Akun dan statistik tetap aman.';
    });
  }
  window.SSCircleMinecraftAvatars=Object.freeze({
    eligible,urlForAccount,renderPrimary,cardAvatar,openPreview
  });
})();
