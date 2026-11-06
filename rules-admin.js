/* Editor Server Rules: kategori, daftar aturan, dan pratinjau. */
'use strict';
window.SSCircleRulesAdmin = (() => {
  let model = null;
  let changed = () => {};
  let viewportMobile = false;
  let previewTimer = 0;
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const newId = prefix => prefix + '-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  function field(title, value, onInput, multiline = false, limit = 300) {
    const label = el('label', 'field-group');
    label.append(el('span', 'field-label', title));
    const input = el(multiline ? 'textarea' : 'input');
    if (!multiline) input.type = 'text';
    else input.rows = 3;
    input.maxLength = limit;
    input.value = value ?? '';
    input.addEventListener('input', () => { onInput(input.value); mark(); });
    label.append(input);
    return label;
  }
  function button(label, action, modifier = 'secondary') {
    const node = el('button', 'button ' + modifier, label);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }
  function mark() { changed(); schedule(); }
  function sendPreview() {
    if (!model) return;
    const frame = $('rules-admin-preview-frame');
    frame?.contentWindow?.postMessage({
      type: 'ssc-rules-preview-settings', settings: structuredClone(model.settings)
    }, location.origin);
    frame?.contentWindow?.postMessage({
      type: 'ssc-theme-preview-settings', settings: structuredClone(model.settings)
    }, location.origin);
  }
  function schedule() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(sendPreview, 130);
  }
  function sizePreview() {
    const shell = $('rules-admin-preview-window'), frame = $('rules-admin-preview-frame');
    if (!shell || !frame) return;
    const width = viewportMobile ? 390 : 1150;
    const height = viewportMobile ? 850 : 860;
    const scale = Math.min(1, Math.max(190, shell.clientWidth - 20) / width);
    frame.style.width = width + 'px';
    frame.style.height = height + 'px';
    frame.style.transform = `scale(${scale})`;
    shell.style.height = Math.min(680, height * scale + 18) + 'px';
    $('rules-preview-desktop').classList.toggle('primary', !viewportMobile);
    $('rules-preview-mobile').classList.toggle('primary', viewportMobile);
  }
  function reorder(list, from, to) {
    if (to < 0 || to >= list.length) return;
    list.splice(to, 0, list.splice(from, 1)[0]);
    mark(); renderEditor();
  }
  function renderEditor() {
    if (!model) return;
    const s = model.settings;
    const root = $('rules-admin-editor');
    root.replaceChildren();
    const settings = el('section', 'panel rules-admin-panel');
    settings.append(el('h2', '', 'Pengaturan halaman'));
    const toggle = el('label', 'rules-admin-switch');
    const checkbox = el('input');
    checkbox.type = 'checkbox'; checkbox.checked = s.rulesEnabled !== false;
    checkbox.onchange = () => { s.rulesEnabled = checkbox.checked; mark(); };
    toggle.append(checkbox, el('span', '', 'Wajib membaca dan menyetujui aturan sebelum mendaftar'));
    settings.append(toggle, el('p', 'field-help', 'Saat aktif, pengunjung diarahkan ke Server Rules sebelum membuka Registration.'));
    for (const [key, label, multiline, max] of [
      ['rulesBadge','Label kecil di atas judul',false,90],
      ['rulesTitle','Judul halaman',false,140],
      ['rulesDescription','Keterangan pembuka',true,1100],
      ['rulesReminder','Catatan pelanggaran di bawah aturan',true,1300],
      ['rulesAgreement','Tulisan checkbox persetujuan',true,320],
      ['rulesButton','Teks tombol lanjut',false,100],
      ['rulesConsentTitle','Judul panel persetujuan',false,120],
      ['rulesMetaLeft','Keterangan kecil pertama',false,100],
      ['rulesMetaRight','Keterangan kecil kedua',false,100],
      ['rulesScrollHint','Petunjuk sebelum sampai bawah',true,250],
      ['rulesReadyHint','Petunjuk setelah selesai membaca',true,250],

    ]) settings.append(field(label, s[key], v => { s[key] = v; }, multiline, max));
    root.append(settings);

    const sections = el('section', 'panel rules-admin-panel');
    const toolbar = el('div', 'rules-admin-toolbar');
    toolbar.append(el('div', '', 'Kategori & daftar aturan'));
    toolbar.append(button('+ Kategori baru', () => {
      if (s.rulesSections.length >= 12) return SSCNotice.alert('Maksimal 12 kategori.');
      s.rulesSections.push({ id: newId('category'), title: 'Kategori baru', description: '',
        items: [{ id: newId('rule'), text: 'Peraturan baru', detail: '' }] });
      mark(); renderEditor();
      root.querySelector('details:last-of-type')?.setAttribute('open','');
    }));
    sections.append(toolbar, el('p', 'field-help', 'Klik nama kategori untuk mengedit isinya. Gunakan panah untuk mengatur urutan.'));
    s.rulesSections ||= [];
    s.rulesSections.forEach((section, sectionIndex) => {
      const details = el('details', 'rules-admin-category');
      if (sectionIndex === 0) details.open = true;
      const summary = el('summary');
      summary.append(el('strong','', section.title || 'Kategori ' + (sectionIndex + 1)),
        el('span', 'rules-admin-count', (section.items || []).length + ' aturan'));
      details.append(summary);
      const contents = el('div', 'rules-admin-category-body');
      contents.append(field('Nama kategori', section.title, value => {
        section.title = value;
        summary.querySelector('strong').textContent = value || 'Kategori';
      },false,140));
      contents.append(field('Penjelasan kategori (boleh kosong)', section.description, value => { section.description = value; },true,500));
      const menu = el('div','rules-admin-actions');
      menu.append(button('↑ Naik',()=>reorder(s.rulesSections,sectionIndex,sectionIndex-1)),
        button('↓ Turun',()=>reorder(s.rulesSections,sectionIndex,sectionIndex+1)),
        button('Hapus kategori',async ()=>{
          if(s.rulesSections.length === 1) return SSCNotice.alert('Minimal perlu satu kategori.');
          if(!await SSCNotice.confirm('Hapus kategori dan seluruh aturan di dalamnya?',{danger:true,confirmText:'Hapus kategori'})) return;
          s.rulesSections.splice(sectionIndex,1); mark(); renderEditor();
        }));
      contents.append(menu);
      section.items ||= [];
      const list = el('div','rules-admin-items');
      section.items.forEach((rule, index) => {
        const item = el('div','rules-admin-rule');
        const top = el('div','rules-admin-rule-top');
        top.append(el('span','rules-item-index',String(index+1).padStart(2,'0')),
          el('strong','', rule.text || 'Peraturan baru'));
        const controls = el('div','rules-admin-actions');
        controls.append(button('↑',()=>reorder(section.items,index,index-1)),
          button('↓',()=>reorder(section.items,index,index+1)),
          button('Hapus',()=>{
            if(section.items.length === 1) return SSCNotice.alert('Kategori perlu setidaknya satu aturan.');
            section.items.splice(index,1); mark();renderEditor();
          }));
        item.append(top, field('Isi aturan',rule.text,v=>{
          rule.text=v;top.querySelector('strong').textContent=v||'Peraturan baru';
        },false,280),field('Penjelasan tambahan (opsional)',rule.detail,v=>{rule.detail=v;},true,650),controls);
        list.append(item);
      });
      contents.append(list,button('+ Tambah peraturan',()=>{
        if(section.items.length >= 50) return SSCNotice.alert('Maksimal 50 peraturan per kategori.');
        section.items.push({id:newId('rule'),text:'Peraturan baru',detail:''});mark();renderEditor();
      }));
      details.append(contents);
      sections.append(details);
    });
    root.append(sections);
  }
  let installed = false;
  function render(data, notify) {
    model = data;
    changed = notify;
    renderEditor();
    if (!installed) {
      installed = true;
      $('rules-admin-preview-frame').addEventListener('load',schedule);
      $('rules-preview-desktop').onclick=()=>{viewportMobile=false;sizePreview();schedule();};
      $('rules-preview-mobile').onclick=()=>{viewportMobile=true;sizePreview();schedule();};
      if ('ResizeObserver' in window) new ResizeObserver(sizePreview).observe($('rules-admin-preview-window'));
      window.addEventListener('message',event=>{
        if(event.origin!==location.origin || event.source!==$('rules-admin-preview-frame')?.contentWindow) return;
        if(event.data?.type==='ssc-rules-preview-ready' || event.data?.type==='ssc-theme-preview-ready') schedule();
        if(event.data?.type==='ssc-rules-preview-applied') $('rules-admin-preview-status').textContent='Pratinjau sudah diperbarui.';
      });
    }
    sizePreview();
    schedule();
  }
  return { render, schedule };
})();
