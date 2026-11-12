/* Pengelolaan event, formulir anggota, peserta, dan achievement. */
'use strict';

(() => {
  const root = document.getElementById('community55-admin-root');
  if (!root) return;

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

  layout.append(formPanel, proposalsPanel, participantsPanel, achievementsPanel);
  root.append(feedback, layout);

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

  function notify(text, error = false) {
    feedback.textContent = text;
    feedback.className = 'c55-note' + (error ? ' error' : '');
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
            : window.confirm(message);
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
            await load({keepForm: true});
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

  function renderRules(rules) {
    rulesList.replaceChildren();
    const kinds = [
      ['playtime_seconds', 'Playtime (detik)'],
      ['mob_kills', 'Mob kills'],
      ['deaths', 'Deaths'],
      ['blocks_mined', 'Blocks mined'],
      ['events_attended', 'Event dihadiri']
    ];

    const editor = rule => {
      const form = element('form', 'c55-mini-card');
      const id = field('ID unik');
      const title = field('Nama achievement');
      const description = field('Keterangan');
      const target = field('Target', 'number');

      id.input.value = rule.id || '';
      id.input.required = true;
      id.input.pattern = '[a-z0-9_-]{3,60}';
      title.input.value = rule.title || '';
      title.input.required = true;
      description.input.value = rule.description || '';
      target.input.value = rule.target || '1';
      target.input.min = '1';
      target.input.required = true;

      const metric = select(kinds, rule.metric || 'events_attended');
      const active = element('input');
      active.type = 'checkbox';
      active.checked = rule.enabled !== 0;
      const activeLabel = element('label', 'c55-field c55-check-row');
      activeLabel.append(active, element('span', '', 'Aktif'));

      const save = button('Simpan aturan', () => {}, 'primary');
      save.type = 'submit';
      form.append(
        id.wrapper, title.wrapper, description.wrapper,
        metric, target.wrapper, activeLabel, save
      );
      form.addEventListener('submit', async event => {
        event.preventDefault();
        save.disabled = true;
        try {
          await request('/api/admin/community/achievements', {
            method: 'POST',
            body: JSON.stringify({
              id: id.input.value,
              title: title.input.value,
              description: description.input.value,
              metric: metric.value,
              target: Number(target.input.value),
              enabled: active.checked
            })
          });
          notify('Aturan achievement berhasil disimpan.');
        } catch (error) {
          notify(error.message, true);
        } finally {
          save.disabled = false;
        }
      });
      return form;
    };

    for (const rule of rules) rulesList.append(editor(rule));
    rulesList.append(button('+ Tambah achievement', () => {
      const newRule = editor({});
      rulesList.prepend(newRule);
      newRule.scrollIntoView({block: 'center', behavior: 'smooth'});
    }));
  }

  async function load({keepForm = false} = {}) {
    try {
      const [eventsData, publicData, achievementsData, policyData] = await Promise.all([
        request('/api/admin/community/events'),
        request('/api/events'),
        request('/api/admin/community/achievements'),
        request('/api/admin/community/events/form')
      ]);

      proposals = eventsData.proposals || [];
      events = publicData.events || [];
      renderProposals();
      renderEventSelect();
      renderRules(achievementsData.rules || []);

      if (!keepForm || !formPolicy || !pendingEdits) {
        formPolicy = policyData.settings;
        formRevision = policyData.revision;
        pendingEdits = false;
        renderFormEditor();
      }
      notify('Pengaturan komunitas berhasil dimuat.');
    } catch (error) {
      notify(error.message, true);
    }
  }

  document.querySelector('[data-tab="events-admin"]')
    ?.addEventListener('click', () => load({keepForm: pendingEdits}));
  if (location.hash.includes('events-admin')) load();
})();
