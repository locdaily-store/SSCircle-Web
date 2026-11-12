/* V10.55: public results of approved community events, privacy-aware. */
(()=>{'use strict';
 const root=document.getElementById('community55-hall-of-fame');if(!root)return;
 const e=(tag,cls='',txt='')=>{const node=document.createElement(tag);if(cls)node.className=cls;if(txt)node.textContent=txt;return node;};
 async function render(){
   try{
     const response=await fetch('/api/community/hall-of-fame',{cache:'no-store'});
     if(!response.ok)return;
     const data=await response.json();
     if(!data.items?.length)return;
     root.replaceChildren(e('h2','','Community Event Hall of Fame'));
     root.append(e('p','c55-note','Pemenang kegiatan SSCircle yang sudah disetujui pengurus dan dicatat ke riwayat komunitas.'));
     const list=e('div','c55-admin-grid');
     for(const item of data.items){
       const card=e('article','c55-mini-card');
       card.append(e('small','','Juara '+item.rank),e('strong','',item.winner),
         e('span','',item.eventTitle),e('small','',item.label));
       list.append(card);
     }
     root.append(list);
   }catch{root.replaceChildren();}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
})();