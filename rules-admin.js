/* Editor Server Rules: kategori, daftar aturan, dan pratinjau. */
'use strict';
window.SSCircleRulesAdmin = (() => {
  let model = null;
  let changed = () => {};
  let viewportMobile = false;
  let previewTimer = 0;
  let openedCategory = '';
  let openedRule = '';
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
    settings.append(el('p','field-help','Kewajiban bergabung ke Discord SSCircle Community dan tombol Gabung Discord ditampilkan otomatis di Server Rules, termasuk untuk aturan lama. Alamat undangan mengikuti pengaturan Discord pada Atur Homepage.'));
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
    sections.append(toolbar, el('p', 'field-help', 'Seret ikon ⠿ untuk mengurutkan kategori atau aturan. Klik judul untuk mengedit.'));
    s.rulesSections ||= [];
    s.rulesSections.forEach((section, sectionIndex) => {
      const details = el('details', 'rules-admin-category');
      details.open = openedCategory === section.id || (!openedCategory && sectionIndex === 0);
      details.addEventListener('toggle', () => { if (details.open) openedCategory = section.id; });
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
        const item = el('details','rules-admin-rule');
        item.open = openedRule === rule.id;
        item.addEventListener('toggle', () => { if (item.open) openedRule = rule.id; });
        const top = el('summary','rules-admin-rule-top');
        top.append(el('span','rules-item-index',String(index+1).padStart(2,'0')),
          el('strong','', rule.text || 'Peraturan baru'));
        const controls = el('div','rules-admin-actions');
        controls.append(button('↑',()=>reorder(section.items,index,index-1)),
          button('↓',()=>reorder(section.items,index,index+1)),
          button('Hapus',()=>{
            if(section.items.length === 1) return SSCNotice.alert('Kategori perlu setidaknya satu aturan.');
            section.items.splice(index,1); mark();renderEditor();
          }));
        const inner = el('div', 'rules-admin-rule-fields');
        inner.append(field('Isi aturan',rule.text,v=>{
          rule.text=v;top.querySelector('strong').textContent=v||'Peraturan baru';
        },false,280),field('Penjelasan tambahan (opsional)',rule.detail,v=>{rule.detail=v;},true,650),controls);
        item.append(top,inner);
        list.append(item);
      });
      window.SSCircleSort?.attach(list, { item: '.rules-admin-rule', handleTarget: 'summary', onMove: (from, to) => {
        const moved = section.items.splice(from, 1)[0]; section.items.splice(to, 0, moved); mark(); renderEditor();
      }});
      contents.append(list,button('+ Tambah peraturan',()=>{
        if(section.items.length >= 50) return SSCNotice.alert('Maksimal 50 peraturan per kategori.');
        section.items.push({id:newId('rule'),text:'Peraturan baru',detail:''});mark();renderEditor();
      }));
      details.append(contents);
      sections.append(details);
    });
    window.SSCircleSort?.attach(sections, { item: '.rules-admin-category', handleTarget: 'summary', onMove: (from, to) => {
      const moved = s.rulesSections.splice(from, 1)[0]; s.rulesSections.splice(to, 0, moved); mark(); renderEditor();
    }});
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
