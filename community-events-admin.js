/* Pengelolaan event, formulir anggota, peserta, dan achievement. */
'use strict';

(() => {
  const root = document.getElementById('community55-admin-root');
  const achievementsRoot = document.getElementById('community55-achievements-admin-root');
  if (!root || !achievementsRoot) return;

  const element = (tag, className = '', text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const request = async (path, options = {}) => {
    const response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(options.body ? {'Content-Type': 'application/json'} : {})
      },
      ...options
    });
    const payload = await response.json();
    if (!response.ok)
      throw Error(payload.error || 'Permintaan tidak berhasil diproses.');
    return payload;
  };

  const button = (text, callback, variant = 'secondary') => {
    const node = element('button', 'button ' + variant, text);
    node.type = 'button';
    node.addEventListener('click', callback);
    return node;
  };

  const field = (text, kind = 'text') => {
    const wrapper = element('label', 'c55-field');
    wrapper.append(element('span', '', text));
    const input = element('input');
    input.type = kind;
    wrapper.append(input);
    return {wrapper, input};
  };

  const formatDate = value =>
    value ? new Date(value).toLocaleString('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }) : '-';

  const feedback = element('p', 'c55-note',
    'Buka Event & Jadwal untuk memuat pengaturan komunitas.');
  const layout = element('div', 'c55-admin-grid');
  const achievementsFeedback = element('p', 'c55-note', 'Atur pencapaian dan aturan pemberian otomatis di sini.');

  function panel(title) {
    const node = element('section', 'c55-admin-card');
    node.append(element('h2', '', title));
    return node;
  }

  const formPanel = panel('Formulir pengajuan event');
  const formEditor = element('div', 'c55-admin-list');
  formPanel.append(formEditor);

  const proposalsPanel = panel('Pengajuan dari anggota');
  const proposalList = element('div', 'c55-admin-list');
  proposalsPanel.append(proposalList);

  const participantsPanel = panel('Peserta, Check-In & Pemenang');
  const eventSelect = element('select', 'c55-field-input');
  const participantList = element('div', 'c55-admin-list');
  participantsPanel.append(eventSelect, participantList);

  const achievementsPanel = panel('Pengaturan achievement');
  const rulesList = element('div', 'c55-admin-list');
  achievementsPanel.append(rulesList);

  layout.append(formPanel, proposalsPanel, participantsPanel);
  root.append(feedback, layout);
  achievementsRoot.append(achievementsFeedback, achievementsPanel);

  const CORE_TYPES = {
    executor: 'text',
    title: 'text',
    technical: 'textarea',
    startAt: 'datetime-local',
    prizes: 'prizes'
  };

  const TYPES = [
    ['text', 'Teks pendek'],
    ['textarea', 'Paragraf panjang'],
    ['number', 'Angka'],
    ['date', 'Tanggal'],
    ['select', 'Dropdown pilihan']
  ];

  let formPolicy = null;
  let formRevision = '';
  let pendingEdits = false;
  let proposals = [];
  let events = [];
  let checking = false;
  let badgeTimer = null;
  const pendingBadge = document.getElementById('community-event-badge');
  const noteAchievements = (value, error = false) => {
    achievementsFeedback.textContent = value;
    achievementsFeedback.className = 'c55-note' + (error ? ' error' : '');
  };

  function notify(text, error = false) {
    feedback.textContent = text;
    feedback.className = 'c55-note' + (error ? ' error' : '');
  }
  async function refreshBadge() {
    if(!pendingBadge || document.getElementById('dashboard')?.classList.contains('hide'))return;
    try{
      const result=await request('/api/admin/community/events/pending-count');
      const count=Math.max(0,Number(result.pending)||0);
      pendingBadge.hidden=count===0;
      pendingBadge.textContent=count>99?'99+':String(count);
      pendingBadge.setAttribute('aria-label',count+' pengajuan event menunggu');
      pendingBadge.closest('[data-tab]')?.classList.toggle('has-pending-event',count>0);
    }catch{
      // Transient offline states keep the navigation usable without inventing a count.
      pendingBadge.hidden=true;
    }
  }
  function startBadge() {
    if(!pendingBadge || badgeTimer)return;
    void refreshBadge();
    badgeTimer=setInterval(()=>{if(!document.hidden)void refreshBadge();},45000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshBadge();});
    window.addEventListener('focus',()=>void refreshBadge());
  }

  function select(options, value) {
    const node = element('select');
    for (const [key, label] of options) {
      const option = element('option', '', label);
      option.value = key;
      node.append(option);
    }
    node.value = value;
    return node;
  }

  function numericSetting(wrapper, label, key, min, max) {
    const entry = field(label, 'number');
    entry.input.min = String(min);
    entry.input.max = String(max);
    entry.input.step = '1';
    entry.input.value = String(formPolicy[key]);
    entry.input.addEventListener('input', () => {
      formPolicy[key] = Number(entry.input.value);
      pendingEdits = true;
    });
    wrapper.append(entry.wrapper);
  }

  function renderFormEditor() {
    if (!formPolicy) return;
    formEditor.replaceChildren();

    const help = element('p', 'c55-note',
      'Atur teks, urutan, jenis jawaban, dan pertanyaan tambahan. Nama event serta tanggal mulai wajib ada agar kegiatan dapat dijadwalkan.');
    formEditor.append(help);

    const toggle = element('label', 'c55-field c55-check-row');
    const enabled = element('input');
    enabled.type = 'checkbox';
    enabled.checked = formPolicy.enabled;
    enabled.addEventListener('change', () => {
      formPolicy.enabled = enabled.checked;
      pendingEdits = true;
    });
    toggle.append(enabled, element('span', '', 'Izinkan anggota mengajukan event'));
    formEditor.append(toggle);

    numericSetting(formEditor, 'Maksimal pengajuan menunggu per anggota (1–10)',
      'maxPending', 1, 10);
    numericSetting(formEditor, 'Kuota peserta awal (1–500)',
      'defaultCapacity', 1, 500);
    numericSetting(formEditor, 'Minimal jeda sebelum mulai (jam, 1–168)',
      'minNoticeHours', 1, 168);
    numericSetting(formEditor, 'Maksimal peringkat hadiah (1–20)',
      'maxPrizes', 1, 20);

    const questions = element('div', 'c55-question-list');
    formPolicy.fields.forEach((question, index) => {
      const card = element('article', 'c55-mini-card c55-question-entry');
      const heading = element('div', 'c55-admin-actions');
      heading.append(element('strong', '', 'Pertanyaan ' + (index + 1)));
      const move = delta => {
        const next = index + delta;
        if (next < 0 || next >= formPolicy.fields.length) return;
        const items = formPolicy.fields;
        items.splice(next, 0, items.splice(index, 1)[0]);
        pendingEdits = true;
        renderFormEditor();
      };

      const up = button('↑ Naik', () => move(-1));
      up.disabled = index === 0;
      const down = button('↓ Turun', () => move(1));
      down.disabled = index === formPolicy.fields.length - 1;
      heading.append(up, down);

      if (!['title', 'startAt'].includes(question.id)) {
        heading.append(button('Hapus', async () => {
          const message = 'Hapus pertanyaan "' + question.label + '" dari formulir berikutnya?';
          const approved = window.SSCNotice?.confirm
            ? await window.SSCNotice.confirm(message, {danger: true, confirmText: 'Hapus'})
            : await window.SSCircleDialog.confirm(message);
          if (!approved) return;
          formPolicy.fields.splice(index, 1);
          pendingEdits = true;
          renderFormEditor();
        }));
      }
      card.append(heading);

      const title = field('Judul pertanyaan');
      title.input.maxLength = 160;
      title.input.value = question.label;
      title.input.addEventListener('input', () => {
        question.label = title.input.value;
        pendingEdits = true;
      });
      card.append(title.wrapper);

      const type = element('label', 'c55-field');
      type.append(element('span', '', 'Jenis jawaban'));
      const typeOptions = Object.hasOwn(CORE_TYPES, question.id)
        ? [[CORE_TYPES[question.id], CORE_TYPES[question.id]]]
        : TYPES;
      const typeSelect = select(typeOptions, question.type);
      typeSelect.disabled = Object.hasOwn(CORE_TYPES, question.id);
      typeSelect.addEventListener('change', () => {
        question.type = typeSelect.value;
        question.options = question.type === 'select'
          ? ['Pilihan 1', 'Pilihan 2'] : [];
        pendingEdits = true;
        renderFormEditor();
      });
      type.append(typeSelect);
      card.append(type);

      const placeholder = field('Placeholder (opsional)');
      placeholder.input.maxLength = 180;
      placeholder.input.value = question.placeholder || '';
      placeholder.input.addEventListener('input', () => {
        question.placeholder = placeholder.input.value;
        pendingEdits = true;
      });
      card.append(placeholder.wrapper);

      const requiredLabel = element('label', 'c55-field c55-check-row');
      const required = element('input');
      required.type = 'checkbox';
      required.checked = question.required;
      required.disabled = ['title', 'startAt'].includes(question.id);
      required.addEventListener('change', () => {
        question.required = required.checked;
        pendingEdits = true;
      });
      requiredLabel.append(required, element('span', '', 'Wajib dijawab'));
      card.append(requiredLabel);

      if (question.type === 'select') {
        const choices = element('label', 'c55-field');
        choices.append(element('span', '', 'Pilihan dropdown (satu pilihan per baris)'));
        const textarea = element('textarea');
        textarea.rows = 4;
        textarea.value = (question.options || []).join('\n');
        textarea.addEventListener('input', () => {
          question.options = textarea.value.split(/\r?\n/)
            .map(line => line.trim()).filter(Boolean);
          pendingEdits = true;
        });
        choices.append(textarea);
        card.append(choices);
      }

      questions.append(card);
    });
    formEditor.append(questions);
    window.SSCircleSort?.attach(questions, {
      item: '.c55-question-entry',
      handleTarget: '.c55-admin-actions',
      onMove: (from, to) => {
        const fields = formPolicy.fields;
        fields.splice(to, 0, fields.splice(from, 1)[0]);
        pendingEdits = true;
        renderFormEditor();
      }
    });

    const add = button('+ Tambah pertanyaan', () => {
      if (formPolicy.fields.length >= 20) return notify('Maksimal 20 pertanyaan.', true);
      const id = 'custom_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      formPolicy.fields.push({
        id, label: 'Pertanyaan baru', type: 'text',
        required: false, placeholder: '', options: []
      });
      pendingEdits = true;
      renderFormEditor();
    });
    add.disabled = formPolicy.fields.length >= 20;

    const save = button('Simpan pengaturan formulir', async () => {
      save.disabled = true;
      notify('Menyimpan pengaturan formulir...');
      try {
        const response = await request('/api/admin/community/events/form', {
          method: 'PUT',
          body: JSON.stringify({revision: formRevision, settings: formPolicy})
        });
        formRevision = response.revision;
        pendingEdits = false;
        notify('Pengaturan formulir event berhasil disimpan.');
      } catch (error) {
        notify(error.message, true);
      } finally {
        save.disabled = false;
      }
    }, 'primary');

    const optionalDefaults = [
      {id: 'executor', label: 'Nama pelaksana / staff event', type: 'text',
        required: true, placeholder: 'Nama pelaksana atau tim', options: []},
      {id: 'technical', label: 'Teknis / Sistem pelaksanaan', type: 'textarea',
        required: true, placeholder: 'Aturan pelaksanaan event', options: []},
      {id: 'prizes', label: 'Hadiah untuk para pemenang', type: 'prizes',
        required: true, placeholder: 'Hadiah Juara', options: []}
    ];

    const actions = element('div', 'c55-admin-actions');
    actions.append(add);
    for (const preset of optionalDefaults) {
      if (formPolicy.fields.some(field => field.id === preset.id)) continue;
      const restore = button('+ Pulihkan ' + preset.label, () => {
        if (formPolicy.fields.length >= 20)
          return notify('Maksimal 20 pertanyaan.', true);
        formPolicy.fields.push({...preset});
        pendingEdits = true;
        renderFormEditor();
      });
      actions.append(restore);
    }
    actions.append(save);
    formEditor.append(actions);
    formEditor.append(element('p', 'c55-note',
      'Pertanyaan baru dipakai pada pengajuan berikutnya. Jawaban dari pengajuan lama tetap tersimpan.'));
  }

  function renderProposals() {
    proposalList.replaceChildren();
    for (const item of proposals) {
      const card = element('article', 'c55-mini-card');
      const state = item.status === 'pending' ? 'Menunggu persetujuan' :
        item.status === 'approved' ? 'Disetujui' : 'Ditolak';
      card.append(
        element('strong', '', item.title),
        element('small', '', 'Pelaksana: ' + (item.executor || '-') + ' · ' +
          formatDate(item.start_at)),
        element('small', '', 'Status: ' + state)
      );

      if (item.formFields && item.formAnswers) {
        for (const question of item.formFields) {
          const answer = item.formAnswers[question.id];
          const value = Array.isArray(answer)
            ? answer.map((text, index) => 'Juara ' + (index + 1) + ': ' + text).join('\n')
            : String(answer ?? '');
          if (value) {
            card.append(element('small', '', question.label));
            card.append(element('p', '', value));
          }
        }
      } else {
        card.append(element('p', '', item.technical || ''));
        const prizes = JSON.parse(item.prizes_json || '[]');
        for (const prize of prizes)
          card.append(element('small', '', 'Juara ' + prize.rank + ': ' + prize.prize));
      }

      if (item.status === 'pending') {
        const capacity = field('Kuota peserta', 'number');
        capacity.input.min = '1';
        capacity.input.max = '500';
        capacity.input.value = String(formPolicy?.defaultCapacity || 40);
        const reason = field('Alasan (wajib apabila ditolak)');
        reason.input.maxLength = 500;
        card.append(capacity.wrapper, reason.wrapper);

        const review = async action => {
          try {
            await request('/api/admin/community/events/review', {
              method: 'POST',
              body: JSON.stringify({
                id: item.id,
                action,
                capacity: Number(capacity.input.value),
                reason: reason.input.value
              })
            });
            await loadEvents({keepForm: true});
            await refreshBadge();
          } catch (error) {
            notify(error.message, true);
          }
        };

        const actions = element('div', 'c55-admin-actions');
        actions.append(
          button('Setujui', () => review('approved'), 'primary'),
          button('Tolak', () => review('rejected'))
        );
        card.append(actions);
      } else if (item.reason) {
        card.append(element('p', 'c55-note', 'Alasan: ' + item.reason));
      }
      proposalList.append(card);
    }
    if (!proposals.length)
      proposalList.append(element('p', 'c55-note', 'Belum ada pengajuan event.'));
  }

  function renderEventSelect() {
    const previous = eventSelect.value;
    eventSelect.replaceChildren(element('option', '', 'Pilih event untuk melihat peserta'));
    for (const event of events) {
      const option = element('option', '', event.title + ' · ' + formatDate(event.startAt));
      option.value = event.id;
      eventSelect.append(option);
    }
    if (events.some(event => event.id === previous)) {
      eventSelect.value = previous;
      loadParticipants();
    }
  }

  async function loadParticipants() {
    const id = eventSelect.value;
    participantList.replaceChildren();
    if (!id) return;
    try {
      const data = await request('/api/admin/community/events?eventId=' + encodeURIComponent(id));
      for (const participant of data.signups || []) {
        const card = element('article', 'c55-mini-card');
        card.append(
          element('strong', '', participant.member_id),
          element('small', '', 'Status: ' + participant.state)
        );
        if (participant.state === 'registered') {
          card.append(button('Tandai hadir', async () => {
            try {
              await request('/api/admin/community/events/check-in', {
                method: 'POST',
                body: JSON.stringify({eventId: id, memberId: participant.member_id})
              });
              await loadParticipants();
            } catch (error) {
              notify(error.message, true);
            }
          }));
        } else if (participant.state === 'attended') {
          const rank = field('Nomor juara', 'number');
          rank.input.min = '1';
          rank.input.max = '20';
          rank.input.value = '1';
          const award = field('Hadiah atau keterangan');
          const action = button('Berikan penghargaan', async () => {
            try {
              await request('/api/admin/community/events/award', {
                method: 'POST',
                body: JSON.stringify({
                  eventId: id,
                  memberId: participant.member_id,
                  rank: Number(rank.input.value),
                  label: award.input.value
                })
              });
              notify('Penghargaan berhasil diberikan.');
              await loadParticipants();
            } catch (error) {
              notify(error.message, true);
            }
          });
          card.append(rank.wrapper, award.wrapper, action);
        }
        participantList.append(card);
      }

      if (!data.signups?.length)
        participantList.append(element('p', 'c55-note', 'Belum ada peserta.'));
      for (const award of data.awards || []) {
        participantList.append(element('p', 'c55-note',
          'Juara ' + award.rank + ' · ' + award.member_id + ' · ' + award.label));
      }
    } catch (error) {
      notify(error.message, true);
    }
  }
  eventSelect.addEventListener('change', loadParticipants);

  async function recheckAll() {
    if(checking)return;
    checking=true;
    let checked=0,granted=0,cursor='',completed=false;
    try{
      for(let page=0;page<100;page++){
        const result=await request('/api/admin/community/achievements/recheck',{
          method:'POST',body:JSON.stringify({afterId:cursor})
        });
        checked+=Number(result.checked||0);
        granted+=Number(result.granted||0);
        cursor=result.nextCursor||cursor;
        noteAchievements('Memeriksa '+checked+' anggota · '+granted+' achievement baru diberikan...');
        if(result.done){completed=true;break;}
      }
      noteAchievements((completed?'Pemeriksaan selesai. ':'Batas pemeriksaan tercapai, jalankan lagi untuk anggota berikutnya. ')+
        checked+' anggota diperiksa · '+granted+' pencapaian baru diberikan.');
      const response=await request('/api/admin/community/achievements');
      renderRules(response.rules||[]);
    }catch(error){noteAchievements('Pemeriksaan berhenti setelah '+checked+' anggota: '+error.message,true);}
    finally{checking=false;}
  }
  function renderRules(rules) {
    rulesList.replaceChildren();
    const help=element('div','c55-achievement-guide');
    help.append(element('strong','','Pemberian achievement otomatis'),
      element('p','c55-note','Atur metrik, target, dan aktifkan pemberian otomatis. Pencapaian diproses saat statistik Minecraft masuk, peserta hadir, atau profil anggota dibuka. Aturan yang baru dibuat juga bisa diterapkan kepada anggota yang sudah memenuhi syarat.'));
    rulesList.append(help);
    const kinds=[
      ['playtime_hours','Playtime (jam)'],
      ['mob_kills','Mob terbunuh'],
      ['deaths','Jumlah kematian'],
      ['blocks_mined','Blok ditambang'],
      ['events_attended','Event dihadiri']
    ];
    const toolbar=element('div','c55-admin-actions');
    const recheck=button('↻ Periksa semua anggota',()=>void recheckAll(),'secondary');
    toolbar.append(recheck,element('span','c55-note','Pemeriksaan menggunakan data anggota Diterima yang tercatat di D1.'));
    rulesList.append(toolbar);
    const editor=rule=>{
      const form=element('form','c55-mini-card c55-achievement-editor');
      const id=field('ID achievement');
      const title=field('Nama achievement');
      const description=field('Deskripsi pencapaian');
      const target=field('Target (jam jika Playtime)','number');
      id.input.value=rule.id||'';
      id.input.required=true;
      id.input.pattern='[a-z0-9_-]{3,60}';
      if(rule.id)id.input.readOnly=true;
      title.input.value=rule.title||'';
      title.input.required=true;
      description.input.value=rule.description||'';
      target.input.value=String(rule.target??1);
      target.input.min='1';target.input.max='1000000000';target.input.step='1';
      target.input.required=true;
      const metricValue=rule.metric==='playtime_seconds'?'playtime_hours':rule.metric;
      const metric=select(kinds,metricValue||'events_attended');
      const metricLabel=element('label','c55-field');
      metricLabel.append(element('span','','Metrik pencapaian'),metric);
      const updateUnit=()=>{
        target.wrapper.querySelector('span').textContent=metric.value==='playtime_hours'?'Target playtime (jam)':'Target jumlah';
      };
      metric.addEventListener('change',updateUnit);
      updateUnit();
      const active=element('input');active.type='checkbox';active.checked=rule.enabled!==0;
      const activeLabel=element('label','c55-field c55-check-row');
      activeLabel.append(active,element('span','','Tampilkan achievement ini'));
      const automatic=element('input');automatic.type='checkbox';automatic.checked=rule.auto_grant!==0;
      const autoLabel=element('label','c55-field c55-check-row');
      autoLabel.append(automatic,element('span','','Berikan otomatis ketika target tercapai'));
      const metrics=element('div','c55-achievement-inputs');
      metrics.append(id.wrapper,title.wrapper,description.wrapper,metricLabel,target.wrapper);
      const toggles=element('div','c55-achievement-toggles');
      toggles.append(activeLabel,autoLabel);
      const controls=element('div','c55-admin-actions');
      const save=button('Simpan aturan',()=>{},'primary');
      save.type='submit';
      controls.append(save);
      if(rule.id){
        const remove=button('Hapus achievement',async()=>{
          const yes=await window.SSCNotice.confirm(
            'Hapus achievement "'+rule.title+'" beserta riwayat pencapaiannya? Tindakan ini tidak dapat dibatalkan.',
            {danger:true,confirmText:'Hapus achievement'});
          if(!yes)return;
          remove.disabled=true;
          try{
            await request('/api/admin/community/achievements',{
              method:'DELETE',body:JSON.stringify({id:rule.id,confirmation:'HAPUS ACHIEVEMENT'})
            });
            noteAchievements('Achievement dan riwayat pemberiannya dihapus.');
            await loadAchievements();
          }catch(error){noteAchievements(error.message,true);remove.disabled=false;}
        });
        controls.append(remove);
      }
      const count=rule.id?element('small','c55-achievement-awarded','✓ '+(Number(rule.awarded)||0)+' anggota sudah memperoleh achievement ini'):null;
      form.append(metrics,toggles);
      if(count)form.append(count);
      form.append(controls);
      form.addEventListener('submit',async event=>{
        event.preventDefault();
        save.disabled=true;
        try{
          await request('/api/admin/community/achievements',{
            method:'POST',body:JSON.stringify({
              id:id.input.value,title:title.input.value,description:description.input.value,
              metric:metric.value,target:Number(target.input.value),
              enabled:active.checked,autoGrant:automatic.checked
            })
          });
          noteAchievements('Aturan berhasil disimpan. Memeriksa anggota yang sudah memenuhi syarat...');
          await recheckAll();
        }catch(error){noteAchievements(error.message,true);}
        finally{save.disabled=false;}
      });
      return form;
    };
    for(const rule of rules)rulesList.append(editor(rule));
    const newRuleButton=button('+ Buat achievement baru',()=>{
      const card=editor({});
      rulesList.insertBefore(card,newRuleButton);
      card.scrollIntoView({block:'center',behavior:'smooth'});
      card.querySelector('input')?.focus();
    },'secondary');
    rulesList.append(newRuleButton);
  }

  async function loadEvents({keepForm=false}={}){
    try{
      const [eventsData,publicData,policyData]=await Promise.all([
        request('/api/admin/community/events'),
        request('/api/events'),
        request('/api/admin/community/events/form')
      ]);
      proposals=eventsData.proposals||[];
      events=publicData.events||[];
      renderProposals();
      renderEventSelect();
      if(!keepForm||!formPolicy||!pendingEdits){
        formPolicy=policyData.settings;
        formRevision=policyData.revision;
        pendingEdits=false;
        renderFormEditor();
      }
      notify('Pengajuan event dan pengaturan form berhasil dimuat.');
      await refreshBadge();
    }catch(error){notify(error.message,true);}
  }

  async function loadAchievements(){
    try{
      const response=await request('/api/admin/community/achievements');
      renderRules(response.rules||[]);
      noteAchievements('Aturan siap dikelola. Perubahan langsung disimpan ke D1.');
    }catch(error){noteAchievements(error.message,true);}
  }
  window.SSCircleCommunityV55Admin={loadEvents,loadAchievements,refreshBadge,startBadge};

})();
