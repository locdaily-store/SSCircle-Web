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
   noConfig:'Alamat gateway belum diatur. Admin harus mengedit voice-config.js.',
   noNearby:'Tidak ada pemain dalam jangkauan.',group:'Gabung grup'},
 en:{start:'Enable microphone',stop:'Disable microphone',status:'Checking server...',
   offline:'Voice gateway offline. Check the voice server.',ready:'Gateway online',
   disconnected:'Disconnected',connecting:'Connecting...',connected:'Connected',
   reconnecting:'Reconnecting...',paired:'Account paired successfully.',
   micDenied:'Microphone permission denied. Review browser permissions and enable it manually.',
   audioUnavailable:'AudioWorklet is unsupported. Please use a current browser.',
   invalid:'Pairing code invalid, expired, or already used.',
   noConfig:'Voice gateway is not configured. Admin must edit voice-config.js.',
   noNearby:'No players within hearing range.',group:'Join group'}
};
let lang='id',token='',socket=null,me=null,latest=null,ctx=null,stream=null,worklet=null,
  micSource=null,micGain=1,speakerGain=null,pttDown=false,muted=false,deafened=false,
  whisper=false,closing=false,reconnectTry=0,sendLevel=0,outputVolume=1,playing=new Map();
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
  if(socket){const old=socket;socket=null;old.onclose=null;old.onmessage=null;old.close(1000,'user');}
}
async function disconnect(){
  closing=true;closeSocket();
  if(token)try{await request('/api/disconnect',{method:'POST',headers:{Authorization:'Bearer '+token}});}catch{}
  token='';me=null;latest=null;reconnectTry=0;
  stopMic();clearPlayback();setRoom(false);status(translation('disconnected'),false);
}
function control(action,value=''){
  if(socket?.readyState===WebSocket.OPEN)
    socket.send(JSON.stringify({t:'control',action,value:String(value)}));
}
function updateButtons(){
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
  updateButtons();
}
async function join(){
  closing=false;setRoom(true);$('room-status').textContent=translation('connecting');
  try{
    const value=await request('/api/ticket',{method:'POST',
      headers:{Authorization:'Bearer '+token},body:'{}'});
    if(closing)return;
    const ws=API.replace(/^http/i,'ws')+'/ws?ticket='+encodeURIComponent(value.ticket);
    const current=new WebSocket(ws);socket=current;
    current.onopen=()=>{
      reconnectTry=0;$('room-status').textContent=translation('connected');
      status(translation('connected'),true);message('Voice room terhubung. Aktifkan mikrofon untuk mulai berbicara.');
      updateButtons();
    };
    current.onmessage=e=>{
      let msg;try{msg=JSON.parse(e.data);}catch{return;}
      if(msg.t==='state'){latest=msg;renderState(msg);}
      if(msg.t==='audio')receiveAudio(msg);
      if(msg.t==='error')message(msg.code,true);
    };
    current.onclose=()=>{
      if(socket!==current||closing)return;
      socket=null;$('room-status').textContent=translation('reconnecting');
      status(translation('reconnecting'),false);
      if(++reconnectTry>8){message('Koneksi terputus. Gunakan /voice link lagi.',true);return;}
      setTimeout(()=>{if(!closing&&token)join();},Math.min(15000,1000*Math.pow(1.6,reconnectTry)));
    };
    current.onerror=()=>{$('room-status').textContent=translation('disconnected');};
  }catch(error){
    message(error.message,true);
    if(/SESSION_EXPIRED|Sesi habis|unauthorized/i.test(error.message)){await disconnect();return;}
    if(!closing&&++reconnectTry<=8)setTimeout(join,Math.min(15000,1200*Math.pow(1.6,reconnectTry)));
  }
}
function renderState(msg){
  if(msg.status!=='connected'){status(translation('offline'),false);return;}
  const myself=msg.self;
  if(!myself){message('Minecraft offline. Login ke server terlebih dahulu.',true);return;}
  $('room-status').textContent=translation('connected');
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
  if(ctx.state==='suspended')await ctx.resume();
  return ctx;
}
function receiveAudio(msg){
  if(deafened||!msg.pcm||!ctx||!speakerGain||!me||msg.uuid===me.uuid)return;
  let raw;try{raw=Uint8Array.from(atob(msg.pcm),ch=>ch.charCodeAt(0));}catch{return;}
  if(raw.length!==1920)return;
  const samples=new Float32Array(960);
  const view=new DataView(raw.buffer);
  for(let i=0;i<960;i++)samples[i]=view.getInt16(i*2,true)/32768;
  let state=audioStreams.get(msg.uuid);
  if(!state){
    const pan=ctx.createStereoPanner(),gain=ctx.createGain();
    gain.connect(pan);pan.connect(speakerGain);
    state={pan,gain,next:ctx.currentTime};audioStreams.set(msg.uuid,state);
  }
  const dx=Number(msg.dx)||0,dz=Number(msg.dz)||0;
  const distance=Math.hypot(dx,dz),attenuation=Math.max(.08,1-distance/48);
  const yaw=(Number(msg.yaw)||0)*Math.PI/180;
  state.pan.pan.value=Math.max(-1,Math.min(1,-(dx*Math.cos(yaw)+dz*Math.sin(yaw))/Math.max(1,distance)));
  state.gain.gain.value=attenuation;
  const buffer=ctx.createBuffer(1,960,48000);
  buffer.copyToChannel(samples,0);
  const source=ctx.createBufferSource();source.buffer=buffer;source.connect(state.gain);
  const when=Math.max(ctx.currentTime+.04,state.next);
  if(when>ctx.currentTime+.28){state.next=ctx.currentTime+.04;return;}
  source.start(when);source.onended=()=>source.disconnect();
  state.next=when+.02;
}
function asPCM(samples){
  const bytes=new Uint8Array(1920),view=new DataView(bytes.buffer);
  for(let i=0;i<960;i++)view.setInt16(i*2,Math.max(-32768,Math.min(32767,Math.round(samples[i]*32767*micGain))),true);
  let str='';for(const b of bytes)str+=String.fromCharCode(b);
  return btoa(str);
}
async function startMic(){
  if(stream){stopMic();return;}
  try{
    const context=await ensureContext();
    if(!context.audioWorklet)throw Error(translation('audioUnavailable'));
    const device=$('mic-select').value;
    stream=await navigator.mediaDevices.getUserMedia({audio:{
      deviceId:device?{exact:device}:undefined,echoCancellation:true,
      noiseSuppression:$('noise-suppression').checked,autoGainControl:true},video:false});
    await context.audioWorklet.addModule('voice-worklet.js');
    micSource=context.createMediaStreamSource(stream);
    worklet=new AudioWorkletNode(context,'sscircle-microphone',{numberOfInputs:1,numberOfOutputs:1});
    worklet.port.onmessage=e=>{
      if(e.data?.t==='level'){$('mic-meter').value=Math.min(1,e.data.value*7);sendLevel=e.data.value;}
      if(e.data?.t==='pcm'&&shouldTransmit()&&socket?.readyState===WebSocket.OPEN&&
         socket.bufferedAmount<32*1024){
        socket.send(JSON.stringify({t:'audio',pcm:asPCM(e.data.frame)}));
      }
    };
    micSource.connect(worklet);worklet.connect(context.destination);
    $('start-mic').textContent=translation('stop');$('start-mic').classList.add('is-active');
    worklet.port.postMessage({t:'sensitivity',value:Number($('sensitivity').value)/1000});
    updateButtons();await updateDevices();
  }catch(e){
    stopMic();message(e.name==='NotAllowedError'?translation('micDenied'):e.message,true);
  }
}
function stopMic(){
  if(stream)stream.getTracks().forEach(track=>track.stop());
  stream=null;if(micSource)try{micSource.disconnect();}catch{}
  if(worklet)try{worklet.disconnect();}catch{}
  micSource=null;worklet=null;pttDown=false;
  $('start-mic').textContent=translation('start');$('start-mic').classList.remove('is-active');
  $('mic-meter').value=0;
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
function setLanguage(){
  lang=$('language').value;document.documentElement.lang=lang;
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
    token=out.token;me=out.player;
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
$('sensitivity').oninput=()=>worklet?.port.postMessage({t:'sensitivity',value:Number($('sensitivity').value)/1000});
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
document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&stream)message('Browser dapat menghentikan mikrofon di background. Pastikan izin tetap aktif.');
});
window.addEventListener('pagehide',()=>{stopMic();closeSocket();});
if(API){
  request('/api/health').then(h=>status(h.ready?translation('ready'):translation('offline'),h.ready))
    .catch(()=>status(translation('offline'),false));
}else status(translation('noConfig'),false);
setMode();setLanguage();setRoom(false);
})();
