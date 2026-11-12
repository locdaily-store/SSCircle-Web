/* SSCircle V10.55 • read-only achievement progress integrated in Profile. */
(()=>{'use strict';
 const root=document.getElementById('community55-achievements');
 if(!root)return;
 const el=(t,cl='',txt='')=>{const n=document.createElement(t);if(cl)n.className=cl;if(txt)n.textContent=txt;return n;};
 let busy=false;
 async function load(){
   if(busy)return;busy=true;
   try{
     const res=await fetch('/api/community/achievements',{credentials:'same-origin',cache:'no-store'});
     if(!res.ok){root.replaceChildren();return;}
     const data=await res.json();
     root.replaceChildren(el('h3','','Community Achievements'));
     const box=el('div','c55-achievements');
     for(const rule of data.achievements||[]){
       const row=el('article','c55-achievement');row.append(el('strong','',rule.title));
       if(rule.description)row.append(el('small','',rule.description));
       const progress=el('progress');progress.max=Math.max(1,rule.target);progress.value=rule.progress;
       row.append(progress,el('small','',rule.earnedAt?'✓ Tercapai · '+new Date(rule.earnedAt).toLocaleDateString('id-ID'):rule.progress+' / '+rule.target));
       box.append(row);
     }
     if(!data.achievements?.length)box.append(el('p','player-helper','Belum ada achievement yang aktif.'));
     if(data.awards?.length){
       box.append(el('h3','','Hasil Event Saya'));
       for(const award of data.awards){
         const card=el('article','c55-achievement');card.append(el('strong','','Juara '+award.rank),el('small','',award.label));box.append(card);
       }
     }
     root.append(box);
   }catch{root.replaceChildren();}finally{busy=false;}
 }
 document.addEventListener('DOMContentLoaded',()=>load());
 document.addEventListener('click',e=>{
   if(e.target.closest('[data-profile-tab="profile"],[data-profile-section="achievements"],a[href*="achievements"]'))load();
 });
 window.SSCircleCommunityAchievementsReload=load;
})();