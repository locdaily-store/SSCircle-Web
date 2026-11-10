/* SSCircle V10.49.1.1 | Server skin avatar + interactive CSS 3D skin viewer.
   The server verifies linked ownership; never resolve by username/offline UUID.
   No third-party CDN, WebGL dependency, external script or leaked texture URL. */
'use strict';
(() => {
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const cache=new Map();
  let primaryTicket=0;
  const eligible=account=>Boolean(account&&UUID.test(account.id||'')&&
    ['java_premium','java_offline','bedrock'].includes(account.provider));
  const urlForAccount=account=>eligible(account)
    ?'/api/player/minecraft/skin/'+encodeURIComponent(account.id):null;
  function loadSkin(account,force=false){
    const url=urlForAccount(account);
    if(!url)return Promise.resolve(null);
    const entry=cache.get(url);
    if(!force&&entry&&Date.now()-entry.at<60000)return entry.promise;
    const promise=new Promise(resolve=>{
      const image=new Image();
      image.onload=()=>resolve(image.naturalWidth===64&&
        (image.naturalHeight===32||image.naturalHeight===64)?image:null);
      image.onerror=()=>resolve(null);
      image.src=url+(force?'?refresh='+Date.now():'');
    });
    cache.set(url,{promise,at:Date.now()});
    return promise;
  }
  function drawHead(image,canvas){
    const ctx=canvas.getContext('2d');
    if(!ctx)return false;
    canvas.width=64;canvas.height=64;
    ctx.imageSmoothingEnabled=false;
    ctx.clearRect(0,0,64,64);
    ctx.drawImage(image,8,8,8,8,0,0,64,64);
    ctx.drawImage(image,40,8,8,8,0,0,64,64);
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
      holder.append(canvas);
    }
    const account=(Array.isArray(accounts)?accounts:[]).find(a=>a.isPrimary)
      ||(Array.isArray(accounts)?accounts[0]:null);
    const ticket=++primaryTicket;
    canvas.hidden=true;fallback.hidden=false;
    if(!eligible(account))return;
    canvas.setAttribute('aria-label','Skin Minecraft '+account.username);
    loadSkin(account).then(img=>{
      if(ticket!==primaryTicket||!img)return;
      if(drawHead(img,canvas)){canvas.hidden=false;fallback.hidden=true;}
    });
  }
  function cardAvatar(account){
    const wrap=document.createElement('span');wrap.className='ssc-minecraft-avatar';
    const fallback=document.createElement('span');
    fallback.className='ssc-minecraft-avatar-fallback';
    fallback.textContent='MC';fallback.setAttribute('aria-hidden','true');wrap.append(fallback);
    if(eligible(account)){
      const canvas=document.createElement('canvas');canvas.hidden=true;
      canvas.setAttribute('role','img');
      canvas.setAttribute('aria-label','Wajah skin '+account.username);
      wrap.append(canvas);
      loadSkin(account).then(image=>{
        if(!image||!wrap.isConnected)return;
        if(drawHead(image,canvas)){fallback.hidden=true;canvas.hidden=false;}
      });
    }
    return wrap;
  }

  // Vanilla CSS 3D scene. Six real textured faces for every cuboid, with outer
  // layers (hat, jacket, sleeves, trousers). One pixel is five CSS pixels.
  const UNIT=5;
  function faceImage(image,x,y,w,h){
    const canvas=document.createElement('canvas');
    canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d');
    if(!ctx)return '';
    ctx.imageSmoothingEnabled=false;
    if(x>=0&&y>=0&&x+w<=64&&y+h<=image.naturalHeight)
      ctx.drawImage(image,x,y,w,h,0,0,w,h);
    return canvas.toDataURL('image/png');
  }
  function cube(image,{u,v,w,h,d,x,y,z=0,overlay=false}){
    const host=document.createElement('div');
    host.className='ssc-skin-cuboid'+(overlay?' is-overlay':'');
    host.style.transform=`translate3d(${x*UNIT}px,${y*UNIT}px,${z*UNIT}px)`;
    const sx=w*UNIT,sy=h*UNIT,sz=d*UNIT;
    const faces=[
      ['front',u+d,v+d,w,h,sx,sy,`translateZ(${sz/2}px)`],
      ['back',u+2*d+w,v+d,w,h,sx,sy,`rotateY(180deg) translateZ(${sz/2}px)`],
      ['right',u,v+d,d,h,sz,sy,`rotateY(90deg) translateZ(${sx/2}px)`],
      ['left',u+d+w,v+d,d,h,sz,sy,`rotateY(-90deg) translateZ(${sx/2}px)`],
      ['top',u+d,v,w,d,sx,sz,`rotateX(90deg) translateZ(${sy/2}px)`],
      ['bottom',u+d+w,v,w,d,sx,sz,`rotateX(-90deg) translateZ(${sy/2}px)`]
    ];
    for(const [name,tx,ty,tw,th,fw,fh,transform] of faces){
      const side=document.createElement('div');
      side.className='ssc-skin-face ssc-skin-face-'+name;
      side.style.width=fw+'px';side.style.height=fh+'px';
      side.style.transform=transform;
      side.style.backgroundImage=`url("${faceImage(image,tx,ty,tw,th)}")`;
      host.append(side);
    }
    return host;
  }
  function skinModel(image,variant){
    const scene=document.createElement('div');
    scene.className='ssc-skin-scene';
    const modern=image.naturalHeight===64;
    const slim=modern&&variant==='slim';
    const aw=slim?3:4;
    const parts=[
      {u:0,v:0,w:8,h:8,d:8,x:0,y:-12},
      {u:16,v:16,w:8,h:12,d:4,x:0,y:-2},
      {u:40,v:16,w:aw,h:12,d:4,x:-4-aw/2,y:-2},
      {u:modern?32:40,v:modern?48:16,w:aw,h:12,d:4,x:4+aw/2,y:-2},
      {u:0,v:16,w:4,h:12,d:4,x:-2,y:10},
      {u:modern?16:0,v:modern?48:16,w:4,h:12,d:4,x:2,y:10}
    ];
    for(const part of parts)scene.append(cube(image,part));
    if(modern){
      const layers=[
        {u:32,v:0,w:8,h:8,d:8,x:0,y:-12},
        {u:16,v:32,w:8,h:12,d:4,x:0,y:-2},
        {u:40,v:32,w:aw,h:12,d:4,x:-4-aw/2,y:-2},
        {u:48,v:48,w:aw,h:12,d:4,x:4+aw/2,y:-2},
        {u:0,v:32,w:4,h:12,d:4,x:-2,y:10},
        {u:0,v:48,w:4,h:12,d:4,x:2,y:10}
      ];
      // Outer layers expand slightly to prevent depth fighting.
      for(const part of layers){
        const shell=cube(image,{...part,overlay:true});
        const zoom=part.h===8?1.08:1.05;
        shell.style.transform+=` scale3d(${zoom},${zoom},${zoom})`;
        scene.append(shell);
      }
    }
    return scene;
  }
  let activePreview=0;
  async function openPreview(account){
    if(!eligible(account))return;
    let dialog=document.getElementById('ssc-minecraft-skin-dialog');
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='ssc-minecraft-skin-dialog';
      dialog.className='ssc-skin-dialog';
      dialog.setAttribute('aria-label','Viewer skin Minecraft 3D');
      const content=document.createElement('div');content.className='ssc-skin-dialog-content';
      const h=document.createElement('h2');h.textContent='Lihat skin Minecraft';
      const name=document.createElement('p');name.className='ssc-skin-dialog-caption';
      const viewport=document.createElement('div');
      viewport.className='ssc-skin-viewport';viewport.tabIndex=0;
      viewport.setAttribute('aria-label','Geser atau gunakan tombol panah untuk memutar skin 3D');
      const status=document.createElement('p');
      status.className='ssc-skin-dialog-message';status.setAttribute('role','status');
      const actions=document.createElement('div');actions.className='ssc-skin-controls';
      const button=(text,kind,action)=>{
        const el=document.createElement('button');el.type='button';
        el.className='player-action player-action-secondary';
        el.textContent=text;el.dataset.action=kind;el.onclick=action;actions.append(el);
        return el;
      };
      button('Putar kiri','left',()=>rotate(-25,0));
      button('Putar kanan','right',()=>rotate(25,0));
      button('Zoom +','plus',()=>zoom(0.15));
      button('Zoom −','minus',()=>zoom(-0.15));
      button('Reset','reset',()=>reset());
      const close=button('Tutup','close',()=>dialog.close());
      const refresh=button('Muat ulang skin','refresh',()=>openPreview({...dialog._account},true));
      const note=document.createElement('small');
      note.textContent='Geser model untuk memutar. Scroll/dua jari untuk memperbesar. Skin mengikuti yang tersedia di server.';
      content.append(h,name,viewport,status,actions,note);dialog.append(content);
      document.body.append(dialog);
      dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
      let yaw=-25,pitch=-8,scale=1,anchor=null,scene=null;
      function refreshTransform(){if(scene)scene.style.transform=
        `rotateX(${pitch}deg) rotateY(${yaw}deg) scale(${scale})`;}
      function rotate(dy,dx){yaw+=dy;pitch=Math.max(-65,Math.min(65,pitch+dx));refreshTransform();}
      function zoom(delta){scale=Math.max(0.6,Math.min(1.9,scale+delta));refreshTransform();}
      function reset(){yaw=-25;pitch=-8;scale=1;refreshTransform();}
      viewport.addEventListener('pointerdown',e=>{
        anchor={x:e.clientX,y:e.clientY};viewport.setPointerCapture(e.pointerId);
      });
      viewport.addEventListener('pointermove',e=>{
        if(!anchor)return;
        rotate((e.clientX-anchor.x)*0.75,-(e.clientY-anchor.y)*0.55);
        anchor={x:e.clientX,y:e.clientY};
      });
      viewport.addEventListener('pointerup',()=>{anchor=null;});
      viewport.addEventListener('pointercancel',()=>{anchor=null;});
      viewport.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?0.08:-0.08);},{passive:false});
      viewport.addEventListener('keydown',e=>{
        if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
          e.preventDefault();rotate(e.key==='ArrowLeft'?-15:15,0);
        }else if(e.key==='ArrowUp'||e.key==='ArrowDown'){
          e.preventDefault();rotate(0,e.key==='ArrowUp'?10:-10);
        }
      });
      dialog._setScene=s=>{scene=s;reset();};
    }
    dialog._account=account;
    const ticket=++activePreview;
    const viewport=dialog.querySelector('.ssc-skin-viewport');
    const message=dialog.querySelector('.ssc-skin-dialog-message');
    dialog.querySelector('.ssc-skin-dialog-caption').textContent=account.username;
    viewport.replaceChildren();message.textContent='Memuat skin Minecraft dari server...';
    if(!dialog.open)dialog.showModal();
    const [image,meta]=await Promise.all([
      loadSkin(account,arguments.length>1&&arguments[1]===true),
      fetch('/api/player/minecraft/skin-info/'+encodeURIComponent(account.id),
        {cache:'no-store',credentials:'same-origin'}).then(r=>r.ok?r.json():null).catch(()=>null)
    ]);
    if(ticket!==activePreview||!dialog.open)return;
    if(!image){message.textContent='Skin belum tersedia. Masuk kembali ke Minecraft dan minta OP menjalankan /sscircle sync, lalu tekan Muat ulang skin.';return;}
    const scene=skinModel(image,meta?.model==='slim'?'slim':'classic');
    viewport.append(scene);dialog._setScene(scene);
    message.textContent='Skin 3D siap · '+(meta?.source==='server'?'Dari skin yang diterapkan server':
      'Dari Mojang (fallback)')+(meta?.updatedAt?' · Sinkron '+new Date(meta.updatedAt).toLocaleString('id-ID'):'');
  }
  window.SSCircleMinecraftAvatars=Object.freeze({
    eligible,urlForAccount,renderPrimary,cardAvatar,openPreview
  });
})();
