/* SSCircle Password Visibility: controlled locally, never stores or transmits input. */
'use strict';
(() => {
  const eye='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.7-7 10-7 10 7 10 7-3.7 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const eyeOff='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.2C11.1 5.1 11.5 5 12 5c6.3 0 10 7 10 7a17 17 0 0 1-3 3.7M6.1 6.1C3.5 8 2 12 2 12s3.7 7 10 7c1.5 0 2.9-.4 4.1-1.1"/><path d="M10 10a3 3 0 0 0 4 4"/></svg>';
  const enhance=input=>{
    if(input.dataset.eyeReady==='true')return;
    input.dataset.eyeReady='true';
    const wrap=document.createElement('span');wrap.className='ssc-password-wrap';
    input.parentNode.insertBefore(wrap,input);
    wrap.append(input);
    const button=document.createElement('button');
    button.type='button';button.className='ssc-password-eye';
    const name=input.closest('label')?.querySelector('.field-label, .player-setting-field>span, span')?.textContent?.trim()||'password';
    const update=()=>{
      const visible=input.type==='text';
      button.innerHTML=visible?eyeOff:eye;
      button.setAttribute('aria-label',(visible?'Sembunyikan ':'Tampilkan ')+name);
      button.setAttribute('aria-pressed',String(visible));
      button.title=visible?'Sembunyikan password':'Lihat password';
    };
    button.addEventListener('click',()=>{
      const start=input.selectionStart,end=input.selectionEnd;
      input.type=input.type==='password'?'text':'password';
      update();input.focus({preventScroll:true});
      try{if(start!==null&&end!==null)input.setSelectionRange(start,end)}catch{}
    });
    wrap.append(button);update();
  };
  const setup=()=>document.querySelectorAll('input[type=password]').forEach(enhance);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();