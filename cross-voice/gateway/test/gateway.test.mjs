import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createGateway} from '../server.mjs';

const origin='https://sscircle.test';
const secret='voice-gateway-shared-secret-very-long-and-random';
const A='11111111-1111-4111-8111-111111111111'; // Bedrock
const B='22222222-2222-4222-8222-222222222222'; // Bedrock
const C='33333333-3333-4333-8333-333333333333'; // Java
const D='44444444-4444-4444-8444-444444444444'; // Other world
const players=[
  {uuid:A,name:'BedrockOne',world:'world-one',x:0,y:70,z:0,bedrock:true},
  {uuid:B,name:'BedrockTwo',world:'world-one',x:5,y:70,z:0,bedrock:true},
  {uuid:C,name:'JavaOne',world:'world-one',x:3,y:70,z:0,bedrock:false},
  {uuid:D,name:'FarWorld',world:'world-two',x:0,y:70,z:0,bedrock:true}
];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function next(ws,pred,ms=4000){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{ws.off('message',listener);reject(Error('Missing expected WebSocket frame'));},ms);
    const listener=data=>{
      let msg;try{msg=JSON.parse(data.toString());}catch{return;}
      if(pred(msg)){clearTimeout(timer);ws.off('message',listener);resolve(msg);}
    };
    ws.on('message',listener);
  });
}
async function open(url,options){
  const ws=new WebSocket(url,options);
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  return ws;
}
test('one-time pairing, native Java / Bedrock PCM relay, same-world proximity and forced logout',async()=>{
  const app=createGateway({port:0,bridgeSecret:secret,origin,radius:32,maxClients:10});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const address='http://127.0.0.1:'+app.server.address().port;
  const wsurl=address.replace('http:','ws:');
  let bridge,clientA,clientB,clientD;
  const api=async(path,body,token)=>{
    const response=await fetch(address+path,{method:'POST',
      headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
      body:JSON.stringify(body||{})});
    return {status:response.status,data:await response.json()};
  };
  async function link(code,uuid){
    bridge.send(JSON.stringify({t:'code',code,uuid,expires:Date.now()+60000}));
    await pause(20);
    const paired=await api('/api/pair',{code});
    assert.equal(paired.status,200,JSON.stringify(paired.data));
    const duplicated=await api('/api/pair',{code});
    assert.equal(duplicated.status,401,'one-time code cannot be replayed');
    const ticket=await api('/api/ticket',{},paired.data.token);
    assert.equal(ticket.status,200);
    return {ws:await open(wsurl+'/ws?ticket='+ticket.data.ticket,{headers:{Origin:origin}}),
      token:paired.data.token};
  }
  try{
    bridge=await open(wsurl+'/bridge',{headers:{Authorization:'Bearer '+secret}});
    bridge.send(JSON.stringify({t:'snapshot',voiceReady:true,players}));
    await pause(20);
    const a=await link('ABCDEFGH',A),b=await link('JKLMNPQR',B),d=await link('STUVWXYZ',D);
    clientA=a.ws;clientB=b.ws;clientD=d.ws;
    const pcm=Buffer.alloc(1920,25).toString('base64');
    const javaReceives=next(bridge,m=>m.t==='audio'&&m.uuid===A);
    const bedrockReceives=next(clientB,m=>m.t==='audio'&&m.uuid===A);
    clientA.send(JSON.stringify({t:'audio',pcm}));
    assert.equal((await javaReceives).pcm,pcm,'Paper receives actual PCM bytes');
    assert.equal((await bedrockReceives).pcm,pcm,'Bedrock hears nearby Bedrock');
    const javaAudio=next(clientA,m=>m.t==='audio'&&m.uuid===C);
    bridge.send(JSON.stringify({t:'audio',uuid:C,pcm}));
    assert.equal((await javaAudio).pcm,pcm,'Bedrock hears native Java PCM');
    // World boundary: player D must not receive C's sound.
    let leaked=false;const listener=data=>{
      try{const msg=JSON.parse(data.toString());if(msg.t==='audio'&&msg.uuid===C)leaked=true;}
      catch{}
    };
    clientD.on('message',listener);
    bridge.send(JSON.stringify({t:'audio',uuid:C,pcm}));
    await pause(70);clientD.off('message',listener);
    assert.equal(leaked,false,'cross-world audio is isolated');
    assert.equal((await api('/api/disconnect',{},a.token)).status,200);
    assert.equal((await api('/api/ticket',{},a.token)).status,401,'logout revokes session');
    assert.ok(app.debug().up>0&&app.debug().down>0);
  } finally{
    for(const ws of [clientA,clientB,clientD,bridge])try{ws?.terminate();}catch{}
    await app.close();
  }
});

test('pairing requires correct origin, matching server and rate limit',async()=>{
  const app=createGateway({port:0,bridgeSecret:secret,origin});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  try{
    let result=await fetch(base+'/api/pair',{method:'POST',headers:{
      Origin:'https://attacker.example','Content-Type':'application/json'},
      body:'{"code":"ABCDEFGH"}'});
    assert.equal(result.status,403);
    for(let i=0;i<8;i++){
      result=await fetch(base+'/api/pair',{method:'POST',headers:{
        Origin:origin,'Content-Type':'application/json'},body:'{"code":"ABCDEFGH"}'});
      assert.equal(result.status,503,'offline gateway does not accept pairing');
    }
    result=await fetch(base+'/api/pair',{method:'POST',headers:{
      Origin:origin,'Content-Type':'application/json'},body:'{"code":"ABCDEFGH"}'});
    assert.equal(result.status,429,'IP throttling prevents unlimited attempts');
  }finally{await app.close();}
});

