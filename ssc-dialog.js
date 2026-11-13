/* SSCircle shared dialogs: accessible, themed confirmations without browser alert/confirm. */
'use strict';
window.SSCircleDialog = (() => {
  let dialog=null,toastArea=null,chain=Promise.resolve(),toastTimer=0;
  function el(tag,className='',text){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=String(text);
    return node;
  }
  function ensure(){
    if(dialog)return;
    dialog=el('dialog','ssc-circle-dialog');
    dialog.setAttribute('aria-labelledby','ssc-circle-dialog-title');
    dialog.setAttribute('aria-describedby','ssc-circle-dialog-description');
    const form=el('form','ssc-circle-dialog-inner');
    form.method='dialog';
    const brand=el('div','ssc-circle-dialog-symbol','✦');
    brand.setAttribute('aria-hidden','true');
    const title=el('h2','ssc-circle-dialog-title','SSCircle');
    title.id='ssc-circle-dialog-title';
    const description=el('p','ssc-circle-dialog-description','');
    description.id='ssc-circle-dialog-description';
    const buttons=el('div','ssc-circle-dialog-buttons');
    const cancel=el('button','ssc-circle-dialog-button ssc-circle-dialog-cancel','Batal');
    cancel.type='button';
    const accept=el('button','ssc-circle-dialog-button ssc-circle-dialog-accept','Lanjutkan');
    accept.type='submit';
    buttons.append(cancel,accept);
    form.append(brand,title,description,buttons);
    dialog.append(form);
    document.body.append(dialog);
    toastArea=el('div','ssc-circle-toast-region');
    toastArea.setAttribute('role','status');
    toastArea.setAttribute('aria-live','polite');
    toastArea.setAttribute('aria-atomic','true');
    document.body.append(toastArea);
  }
  function show(message,options={}){
    ensure();
    const run=()=>new Promise(resolve=>{
      const alertMode=options.mode==='alert';
      const title=dialog.querySelector('.ssc-circle-dialog-title');
      const desc=dialog.querySelector('.ssc-circle-dialog-description');
      const accept=dialog.querySelector('.ssc-circle-dialog-accept');
      const cancel=dialog.querySelector('.ssc-circle-dialog-cancel');
      title.textContent=options.title|| (alertMode?'Pemberitahuan SSCircle':options.danger?'Konfirmasi tindakan':'Konfirmasi SSCircle');
      desc.textContent=String(message||'');
      accept.textContent=options.confirmText||(alertMode?'Mengerti':options.danger?'Ya, lanjutkan':'Lanjutkan');
      cancel.hidden=alertMode;
      dialog.classList.toggle('is-danger',options.danger===true);
      let settled=false;
      const finish=value=>{
        if(settled)return;
        settled=true;
        form.removeEventListener('submit',submit);
        cancel.removeEventListener('click',dismiss);
        dialog.removeEventListener('cancel',escape);
        dialog.removeEventListener('close',closed);
        dialog.removeEventListener('click',outside);
        if(dialog.open)dialog.close();
        resolve(value);
      };
      const form=dialog.querySelector('form');
      const submit=event=>{event.preventDefault();finish(true);};
      const dismiss=()=>finish(false);
      const escape=event=>{event.preventDefault();finish(false);};
      const closed=()=>finish(false);
      const outside=event=>{if(event.target===dialog && !alertMode)finish(false);};
      form.addEventListener('submit',submit);
      cancel.addEventListener('click',dismiss);
      dialog.addEventListener('cancel',escape);
      dialog.addEventListener('close',closed);
      dialog.addEventListener('click',outside);
      if(typeof dialog.showModal==='function')dialog.showModal();
      else dialog.setAttribute('open','');
      requestAnimationFrame(()=>accept.focus());
    });
    const next=chain.then(run,run);
    chain=next.catch(()=>{});
    return next;
  }
  function toast(message,type='success',duration=3800){
    ensure();
    clearTimeout(toastTimer);
    const item=el('div','ssc-circle-toast is-'+(type==='error'?'error':type==='warning'?'warning':'success'));
    const icon=el('span','ssc-circle-toast-glyph',type==='error'?'!':type==='warning'?'•':'✓');
    item.append(icon,el('span','',String(message||'')));
    toastArea.replaceChildren(item);
    toastTimer=setTimeout(()=>item.remove(),Math.max(1600,Math.min(9000,Number(duration)||3800)));
  }
  return {
    confirm:(message,options={})=>show(message,options),
    alert:(message,options={})=>show(message,{...options,mode:'alert'}),
    toast
  };
})();
