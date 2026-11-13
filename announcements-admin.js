/* Admin Announcement: editorial settings, article CRUD, shared media picker, and live preview. */
'use strict';
window.SSCircleAnnouncementAdmin = (() => {
  const $ = id => document.getElementById(id);
  const node = (tag, cls='', value) => {
    const n = document.createElement(tag);
    if(cls)n.className=cls;
    if(value!==undefined)n.textContent=String(value);
    return n;
  };
  const defaults = { enabled:true,eyebrow:'SSCIRCLE / LATEST STORIES',
    title:'Announcement & News',subtitle:'Berita server, kabar komunitas, dan cerita terbaru dari SSCircle.',
    featuredLabel:'SOROTAN UTAMA',emptyText:'Belum ada pengumuman yang diterbitkan.' };
  let theme = {}, settings={...defaults},settingsRevision='',items=[],counts={},selected='',editor=null,loaded=false,busy=false,phone=false;
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const endpoint='/api/admin/announcements';
  const blank = () => ({id:'',title:'',excerpt:'',content:'',category:'Informasi',imageUrl:'',
    imageAlt:'',images:[],status:'draft',pinned:false,publishedAt:new Date().toISOString(),updatedAt:''});
  function status(message,error=false){
    const root=$('ann-admin-status');
    if(root){root.textContent=message||'';root.dataset.error=String(error);}
  }
  async function request(path,method='GET',value) {
    const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',
      headers:{Accept:'application/json',...(value?{'Content-Type':'application/json'}:{})},
      ...(value?{body:JSON.stringify(value)}:{})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||'Permintaan gagal ('+response.status+').');
    return data;
  }
  function field(title,key,value,max,tag='input') {
    const label=node('label','field-group'),heading=node('span','field-label',title),control=node(tag);
    if(tag==='textarea')control.rows=key==='content'?9:3;
    else control.type='text';
    control.value=value||'';
    control.maxLength=max;
    control.addEventListener('input',()=>{editor[key]=control.value;preview();});
    label.append(heading,control);
    return label;
  }
  function settingField(title,key,max,tag='input'){
    const label=node('label','field-group'),caption=node('span','field-label',title),control=node(tag);
    if(tag==='textarea')control.rows=3;else control.type='text';
    control.value=settings[key]??'';
    control.maxLength=max;
    control.oninput=()=>{settings[key]=control.value;preview();};
    label.append(caption,control);
    return label;
  }
  function button(label,action,primary=false) {
    const b=node('button','button '+(primary?'primary':'secondary'),label);
    b.type='button';b.onclick=action;return b;
  }
  function toggle(label,value,action) {
    const wrap=node('label','ann-admin-toggle'),input=node('input');
    input.type='checkbox';input.checked=!!value;input.onchange=()=>action(input.checked);
    wrap.append(input,node('span','',label));return wrap;
  }
  function shell() {
    const root=$('ann-admin-root');
    if(!root)return;
    root.replaceChildren();
    const toolbar=node('div','ann-admin-toolbar');
    const left=node('div');
    left.append(node('h2','','Daftar berita dan artikel'),node('p','field-help','Draft, berita aktif, dan publikasi terjadwal tersimpan di D1.'));
    toolbar.append(left,button('+ Buat pengumuman',()=>select(''),true));
    const cards=node('div','ann-admin-layout');
    const sidebar=node('aside','ann-admin-list-panel panel'),heading=node('div','ann-admin-list-head');
    heading.append(node('strong','', 'Artikel'),button('↻ Muat ulang',()=>void load()));
    sidebar.append(heading,node('div','ann-admin-articles'));
    sidebar.querySelector('.ann-admin-articles').id='ann-admin-articles';
    const edit=node('section','ann-admin-editor-panel panel');
    edit.id='ann-admin-editor';
    cards.append(sidebar,edit);
    const settingsPanel=node('section','ann-admin-settings panel');
    settingsPanel.append(node('h2','','Pengaturan halaman Announcement'),node('p','field-help','Teks pembuka, status halaman, dan tampilan berita dapat diatur tanpa mengubah file HTML.'));
    const fields=node('div','ann-admin-settings-fields');
    fields.id='ann-admin-settings-fields';
    settingsPanel.append(fields);
    const previewPanel=node('section','ann-admin-preview-panel panel');
    const header=node('div','ann-admin-preview-top');
    header.append(node('div','',undefined));
    header.firstChild.append(node('h2','','Live Preview'),node('p','field-help','Perubahan artikel dan pengaturan halaman dapat dilihat sebelum disimpan.'));
    const controls=node('div','ann-admin-preview-controls');
    controls.append(button('Desktop',()=>resize(false)),button('HP',()=>resize(true)),button('↻',()=>preview()));
    header.append(controls);
    const viewport=node('div','ann-admin-viewport');
    viewport.id='ann-admin-viewport';
    const iframe=node('iframe');
    iframe.id='ann-admin-preview-frame';
    iframe.title='Pratinjau halaman Announcement';
    iframe.loading='lazy';
    iframe.src='announcements.html?ssc_theme_preview=1&ssc_announcements_preview=1';
    iframe.onload=preview;
    viewport.append(iframe);
    previewPanel.append(header,viewport);
    root.append(toolbar,cards,settingsPanel,previewPanel);
    renderSettings();renderItems();renderEditor();resize(phone);
  }
  function resize(mobile) {
    phone=mobile;
    const view=$('ann-admin-viewport');
    if(view)view.classList.toggle('is-mobile',mobile);
  }
  function renderSettings(){
    const root=$('ann-admin-settings-fields');
    if(!root)return;
    root.replaceChildren();
    root.append(toggle('Aktifkan halaman Announcement',settings.enabled,v=>{settings.enabled=v;preview();}));
    const grid=node('div','ann-admin-field-grid');
    grid.append(settingField('Label kecil / eyebrow','eyebrow',90),
      settingField('Judul halaman','title',120),
      settingField('Deskripsi pembuka','subtitle',450,'textarea'),
      settingField('Label sorotan','featuredLabel',80),
      settingField('Teks jika belum ada berita','emptyText',240,'textarea'));
    root.append(grid,button('Simpan pengaturan halaman',()=>void saveSettings(),true));
  }
  function renderItems(){
    const root=$('ann-admin-articles');
    if(!root)return;
    root.replaceChildren();
    const totals=node('div','ann-admin-counts','Total '+(counts.total??items.length)+' · Terbit '+(counts.published??0)+' · Draft '+(counts.draft??0));
    root.append(totals);
    if(!items.length)root.append(node('p','field-help','Belum ada artikel. Tekan Buat pengumuman untuk memulai.'));
    for(const item of items) {
      const card=button('',()=>select(item.id));
      card.className='ann-admin-item'+(selected===item.id?' is-selected':'');
      const title=node('strong','',item.title);
      const meta=node('span','',item.category+' · '+(item.status==='published'?'Terbit':'Draft')+(item.pinned?' · Sorotan':''));
      card.append(title,meta);root.append(card);
    }
  }
  const toLocalInput = iso => {
    const d=new Date(iso||Date.now());
    return Number.isFinite(d.getTime())?new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16):'';
  };
  function renderGallery(){
    const root=$('ann-admin-gallery-images');
    if(!root||!editor)return;
    root.replaceChildren();
    editor.images.forEach((src,index)=>{
      const card=node('div','ann-admin-gallery-photo');
      const img=node('img');img.src=src;img.alt='Foto tambahan '+(index+1);img.loading='lazy';
      const remove=button('Hapus',()=>{editor.images.splice(index,1);renderGallery();preview();});
      card.append(img,remove);root.append(card);
    });
  }
  function renderEditor(){
    const root=$('ann-admin-editor');
    if(!root)return;
    root.replaceChildren();
    if(!editor){root.append(node('p','field-help','Pilih artikel untuk mengedit atau buat artikel baru.'));return;}
    const top=node('div','ann-admin-editor-heading');
    top.append(node('h2','',editor.id?'Edit berita':'Buat berita baru'));
    if(editor.id)top.append(node('span','ann-admin-state',editor.status==='published'?'Published':'Draft'));
    root.append(top);
    const grid=node('div','ann-admin-field-grid');
    grid.append(field('Judul berita','title',editor.title,140),field('Kategori','category',editor.category,48),
      field('Ringkasan / cuplikan berita','excerpt',editor.excerpt,360,'textarea'),
      field('Isi lengkap artikel','content',editor.content,12000,'textarea'));
    root.append(grid);
    const controls=node('div','ann-admin-inline-controls');
    const stateLabel=node('label','field-group'),stateSelect=node('select');
    for(const [id,label] of [['draft','Draft · belum ditampilkan'],['published','Terbitkan · tampil untuk publik']]){
      const o=node('option','',label);o.value=id;stateSelect.append(o);
    }
    stateSelect.value=editor.status;
    stateSelect.onchange=()=>{editor.status=stateSelect.value;preview();};
    stateLabel.append(node('span','field-label','Status artikel'),stateSelect);
    const dateLabel=node('label','field-group'),dateInput=node('input');
    dateInput.type='datetime-local';dateInput.value=toLocalInput(editor.publishedAt);
    dateInput.onchange=()=>{if(dateInput.value){editor.publishedAt=new Date(dateInput.value).toISOString();preview();}};
    dateLabel.append(node('span','field-label','Tanggal & jam terbit (Waktu perangkat)'),dateInput);
    controls.append(stateLabel,dateLabel);
    root.append(controls,toggle('Jadikan sorotan utama (pin berita)',editor.pinned,v=>{editor.pinned=v;preview();}));
    const cover=node('div','ann-admin-media-group');
    cover.append(node('h3','','Foto sampul'),node('p','field-help','Upload, pilih dari media, atau tempel URL gambar HTTPS seperti pada editor lainnya.'));
    const coverPreview=node('img','ann-admin-cover-preview');
    coverPreview.alt='Pratinjau sampul artikel';coverPreview.hidden=!editor.imageUrl;
    if(editor.imageUrl)coverPreview.src=editor.imageUrl;
    const picker=node('div','ann-admin-picker');
    window.SSCircleImagePicker?.mount(picker,{
      current:()=>editor.imageUrl||'',onSelect:src=>{
        editor.imageUrl=src;coverPreview.src=src;coverPreview.hidden=false;preview();
      },title:'Pilih gambar sampul'
    });
    cover.append(coverPreview,picker,field('Teks alternatif gambar (aksesibilitas)','imageAlt',editor.imageAlt,180),
      button('Hapus foto sampul',()=>{editor.imageUrl='';coverPreview.hidden=true;preview();}));
    root.append(cover);
    const gallery=node('div','ann-admin-media-group');
    gallery.append(node('h3','','Galeri foto tambahan (maksimal 8)'));
    const galleryImages=node('div','ann-admin-gallery-images');galleryImages.id='ann-admin-gallery-images';
    const galleryPicker=node('div','ann-admin-picker');
    window.SSCircleImagePicker?.mount(galleryPicker,{
      onAdd:src=>{if(!editor.images.includes(src)){editor.images.push(src);renderGallery();preview();}},
      count:()=>editor.images.length,max:8,title:'Tambah foto galeri'
    });
    gallery.append(galleryImages,galleryPicker);root.append(gallery);
    const actions=node('div','ann-admin-editor-actions');
    const save=button(editor.id?'Simpan perubahan':'Simpan artikel baru',()=>void saveArticle(),true);
    actions.append(save);
    if(editor.id)actions.append(button('Hapus artikel',()=>void deleteArticle()));
    root.append(actions);
    renderGallery();preview();
  }
  function select(id) {
    selected=id||'';
    editor=selected?clone(items.find(i=>i.id===selected)||blank()):blank();
    renderItems();renderEditor();
  }
  function preview(){
    const frame=$('ann-admin-preview-frame');
    if(!frame?.contentWindow)return;
    const all=items.map(i=>clone(i));
    if(editor){
      const index=all.findIndex(i=>i.id===editor.id);
      const draft=clone(editor);
      if(!draft.id)draft.id='preview-new-article';
      if(index>=0)all[index]=draft;
      else all.unshift(draft);
    }
    const sorted=all.sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||String(b.publishedAt).localeCompare(String(a.publishedAt)));
    frame.contentWindow.postMessage({type:'ssc-announcement-preview-state',
      settings:clone(settings),items:sorted,theme:clone(theme),activeId:''},location.origin);
    frame.contentWindow.postMessage({type:'ssc-theme-preview-settings',settings:clone(theme)},location.origin);
  }
  async function load(){
    if(busy)return;
    busy=true;status('Memuat pengumuman...');
    try{
      const result=await request(endpoint);
      settings={...defaults,...result.settings};settingsRevision=result.settingsRevision;
      items=Array.isArray(result.items)?result.items:[];counts=result.counts||{};
      selected=items.some(x=>x.id===selected)?selected:'';
      editor=selected?clone(items.find(x=>x.id===selected)):null;
      loaded=true;shell();
      status('Konten siap dikelola. Perubahan artikel belum akan tampil sebelum disimpan.');
    }catch(error){status(error.message,true);}
    finally{busy=false;}
  }
  async function saveSettings(){
    if(busy)return;
    busy=true;
    try {
      const result=await request(endpoint+'/settings','PUT',{revision:settingsRevision,settings});
      settingsRevision=result.settingsRevision;settings=result.settings;
      status('Pengaturan halaman Announcement tersimpan.');
      preview();
    }catch(error){status(error.message,true);}
    finally{busy=false;}
  }
  async function saveArticle(){
    if(busy||!editor)return;
    if(!editor.title.trim()||!editor.content.trim()){status('Judul dan isi artikel wajib diisi.',true);return;}
    busy=true;
    try{
      const original=editor.id;
      const result=await request(endpoint,original?'PUT':'POST',editor);
      selected=result.id;editor.updatedAt=result.updatedAt;
      const data=await request(endpoint);
      items=data.items;counts=data.counts;editor=clone(items.find(i=>i.id===selected));
      renderItems();renderEditor();
      status('Artikel berhasil disimpan'+(editor.status==='published'?' dan dijadwalkan/diterbitkan.': ' sebagai draft.') );
    }catch(error){status(error.message,true);}
    finally{busy=false;}
  }
  async function deleteArticle(){
    if(busy||!editor?.id)return;
    const confirmed=window.SSCNotice?.confirm?await window.SSCNotice.confirm('Hapus berita ini secara permanen? Tindakan tidak bisa dibatalkan.',{confirmText:'Hapus berita'}):confirm('Hapus berita ini permanen?');
    if(!confirmed)return;
    busy=true;
    try{
      await request(endpoint,'DELETE',{id:editor.id,updatedAt:editor.updatedAt});
      selected='';editor=null;
      const data=await request(endpoint);
      items=data.items;counts=data.counts;renderItems();renderEditor();
      status('Artikel telah dihapus.');
    }catch(error){status(error.message,true);}
    finally{busy=false;}
  }
  function render(data){theme=data?.settings||theme;}
  return {render,load};
})();
