/* SSCircle V10.48 • private operational monitoring UI.
   Never interpret server/player labels as HTML. All values use textContent. */
'use strict';
window.SSCircleMinecraftSyncAdmin=(()=>{
  const root=document.getElementById('minecraft-sync-root');
  const el=(tag,cls='',text)=>{const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(text!==undefined)node.textContent=String(text);
    return node;};
  const button=(label,cb,cls='button secondary')=>{
    const b=el('button',cls,label);b.type='button';b.onclick=cb;return b;};
  const locale='id-ID';
  const stamp=(raw)=>{
    const value=Date.parse(raw||'');
    return Number.isFinite(value)?new Date(value).toLocaleString(locale):'Belum tersedia';};
  const num=(v)=>new Intl.NumberFormat(locale).format(Number(v)||0);
  const types={java_premium:'Minecraft Java Premium',
    java_non_premium:'Minecraft Java (sesi offline)',
    java_unverified:'Minecraft Java (Premium belum terverifikasi)',
    bedrock:'Minecraft Bedrock'};
  const eventText={IDLE:'Menunggu pengiriman',SYNC_OK:'Berhasil',
    QUEUE_PENDING:'Menunggu pengiriman',NETWORK_ERROR:'Gangguan jaringan',
    HTTP_ERROR:'Permintaan gagal',AUTH_ERROR:'Masalah autentikasi'};
  let multi=null,multiAudit=[],state=null,loading=false,offset=0,term='',filter='all',searchTimer=null;
  async function api(path,options={}){
    const res=await fetch(path,{credentials:'same-origin',cache:'no-store',
      headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})},...options});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw Error(data.error||'Tidak bisa mengambil informasi sinkronisasi.');
    return data;
  }
  const status=(text,error=false)=>{
    const node=document.getElementById('ssc-sync-notice');
    if(node){node.textContent=text;node.dataset.error=String(error);}
  };
  function metric(title,value,detail,icon){
    const card=el('article','ssc-sync-metric');
    const head=el('div','ssc-sync-metric-head');
    head.append(el('span','ssc-sync-glyph',icon),el('span','',title));
    card.append(head,el('strong','ssc-sync-metric-number',value),
      el('small','',detail));
    return card;
  }
  function render(){
    if(!root||!state)return;
    root.replaceChildren();
    const bar=el('div','ssc-sync-toolbar panel');
    const left=el('div','ssc-sync-toolbar-text');
    left.append(el('strong','','Kesehatan sinkronisasi'),
      el('p','','Data terakhir yang dikirim plugin. Tidak mengontrol Minecraft secara langsung.'));
    const controls=el('div','ssc-sync-toolbar-buttons');
    const refresh=button('↻ Muat ulang',()=>load());
    const trigger=button('↗ Minta sinkronisasi',requestSync,'button primary');
    trigger.disabled=!!state.pendingCommand||state.connection!=='recent';
    trigger.title=state.pendingCommand?'Sudah ada permintaan yang menunggu'
      :state.connection!=='recent'?'Laporan plugin belum cukup baru':'Kirim permintaan ke antrean plugin';
    controls.append(refresh,trigger);bar.append(left,controls);
    root.append(bar);
    const notice=el('div','ssc-sync-notice');notice.id='ssc-sync-notice';notice.setAttribute('role','status');
    root.append(notice);
    const telemetry=state.telemetry,live=state.connection;
    const labels={no_data:'Belum ada laporan plugin',recent:'Laporan baru diterima',
      delayed:'Laporan terlambat',unknown:'Status belum diketahui'};
    const overview=el('section','panel ssc-sync-overview');
    const title=el('div','ssc-sync-section-head');
    title.append(el('h2','','Ringkasan server'),el('span','ssc-sync-indicator',labels[live]||labels.unknown));
    title.lastChild.dataset.state=live;
    overview.append(title);
    const metrics=el('div','ssc-sync-metrics');
    metrics.append(
      metric('Akun Minecraft tertaut',num(state.summary.linked),'Akun yang sudah dikonfirmasi','♧'),
      metric('Belum ada statistik',num(state.summary.noStats),'Akun tertaut tanpa snapshot','◷'),
      metric('Snapshot tertunda',telemetry?num(telemetry.pendingSnapshots):'—',
        'Dari heartbeat terakhir','⇅'),
      metric('Pemain terlapor',telemetry?num(telemetry.onlinePlayers):'—',
        'Bukan pengukuran real-time browser','♟'));
    overview.append(metrics);
    const foot=el('div','ssc-sync-facts');
    const facts=[
      ['Laporan terakhir',stamp(telemetry?.lastSeenAt)],
      ['Sinkron terakhir berhasil',stamp(telemetry?.lastSuccessAt)],
      ['Status pengiriman',telemetry?(eventText[telemetry.deliveryCode]||'Belum diketahui'):'Belum ada laporan'],
      ['Plugin Paper',telemetry?'V'+telemetry.pluginVersion:'Belum terlapor'],
      ['Antrean pengambilan',telemetry?num(telemetry.captureBacklog):'—'],
      ['TPS rata-rata 1 menit',Number.isFinite(telemetry?.tps1m)?Number(telemetry.tps1m).toFixed(2):'—']
    ];
    for(const [label,value] of facts){
      const item=el('div','ssc-sync-fact');
      item.append(el('span','',label),el('strong','',value));foot.append(item);
    }
    overview.append(foot);
    if(state.pendingCommand){
      overview.append(el('p','ssc-sync-pending',
        'Permintaan sinkronisasi menunggu plugin: sejak '+stamp(state.pendingCommand.createdAt)+
        '. Akan kedaluwarsa '+stamp(state.pendingCommand.expiresAt)+'.'));
    }
    root.append(overview);
    if(multi){
      const section=el('section','panel ssc-multi-settings');
      section.append(el('h2','','Multi-Account Linking'),
        el('p','ssc-sync-subtitle','Batasi jumlah identitas Minecraft per anggota. Mengurangi batas tidak memutus tautan yang sudah ada.'));
      const fields=el('div','ssc-multi-fields');
      const enabledLabel=el('label','ssc-multi-field');
      const enabled=el('input');enabled.type='checkbox';enabled.checked=multi.enabled===true;
      enabledLabel.append(enabled,el('span','','Izinkan anggota menambahkan akun Minecraft'));
      const limitLabel=el('label','ssc-multi-field');
      limitLabel.append(el('span','','Maksimal akun per anggota'));
      const max=el('select');
      for(let count=1;count<=5;count++){
        const option=el('option','',count+' akun');option.value=String(count);max.append(option);
      }
      max.value=String(multi.maxAccounts||3);limitLabel.append(max);
      const save=button('Simpan batas akun',async()=>{
        save.disabled=true;
        try{
          multi=await api('/api/admin/minecraft/multi-account',{
            method:'PUT',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({enabled:enabled.checked,maxAccounts:Number(max.value)})});
          status('Pengaturan Multi-Account telah tersimpan.');
          await load();
        }catch(error){status(error.message,true);save.disabled=false;}
      },'button primary');
      fields.append(enabledLabel,limitLabel,save);
      section.append(fields);
      if(multiAudit.length){
        const audit=el('div','ssc-multi-audit');
        audit.append(el('h3','','Perubahan tautan terbaru'));
        for(const item of multiAudit.slice(0,8)){
          const labels={linked:'Ditautkan',unlinked:'Diputus',primary_changed:'Akun utama diubah'};
          const line=el('div','ssc-multi-audit-row');
          line.append(el('span','',(labels[item.action]||'Aktivitas')+' · '+item.username),
            el('small','',stamp(item.at)));
          audit.append(line);
        }
        section.append(audit);
      }
      root.append(section);
    }
    const accounts=el('section','panel ssc-sync-accounts');
    accounts.append(el('h2','','Akun & status statistik'));
    accounts.append(el('p','ssc-sync-subtitle',
      'Pencarian dan filter berlaku untuk seluruh akun tertaut. Pemain offline tidak dianggap gagal hanya karena statistiknya lama.'));
    const filters=el('div','ssc-sync-filters');
    const search=el('input');search.type='search';search.value=term;search.placeholder='Cari nama akun atau anggota';
    search.setAttribute('aria-label','Cari akun Minecraft');
    search.oninput=()=>{
      term=search.value;offset=0;
      clearTimeout(searchTimer);
      searchTimer=setTimeout(()=>void load({focusSearch:true}),400);
    };
    const selection=el('select');
    selection.setAttribute('aria-label','Filter status statistik');
    for(const [value,label] of [['all','Semua akun'],['synced','Ada statistik'],['missing','Belum ada statistik']]){
      const o=el('option','',label);o.value=value;selection.append(o);
    }
    selection.value=filter;selection.onchange=()=>{filter=selection.value;offset=0;void load();};
    filters.append(search,selection);accounts.append(filters);
    const table=el('div','ssc-sync-account-list');accounts.append(table);
    const pagination=el('div','ssc-sync-pagination');
    const previous=button('← Sebelumnya',()=>{offset=Math.max(0,offset-100);load();});
    const next=button('Berikutnya →',()=>{offset+=100;load();});
    previous.disabled=offset===0;next.disabled=!state.hasMore;
    pagination.append(previous,el('span','',('Halaman '+(Math.floor(offset/100)+1))),
      next);
    accounts.append(pagination);root.append(accounts);
    paintAccounts(table);
    const history=el('section','panel ssc-sync-events');
    history.append(el('h2','','Riwayat sinkronisasi'),el('p','ssc-sync-subtitle',
      'Hanya perubahan status yang dicatat; tidak menyimpan secret, password, atau isi chat pemain.'));
    if(!state.events.length){
      history.append(el('p','ssc-sync-empty','Belum ada perubahan status tercatat.'));
    }else for(const event of state.events){
      const line=el('div','ssc-sync-event');
      const dot=el('span','ssc-sync-event-dot');
      dot.dataset.state=event.code==='SYNC_OK'?'ok':
        ['NETWORK_ERROR','HTTP_ERROR','AUTH_ERROR'].includes(event.code)?'error':'idle';
      line.append(dot,el('span','',event.details||eventText[event.code]||'Aktivitas'),
        el('small','',stamp(event.at)));history.append(line);
    }
    root.append(history);
  }
  function paintAccounts(container){
    container.replaceChildren();
    let accounts=state.accounts||[];
    // Backend applies filters across all linked accounts, not just this page.
    if(!accounts.length){
      container.append(el('p','ssc-sync-empty',
        'Belum ada akun yang cocok dengan pencarian atau filter.'));return;
    }
    for(const a of accounts){
      const item=el('div','ssc-sync-account');
      const info=el('div','ssc-sync-account-info');
      info.append(el('strong','',a.username),el('small','',
        (types[a.edition]||'Minecraft')+' · '+a.memberName));
      const date=el('div','ssc-sync-account-date');
      date.append(el('strong','',a.lastSyncAt?'Sudah ada statistik':'Menunggu statistik'),
        el('small','',a.lastSyncAt?stamp(a.lastSyncAt):'Belum ada sinkronisasi'));
      const warnings={
        NAMA_SAMA_PERIKSA:'Ada nama akun yang sama pada tautan lain. Periksa kepemilikan sebelum recovery.',
        PREMIUM_BELUM_VERIFIKASI:'Sesi Java belum membuktikan Premium. Periksa AuthMe dan FastLoginPlus.',
        SESI_OFFLINE_BELUM_PREMIUM:'Koneksi terakhir memakai login offline. Ini bukan bukti bahwa pemilik tidak membeli Minecraft original. Periksa verifikasi sesi FastLoginPlus.',
        BUKTI_LOGIN_LAMA:'Bukti sesi sudah lebih dari 7 hari. Status Java akan terlihat belum terverifikasi sampai bukti terbaru berhasil dikirim.',
        BUKTI_BEDROCK_BELUM_TERSEDIA:'Bukti Floodgate belum tersedia pada akun ini.'
      };
      for(const code of (Array.isArray(a.securityWarnings)?a.securityWarnings:[])){
        if(warnings[code]){
          const warning=el('small','ssc-sync-account-warning','Periksa identitas: '+warnings[code]);
          info.append(warning);
        }
      }
      if(a.identityProofAt)info.append(el('small','',
        'Bukti sesi terakhir: '+stamp(a.identityProofAt)));
      item.append(info,date);container.append(item);
    }
  }
  async function load({focusSearch=false}={}){
    if(loading||!root)return;
    loading=true;
    try {
      const params=new URLSearchParams({offset:String(offset),filter,q:term.trim().slice(0,64)});
      state=await api('/api/admin/minecraft/sync?'+params.toString());
      multi=await api('/api/admin/minecraft/multi-account').catch(()=>null);
      multiAudit=(await api('/api/admin/minecraft/multi-account/audit').catch(()=>({events:[]}))).events||[];
      render();
      if(focusSearch){
        const input=root.querySelector('input[type=search]');
        input?.focus({preventScroll:true});
        input?.setSelectionRange(input.value.length,input.value.length);
      }
    }catch(error){
      if(!state){
        root.replaceChildren(el('div','panel ssc-sync-empty',
          'Belum dapat memuat monitoring: '+error.message));
      }else status(error.message,true);
    }finally{loading=false;}
  }
  async function requestSync(){
    if(!state||state.pendingCommand||loading)return;
    const btn=Array.from(root.querySelectorAll('button')).find(x=>x.textContent.includes('Minta sinkronisasi'));
    if(btn)btn.disabled=true;
    try{
      const result=await api('/api/admin/minecraft/sync/request',{
        method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      await load();
      status(result.alreadyPending?'Permintaan sebelumnya masih menunggu.':
        'Permintaan disimpan. Plugin akan mengambilnya pada heartbeat berikutnya.');
    }catch(error){
      status(error.message,true);
      if(btn)btn.disabled=false;
    }
  }
  return {load};
})();
