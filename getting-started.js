/* Public getting-started guide. Never execute administrator-authored HTML. */
'use strict';
(() => {
  const $=id=>document.getElementById(id), defaults=window.SSCircleGettingStartedDefaults;
  if(!defaults||!$('howto-main'))return;
  const key='sscircle-guide-progress-v1';
  let config=defaults,sections=[],active=0,step=0,completed=new Set();
  try { const entries=JSON.parse(localStorage.getItem(key)||'[]'); if(Array.isArray(entries))completed=new Set(entries.filter(x=>typeof x==='string'&&x.length<120)); } catch{}
  const saveProgress=()=>{try{localStorage.setItem(key,JSON.stringify([...completed].slice(0,200)));}catch{}};
  const markKey=(s,i)=>s.id+':'+i;
  const node=(tag,className='',text)=>{const n=document.createElement(tag);n.className=className;if(text!==undefined)n.textContent=text;return n;};
  const safeLink=href=>{
    if(typeof href!=='string')return '';
    if(/^\/(?!\/)[a-z0-9/_#.?=&%-]+$/i.test(href))return href;
    if(/^https:\/\/(discord\.gg|discord\.com)\/[a-z0-9/_?=&%-]+$/i.test(href))return href;
    return '';
  };
  const safeImage=src=>{if(typeof src!=='string')return '';if(/^(?:\/api\/media\/[a-f0-9-]{36}|assets\/[a-z0-9/_-]+\.(?:webp|png|jpg|jpeg))$/i.test(src))return src;try{const u=new URL(src);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}};
  const embedVideo=value=>{
    if(typeof value!=='string')return '';
    try{const u=new URL(value);if(u.protocol!=='https:')return '';
      const host=u.hostname.toLowerCase();
      let id='';
      if(host==='youtu.be')id=u.pathname.slice(1);
      else if(host==='youtube.com'||host==='www.youtube.com')id=u.pathname.startsWith('/embed/')?u.pathname.slice(7):u.searchParams.get('v')||'';
      return /^[a-zA-Z0-9_-]{11}$/.test(id)?'https://www.youtube-nocookie.com/embed/'+id:'';
    }catch{return '';}
  };
  const normalized=c=>{
    const actual=typeof c==='object'&&c?c:{};
    return {enabled:actual.enabled!==false,title:String(actual.title||defaults.title),subtitle:String(actual.subtitle||defaults.subtitle),
      sections:Array.isArray(actual.sections)&&actual.sections.length?actual.sections:defaults.sections,
      faq:Array.isArray(actual.faq)?actual.faq:defaults.faq};
  };
  const updateCount=()=>{
    $('howto-total').textContent=String(sections.length);
    let count=0;for(const s of sections)for(let i=0;i<s.steps.length;i++)if(completed.has(markKey(s,i)))count++;
    $('howto-progress-count').textContent=String(count);
  };
  function renderCategories(filter=''){
    const root=$('howto-category-list');root.replaceChildren();
    let matches=0;
    sections.forEach((s,i)=>{
      const haystack=[s.title,s.summary,...(s.steps||[]).flatMap(t=>[t.title,t.text])].join(' ').toLowerCase();
      if(!haystack.includes(filter))return;
      matches++;
      const button=node('button','howto-category'+(active===i?' active':''));button.type='button';
      button.setAttribute('aria-pressed',String(active===i));
      button.append(node('span','howto-category-icon',s.icon||String(i+1).padStart(2,'0')));
      const body=node('span','howto-category-body');
      body.append(node('strong','',s.title),node('small','',s.summary||''));
      button.append(body);
      button.onclick=()=>{active=i;step=0;renderCategories($('howto-search').value.trim().toLowerCase());renderStep();};
      root.append(button);
    });
    $('howto-no-results').hidden=matches>0;
  }
  function renderStep(){
    const s=sections[active];if(!s)return;
    const steps=s.steps||[];step=Math.min(Math.max(0,step),Math.max(0,steps.length-1));
    const t=steps[step];if(!t)return;
    $('howto-category-kicker').textContent='PANDUAN '+String(active+1).padStart(2,'0');
    $('howto-section-title').textContent=s.title;
    $('howto-section-summary').textContent=s.summary||'';
    $('howto-step-position').textContent=(step+1)+' / '+steps.length;
    $('howto-step-number').textContent=String(step+1).padStart(2,'0');
    $('howto-step-title').textContent=t.title;
    $('howto-step-description').textContent=t.text||'';
    $('howto-back').disabled=step===0;
    $('howto-next').textContent=step===steps.length-1?'Ulangi panduan ↻':'Berikutnya →';
    $('howto-step-meter').replaceChildren(...steps.map((_,i)=>{
      const el=node('span','howto-meter-tick'+(i<=step?' current':'')+(completed.has(markKey(s,i))?' complete':''));
      el.title='Langkah '+(i+1);return el;
    }));
    const complete=$('howto-complete');
    complete.checked=completed.has(markKey(s,step));
    $('howto-progress-note').textContent=completed.has(markKey(s,step))?'Langkah ini sudah ditandai sebagai dipahami.':'Centang setelah kamu memahami langkah ini.';
    const action=$('howto-step-action');action.replaceChildren();
    const href=safeLink(t.href);
    if(href){const link=node('a','howto-button-link',t.linkLabel||'Buka halaman ↗');link.href=href;if(href.startsWith('https://')){link.target='_blank';link.rel='noopener noreferrer';}action.append(link);}
    const media=$('howto-step-media');media.replaceChildren();
    const image=safeImage(t.image);
    if(image){const img=node('img');img.src=image;img.loading='lazy';img.alt='Ilustrasi: '+t.title;media.append(img);}
    const youtube=embedVideo(t.video);
    if(youtube){const frame=node('iframe');frame.src=youtube;frame.loading='lazy';frame.title='Video tutorial '+t.title;frame.referrerPolicy='strict-origin-when-cross-origin';frame.allow='accelerometer; encrypted-media; gyroscope; picture-in-picture';frame.allowFullscreen=true;media.append(frame);}
    media.hidden=!media.childElementCount;
    $('howto-account-guide').hidden=s.id!=='link';
    updateCount();
  }
  $('howto-back').onclick=()=>{step=Math.max(0,step-1);renderStep();};
  $('howto-next').onclick=()=>{step=(step+1)%sections[active].steps.length;renderStep();};
  $('howto-complete').onchange=event=>{
    const value=markKey(sections[active],step);
    if(event.target.checked)completed.add(value);else completed.delete(value);
    saveProgress();renderStep();
  };
  $('howto-search').oninput=event=>renderCategories(event.target.value.trim().toLowerCase());
  const editionText={
    premium:'Java Premium: gunakan akun resmi Minecraft yang dimiliki, masuk ke server, lalu ikuti instruksi pairing yang ditampilkan oleh plugin dan website.',
    offline:'Non-Premium: login menggunakan username yang terdaftar di server dan selesaikan autentikasi game sebelum menghubungkan akun ke Profile.',
    bedrock:'Bedrock: gunakan alamat serta port Bedrock yang diumumkan admin. Identitas Bedrock diproses melalui integrasi server; ikuti instruksi pairing resmi yang tersedia.'
  };
  document.querySelectorAll('[data-edition]').forEach(button=>button.onclick=()=>{
    document.querySelectorAll('[data-edition]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
    $('howto-edition-description').textContent=editionText[button.dataset.edition];
  });
  $('howto-edition-description').textContent=editionText.premium;
  function renderFaq(){
    const root=$('howto-faq-list');root.replaceChildren();
    for(const faq of config.faq){
      if(!faq||!faq.question||!faq.answer)continue;
      const details=node('details','howto-faq-item');
      details.append(node('summary','',faq.question),node('p','',faq.answer));
      root.append(details);
    }
    $('faq').hidden=!root.childElementCount;
  }
  function apply(input,theme=input){
    config=normalized(input);
    window.SSCircleTheme?.apply?.(theme||{});
    $('howto-title').replaceChildren(document.createTextNode(config.title),node('span','','.'));
    $('howto-description').textContent=config.subtitle;
    $('tutorials').hidden=!config.enabled;
    $('faq').hidden=!config.enabled;
    if(!config.enabled)return;
    sections=config.sections.filter(s=>s&&typeof s.id==='string'&&Array.isArray(s.steps)&&s.steps.length>0);
    if(!sections.length)sections=defaults.sections;
    if(!sections.some(s=>s.id===sections[active]?.id))active=0;
    renderCategories();renderStep();renderFaq();
  }
  apply(defaults);
  const previewMode=new URLSearchParams(location.search).has('ssc_theme_preview');
  if(previewMode){
    window.addEventListener('message',event=>{
      if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='ssc-howto-preview')return;
      apply(event.data.guide||defaults,event.data.settings||{});
      parent.postMessage({type:'ssc-howto-preview-applied'},location.origin);
    });
    if(parent!==window)parent.postMessage({type:'ssc-howto-preview-ready'},location.origin);
  }else{
    fetch('/api/form',{credentials:'same-origin',cache:'no-store'})
      .then(r=>r.ok?r.json():Promise.reject())
      .then(v=>apply(v.settings?.gettingStarted||defaults,v.settings||{}))
      .catch(()=>{});
  }
})();