/* Full gallery with categories, existing media sources and accessible lightbox. */
'use strict';
(() => {
 const $=id=>document.getElementById(id);
 const fallback='assets/gallery/sscircle-01.webp';
 const src=s=>typeof s==='string'&&(/^(assets\/gallery\/sscircle-0[1-9]\.webp|\/api\/media\/[0-9a-f-]{36})$/i.test(s)||/^https:\/\/[^\s<>"'\\]+$/i.test(s))?s:fallback;
 const defaultPhotos=Array.from({length:9},(_,i)=>({src:'assets/gallery/sscircle-'+String(i+1).padStart(2,'0')+'.webp',title:'SSCircle Gallery '+(i+1),caption:'',category:''}));
 let items=[],shown=[],selected='all',current=0;
 const viewer=$('gallery-viewer');
 function openPhoto(index){if(!shown.length)return;current=(index+shown.length)%shown.length;const item=shown[current];$('gallery-image').src=src(item.src);$('gallery-image').alt=item.title||'Foto SSCircle';$('gallery-caption').textContent=[item.title,item.caption].filter(Boolean).join(' · ');if(!viewer.open)viewer.showModal();}
 function render(){shown=items.filter(x=>selected==='all'||x.category===selected);$('gallery-grid').replaceChildren();$('gallery-empty').hidden=shown.length>0;$('gallery-count').textContent=shown.length+' foto';shown.forEach((item,index)=>{const button=document.createElement('button');button.className='gallery-card';button.type='button';const img=new Image();img.loading='lazy';img.src=src(item.src);img.alt=item.title||'Foto';img.onerror=()=>{img.onerror=null;img.src=fallback;};const info=document.createElement('span');info.className='gallery-card-info';const title=document.createElement('strong');title.textContent=item.title||'Foto SSCircle';const small=document.createElement('small');small.textContent=item.categoryLabel||'SSCircle';info.append(title,small);button.append(img,info);button.addEventListener('click',()=>openPhoto(index));$('gallery-grid').append(button);});}
 function addTab(label,id){const btn=document.createElement('button');btn.className='gallery-tab';btn.type='button';btn.textContent=label;btn.setAttribute('aria-pressed',String(selected===id));btn.onclick=()=>{selected=id;document.querySelectorAll('.gallery-tab').forEach(x=>x.setAttribute('aria-pressed',String(x===btn)));render();};$('gallery-tabs').append(btn);}
 function apply(s){
   window.SSCircleTheme?.apply?.(s);
   $('gallery-title').textContent=s.galleryPageTitle||s.homeGalleryTitle||'SSCircle Gallery';
   $('gallery-description').textContent=s.galleryPageDescription||s.homeGalleryText||'Momen SSCircle Server.';
   $('gallery-tabs').replaceChildren();
   const categories=Array.isArray(s.galleryCategories)?s.galleryCategories:[];
   const lookup=new Map(categories.filter(c=>c?.id).map(c=>[c.id,c.label]));
   items=(Array.isArray(s.homeGallery)?s.homeGallery:defaultPhotos).filter(Boolean)
     .map(x=>({...x,categoryLabel:lookup.get(x.category)||'SSCircle'}));
   if(selected!=='all'&&!lookup.has(selected))selected='all';
   addTab('Semua','all');
   categories.forEach(cat=>{if(cat?.id&&cat?.label)addTab(cat.label,cat.id);});
   if(s.galleryPageEnabled===false){
     items=[];render();$('gallery-empty').textContent='Halaman Gallery sedang dinonaktifkan.';
   }else {
     $('gallery-empty').textContent='Belum ada foto pada kategori ini.';
     render();
   }
 }
 $('gallery-close').onclick=()=>viewer.close();$('gallery-prev').onclick=()=>openPhoto(current-1);$('gallery-next').onclick=()=>openPhoto(current+1);
 viewer.addEventListener('click',e=>{if(e.target===viewer)viewer.close();});document.addEventListener('keydown',e=>{if(!viewer.open)return;if(e.key==='ArrowRight')openPhoto(current+1);if(e.key==='ArrowLeft')openPhoto(current-1);});
 const preview=new URLSearchParams(location.search).has('ssc_theme_preview');
 if(preview){
   window.addEventListener('message',event=>{
     if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='ssc-theme-preview-settings')return;
     apply(event.data.settings||{});
     parent.postMessage({type:'ssc-theme-preview-applied'},location.origin);
   });
   apply({});
   if(parent!==window)parent.postMessage({type:'ssc-theme-preview-ready'},location.origin);
 }else {
   fetch('/api/form',{credentials:'same-origin',cache:'no-store'})
     .then(r=>r.ok?r.json():Promise.reject())
     .then(v=>apply(v.settings||{})).catch(()=>apply({}));
 }
})();