test('voice chat unavailable blocks pairing; bridge restart revokes old browser session',async()=>{
  const app=createGateway({port:0,bridgeSecret:secret,origin,maxClients:6});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  const wsbase=base.replace('http:','ws:');
  let bridge;
  const call=async(path,payload,auth)=>{
    const r=await fetch(base+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',
      ...(auth?{Authorization:'Bearer '+auth}:{})},body:JSON.stringify(payload||{})});
    return {status:r.status,data:await r.json()};
  };
  try{
    bridge=await open(wsbase+'/bridge',{headers:{Authorization:'Bearer '+secret}});
    bridge.send(JSON.stringify({t:'snapshot',voiceReady:false,players}));
    await pause(30);
    assert.equal((await (await fetch(base+'/api/health')).json()).ready,false);
    assert.equal((await call('/api/pair',{code:'ZZZZZZZZ'})).status,503);
    bridge.send(JSON.stringify({t:'snapshot',voiceReady:true,players}));
    bridge.send(JSON.stringify({t:'code',code:'ABCDEFGH',uuid:A,expires:Date.now()+60000}));
    await pause(30);
    const paired=await call('/api/pair',{code:'ABCDEFGH'});
    assert.equal(paired.status,200);
    bridge.terminate();await pause(80);
    const replacement=await open(wsbase+'/bridge',{headers:{Authorization:'Bearer '+secret}});
    bridge=replacement;
    bridge.send(JSON.stringify({t:'snapshot',voiceReady:true,players}));
    await pause(40);
    assert.equal((await call('/api/ticket',{},paired.data.token)).status,401,
      'tokens from a previous server connection must not be reusable');
  }finally{bridge?.terminate();await app.close();}
});

test('private groups, deafen and whisper never leak PCM to wrong listener',async()=>{
  const app=createGateway({port:0,bridgeSecret:secret,origin,radius:32,whisperRadius:8});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port,wsbase=base.replace('http:','ws:');
  let bridge,clientA,clientB;
  const pair=async(code,uuid)=>{
    bridge.send(JSON.stringify({t:'code',code,uuid,expires:Date.now()+60000}));
    await pause(20);
    const r=await fetch(base+'/api/pair',{method:'POST',
      headers:{Origin:origin,'Content-Type':'application/json'},
      body:JSON.stringify({code})});
    assert.equal(r.status,200);
    const token=(await r.json()).token;
    const k=await fetch(base+'/api/ticket',{method:'POST',
      headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+token},body:'{}'});
    assert.equal(k.status,200);
    return open(wsbase+'/ws?ticket='+(await k.json()).ticket,{headers:{Origin:origin}});
  };
  try{
    bridge=await open(wsbase+'/bridge',{headers:{Authorization:'Bearer '+secret}});
    const near=players.filter(p=>p.uuid===A||p.uuid===B)
      .map(x=>({...x,group:x.uuid===A?'group-one':'group-two'}));
    bridge.send(JSON.stringify({t:'snapshot',voiceReady:true,players:near}));await pause(20);
    clientA=await pair('ABCDEFGH',A);
    clientB=await pair('JKLMNPQR',B);
    const pcm=Buffer.alloc(1920).toString('base64');
    let received=0;
    const handler=data=>{try{const v=JSON.parse(data.toString());if(v.t==='audio')received++;}catch{}};
    clientB.on('message',handler);
    clientA.send(JSON.stringify({t:'audio',pcm}));
    await pause(80);assert.equal(received,0,'different voice groups must be isolated');
    bridge.send(JSON.stringify({t:'snapshot',voiceReady:true,players:near.map(x=>({...x,group:'',
      deafened:x.uuid===B}))}));await pause(25);
    clientA.send(JSON.stringify({t:'audio',pcm}));await pause(70);
    assert.equal(received,0,'deafened listeners must not receive audio');
    bridge.send(JSON.stringify({t:'snapshot',voiceReady:true,players:near.map(x=>({...x,group:'',
      deafened:false,x:x.uuid===B?20:0,whisper:x.uuid===A}))}));await pause(25);
    clientA.send(JSON.stringify({t:'audio',pcm}));await pause(70);
    assert.equal(received,0,'whisper cannot reach listener beyond whisper radius');
    bridge.send(JSON.stringify({t:'snapshot',voiceReady:true,players:near.map(x=>({...x,group:'',
      deafened:false,x:x.uuid===B?5:0,whisper:x.uuid===A}))}));await pause(25);
    clientA.send(JSON.stringify({t:'audio',pcm}));await pause(70);
    assert.ok(received>=1,'listener now within whisper radius can hear');
  }finally{
    for(const ws of [clientA,clientB,bridge])try{ws?.terminate();}catch{}
    await app.close();
  }
});
