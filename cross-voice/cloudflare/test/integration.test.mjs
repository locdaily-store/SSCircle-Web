// Run against local Wrangler Durable Object runtime, not mocked functions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';

const http=process.env.CROSS_VOICE_TEST_URL||'http://127.0.0.1:8892';
const wsOrigin=http.replace(/^http/,'ws');
const origin='https://sscircle.test';
const secret='local-development-bridge-secret-not-for-production-123456';
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const C='33333333-3333-4333-8333-333333333333';
const D='44444444-4444-4444-8444-444444444444';
const basePlayers=[
  {uuid:A,name:'BedrockA',world:'world_one',x:0,y:65,z:0,bedrock:true},
  {uuid:B,name:'BedrockB',world:'world_one',x:5,y:65,z:0,bedrock:true},
  {uuid:C,name:'JavaC',world:'world_one',x:4,y:65,z:0,bedrock:false},
  {uuid:D,name:'BedrockD',world:'world_two',x:4,y:65,z:0,bedrock:true}
];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function openWs(path,headers={}){
  const socket=new WebSocket(wsOrigin+path,{headers});
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('WebSocket open timed out')),7000);
    socket.once('open',()=>{clearTimeout(timer);resolve();});
    socket.once('error',e=>{clearTimeout(timer);reject(e);});
  });
  return socket;
}
const get=(path,headers={})=>fetch(http+path,{headers}).then(r=>r.json());
const post=async(path,body={},token='',extra={})=>{
  const r=await fetch(http+path,{method:'POST',
    headers:{Origin:origin,'Content-Type':'application/json',
      ...(token?{Authorization:'Bearer '+token}:{}),...extra},
    body:JSON.stringify(body)});
  return {status:r.status,data:await r.json()};
};
const send=(ws,payload)=>ws.send(JSON.stringify(payload));
async function next(ws,pred,timeout=5000){
  return new Promise((resolve,reject)=>{
    const clock=setTimeout(()=>{ws.off('message',listener);reject(Error('Expected WebSocket frame did not arrive'));},timeout);
    function listener(buf){
      try{
        const data=JSON.parse(buf.toString());
        if(!pred(data))return;
        clearTimeout(clock);ws.off('message',listener);resolve(data);
      }catch{}
    }
    ws.on('message',listener);
  });
}
async function pair(bridge,code,id){
  send(bridge,{t:'code',code,uuid:id,expires:Date.now()+120000});
  await sleep(90);
  const p=await post('/api/pair',{code});
  assert.equal(p.status,200,JSON.stringify(p));
  const replay=await post('/api/pair',{code});
  assert.equal(replay.status,401,'pairing code must only work once');
  const t=await post('/api/ticket',{},p.data.token);
  assert.equal(t.status,200,'session must issue a websocket ticket');
  const ws=await openWs('/ws?ticket='+t.data.ticket,{Origin:origin});
  return {socket:ws,token:p.data.token,ticket:t.data.ticket};
}
test('real Cloudflare Durable Object pairing, voice batches and world separation',async()=>{
  let bridge,a,b,d;
  const pcm=Buffer.alloc(1920,7).toString('base64');
  try{
    bridge=await openWs('/bridge',{Authorization:'Bearer '+secret});
    send(bridge,{t:'snapshot',voiceReady:true,players:basePlayers});
    await sleep(120);
    assert.equal((await get('/api/health')).ready,true,'Paper + SVC must be ready');
    a=await pair(bridge,'ABCDEFGH',A);
    b=await pair(bridge,'JKLMNPQR',B);
    d=await pair(bridge,'STUVWXYZ',D);
    let leaked=false;
    const onD=buf=>{try{const m=JSON.parse(buf.toString());if(m.t==='audioBatch')leaked=true;}catch{}};
    d.socket.on('message',onD);
    const fromBedrock=next(bridge,m=>m.t==='audioBatch'&&m.uuid===A);
    const withinBedrock=next(b.socket,m=>m.t==='audioBatch'&&m.uuid===A);
    send(a.socket,{t:'audioBatch',frames:[{pcm},{pcm},{pcm}]});
    const paperAudio=await fromBedrock;
    assert.equal(paperAudio.frames.length,3);
    assert.equal(paperAudio.frames[0].pcm,pcm,'actual PCM must reach Paper');
    const bedrockAudio=await withinBedrock;
    assert.equal(bedrockAudio.frames.length,3,'Bedrock-to-Bedrock audio arrives');
    assert.equal(bedrockAudio.frames[1].pcm,pcm);
    const javaToBedrock=next(a.socket,m=>m.t==='audioBatch'&&m.uuid===C);
    send(bridge,{t:'audioBatch',uuid:C,frames:[{pcm},{pcm}]});
    assert.equal((await javaToBedrock).frames.length,2,'Java PCM arrives for browser');
    await sleep(90);
    assert.equal(leaked,false,'different worlds must not receive audio');
    d.socket.off('message',onD);
    // A mobile foreground service rotates its bearer while the live socket stays open.
    const formerToken=a.token;
    const rotation=await post('/api/renew',{},formerToken);
    assert.equal(rotation.status,200,'session renew succeeds before expiry');
    assert.equal(rotation.data.expiresIn,30*24*60*60,'active session has a rolling 30-day safety window');
    assert.notEqual(rotation.data.token,formerToken,'renew rotates the bearer');
    assert.equal((await post('/api/ticket',{},formerToken)).status,401,'old bearer is invalid');
    a.token=rotation.data.token;
    const streamAfterRenew=next(a.socket,m=>m.t==='audioBatch'&&m.uuid===C);
    send(bridge,{t:'audioBatch',uuid:C,frames:[{pcm}]});
    assert.equal((await streamAfterRenew).frames[0].pcm,pcm,'socket stays alive after rotation');
    assert.equal((await post('/api/disconnect',{},a.token)).status,200);
    assert.equal((await post('/api/ticket',{},a.token)).status,401,'explicit disconnect revokes token');
    const oldTicket=await new Promise(resolve=>{
      const socket=new WebSocket(wsOrigin+'/ws?ticket='+a.ticket,{headers:{Origin:origin}});
      socket.once('unexpected-response',(req,res)=>{resolve(res.statusCode);res.resume();});
      socket.once('open',()=>resolve(101));socket.once('error',()=>resolve(0));
    });
    assert.notEqual(oldTicket,101,'one-time WebSocket ticket must not replay');
  }finally{
    for(const s of [a?.socket,b?.socket,d?.socket,bridge])try{s?.terminate();}catch{}
  }
});

