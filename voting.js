/* SSCircle Voting: three distinct choices for each accepted member and question. */

// Halaman voting: pemeriksaan sesi, pilihan, dan hasil.

'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const make = (tag, className = '', text) => {
    const element = document.createElement(tag);
    if (className)
      element.className = className;
    if (text !== undefined)
      element.textContent = text;
    return element;
  };
  let votingData = null;
  let account = null;
  const note = (text, kind = '') => {
    const element = $('vote-message');
    element.textContent = text || '';
    element.className = 'vote-message' + (kind ? ' is-' + kind : '');
  };
  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      ...options,
    });
    const payload = await response.json();
    if (!response.ok)
      throw new Error(payload.error || 'Layanan sementara tidak tersedia.');
    return payload;
  }
  function renderAccount() {
    const login = $('vote-login');
    const owner = $('vote-current-player');
    if (!login || !owner)
      return;
    const accepted = account?.status === 'accepted';
    login.hidden = !!account;
    owner.hidden = !account;
    if (account) {
      $('vote-current-player-name').textContent = accepted ? 'Pendaftar diterima' : 'Belum mendapatkan akses voting';
      $('vote-current-player-code').textContent = account.code.replace(/.(?=.{4})/g, '•');
    }
    const active = votingData?.active === true;
    $('vote-questions').hidden = !accepted;
    for(const b of document.querySelectorAll('.vote-question-submit'))b.disabled=!active||!accepted||b.dataset.voted==='1';
  }
  async function refreshAccount() {
    try {
      account = await request('/api/player/me');
      if (!account.authenticated)
        account = null;
      if (account && account.status !== 'accepted')
        location.replace('status.html?akses-voting=' + (account.status === 'rejected' ? 'ditolak' : 'menunggu') + '#kode-milikku');
    }
    catch {
      account = null;
    }
    renderAccount();
  }
  function imageGallery(sources, className) {
    const gallery=make('div',className);
    for(const [index,source] of sources.entries()){
      const figure=make('figure','vote-image-frame'),image=make('img');
      image.src=source;image.alt='Foto voting '+(index+1);image.loading='lazy';figure.append(image);gallery.append(figure);
    }
    return gallery;
  }
  function renderVoting(payload) {
    votingData=payload;
    $('vote-title').textContent=payload.title||'Voting Komunitas';
    $('vote-question').textContent=(payload.questions?.length||0)>1?'Pilih sesuai pertanyaan':'Pertanyaan Voting';
    $('vote-description').textContent=payload.text||'';
    $('vote-status').textContent=!payload.enabled?'Voting sedang tidak tersedia.':payload.active?
      (payload.endsAt?'Voting berakhir: '+new Date(payload.endsAt).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'}):'Voting sedang berlangsung.'):
      'Sesi voting sudah berakhir.';
    $('vote-images').hidden=true;$('vote-images').replaceChildren();
    $('vote-results-section').hidden=true;
    const host=$('vote-questions');host.replaceChildren();
    const voted=new Set(payload.votedQuestionIds||[]);
    const usedOptions=payload.usedOptions||{};
    const remaining=payload.remainingTokens||{};
    for(const [index,question] of (payload.questions||[]).entries()){
      const card=make('section','vote-poll-card');card.id='poll-'+question.id;
      card.append(make('span','vote-poll-index','PERTANYAAN '+String(index+1).padStart(2,'0')),
        make('h2','',question.title));
      card.append(make('p','vote-option-description','Token tersisa: '+Number(remaining[question.id]??3)+' / 3. Setiap token wajib memilih jawaban berbeda.'));
      if(question.description)card.append(make('p','vote-option-description',question.description));
      if(question.images?.length)card.append(imageGallery(question.images,'vote-image-gallery'));
      const form=make('form','vote-form vote-question-form');
      const choices=make('div','vote-options');
      for(const [i,option] of (question.options||[]).entries()){
        const row=make('label','vote-option vote-option-rich'),top=make('div','vote-option-top');
        const radio=make('input');radio.type='radio';radio.name='choice-'+question.id;
        const used=(usedOptions[question.id]||[]).includes(option.id);
        radio.value=option.id;radio.required=true;radio.disabled=used||voted.has(question.id)||!payload.active;
        if(!used&&!voted.has(question.id)&&!choices.querySelector('input:checked'))radio.checked=true;
        top.append(radio,make('strong','',option.label));
        if(used)top.append(make('span','vote-option-description','✓ Sudah dipilih'));
        row.append(top);
        if(option.description)row.append(make('p','vote-option-description',option.description));
        if(option.images?.length)row.append(imageGallery(option.images,'vote-choice-gallery'));
        choices.append(row);
      }
      form.append(choices);
      const submit=make('button','home-button home-button-primary vote-question-submit',voted.has(question.id)?'✓ Token habis':'Gunakan 1 token');
      submit.type='submit';submit.dataset.voted=voted.has(question.id)?'1':'0';
      submit.disabled=voted.has(question.id)||!payload.active||account?.status!=='accepted';
      form.append(submit);
      form.addEventListener('submit',async event=>{
        event.preventDefault();
        if(!account||account.status!=='accepted')return note('Masuk sebagai pendaftar Diterima terlebih dahulu.','error');
        const selected=form.querySelector('input[type="radio"]:checked');
        if(!selected)return note('Pilih satu jawaban terlebih dahulu.','error');
        submit.disabled=true;note('Menyimpan jawaban...');
        try {
          const result=await request('/api/voting/vote',{method:'POST',body:JSON.stringify({questionId:question.id,optionId:selected.value})});
          note(result.message||'Jawaban tersimpan.','success');
          renderVoting(await request('/api/voting'));
        }catch(err){note(err.message,'error');submit.disabled=false;}
      });
      card.append(form);
      if(question.showResults){
        const results=make('div','vote-results');results.append(make('h3','',`Hasil: ${question.title}`));
        for(const item of question.results||[]){
          const row=make('article','vote-result-card'),heading=make('div','vote-result-head');
          heading.append(make('strong','',item.label),make('span','',item.count+' suara · '+item.percent+'%'));
          const track=make('div','vote-result-bar'),fill=make('div','vote-result-fill');
          fill.style.width=item.percent+'%';track.append(fill);row.append(heading,track);results.append(row);
        }
        card.append(results);
      }
      host.append(card);
    }
    if(!host.children.length)host.append(make('p','vote-message','Belum ada pertanyaan voting.'));
    renderAccount();
  }
  $('vote-login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('vote-login-button');
    button.disabled = true;
    note('Memverifikasi kode pendaftaran...');
    try {
      account = await request('/api/player/login', {
        method: 'POST',
        body: JSON.stringify({ code: $('vote-account').value }),
      });
      $('vote-account').value = '';
      renderAccount();
      if (account.status !== 'accepted') {
        location.replace('status.html?akses-voting=' + (account.status === 'rejected' ? 'ditolak' : 'menunggu') + '#kode-milikku');
        return;
      }
      note('Berhasil masuk. Sekarang kamu dapat memberikan suara.', 'success');
      renderVoting(await request('/api/voting'));
    }
    catch (error) {
      note(error.message, 'error');
    }
    finally {
      button.disabled = false;
    }
  });
  $('vote-player-logout').addEventListener('click', async () => {
    await request('/api/player/logout', { method: 'POST' }).catch(() => { });
    account = null;
    renderAccount();
    note('Kamu sudah keluar.');
  });
  document.querySelectorAll('.home-reveal').forEach(item => item.classList.add('is-shown'));
  window.SSCircleTheme?.load();
  // Read only public display settings; does not bypass server-side voting access checks.
  fetch('/api/form', { credentials: 'same-origin', cache: 'no-store' })
    .then(r => r.ok ? r.json() : null)
    .then(form => {
    const s = form?.settings || {};
    if ($('vote-footer-text'))
      $('vote-footer-text').textContent = s.homeFooterText || 'One circle. Endless stories.';
    if ($('vote-footer-logo'))
      $('vote-footer-logo').src = s.logoImageUrl || (s.logoMediaId ? '/api/media/' + s.logoMediaId : 'assets/sscircle-logo.png');
    if ($('ssc-footer-discord') && /^https:\/\/(?:discord\.gg|discord\.com)\//.test(s.homeDiscordUrl || ''))
      $('ssc-footer-discord').href = s.homeDiscordUrl;
  }).catch(() => { });
  Promise.all([request('/api/voting'), refreshAccount()])
    .then(([data]) => renderVoting(data))
    .catch(error => {
    $('vote-status').textContent = 'Voting belum dapat dimuat.';
    note(error.message, 'error');
  });
})();
