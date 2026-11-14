/* SSCircle How to Play editor: validated shared site settings, no separate database. */
'use strict';
window.SSCircleHowToPlayAdmin=(()=>{
let data=null,changed=()=>{},timer=null;
const $=id=>document.getElementById(id);
const create=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;};
function defaults(){return JSON.parse(JSON.stringify(window.SSCircleHowToPlayDefaults));}
const model=()=>data.settings.howToPlay;
function edit(container,title,value,cb,multi=false){
const label=create('label','ssc-guide-field'),span=create('span','',title),input=create(multi?'textarea':'input');
if(!multi)input.type='text';else input.rows=3;
input.value=value||'';input.maxLength=multi?1400:500;input.oninput=()=>{cb(input.value);change();};
label.append(span,input);container.append(label);return input;
}
function change(){changed();clearTimeout(timer);timer=setTimeout(preview,180);}
function preview(){
const frame=$('howto-preview-frame');if(frame?.contentWindow)
frame.contentWindow.postMessage({type:'ssc-howto-preview',howToPlay:JSON.parse(JSON.stringify(model()))},location.origin);
}
function renderFaq(host){
host.replaceChildren();
model().faq.forEach((item,index)=>{
const card=create('section','ssc-guide-edit-card'),heading=create('div','ssc-guide-card-head',String(index+1)+'. Pertanyaan');
const remove=create('button','button secondary','Hapus');remove.type='button';remove.onclick=()=>{model().faq.splice(index,1);change();render();};
heading.append(remove);card.append(heading);
edit(card,'Pertanyaan',item.question,v=>item.question=v);
edit(card,'Jawaban',item.answer,v=>item.answer=v,true);
host.append(card);
});
}
function renderCategories(host){
host.replaceChildren();
model().categories.forEach((category,index)=>{
const card=create('section','ssc-guide-edit-card');
const heading=create('div','ssc-guide-card-head');
heading.append(create('strong','',String(index+1)+'. '+category.label));
for(const [name,dir] of [['↑',-1],['↓',1]]){
const b=create('button','button secondary',name);b.type='button';b.disabled=index+dir<0||index+dir>=model().categories.length;
b.setAttribute('aria-label','Pindahkan kategori '+name);
b.onclick=()=>{const list=model().categories;[list[index],list[index+dir]]=[list[index+dir],list[index]];change();render();};heading.append(b);
}
const del=create('button','button secondary','Hapus');del.type='button';del.onclick=async()=>{if(!confirm('Hapus kategori dan semua langkah di dalamnya?'))return;model().categories.splice(index,1);change();render();};heading.append(del);
card.append(heading);
edit(card,'Judul kategori',category.label,v=>{category.label=v;heading.querySelector('strong').textContent=String(index+1)+'. '+v;});
edit(card,'Ikon kecil',category.icon,v=>category.icon=v);
edit(card,'Deskripsi kategori',category.intro,v=>category.intro=v,true);
const steps=create('div','ssc-guide-step-list');
category.steps.forEach((step,j)=>{
const s=create('div','ssc-guide-step-card'),title=create('div','ssc-guide-card-head',String(j+1)+'. Langkah');
const up=create('button','button secondary','↑');up.disabled=j===0;up.type='button';up.onclick=()=>{[category.steps[j-1],category.steps[j]]=[category.steps[j],category.steps[j-1]];change();render();};
const down=create('button','button secondary','↓');down.disabled=j===category.steps.length-1;down.type='button';down.onclick=()=>{[category.steps[j+1],category.steps[j]]=[category.steps[j],category.steps[j+1]];change();render();};
const remove=create('button','button secondary','Hapus');remove.type='button';remove.onclick=()=>{if(category.steps.length<=1)return;category.steps.splice(j,1);change();render();};
title.append(up,down,remove);s.append(title);
edit(s,'Judul langkah',step.title,v=>step.title=v);
edit(s,'Penjelasan',step.body,v=>step.body=v,true);
edit(s,'Catatan (opsional)',step.tip,v=>step.tip=v);
edit(s,'Tautan tombol (opsional)',step.url,v=>step.url=v);
edit(s,'Teks tombol (opsional)',step.link,v=>step.link=v);
edit(s,'Gambar: assets/ atau /api/media/ (opsional)',step.image,v=>step.image=v);
edit(s,'Link video YouTube (opsional)',step.video,v=>step.video=v);
steps.append(s);
});
card.append(steps);
const addStep=create('button','button secondary','+ Tambah langkah');addStep.type='button';addStep.onclick=()=>{if(category.steps.length>=12)return alert('Maksimal 12 langkah per kategori.');category.steps.push({title:'Langkah baru',body:'Tulis penjelasan tutorial.'});change();render();};card.append(addStep);host.append(card);
});
}
function render(){
if(!data)return;
const basic=$('howto-admin-general'),cat=$('howto-admin-categories'),faq=$('howto-admin-faq');if(!basic||!cat||!faq)return;
const guide=model();basic.replaceChildren();
const toggle=create('label','ssc-guide-toggle'),input=create('input');input.type='checkbox';input.checked=guide.enabled!==false;input.onchange=()=>{guide.enabled=input.checked;change();};
toggle.append(input,create('span','','Terbitkan halaman How to Play'));basic.append(toggle);
edit(basic,'Judul halaman',guide.title,v=>guide.title=v);edit(basic,'Subjudul',guide.subtitle,v=>guide.subtitle=v);
renderCategories(cat);renderFaq(faq);
}
function init(){
$('howto-admin-save')?.addEventListener('click',()=>document.getElementById('save')?.click());
$('howto-admin-add-category')?.addEventListener('click',()=>{
if(!data)return;if(model().categories.length>=12)return alert('Maksimal 12 kategori.');
model().categories.push({id:'guide-'+Math.random().toString(36).slice(2,10),label:'Panduan baru',icon:'✦',intro:'',steps:[{title:'Langkah pertama',body:'Tulis penjelasan.'}]});change();render();
});
$('howto-admin-add-faq')?.addEventListener('click',()=>{if(!data)return;if(model().faq.length>=24)return alert('Maksimal 24 FAQ.');model().faq.push({question:'Pertanyaan baru',answer:'Jawaban singkat.'});change();render();});
$('howto-admin-reset')?.addEventListener('click',()=>{if(!data||!confirm('Kembalikan seluruh tutorial bawaan? Konten kustom belum tersimpan akan digantikan.'))return;data.settings.howToPlay=defaults();change();render();});
$('howto-preview-frame')?.addEventListener('load',preview);
$('howto-preview-mobile')?.addEventListener('click',()=>{$('howto-preview-shell').dataset.device='mobile';});
$('howto-preview-desktop')?.addEventListener('click',()=>{$('howto-preview-shell').dataset.device='desktop';});
}
function attach(payload,mark){
data=payload;changed=mark;
if(!data.settings.howToPlay||!Array.isArray(data.settings.howToPlay.categories))data.settings.howToPlay=defaults();
render();preview();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
return {render:attach,preview};
})();