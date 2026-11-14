/* Getting Started content manager; draft and published content stay separate. */
'use strict';
window.SSCircleGettingStartedAdmin=(()=>{
  let data=null,dirty=()=>{},draft=null,selected=0,device='desktop',previewTimer=0;
  const $=id=>document.getElementById(id);
  const node=(tag,cls='',value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n;};
  const clone=v=>JSON.parse(JSON.stringify(v));
  const newId=()=> 'guide-'+Math.random().toString(36).slice(2,10);
  const update=()=>{if(!data)return;data.settings.gettingStartedDraft=draft;dirty();clearTimeout(previewTimer);previewTimer=setTimeout(preview,170);};
  function preview(){
    const frame=$('getting-started-preview-frame');if(!frame?.contentWindow||!data)return;
    frame.contentWindow.postMessage({type:'ssc-howto-preview',settings:clone(data.settings),guide:clone(draft)},location.origin);
  }
  function inputField(parent,label,value,change,{textarea=false,placeholder='',max=1500}={}){
    const field=node('label','field-group'),title=node('span','field-label',label),input=node(textarea?'textarea':'input');
    if(!textarea)input.type='text';else input.rows=3;
    input.maxLength=max;input.placeholder=placeholder;input.value=value||'';
    input.oninput=()=>{change(input.value);update();};
    field.append(title,input);parent.append(field);return input;
  }
  function action(label,callback,secondary=true){
    const b=node('button','button '+(secondary?'secondary':'primary'),label);
    b.type='button';b.onclick=callback;return b;
  }
  function move(items,i,delta){
    const j=i+delta;if(j<0||j>=items.length)return;
    [items[i],items[j]]=[items[j],items[i]];update();renderEditor();
  }
  function renderEditor(){
    const root=$('getting-started-admin-editor');if(!root||!draft)return;
    root.replaceChildren();
    const introduction=node('section','panel howto-admin-block');
    introduction.append(node('h2','','Pengaturan halaman'));
    inputField(introduction,'Judul halaman',draft.title,v=>draft.title=v,{max:110});
    inputField(introduction,'Deskripsi',draft.subtitle,v=>draft.subtitle=v,{textarea:true,max:600});
    const visibility=node('label','toggle-row'),toggle=node('input');toggle.type='checkbox';toggle.checked=draft.enabled!==false;
    toggle.onchange=()=>{draft.enabled=toggle.checked;update();};
    visibility.append(toggle,node('span','','Aktifkan halaman panduan ketika diterbitkan'));introduction.append(visibility);root.append(introduction);
    const categories=node('section','panel howto-admin-block');
    categories.append(node('h2','','Kategori dan langkah tutorial'),node('p','field-help','Pilih kategori untuk mengubah langkahnya. Seret kategori untuk mengatur urutan, atau gunakan tombol panah.'));
    const cats=node('div','howto-admin-categories');
    draft.sections.forEach((section,i)=>{
      const b=action((i+1)+'. '+section.title,()=>{selected=i;renderEditor();});
      b.className='howto-admin-category'+(selected===i?' active':'');
      b.draggable=true;
      b.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',String(i));e.dataTransfer.effectAllowed='move';});
      b.addEventListener('dragover',e=>e.preventDefault());
      b.addEventListener('drop',e=>{e.preventDefault();const from=Number(e.dataTransfer.getData('text/plain'));if(!Number.isInteger(from)||from<0||from>=draft.sections.length)return;const [item]=draft.sections.splice(from,1);draft.sections.splice(i,0,item);selected=i;update();renderEditor();});
      cats.append(b);
    });
    categories.append(cats);
    categories.append(action('+ Tambah kategori',()=>{
      if(draft.sections.length>=12)return;
      draft.sections.push({id:newId(),title:'Kategori Baru',summary:'Tuliskan deskripsi kategori.',icon:String(draft.sections.length+1).padStart(2,'0'),steps:[{title:'Langkah pertama',text:'Tuliskan petunjuk di sini.'}]});
      selected=draft.sections.length-1;update();renderEditor();
    }));
    const section=draft.sections[selected];
    if(section){
      const detail=node('div','howto-admin-detail');
      inputField(detail,'Nama kategori',section.title,v=>section.title=v,{max:110});
      inputField(detail,'Ringkasan kategori',section.summary,v=>section.summary=v,{max:260});
      inputField(detail,'Simbol / nomor pendek',section.icon,v=>section.icon=v,{max:16});
      const controls=node('div','howto-admin-actions');
      controls.append(action('↑ Naik',()=>{move(draft.sections,selected,-1);selected=Math.max(0,selected-1);renderEditor();}),
        action('↓ Turun',()=>{move(draft.sections,selected,1);selected=Math.min(draft.sections.length-1,selected+1);renderEditor();}),
        action('Hapus kategori',async()=>{
          if(draft.sections.length<=1)return;
          if(!await window.SSCNotice.confirm('Hapus kategori ini dari draft?',{danger:true,confirmText:'Hapus'}))return;
          draft.sections.splice(selected,1);selected=Math.max(0,selected-1);update();renderEditor();
        }));
      detail.append(controls,node('h3','','Langkah panduan'));
      section.steps.forEach((step,i)=>{
        const card=node('article','howto-admin-step');card.append(node('h4','',String(i+1).padStart(2,'0')+' · '+(step.title||'Langkah')));
        inputField(card,'Judul langkah',step.title,v=>step.title=v,{max:120});
        inputField(card,'Penjelasan langkah',step.text,v=>step.text=v,{textarea:true,max:1500});
        inputField(card,'Teks tombol (opsional)',step.linkLabel,v=>step.linkLabel=v,{max:90});
        inputField(card,'Link tujuan (opsional)',step.href,v=>step.href=v,{max:350,placeholder:'/registration.html'});
        inputField(card,'URL gambar tutorial (opsional)',step.image,v=>step.image=v,{max:700,placeholder:'assets/... atau /api/media/...'});
        const picker=node('div','howto-admin-image-picker');
        if(window.SSCircleImagePicker?.mount)window.SSCircleImagePicker.mount(picker,{
          title:'Pilih atau unggah gambar tutorial',current:()=>step.image||'',
          onSelect:src=>{step.image=src;update();renderEditor();}
        });
        card.append(picker);
        inputField(card,'URL YouTube (opsional)',step.video,v=>step.video=v,{max:250,placeholder:'https://www.youtube.com/watch?v=...'});
        const actions=node('div','howto-admin-actions');
        actions.append(action('↑',()=>move(section.steps,i,-1)),action('↓',()=>move(section.steps,i,1)),
          action('Hapus langkah',async()=>{
            if(section.steps.length<=1)return;
            if(!await window.SSCNotice.confirm('Hapus langkah dari draft?',{danger:true,confirmText:'Hapus'}))return;
            section.steps.splice(i,1);update();renderEditor();
          }));
        card.append(actions);detail.append(card);
      });
      detail.append(action('+ Tambah langkah',()=>{
        if(section.steps.length>=20)return;
        section.steps.push({title:'Langkah baru',text:'Tulis penjelasan langkah.'});
        update();renderEditor();
      }));
      categories.append(detail);
    }
    root.append(categories);
    const faqs=node('section','panel howto-admin-block');faqs.append(node('h2','','Pertanyaan & Jawaban'));
    draft.faq.forEach((item,i)=>{
      const box=node('div','howto-admin-faq');
      inputField(box,'Pertanyaan',item.question,v=>item.question=v,{max:200});
      inputField(box,'Jawaban',item.answer,v=>item.answer=v,{textarea:true,max:1200});
      box.append(action('Hapus FAQ',()=>{draft.faq.splice(i,1);update();renderEditor();}));
      faqs.append(box);
    });
    faqs.append(action('+ Tambah FAQ',()=>{
      if(draft.faq.length>=30)return;
      draft.faq.push({question:'Pertanyaan baru?',answer:'Tuliskan jawabannya.'});update();renderEditor();
    }));
    root.append(faqs);
  }
  function setDevice(value){
    device=value;
    const viewport=$('getting-started-preview-window');
    if(viewport)viewport.classList.toggle('mobile',device==='mobile');
    for(const [id,enabled] of [['getting-started-preview-desktop',device==='desktop'],['getting-started-preview-mobile',device==='mobile']]){
      const button=$(id);if(button){button.setAttribute('aria-pressed',String(enabled));button.classList.toggle('is-active',enabled);}
    }
  }
  function render(value,markDirty){
    data=value;dirty=markDirty;
    const defaults=window.SSCircleGettingStartedDefaults;
    if(!defaults)return;
    draft=clone(data.settings.gettingStartedDraft||data.settings.gettingStarted||defaults);
    if(!Array.isArray(draft.sections)||!draft.sections.length)draft.sections=clone(defaults.sections);
    if(!Array.isArray(draft.faq))draft.faq=clone(defaults.faq);
    data.settings.gettingStartedDraft=draft;
    selected=0;renderEditor();setDevice('desktop');preview();
  }
  function init(){
    $('getting-started-save-draft')?.addEventListener('click',()=>{$('save')?.click();});
    $('getting-started-publish')?.addEventListener('click',()=>{
      if(!data||!draft)return;
      data.settings.gettingStarted=clone(draft);
      update();$('save')?.click();
    });
    $('getting-started-reset')?.addEventListener('click',async()=>{
      if(!await window.SSCNotice.confirm('Pulihkan draft tutorial bawaan? Perubahan draft saat ini akan diganti.',{danger:true,confirmText:'Pulihkan'}))return;
      draft=clone(window.SSCircleGettingStartedDefaults);selected=0;update();renderEditor();
    });
    $('getting-started-preview-desktop')?.addEventListener('click',()=>setDevice('desktop'));
    $('getting-started-preview-mobile')?.addEventListener('click',()=>setDevice('mobile'));
    $('getting-started-preview-frame')?.addEventListener('load',preview);
    window.addEventListener('message',event=>{
      if(event.origin===location.origin&&event.source===$('getting-started-preview-frame')?.contentWindow&&event.data?.type==='ssc-howto-preview-ready')preview();
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  return {render,preview};
})();