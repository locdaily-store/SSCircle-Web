/* Gallery editor uses Homepage's photo collection and the existing authenticated save API. */
'use strict';
window.SSCircleGalleryAdmin=(()=>{
  let state=null,timer=0,mobile=false;
  const $=id=>document.getElementById(id);
  function resize(){
    const frame=$('gallery-admin-preview-frame'),windowEl=$('gallery-admin-preview-window');
    if(!frame||!windowEl)return;
    const width=mobile?390:1100,height=mobile?840:800;
    const scale=Math.min(1,Math.max(150,windowEl.clientWidth-20)/width);
    frame.style.width=width+'px';
    frame.style.height=height+'px';
    frame.style.transform='scale('+scale+')';
    windowEl.style.height=Math.min(mobile?650:680,height*scale+20)+'px';
  }
  function update(){
    if(!state)return;
    const frame=$('gallery-admin-preview-frame');
    frame?.contentWindow?.postMessage({type:'ssc-theme-preview-settings',settings:JSON.parse(JSON.stringify(state.settings))},location.origin);
  }
  function schedule(){
    clearTimeout(timer);
    timer=setTimeout(update,140);
  }
  function render(data){
    state=data;
    resize();
    schedule();
  }
  function init(){
    $('gallery-admin-save')?.addEventListener('click',()=>document.getElementById('save')?.click());
    $('gallery-open-colors')?.addEventListener('click',()=>document.querySelector('[data-tab="theme"]')?.click());
    $('gallery-preview-desktop')?.addEventListener('click',()=>{mobile=false;resize();});
    $('gallery-preview-mobile')?.addEventListener('click',()=>{mobile=true;resize();});
    $('gallery-admin-preview-frame')?.addEventListener('load',()=>{resize();schedule();});
    $('gallery-admin-preview-window')&&('ResizeObserver' in window)&&new ResizeObserver(resize).observe($('gallery-admin-preview-window'));
    window.addEventListener('message',event=>{
      if(event.origin!==location.origin||event.source!==$('gallery-admin-preview-frame')?.contentWindow)return;
      if(event.data?.type==='ssc-theme-preview-ready')schedule();
      if(event.data?.type==='ssc-theme-preview-applied')$('gallery-preview-status').textContent='Pratinjau Gallery telah diperbarui.';
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  return {render,schedule};
})();
