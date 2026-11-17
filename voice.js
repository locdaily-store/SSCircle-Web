/* SSCircle Voice: live WebSocket PCM audio, paired to authenticated Paper UUID.
   No recording, no stored voice token, and no silent microphone capture. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const base=String(window.SSCIRCLE_VOICE_GATEWAY||'').replace(/\/+$/,'');
const API=/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/i.test(base)||
    /^http:\/\/(?:127\.0\.0\.1|localhost):[0-9]+$/i.test(base)?base:'';
const t={
 id:{start:'Aktifkan mikrofon',stop:'Matikan mikrofon',status:'Memeriksa koneksi server...',
   offline:'Gateway tidak terhubung. Periksa server voice.',ready:'Gateway online',
   disconnected:'Terputus',connecting:'Menghubungkan...',connected:'Terhubung',
   reconnecting:'Menghubungkan ulang...',paired:'Akun berhasil dipasangkan.',
   micDenied:'Izin mikrofon ditolak. Periksa izin browser dan aktifkan melalui tombol mikrofon.',
   audioUnavailable:'Browser tidak mendukung AudioWorklet. Gunakan browser lebih baru.',
   invalid:'Kode salah, kedaluwarsa, atau sudah pernah dipakai.',
   noConfig:'Gateway Voice belum dikonfigurasi. Periksa VOICE_PUBLIC_URL di Cloudflare Pages dan deploy ulang website.',
   noNearby:'Tidak ada pemain dalam jangkauan.',group:'Gabung grup'},
 en:{start:'Enable microphone',stop:'Disable microphone',status:'Checking server...',
   offline:'Voice gateway offline. Check the voice server.',ready:'Gateway online',
   disconnected:'Disconnected',connecting:'Connecting...',connected:'Connected',
   reconnecting:'Reconnecting...',paired:'Account paired successfully.',
   micDenied:'Microphone permission denied. Review browser permissions and enable it manually.',
   audioUnavailable:'AudioWorklet is unsupported. Please use a current browser.',
   invalid:'Pairing code invalid, expired, or already used.',
   noConfig:'Voice gateway is not configured. Check the VOICE_PUBLIC_URL Cloudflare Pages variable and redeploy.',
   noNearby:'No players within hearing range.',group:'Join group'}
};
let lang='id',token='',socket=null,me=null,latest=null,ctx=null,stream=null,worklet=null,
  micSource=null,micGain=1,speakerGain=null,pttDown=false,muted=false,deafened=false,
  whisper=false,closing=false,reconnectTry=0,retryTimer=null,joining=false,lastVoiceState=0,
  micWanted=false,micStarting=false,workletLoaded=false,recovering=false,
  sendLevel=0,outputVolume=1,playing=new Map(),pendingMic=[];
const translation=k=>t[lang][k]||k;
function message(text,error=false){$('room-message').textContent=text;$('room-message').style.color=error?'#ffb1b7':'';}
function pairMessage(text,error=false){$('pair-message').textContent=text;$('pair-message').style.color=error?'#ffb1b7':'';}
function status(label,connected){
  $('connection-label').textContent=label;$('connection-dot').className='voice-led'+(connected?' online':' offline');
  $('connection-details').textContent=connected?'Minecraft / SSCircle':'';
}
function setRoom(open){
  $('pairing-panel').hidden=open;$('room-panel').hidden=!open;
  if(open&&me){
    $('player-name').textContent=me.name;
    $('player-avatar').src='https://mc-heads.net/avatar/'+encodeURIComponent(me.uuid)+'/64';
    $('player-avatar').onerror=()=>$('player-avatar').src='assets/sscircle-logo.png';
  }
}
async function request(path,options={}){
  if(!API)throw Error(translation('noConfig'));
  const response=await fetch(API+path,{mode:'cors',credentials:'omit',cache:'no-store',
    headers:{'Content-Type':'application/json',...options.headers},...options});
  const value=await response.json().catch(()=>({error:'INVALID_RESPONSE'}));
  if(!response.ok){
    const names={INVALID_CODE:translation('invalid'),SERVER_OFFLINE:translation('offline'),
      SESSION_EXPIRED:'Sesi habis. Gunakan /voice link lagi.',
      RATE_LIMIT:'Terlalu banyak percobaan. Tunggu sebelum mencoba lagi.'};
    throw Error(names[value.error]||value.error||'Kesalahan jaringan');
  }
  return value;
}
function closeSocket(){
  if(socket){
    const old=socket;socket=null;old.onclose=null;old.onmessage=null;
    try{old.close(1000,'user');}catch{}
  }
}
function cancelReconnect(){
  if(retryTimer!==null){clearTimeout(retryTimer);retryTimer=null;}
}
function scheduleReconnect(){
  if(closing||!token||retryTimer!==null)return;
  // Mobile background timers may pause. Retain a bounded retry when the page resumes.
  const delay=Math.min(30000,1200*Math.pow(1.6,Math.min(8,++reconnectTry)));
  retryTimer=setTimeout(()=>{retryTimer=null;if(!closing&&token)void join();},delay);
}
async function disconnect(){
  closing=true;cancelReconnect();closeSocket();micWanted=false;
  if(token)try{await request('/api/disconnect',{method:'POST',headers:{Authorization:'Bearer '+token}});}catch{}
  token='';me=null;latest=null;reconnectTry=0;lastVoiceState=0;
  stopMic();clearPlayback();setRoom(false);status(translation('disconnected'),false);
}
function control(action,value=''){
  if(socket?.readyState===WebSocket.OPEN)
    socket.send(JSON.stringify({t:'control',action,value:String(value)}));
}
function updateButtons(){
  if(!shouldTransmit())flushMic();
  $('mute').setAttribute('aria-pressed',String(muted));
  $('mute').textContent=muted?'Unmute':'Mute';
  $('deafen').setAttribute('aria-pressed',String(deafened));
  $('deafen').textContent=deafened?'Undeafen':'Deafen';
  $('whisper').setAttribute('aria-pressed',String(whisper));
  $('whisper').textContent='Whisper: '+(whisper?'ON':'OFF');
  if(worklet)worklet.port.postMessage({t:'mute',value:!shouldTransmit()});
}
function shouldTransmit(){
  if(!stream||muted)return false;
  if($('talk-mode').value==='ptt')return pttDown;
  return true;
}
function setMode(){
  const ptt=$('talk-mode').value==='ptt';
  $('ptt').hidden=!ptt;
  worklet?.port.postMessage({t:'sensitivity',value:ptt?0:Number($('sensitivity').value)/1000});
  updateButtons();
}
async function join(){
  if(closing||!token||joining||socket?.readyState===WebSocket.OPEN||
     socket?.readyState===WebSocket.CONNECTING)return;
  joining=true;setRoom(true);$('room-status').textContent=translation('connecting');
  try{
    const value=await request('/api/ticket',{method:'POST',
      headers:{Authorization:'Bearer '+token},body:'{}'});
    if(closing||!token)return;
    const ws=API.replace(/^http/i,'ws')+'/ws?ticket='+encodeURIComponent(value.ticket);
    const current=new WebSocket(ws);socket=current;
    current.onopen=()=>{
      if(socket!==current||closing)return;
      reconnectTry=0;cancelReconnect();lastVoiceState=Date.now();
      $('room-status').textContent=translation('connected');
      status(translation('connected'),true);
      message('Voice room terhubung. Latar belakang diusahakan aktif bila browser mengizinkan.');
      updateButtons();
    };
    current.onmessage=e=>{
      if(socket!==current)return;
      let msg;try{msg=JSON.parse(e.data);}catch{return;}
      if(msg.t==='state'){lastVoiceState=Date.now();latest=msg;renderState(msg);}
      if(msg.t==='audio'||msg.t==='audioBatch')receiveAudio(msg);
      if(msg.t==='error')message(msg.code,true);
    };
    current.onclose=()=>{
      if(socket!==current||closing)return;
      socket=null;lastVoiceState=0;clearPlayback();
      $('room-status').textContent=translation('reconnecting');
      status(translation('reconnecting'),false);
      scheduleReconnect();
    };
    current.onerror=()=>{$('room-status').textContent=translation('reconnecting');};
  }catch(error){
    message(error.message,true);
    if(/SESSION_EXPIRED|Sesi habis|unauthorized/i.test(error.message)){
      await disconnect();return;
    }
    scheduleReconnect();
  }finally{joining=false;}
}
function renderState(msg){
  if(msg.status!=='connected'){status(translation('offline'),false);return;}
  const myself=msg.self;
  if(!myself){message('Minecraft offline. Login ke server terlebih dahulu.',true);return;}
  $('room-status').textContent=translation('connected');
  if(muted!==!!myself.muted||deafened!==!!myself.deafened||whisper!==!!myself.whisper){
    muted=!!myself.muted;deafened=!!myself.deafened;whisper=!!myself.whisper;
    updateButtons();
  }
  if(Number.isFinite(myself.volume)&&Number($('output-volume').value)!==myself.volume){
    $('output-volume').value=String(myself.volume);outputVolume=myself.volume/100;
    if(speakerGain)speakerGain.gain.value=outputVolume;
  }
  const list=$('nearby-list');list.replaceChildren();
  for(const player of msg.nearby||[]){
    const li=document.createElement('li');
    li.textContent=player.name+' · '+player.distance+' blok'+(player.bedrock?' · Bedrock':' · Java');
    list.append(li);
  }
  if(!list.children.length){const li=document.createElement('li');li.textContent=translation('noNearby');list.append(li);}
}
const audioStreams=new Map();
function clearPlayback(){
  for(const state of audioStreams.values())try{state.gain.disconnect();}catch{}
  audioStreams.clear();
}
async function ensureContext(){
  if(!ctx){
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)throw Error(translation('audioUnavailable'));
    ctx=new Audio({sampleRate:48000,latencyHint:'interactive'});
    speakerGain=ctx.createGain();speakerGain.gain.value=outputVolume;speakerGain.connect(ctx.destination);
  }
  if(ctx.state!=='running')await ctx.resume();
  return ctx;
}
function receiveAudio(msg){
  if(msg.t==='audioBatch'){
    if(!Array.isArray(msg.frames)||msg.frames.length>4)return;
    for(const frame of msg.frames)if(frame&&typeof frame.pcm==='string')
      receiveAudio({...msg,t:'audio',pcm:frame.pcm});
    return;
  }
  if(deafened||!msg.pcm||!ctx||!speakerGain||!me||msg.uuid===me.uuid)return;
  let raw;try{raw=Uint8Array.from(atob(msg.pcm),ch=>ch.charCodeAt(0));}catch{return;}
  if(raw.length!==1920)return;
  const samples=new Float32Array(960);
  const view=new DataView(raw.buffer);
  for(let i=0;i<960;i++)samples[i]=view.getInt16(i*2,true)/32768;
  let state=audioStreams.get(msg.uuid);
  if(!state){
    const panner=ctx.createPanner(),gain=ctx.createGain();
    panner.panningModel='HRTF';panner.distanceModel='inverse';
    panner.refDistance=2;panner.maxDistance=100;panner.rolloffFactor=1.3;
    gain.connect(panner);panner.connect(speakerGain);
    state={panner,gain,next:ctx.currentTime};audioStreams.set(msg.uuid,state);
  }
  const dx=Number(msg.dx)||0,dy=Number(msg.dy)||0,dz=Number(msg.dz)||0;
  const yaw=(Number(msg.yaw)||0)*Math.PI/180;
  const x=-(dx*Math.cos(yaw)+dz*Math.sin(yaw));
  const z=-(dz*Math.cos(yaw)-dx*Math.sin(yaw));
  state.panner.positionX.setTargetAtTime(x,ctx.currentTime,.03);
  state.panner.positionY.setTargetAtTime(dy,ctx.currentTime,.03);
  state.panner.positionZ.setTargetAtTime(z,ctx.currentTime,.03);
  state.gain.gain.value=1;
  const buffer=ctx.createBuffer(1,960,48000);
  buffer.copyToChannel(samples,0);
  const source=ctx.createBufferSource();source.buffer=buffer;source.connect(state.gain);
  const when=Math.max(ctx.currentTime+.04,state.next);
  if(when>ctx.currentTime+.28){state.next=ctx.currentTime+.04;return;}
  source.start(when);source.onended=()=>source.disconnect();
  state.next=when+.02;
}
function flushMic(){
  if(!pendingMic.length)return;
  if(socket?.readyState===WebSocket.OPEN&&socket.bufferedAmount<32*1024){
    socket.send(JSON.stringify({t:'audioBatch',frames:pendingMic}));
  }
  pendingMic=[];
}
function asPCM(samples){
  const bytes=new Uint8Array(1920),view=new DataView(bytes.buffer);
  for(let i=0;i<960;i++)view.setInt16(i*2,Math.max(-32768,Math.min(32767,Math.round(samples[i]*32767*micGain))),true);
  let str='';for(const b of bytes)str+=String.fromCharCode(b);
  return btoa(str);
}
function backgroundInfo(text){
  const state=$('background-state');
  if(state)state.textContent=text;
}
async function activateMic(){
  if(micStarting||!micWanted||stream)return;
  micStarting=true;
  let acquired=null;
  try{
    const context=await ensureContext();
    if(!context.audioWorklet)throw Error(translation('audioUnavailable'));
    const device=$('mic-select').value;
    acquired=await navigator.mediaDevices.getUserMedia({audio:{
      deviceId:device?{exact:device}:undefined,echoCancellation:true,
      noiseSuppression:$('noise-suppression').checked,autoGainControl:true},video:false});
    if(!micWanted){acquired.getTracks().forEach(track=>track.stop());return;}
    stream=acquired;
    if(!workletLoaded){
      await context.audioWorklet.addModule('voice-worklet.js');
      workletLoaded=true;
    }
    micSource=context.createMediaStreamSource(stream);
    worklet=new AudioWorkletNode(context,'sscircle-microphone',{numberOfInputs:1,numberOfOutputs:1});
    worklet.port.onmessage=e=>{
      if(e.data?.t==='level'){$('mic-meter').value=Math.min(1,e.data.value*7);sendLevel=e.data.value;}
      if(e.data?.t==='pcm'&&shouldTransmit()&&socket?.readyState===WebSocket.OPEN&&
         socket.bufferedAmount<32*1024){
        pendingMic.push({pcm:asPCM(e.data.frame)});
        if(pendingMic.length>=3)flushMic();
      }
    };
    micSource.connect(worklet);worklet.connect(context.destination);
    for(const track of acquired.getAudioTracks()){
      track.addEventListener('ended',()=>{
        if(!micWanted||stream!==acquired)return;
        stopMic(true);
        backgroundInfo(translation('micInterrupted'));
        message(translation('micInterrupted'),true);
      });
      track.addEventListener('mute',()=>{
        if(stream===acquired)backgroundInfo(translation('micInterrupted'));
      });
      track.addEventListener('unmute',()=>{
        if(stream===acquired)backgroundInfo(translation('backgroundReady'));
      });
    }
    $('start-mic').textContent=translation('stop');$('start-mic').classList.add('is-active');
    worklet.port.postMessage({t:'sensitivity',value:$('talk-mode').value==='ptt'?0:Number($('sensitivity').value)/1000});
    updateButtons();await updateDevices();backgroundInfo(translation('backgroundReady'));
  }catch(e){
    micWanted=false;stopMic();
    message(e.name==='NotAllowedError'?translation('micDenied'):e.message,true);
    backgroundInfo(translation('micInterrupted'));
  }finally{micStarting=false;}
}
async function startMic(){
  if(micStarting)return;
  if(stream){micWanted=false;stopMic();backgroundInfo(translation('backgroundReady'));return;}
  micWanted=true;
  await activateMic();
}
function stopMic(preserveIntent=false){
  if(!preserveIntent)micWanted=false;
  pendingMic=[];
  if(stream)stream.getTracks().forEach(track=>track.stop());
  stream=null;if(micSource)try{micSource.disconnect();}catch{}
  if(worklet)try{worklet.disconnect();}catch{}
  micSource=null;worklet=null;pttDown=false;
  $('start-mic').textContent=translation('start');$('start-mic').classList.remove('is-active');
  $('mic-meter').value=0;
}
async function recoverVoice(manual=false){
  if(recovering)return;
  recovering=true;
  try{
    // After an OS suspension, a stale WebSocket may still report OPEN.
    if(token&&!closing){
      if(socket?.readyState===WebSocket.OPEN&&lastVoiceState&&
         Date.now()-lastVoiceState>15000){
        closeSocket();clearPlayback();lastVoiceState=0;
      }
      if(!socket||socket.readyState===WebSocket.CLOSED){
        cancelReconnect();void join();
      }
    }
    if(ctx&&ctx.state!=='running'){
      void ctx.resume().catch(()=>backgroundInfo(translation('audioInterrupted')));
    }
    if(micWanted&&(!stream||stream.getAudioTracks().every(t=>t.readyState==='ended'||t.muted))){
      if(manual){
        if(stream)stopMic(true); // Recreate a track that stayed muted after app switching.
        await activateMic();
      }else backgroundInfo(translation('micInterrupted'));
    }else if(ctx?.state==='running'){
      backgroundInfo(translation('backgroundReady'));
    }
  }finally{recovering=false;}
}
async function updateDevices(){
  if(!navigator.mediaDevices?.enumerateDevices)return;
  try{
    const all=await navigator.mediaDevices.enumerateDevices();
    const m=$('mic-select'),current=m.value;m.replaceChildren(new Option('Default microphone',''));
    for(const device of all.filter(d=>d.kind==='audioinput'))
      m.append(new Option(device.label||'Microphone',device.deviceId));
    if([...m.options].some(o=>o.value===current))m.value=current;
    // Sink selection requires a browser implementation and secure context.
    const out=$('speaker-select');
    const supported=typeof ctx?.setSinkId==='function';
    out.disabled=!supported;
    if(supported){
      const selected=out.value;out.replaceChildren(new Option('Default speaker',''));
      for(const device of all.filter(d=>d.kind==='audiooutput'))
        out.append(new Option(device.label||'Speaker',device.deviceId));
      if([...out.options].some(o=>o.value===selected))out.value=selected;
    }
  }catch{}
}
const labels={
  id:{
    subtitle:'Bicara dengan teman Minecraft Java dan Bedrock di sekitar kamu.',
    pairTitle:'Hubungkan akun Minecraft',
    pairInfo:'Masuk ke server melalui Bedrock, ketik <code>/voice link</code> di chat Minecraft, lalu masukkan kode sekali pakai yang muncul.',
    pairLabel:'Kode pairing (8 karakter)',pairHint:'Kode berlaku 2 menit dan hanya bisa dipakai sekali. Jangan membagikannya.',
    near:'Pemain yang terdengar',talk:'Mode bicara',ptt:'Tahan untuk berbicara',
    mic:'Input mikrofon',speaker:'Output speaker',sensitivity:'Sensitivitas mikrofon',
    input:'Volume input',output:'Volume output',meter:'Level mikrofon',
    noise:'Peredam kebisingan (jika didukung)',testMic:'Uji mikrofon',
    testSpeaker:'Uji speaker',mode:'Mode suara',group:'Gabung grup',
    notice:'Pilih Voice Activation untuk bicara saat membuka Minecraft; Push-to-Talk hanya berfungsi ketika halaman aktif. Android/iOS bisa membekukan tab, mikrofon, atau WebSocket. Pulihkan Voice jika terhenti. Jangan tutup tab atau hentikan paksa browser.',
    backgroundTitle:'Voice saat pindah aplikasi',recover:'Pulihkan Voice',backgroundReady:'Voice diusahakan tetap aktif saat pindah aplikasi. Jangan tutup tab.',
    backgroundHidden:'Halaman berjalan di latar belakang jika diizinkan perangkat.',
    micInterrupted:'Mikrofon dihentikan perangkat. Kembali ke halaman lalu tekan Pulihkan Voice.',
    audioInterrupted:'Audio ditangguhkan. Tekan Pulihkan Voice untuk melanjutkan.'
  },
  en:{
    subtitle:'Talk to nearby Minecraft Java and Bedrock friends.',
    pairTitle:'Link your Minecraft account',
    pairInfo:'Join the server using Bedrock, type <code>/voice link</code> in Minecraft chat, then enter the one-time code shown.',
    pairLabel:'Pairing code (8 characters)',pairHint:'Codes expire after 2 minutes and can only be used once. Never share yours.',
    near:'Players you can hear',talk:'Speaking mode',ptt:'Hold to speak',
    mic:'Microphone input',speaker:'Speaker output',sensitivity:'Microphone sensitivity',
    input:'Input volume',output:'Output volume',meter:'Microphone level',
    noise:'Noise suppression (if available)',testMic:'Test microphone',
    testSpeaker:'Test speaker',mode:'Voice mode',group:'Join group',
    notice:'Use Voice Activation while Minecraft is in front; Push-to-Talk only works when this page is active. Android/iOS may suspend the tab, mic, or WebSocket. Tap Restore Voice if interrupted. Keep the tab open.',
    backgroundTitle:'Voice when switching apps',recover:'Restore Voice',backgroundReady:'Voice stays active when supported. Keep this tab open.',
    backgroundHidden:'Background voice continues if your device permits it.',
    micInterrupted:'The device stopped the microphone. Return and tap Restore Voice.',
    audioInterrupted:'Audio was suspended. Tap Restore Voice to resume.'
  }
};
const put=(selector,value,html=false)=>{
  const target=document.querySelector(selector);
  if(target){if(html)target.innerHTML=value;else target.textContent=value;}
};
function translateInterface(){
  const a=labels[lang];
  put('#subtitle',a.subtitle);put('#pair-title',a.pairTitle);
  put('#pair-info',a.pairInfo,true);put('#pair-label',a.pairLabel);
  put('.voice-hint',a.pairHint);put('#nearby-title',a.near);
  put('#talk-mode-label',a.talk);put('#ptt',a.ptt);
  put('label[for="mic-select"]',a.mic);
  put('label[for="speaker-select"]',a.speaker);
  put('label[for="sensitivity"]',a.sensitivity);
  put('label[for="mic-volume"]',a.input);
  put('label[for="output-volume"]',a.output);
  put('label[for="mic-meter"]',a.meter);
  put('#noise-label',a.noise);
  put('#test-mic',a.testMic);put('#test-speaker',a.testSpeaker);
  put('.voice-groups h3',a.mode);put('#join-group',a.group);
  put('.voice-mobile-warning',a.notice);put('#background-title',a.backgroundTitle);put('#recover-voice',a.recover);
  if(!document.hidden)backgroundInfo(a.backgroundReady);
}
function updateAppDownloads(){
  const config=window.SSCIRCLE_VOICE_DOWNLOADS||{};
  const android=typeof config.android==='string'&&
    /^https:\/\/github\.com\/locdaily-store\/SSCircle-Web\/releases\/download\/[a-z0-9._-]+\/[a-z0-9._-]+\.apk$/i.test(config.android)
    ?config.android:'https://github.com/locdaily-store/SSCircle-Web/releases/download/sscircle-voice-android-preview/SSCircle-Voice-Android.apk';
  const ios=typeof config.ios==='string'&&
    /^https:\/\/(?:testflight\.apple\.com\/join\/[a-z0-9]+|apps\.apple\.com\/[a-z]{2}\/app\/[^?#]+\/id[0-9]+)\/?$/i.test(config.ios)
    ?config.ios:'';
  const en=lang==='en';
  const subtitle=$('voice-app-description');
  if(!subtitle)return; // Allows existing isolated browser tests to run.
  $('voice-app-title').textContent=en?'SSCircle Voice for phones':'SSCircle Voice untuk HP';
  subtitle.textContent=en?'Use a dedicated Voice app while playing Minecraft. Choose your platform.':
    'Aplikasi pendamping untuk berbicara saat membuka Minecraft. Pilih perangkatmu.';
  $('voice-download-android').href=android||
    'https://github.com/locdaily-store/SSCircle-Web/actions/workflows/cross-voice-android.yml';
  $('voice-download-ios').href=ios||
    'https://github.com/locdaily-store/SSCircle-Web/blob/feature/sscircle-cross-voice/cross-voice/mobile/ios/README-ID.md';
  $('voice-android-action').textContent=android?(en?'Download Android APK':'Unduh APK Android'):
    (en?'View Android APK builds':'Lihat build APK Android');
  $('voice-ios-action').textContent=ios?(en?'Install iOS app':'Unduh aplikasi iOS'):
    (en?'iOS installation guide':'Panduan aplikasi iOS');
  $('voice-android-note').textContent=android?
    (en?'Official SSCircle Android test APK.':'APK uji SSCircle untuk Android.'):
    (en?'No published APK yet. Check the Actions build results.':
      'APK belum dipublikasikan. Buka hasil build di GitHub Actions.');
  $('voice-ios-note').textContent=ios?
    (en?'Opens the official iOS App Store/TestFlight listing.':
      'Membuka halaman App Store/TestFlight resmi.'):
    (en?'No TestFlight link yet. Apple code signing is required.':
      'Belum ada tautan TestFlight. Instalasi memerlukan penandatanganan Apple.');
}
function setLanguage(){
  lang=$('language').value;document.documentElement.lang=lang;
  translateInterface();
  updateAppDownloads();
  $('start-mic').textContent=stream?translation('stop'):translation('start');
  if(!me)status(translation('status'),false);
  $('join-group').textContent=translation('group');
}
$('language').onchange=setLanguage;
$('pair-code').oninput=()=>{$('pair-code').value=$('pair-code').value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g,'').slice(0,8);};
$('pair-form').onsubmit=async e=>{
  e.preventDefault();if(!API){pairMessage(translation('noConfig'),true);return;}
  $('pair-submit').disabled=true;pairMessage('Menghubungkan akun...');
  try{
    const out=await request('/api/pair',{method:'POST',
      body:JSON.stringify({code:$('pair-code').value})});
    token=out.token;me=out.player;closing=false;cancelReconnect();reconnectTry=0;
    pairMessage(translation('paired'));setRoom(true);await join();
  }catch(error){pairMessage(error.message,true);}
  finally{$('pair-submit').disabled=false;}
};
$('disconnect').onclick=disconnect;
$('start-mic').onclick=startMic;
$('mute').onclick=()=>{muted=!muted;control(muted?'mute':'unmute');updateButtons();};
$('deafen').onclick=()=>{deafened=!deafened;control(deafened?'deafen':'undeafen');updateButtons();};
$('whisper').onclick=()=>{whisper=!whisper;control(whisper?'whisper':'normal');updateButtons();};
$('talk-mode').onchange=setMode;
$('mic-select').onchange=async()=>{if(stream){stopMic();await startMic();}};
$('speaker-select').onchange=async()=>{if(ctx?.setSinkId)try{await ctx.setSinkId($('speaker-select').value);}catch(e){message(e.message,true);}};
$('sensitivity').oninput=()=>worklet?.port.postMessage({t:'sensitivity',value:$('talk-mode').value==='ptt'?0:Number($('sensitivity').value)/1000});
$('mic-volume').oninput=()=>micGain=Number($('mic-volume').value)/100;
$('noise-suppression').onchange=async()=>{
  if(stream)for(const track of stream.getAudioTracks())try{
    await track.applyConstraints({noiseSuppression:$('noise-suppression').checked});
  }catch(e){message('Noise suppression tidak didukung oleh mikrofon/browser ini.',true);}
};
$('output-volume').oninput=()=>{
  outputVolume=Number($('output-volume').value)/100;
  if(speakerGain)speakerGain.gain.value=outputVolume;
  control('volume',$('output-volume').value);
};
$('ptt').addEventListener('pointerdown',e=>{e.preventDefault();pttDown=true;updateButtons();});
for(const ev of ['pointerup','pointercancel','pointerleave'])
  $('ptt').addEventListener(ev,()=>{pttDown=false;updateButtons();});
window.addEventListener('keydown',e=>{
  if(e.key.toLowerCase()==='v'&&!e.repeat&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){
    pttDown=true;updateButtons();
  }
});
window.addEventListener('keyup',e=>{if(e.key.toLowerCase()==='v'){pttDown=false;updateButtons();}});
$('test-speaker').onclick=async()=>{
  try{const ac=await ensureContext(),o=ac.createOscillator(),gain=ac.createGain();
    o.type='sine';o.frequency.value=660;gain.gain.value=.08;
    o.connect(gain);gain.connect(speakerGain);o.start();o.stop(ac.currentTime+.15);
    o.onended=()=>{o.disconnect();gain.disconnect();};
  }catch(e){message(e.message,true);}
};
$('test-mic').onclick=async()=>{
  if(!stream){message('Aktifkan mikrofon terlebih dahulu.',true);return;}
  message('Level mikrofon: '+Math.round(sendLevel*1000)/10+'%. Indikator berada di pengaturan.');
};
for(const input of document.querySelectorAll('input[name=voice-mode]'))
  input.onchange=()=>{
    const group=input.value==='group'&&input.checked;
    $('group-name').disabled=!group;$('join-group').disabled=!group;
    if(!group)control('leave-group');
  };
$('join-group').onclick=()=>{
  const name=$('group-name').value.trim();
  if(!/^[A-Za-z0-9_-]{1,24}$/.test(name)){message('Nama grup hanya huruf, angka, - atau _.',true);return;}
  control('group',name);message('Permintaan gabung grup '+name+' dikirim.');
};
$('recover-voice').onclick=()=>void recoverVoice(true);
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    // Never leave a held PTT key active after switching apps.
    if(pttDown){pttDown=false;updateButtons();}
    backgroundInfo(translation('backgroundHidden'));
  }else void recoverVoice();
});
window.addEventListener('pageshow',()=>void recoverVoice());
window.addEventListener('focus',()=>{if(!document.hidden)void recoverVoice();});
window.addEventListener('online',()=>{if(!document.hidden)void recoverVoice();});
// Mobile may enter bfcache on pagehide; do not deliberately close voice resources.
// Real navigation/tab closure is handled by the browser. Explicit Disconnect still closes all.
window.addEventListener('pagehide',()=>{
  if(pttDown){pttDown=false;updateButtons();}
});
if(API){
  request('/api/health').then(h=>status(h.ready?translation('ready'):translation('offline'),h.ready))
    .catch(()=>status(translation('offline'),false));
}else status(translation('noConfig'),false);
setMode();setLanguage();setRoom(false);
})();
