import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../voice.js',import.meta.url),'utf8');

test('Page lifecycle retains microphone and socket, then restores an interrupted connection',async()=>{
  const elements=new Map(),docEvents=new Map(),winEvents=new Map(),clients=[],timers=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{
      id,value:id==='language'?'id':id==='talk-mode'?'ptt':id==='output-volume'?'100':'',
      hidden:false,textContent:'',classList:{add(){},remove(){}},
      setAttribute(){},replaceChildren(){},append(){},addEventListener(){},
      get options(){return [];}
    });
    return elements.get(id);
  };
  const trackEvents=new Map();
  const track={readyState:'live',stopped:0,
    stop(){this.stopped++;this.readyState='ended';},
    addEventListener(name,fn){trackEvents.set(name,fn);}
  };
  const microphone={getAudioTracks(){return [track];},getTracks(){return [track];}};
  class FakeAudioContext {
    constructor(){this.state='running';this.destination={};this.audioWorklet={addModule:async()=>{}};}
    createGain(){return {gain:{value:1},connect(){},disconnect(){}};}
    createMediaStreamSource(){return {connect(){},disconnect(){}};}
    resume(){this.state='running';return Promise.resolve();}
  }
  class FakeWorklet {
    constructor(){this.port={postMessage(){}};}
    connect(){}
    disconnect(){}
  }
  class FakeSocket {
    static OPEN=1;
    static CONNECTING=0;
    static CLOSED=3;
    constructor(){this.readyState=1;this.bufferedAmount=0;this.closed=0;clients.push(this);}
    close(){this.closed++;this.readyState=3;}
    send(){}
  }
  const document={
    hidden:false,documentElement:{lang:'id'},activeElement:{tagName:'BODY'},
    getElementById:element,querySelector(){return null;},querySelectorAll(){return [];},
    addEventListener(name,fn){docEvents.set(name,fn);}
  };
  const window={
    SSCIRCLE_VOICE_GATEWAY:'https://voice.example.test',AudioContext:FakeAudioContext,
    addEventListener(name,fn){winEvents.set(name,fn);}
  };
  const navigator={mediaDevices:{
    getUserMedia:async()=>microphone,enumerateDevices:async()=>[]
  }};
  const fetch=async(url)=>{
    const data=url.endsWith('/api/health')?{ready:true}:
      url.endsWith('/api/pair')?{token:'session',player:{uuid:'abc',name:'Player'}}:
      url.endsWith('/api/ticket')?{ticket:'ticket'}:{ok:true};
    return new Response(JSON.stringify(data),{status:200});
  };
  const fakeTimeout=(fn,delay)=>{
    const timer={fn,delay,cancelled:false};timers.push(timer);return timer;
  };
  runInNewContext(source,{
    window,document,navigator,fetch,WebSocket:FakeSocket,AudioWorkletNode:FakeWorklet,
    Option:class {constructor(label,value){this.label=label;this.value=value;}},
    Response,setTimeout:fakeTimeout,clearTimeout(timer){timer.cancelled=true;},
    console
  },{filename:'voice.js'});
  await elements.get('pair-form').onsubmit({preventDefault(){}});
  assert.equal(clients.length,1);
  clients[0].onopen();
  await elements.get('start-mic').onclick();
  assert.equal(track.stopped,0,'microphone starts only after pressing the button');
  document.hidden=true;
  docEvents.get('visibilitychange')();
  winEvents.get('pagehide')();
  assert.equal(track.stopped,0,'pagehide must not stop a consenting microphone');
  assert.equal(clients[0].closed,0,'pagehide must not close the live socket');
  document.hidden=false;
  docEvents.get('visibilitychange')();
  await Promise.resolve();
  assert.equal(clients[0].closed,0,'returning promptly should preserve a live socket');

  clients[0].readyState=3;
  clients[0].onclose();
  assert.ok(timers.some(t=>!t.cancelled),'network failure schedules a reconnect');
  winEvents.get('pageshow')();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(clients.length,2,'pageshow reconnects immediately without waiting for throttled timers');
  assert.equal(track.stopped,0,'reconnecting does not stop an active microphone');

  await elements.get('disconnect').onclick();
  assert.equal(track.stopped,1,'explicit disconnect releases microphone');
});

test('Voice background implementation is transparent and does not persist microphone tokens',()=>{
  const html=readFileSync(new URL('../voice.html',import.meta.url),'utf8');
  assert.match(html,/id="recover-voice"/);
  assert.match(html,/id="background-state"/);
  assert.match(source,/document\.addEventListener\('visibilitychange'/);
  assert.match(source,/window\.addEventListener\('pageshow'/);
  assert.match(source,/window\.addEventListener\('online'/);
  assert.doesNotMatch(source,/reconnectTry\s*>\s*8/);
  assert.doesNotMatch(source,/(?:localStorage|sessionStorage)\.setItem\(/);
});
