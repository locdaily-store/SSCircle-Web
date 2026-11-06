/* Halaman Server Rules. Teks selalu berasal dari pengaturan yang disimpan admin. */
'use strict';
(() => {
  const defaults = {"rulesEnabled":true,"rulesBadge":"SEBELUM MENDAFTAR","rulesTitle":"Peraturan SSCircle Server","rulesDescription":"Selamat datang di SSCircle Community! Sebelum mendaftar, baca aturan komunitas dan server Minecraft sampai selesai.","rulesReminder":"Pelanggaran bisa berujung peringatan hingga banned dari server, tergantung jenis dan tingkat pelanggarannya. Terima kasih sudah ikut menjaga SSCircle tetap nyaman.","rulesAgreement":"Saya sudah membaca dan menyetujui seluruh peraturan SSCircle Server.","rulesButton":"Setuju & Lanjut Pendaftaran","rulesSections":[{"id":"community","title":"SSCircle Community","description":"Aturan ini berlaku untuk obrolan dan kegiatan komunitas.","items":[{"id":"community-1","text":"Dilarang spam","detail":"Jangan membanjiri chat dengan pesan berulang atau promosi yang mengganggu."},{"id":"community-2","text":"Jangan membawa isu SARA","detail":"Hindari pesan yang menghina atau memancing perdebatan tentang suku, agama, ras, dan golongan."},{"id":"community-3","text":"Saling membantu","detail":"Kalau ada anggota yang kesulitan, bantu sebisanya. Tetap saling menghargai."},{"id":"community-4","text":"Tidak ada konten NSFW","detail":"Dilarang mengirim konten dewasa (18+), pornografi, atau materi negatif yang tidak pantas."},{"id":"community-5","text":"Jaga cara berbicara","detail":"Gunakan kata-kata yang sopan dan jangan sengaja memancing keributan."},{"id":"community-6","text":"Dilarang menyebarkan link pinjol dan penipuan","detail":"Jangan kirim tautan pinjaman online, spam, phishing, atau link mencurigakan."}]},{"id":"minecraft","title":"Minecraft Server Rules","description":"Aturan ini berlaku selama bermain di server SSCircle.","items":[{"id":"minecraft-1","text":"Dilarang menggunakan X-Ray","detail":"Jangan menggunakan cheat, resource pack, atau mod yang memberi keuntungan tidak adil untuk mencari ore."},{"id":"minecraft-2","text":"Jangan mencuri","detail":"Jangan mengambil barang milik pemain lain, baik yang disimpan di chest maupun block yang sudah ditempatkan."},{"id":"minecraft-3","text":"Jangan spam","detail":"Hindari spam chat, perintah, atau tindakan yang mengganggu pemain lain."},{"id":"minecraft-4","text":"Dilarang griefing","detail":"Jangan merusak bangunan, lahan, atau hasil kerja pemain lain tanpa izin."},{"id":"minecraft-5","text":"Jangan mengganggu berlebihan","detail":"Bercanda boleh, tapi berhenti kalau pemain lain sudah merasa terganggu."},{"id":"minecraft-6","text":"Jangan cari perhatian sampai mengganggu","detail":"Hindari tingkah yang sengaja memancing keributan atau membuat pemain lain risih."},{"id":"minecraft-7","text":"Minta izin sebelum memakai barang orang lain","detail":"Hubungi pemilik lewat chat atau tinggalkan pesan di sign terlebih dahulu."},{"id":"minecraft-8","text":"Whitelist dapat dibersihkan jika tidak aktif","detail":"Pemain yang belum pernah masuk atau tidak online sekitar 20 hari dapat dikeluarkan dari whitelist agar slot tersedia untuk pemain baru."},{"id":"minecraft-9","text":"Bertanggung jawab atas tindakanmu","detail":"Kalau memulai masalah, bersiaplah menerima tindakan dari pengelola sesuai aturan."},{"id":"minecraft-10","text":"Aktivitas server dapat diperiksa","detail":"Perusakan, pencurian, dan pelanggaran lain bisa ditelusuri. Jangan memberi keterangan palsu."}]}],"rulesConsentTitle":"Sudah selesai membaca?","rulesFooterText":"One circle. Endless stories.","rulesBackText":"← Kembali ke Beranda","rulesMetaLeft":"SSCircle Community","rulesMetaRight":"Minecraft SMP","rulesScrollHint":"Baca semua bagian hingga paling bawah untuk membuka persetujuan.","rulesReadyHint":"Selesai dibaca. Centang kotak persetujuan untuk melanjutkan."};
  const $ = id => document.getElementById(id);
  const preview = new URLSearchParams(location.search).has('ssc_rules_preview') ||
    new URLSearchParams(location.search).has('ssc_theme_preview');
  let state = { ...defaults, registrationOpen: false, version: '' };
  let reachedBottom = false;
  let hasPreviewSettings = false;
  let busy = false;

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }
  function render(settings) {
    state = { ...defaults, ...settings };
    $('rules-badge').textContent = state.rulesBadge || '';
    const title = state.rulesTitle || defaults.rulesTitle;
    const space = title.indexOf(' ');
    $('rules-heading').replaceChildren(space < 0 ? document.createTextNode(title) :
      document.createTextNode(title.slice(0, space + 1)));
    if (space >= 0) $('rules-heading').append(element('em', '', title.slice(space + 1)));
    $('rules-description').textContent = state.rulesDescription || '';
    $('rules-reminder').textContent = state.rulesReminder || '';
    $('rules-consent-heading').textContent = state.rulesConsentTitle || defaults.rulesConsentTitle;
    $('rules-meta-left').textContent = state.rulesMetaLeft || '';
    $('rules-meta-right').textContent = state.rulesMetaRight || '';
    $('rules-agree-text').textContent = state.rulesAgreement || defaults.rulesAgreement;
    $('rules-continue').replaceChildren(document.createTextNode(state.rulesButton || defaults.rulesButton), element('span', '', '↗'));
    const root = $('rules-sections');
    root.replaceChildren();
    const sections = Array.isArray(state.rulesSections) ? state.rulesSections : defaults.rulesSections;
    sections.forEach((section, sectionIndex) => {
      const card = element('section', 'rules-section');
      card.id = 'rules-' + (section.id || sectionIndex);
      const intro = element('div', 'rules-section-top');
      const count = element('span', 'rules-section-count', String(sectionIndex + 1).padStart(2, '0'));
      const copy = element('div', 'rules-section-copy');
      copy.append(element('h2', '', section.title || 'Kategori peraturan'));
      if (section.description) copy.append(element('p', '', section.description));
      intro.append(count, copy);
      const list = element('ol', 'rules-list');
      for (const [index, rule] of (section.items || []).entries()) {
        const item = element('li', 'rules-item');
        const number = element('span', 'rules-item-number', String(index + 1).padStart(2, '0'));
        const details = element('div', 'rules-item-copy');
        details.append(element('h3', '', rule.text || 'Peraturan'));
        if (rule.detail) details.append(element('p', '', rule.detail));
        item.append(number, details);
        list.append(item);
      }
      card.append(intro, list);
      root.append(card);
    });
    updateConsent();
    checkEnd();
  }
  function checkEnd() {
    if (reachedBottom) return;
    // Pendaftaran hanya bisa diteruskan setelah bagian paling bawah terlihat.
    const bottom = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
    if (bottom <= 42) {
      reachedBottom = true;
      updateConsent();
    }
  }
  function updateConsent() {
    const canAgree = reachedBottom && state.registrationOpen && state.rulesEnabled !== false && !preview;
    $('rules-agree').disabled = !canAgree;
    if (!canAgree) $('rules-agree').checked = false;
    $('rules-continue').disabled = busy || !canAgree || !$('rules-agree').checked;
    $('rules-scroll-status').textContent = preview
      ? 'Mode pratinjau. Persetujuan tidak dikirim.'
      : !state.registrationOpen
        ? 'Pendaftaran sedang ditutup. Kamu tetap bisa membaca peraturan.'
        : state.rulesEnabled === false
          ? 'Persetujuan sedang tidak diwajibkan pada pendaftaran ini.'
          : reachedBottom
            ? state.rulesReadyHint
            : state.rulesScrollHint;
  }
  function updateBrand(settings) {
    const brand = document.querySelector('.home-brand strong');
    if (brand) brand.textContent = settings.brandName || 'SSCircle';
    const logo = document.getElementById('home-logo');
    const src = settings.logoImageUrl || (settings.logoMediaId ? '/api/media/' + settings.logoMediaId : 'assets/sscircle-logo.png');
    if (logo) logo.src = src;
  }
  async function load() {
    if (preview) render(state);
    try {
      const response = await fetch('/api/rules', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw Error('Peraturan tidak bisa dimuat. Coba kembali sebentar lagi.');
      const settings = await response.json();
      if (!hasPreviewSettings) render(settings);
      // Gunakan palet warna yang sama dengan halaman publik lainnya.
      if (!preview) {
        const form = await fetch('/api/form', { credentials: 'same-origin', cache: 'no-store' });
        if (form.ok) { const settings = (await form.json()).settings;
          window.SSCircleTheme?.apply(settings); updateBrand(settings); }
      }
    }
    catch (error) {
      if (!preview) {
        render(state);
        $('rules-feedback').textContent = error.message;
      }
    }
  }
  $('rules-agree').addEventListener('change', updateConsent);
  $('rules-continue').addEventListener('click', async () => {
    if (busy || preview || !reachedBottom || !$('rules-agree').checked || !state.version) return;
    busy = true;
    $('rules-feedback').textContent = '';
    updateConsent();
    try {
      const response = await fetch('/api/rules/agree', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agreed: true, version: state.version })
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Persetujuan gagal disimpan.');
      location.assign(result.next || '/registration');
    }
    catch (error) {
      $('rules-feedback').textContent = error.message;
      busy = false;
      updateConsent();
    }
  });
  addEventListener('scroll', checkEnd, { passive: true });
  addEventListener('resize', checkEnd, { passive: true });
  if (preview) {
    addEventListener('message', event => {
      if (event.origin !== location.origin || event.source !== parent ||
          event.data?.type !== 'ssc-rules-preview-settings') return;
      hasPreviewSettings = true;
      reachedBottom = false;
      render({ ...event.data.settings, registrationOpen: true });
      updateBrand(event.data.settings);
      parent.postMessage({ type: 'ssc-rules-preview-applied' }, location.origin);
    });
    addEventListener('DOMContentLoaded', () => {
      if (parent !== window) parent.postMessage({ type: 'ssc-rules-preview-ready' }, location.origin);
    });
  }
  load();
})();