test('cross-group isolation, whisper, and deafen with actual Worker runtime',async()=>{
  let bridge,a,b;
  const pcm=Buffer.alloc(1920,5).toString('base64');
  try{
    bridge=await openWs('/bridge',{Authorization:'Bearer '+secret});
    const groupPlayers=basePlayers.slice(0,2).map(p=>({...p,
      group:p.uuid===A?'private_a':'private_b'}));
    send(bridge,{t:'snapshot',voiceReady:true,players:groupPlayers});
    await sleep(110);
    a=await pair(bridge,'ABCDEFGH',A);
    b=await pair(bridge,'JKLMNPQR',B);
    let heard=0;
    const listener=raw=>{try{if(JSON.parse(raw.toString()).t==='audioBatch')heard++;}catch{}};
    b.socket.on('message',listener);
    send(a.socket,{t:'audioBatch',frames:[{pcm}]});
    await sleep(120);
    assert.equal(heard,0,'no voice leakage across groups');
    send(bridge,{t:'snapshot',voiceReady:true,players:groupPlayers.map(p=>({...p,
      group:'',deafened:p.uuid===B}))});
    await sleep(80);
    send(a.socket,{t:'audioBatch',frames:[{pcm}]});
    await sleep(100);
    assert.equal(heard,0,'deafened listener hears nobody');
    send(bridge,{t:'snapshot',voiceReady:true,players:groupPlayers.map(p=>({...p,
      group:'',deafened:false,whisper:p.uuid===A,x:p.uuid===B?20:0}))});
    await sleep(80);
    send(a.socket,{t:'audioBatch',frames:[{pcm}]});
    await sleep(120);assert.equal(heard,0,'whisper distance isolates listener');
    send(bridge,{t:'snapshot',voiceReady:true,players:groupPlayers.map(p=>({...p,
      group:'',deafened:false,whisper:p.uuid===A,x:p.uuid===B?5:0}))});
    await sleep(80);
    const voice=next(b.socket,m=>m.t==='audioBatch'&&m.uuid===A);
    send(a.socket,{t:'audioBatch',frames:[{pcm}]});
    assert.equal((await voice).frames[0].pcm,pcm,'nearby whisper succeeds');
    b.socket.off('message',listener);
  }finally{for(const s of [a?.socket,b?.socket,bridge])try{s?.terminate();}catch{}}
});

test('unauthenticated server and disallowed browser origins are rejected',async()=>{
  const invalid=await new Promise(resolve=>{
    const s=new WebSocket(wsOrigin+'/bridge');
    s.once('unexpected-response',(req,res)=>{resolve(res.statusCode);res.resume();});
    s.once('open',()=>resolve(101));s.once('error',()=>resolve(0));
  });
  assert.equal(invalid,401);
  const r=await fetch(http+'/api/pair',{method:'POST',
    headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},
    body:'{"code":"ABCDEFGH"}'});
  assert.equal(r.status,403);
});

test('linked Bedrock devices reconnect after Paper bridge restarts without a new pairing code',async()=>{
 let firstBridge,secondBridge,linked;
 try{
  firstBridge=await openWs('/bridge',{Authorization:'Bearer '+secret});
  send(firstBridge,{t:'snapshot',voiceReady:true,players:basePlayers});
  await sleep(150);
  linked=await pair(firstBridge,'ABCDEFGH',A);
  const token=linked.token;
  // Close/restart the bridge: one-time pairing codes and tickets are revoked,
  // but the device session stays hashed in Durable Object storage.
  firstBridge.terminate();
  await sleep(160);
  secondBridge=await openWs('/bridge',{Authorization:'Bearer '+secret});
  send(secondBridge,{t:'snapshot',voiceReady:true,players:basePlayers});
  await sleep(220);
  const ticket=await post('/api/ticket',{},token);
  assert.equal(ticket.status,200,JSON.stringify(ticket.data));
  const renew=await post('/api/renew',{},token);
  assert.equal(renew.status,200,JSON.stringify(renew.data));
  assert.equal(renew.data.expiresIn,30*24*60*60);
  assert.notEqual(renew.data.token,token);
  assert.equal((await post('/api/ticket',{},token)).status,401,
    'rotation must still invalidate the old bearer');
  assert.equal((await post('/api/ticket',{},renew.data.token)).status,200,
    'still-linked player may reconnect using the rotated token');
  const out=await post('/api/disconnect',{},renew.data.token);
  assert.equal(out.status,200);
  assert.equal((await post('/api/ticket',{},renew.data.token)).status,401);
 }finally{
  for(const ws of [linked?.socket,firstBridge,secondBridge])try{ws?.terminate();}catch{}
 }
});
