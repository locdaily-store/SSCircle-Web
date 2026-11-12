/* SSCircle official community settings and member awards. */
'use strict';
window.SSCircleCommunityAdmin=(()=>{
  const element=(tag,cls='',value)=>{
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(value!==undefined)node.textContent=String(value);
    return node;
  };
  const button=(label,action)=>{
    const node=element('button','button primary',label);
    node.type='button';node.addEventListener('click',action);return node;
  };
  const field=(title,control)=>{
    const item=element('label','ssc-community-admin-field');
    item.append(element('span','',title),control);return item;
  };
  const check=(title,value)=>{
    const row=element('label','member-admin-switch'),box=element('input');
    box.type='checkbox';box.checked=value;
    row.append(box,element('span','',title));return {row,box};
  };
  const api=async(path,options={})=>{
    const response=await fetch(path,{credentials:'same-origin',cache:'no-store',
      headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})},...options});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(response.status>=500
      ?'Layanan sementara tidak tersedia.':data.error||'Permintaan belum berhasil.');
    return data;
  };
  const title=(text,caption)=>{
    const head=element('div','ssc-community-admin-head');
    head.append(element('h3','',text),element('p','',caption));return head;
  };
  async function socialControls(parent,showMessage){
    const panel=element('section','ssc-community-admin');
    panel.append(title('Pengaturan komunitas','Kelola permintaan pertemanan dan badge anggota SSCircle.'));
    parent.append(panel);
    try{
      const data=await api('/api/admin/social-settings');
      const settings=data.settings||{};
      if(!panel.isConnected)return;
      const summary=data.overview||{};
      panel.append(element('p','ssc-community-overview',
        'Pertemanan aktif: '+(summary.friends||0)+' · Permintaan menunggu: '+
        (summary.pending||0)+' · Badge diberikan: '+(summary.badges||0)));
      const requests=check('Izinkan permintaan pertemanan',settings.requestsEnabled!==false);
      const badges=check('Tampilkan badge komunitas',settings.badgesEnabled!==false);
      const max=element('input');max.type='number';max.min='1';max.max='100';
      max.value=String(settings.maxPending||25);
      const save=button('Simpan pengaturan komunitas',async()=>{
        const pending=Number(max.value);
        if(!Number.isInteger(pending)||pending<1||pending>100){
          showMessage('Batas permintaan harus antara 1 dan 100.',true);return;
        }
        save.disabled=true;
        try{
          await api('/api/admin/social-settings',{method:'PUT',body:JSON.stringify({
            requestsEnabled:requests.box.checked,maxPending:pending,badgesEnabled:badges.box.checked
          })});
          showMessage('Pengaturan komunitas berhasil disimpan.');
        }catch(error){showMessage(error.message,true)}
        finally{save.disabled=false}
      });
      panel.append(requests.row,badges.row,field('Maksimal permintaan terkirim yang menunggu',max),save);
    }catch(_error){
      panel.append(element('p','member-admin-empty','Pengaturan komunitas belum dapat dimuat.'));
    }
  }
  async function awardControls(parent,snapshot,showMessage){
    const panel=element('section','ssc-community-admin');
    panel.append(title('Badge komunitas','Penghargaan dari pengurus untuk kontribusi nyata anggota server.'));
    const members=(snapshot.items||[]).filter(item=>item.status==='accepted');
    const search=element('input');search.type='search';search.maxLength=50;
    search.placeholder='Cari nama atau ID Anggota';
    const picker=element('select');
    const renderMembers=()=>{
      picker.replaceChildren();
      const q=search.value.trim().toLowerCase();let total=0;
      for(const member of members){
        const id='SSC-M'+String(member.id||'').slice(-12).toUpperCase();
        const name=member.displayName||'Anggota SSCircle';
        if(q&&!name.toLowerCase().includes(q)&&!id.toLowerCase().includes(q))continue;
        const option=element('option','',name+' · '+id);
        option.value=member.id;picker.append(option);
        if(++total>=40)break;
      }
      picker.disabled=!total;
    };
    search.addEventListener('input',renderMembers);renderMembers();
    const name=element('input');name.maxLength=50;name.placeholder='Nama penghargaan';
    const details=element('textarea');details.maxLength=160;details.rows=2;
    details.placeholder='Alasan pemberian penghargaan';
    const list=element('div','ssc-community-admin-list');
    const submit=button('Berikan badge',async()=>{
      if(!picker.value||name.value.trim().length<3){
        showMessage('Pilih penerima dan isi nama badge minimal 3 karakter.',true);return;
      }
      submit.disabled=true;
      try{
        await api('/api/admin/member-badges',{method:'POST',body:JSON.stringify({
          memberId:picker.value,title:name.value.trim(),description:details.value.trim()
        })});
        name.value='';details.value='';
        showMessage('Badge berhasil diberikan.');await refresh();
      }catch(error){showMessage(error.message,true)}
      finally{submit.disabled=false}
    });
    panel.append(field('Cari anggota',search),field('Penerima',picker),
      field('Nama badge',name),field('Keterangan',details),submit,list);
    parent.append(panel);
    async function refresh(){
      try{
        const result=await api('/api/admin/member-badges');
        if(!panel.isConnected)return;
        list.replaceChildren();
        for(const badge of result.items||[]){
          const item=element('article','ssc-community-admin-badge');
          const information=element('div');
          information.append(element('strong','',badge.title),
            element('small','',(badge.memberName||'Anggota SSCircle')+
              (badge.description?' · '+badge.description:'')));
          const remove=button('Hapus',async()=>{
            if(!window.confirm('Hapus badge ini dari profil anggota?'))return;
            remove.disabled=true;
            try{
              await api('/api/admin/member-badges',{method:'DELETE',body:JSON.stringify({id:badge.id})});
              showMessage('Badge berhasil dihapus.');await refresh();
            }catch(error){showMessage(error.message,true)}
            finally{remove.disabled=false}
          });
          remove.className='button secondary member-admin-danger';
          item.append(information,remove);list.append(item);
        }
        if(!list.childElementCount)
          list.append(element('p','member-admin-empty','Belum ada badge komunitas.'));
      }catch(_error){
        list.replaceChildren(element('p','member-admin-empty','Daftar badge belum dapat dimuat.'));
      }
    }
    await refresh();
  }
  async function render(tab,parent,snapshot,message){
    if(tab==='policy')await socialControls(parent,message);
    if(tab==='awards')await awardControls(parent,snapshot,message);
  }
  return {render};
})();
