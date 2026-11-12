/* Formulir event komunitas dan pendaftaran peserta. */
'use strict';

(() => {
  const root = document.getElementById('community55-events-root');
  const preview = new URLSearchParams(location.search).has('ssc_events_preview');
  if (!root || preview) return;

  const element = (tag, className = '', text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  async function request(path, options = {}) {
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
    if (!response.ok) throw Error(payload.error || 'Layanan event tidak tersedia.');
    return payload;
  }

  const message = element('p', 'c55-note', 'Memeriksa akses anggota...');
  const form = element('form', 'c55-form');
  const mine = element('section', 'c55-my-events');
  const proposalList = element('div', 'c55-my-list');
  const state = {accepted: false, joined: new Set(), events: [], fields: []};

  function notice(text, error = false) {
    message.textContent = text;
    message.className = 'c55-note' + (error ? ' error' : '');
  }

  function inputField(field) {
    const label = element('label', 'c55-field');
    label.append(element('span', '', field.label + (field.required ? ' *' : '')));
    let control;

    if (field.type === 'textarea') {
      control = element('textarea');
      control.rows = 5;
    } else if (field.type === 'select') {
      control = element('select');
      const empty = element('option', '', '-- Pilih jawaban --');
      empty.value = '';
      control.append(empty);
      for (const choice of field.options || []) {
        const option = element('option', '', choice);
        option.value = choice;
        control.append(option);
      }
    } else {
      control = element('input');
      control.type = field.type === 'datetime-local' ? 'datetime-local' : field.type;
    }

    control.required = field.required;
    control.name = field.id;
    control.placeholder = field.placeholder || '';
    if (field.type === 'number') control.step = 'any';
    if (field.type === 'textarea') control.maxLength = 1800;
    else if (field.type === 'text') control.maxLength = field.id === 'title' ? 140 : 200;
    label.append(control);
    return {label, value: () => control.value};
  }

  function prizesField(field, maxPrizes) {
    const wrap = element('div', 'c55-prizes');
    const heading = element('div', 'c55-field-head');
    heading.append(
      element('strong', '', field.label + (field.required ? ' *' : '')),
      element('small', '', 'Tambahkan hadiah untuk Juara 1 sampai ' + maxPrizes + '.')
    );
    const list = element('div', 'c55-prizes-list');
    const rows = [];

    function redraw() {
      list.replaceChildren();
      rows.forEach((row, index) => {
        const item = element('div', 'c55-prize-row');
        const label = element('label', 'c55-field');
        label.append(element('span', '', 'Juara ' + (index + 1)));
        label.append(row);
        item.append(label);

        const remove = element('button', 'c55-button secondary', 'Hapus');
        remove.type = 'button';
        remove.disabled = rows.length === 1 && field.required;
        remove.addEventListener('click', () => {
          rows.splice(index, 1);
          redraw();
        });
        item.append(remove);
        list.append(item);
      });
      add.disabled = rows.length >= maxPrizes;
    }

    const add = element('button', 'c55-button secondary', '+ Tambah Juara');
    add.type = 'button';
    add.addEventListener('click', () => {
      if (rows.length >= maxPrizes) return;
      const control = element('input');
      control.type = 'text';
      control.maxLength = 180;
      control.placeholder = field.placeholder || 'Hadiah pemenang';
      control.required = field.required;
      rows.push(control);
      redraw();
    });
    wrap.append(heading, list, add);
    if (field.required) add.click();

    return {
      label: wrap,
      value: () => rows.map(row => row.value.trim()).filter(Boolean)
    };
  }

  function renderForm(policy) {
    form.replaceChildren();
    form.hidden = !state.accepted || !policy.enabled;
    if (form.hidden) {
      if (state.accepted) notice('Pengajuan event sedang ditutup oleh Admin.');
      return;
    }

    form.append(
      element('h2', '', 'Buat event komunitasmu'),
      element('p', '', 'Isi pertanyaan dari Admin. Event akan ditinjau sebelum ditampilkan di kalender.')
    );

    const controls = new Map();
    policy.fields.forEach((field, index) => {
      const control = field.type === 'prizes'
        ? prizesField(field, policy.maxPrizes)
        : inputField(field);
      const label = control.label.querySelector('span');
      if (label) label.textContent = (index + 1) + '. ' + label.textContent;
      controls.set(field.id, control);
      form.append(control.label);
    });

    const submit = element('button', 'c55-button', 'Kirim pengajuan ke Admin');
    submit.type = 'submit';
    form.append(submit);
    form.onsubmit = async event => {
      event.preventDefault();
      const answers = Object.fromEntries(
        [...controls].map(([key, control]) => [key, control.value()])
      );
      submit.disabled = true;
      notice('Mengirim pengajuan...');
      try {
        const result = await request('/api/community/events/propose', {
          method: 'POST',
          body: JSON.stringify({answers})
        });
        notice(result.message);
        renderForm(policy);
        await renderMine();
      } catch (error) {
        notice(error.message, true);
      } finally {
        submit.disabled = false;
      }
    };
  }

  async function renderMine() {
    try {
      const data = await request('/api/community/events/my');
      state.joined = new Set((data.joined || []).map(item => item.event_id));
      proposalList.replaceChildren();
      for (const item of data.proposals || []) {
        const card = element('article', 'c55-mini-card');
        const status = item.status === 'approved' ? 'Disetujui' :
          item.status === 'rejected' ? 'Ditolak' : 'Menunggu persetujuan';
        card.append(
          element('strong', '', item.title),
          element('small', '', status)
        );
        if (item.reason) card.append(element('p', '', item.reason));
        proposalList.append(card);
      }
      if (!proposalList.children.length)
        proposalList.append(element('p', 'c55-note', 'Belum ada pengajuan event.'));
      decorateEvents();
    } catch (error) {
      proposalList.replaceChildren(element('p', 'c55-note', error.message));
    }
  }

  function decorateEvents() {
    for (const card of document.querySelectorAll('#events-list .events-card')) {
      if (card.querySelector('.c55-event-join')) continue;
      const id = card.querySelector('.events-countdown')?.dataset.eventId;
      const event = state.events.find(item => item.id === id);
      if (!event || !state.accepted || Date.parse(event.startAt) <= Date.now())
        continue;

      const button = element('button', 'c55-button c55-event-join',
        state.joined.has(id) ? 'Sudah terdaftar' : 'Daftar sebagai peserta');
      button.type = 'button';
      button.disabled = state.joined.has(id);
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const result = await request('/api/community/events/join', {
            method: 'POST',
            body: JSON.stringify({eventId: id})
          });
          state.joined.add(id);
          button.textContent = 'Sudah terdaftar';
          notice(result.message);
        } catch (error) {
          notice(error.message, true);
          button.disabled = false;
        }
      });
      card.append(button);
    }
  }

  async function initialize() {
    form.hidden = true;
    mine.hidden = true;
    try {
      const account = await request('/api/player/me');
      state.accepted = account.authenticated === true && account.status === 'accepted';
      if (state.accepted) {
        mine.hidden = false;
        mine.append(element('h2', '', 'Pengajuan event saya'), proposalList);
        const data = await request('/api/community/events/form');
        renderForm(data.form);
        if (data.form.enabled)
          notice('Pengajuan event tersedia untuk anggota Diterima.');
        await renderMine();
      } else {
        notice('Masuk sebagai anggota Diterima melalui Profile untuk mengajukan atau mengikuti event.');
      }
    } catch (error) {
      notice('Buka Profile dan masuk dengan password Dashboard untuk mengajukan event.');
    }

    try {
      const data = await request('/api/events');
      state.events = data.events || [];
      decorateEvents();
    } catch {
      // Kalender lama tetap menampilkan data jika API tambahan sedang tidak tersedia.
    }
  }

  root.append(message, form, mine);
  const calendar = document.getElementById('events-list');
  if (calendar) new MutationObserver(decorateEvents).observe(calendar, {childList: true});
  initialize();
})();
