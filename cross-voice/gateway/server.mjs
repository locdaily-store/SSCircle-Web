import http from 'node:http';
import {isIP} from 'node:net';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {WebSocketServer, WebSocket} from 'ws';

// No stored recordings or browser usernames: Paper is authoritative.
const config = {
  host: process.env.VOICE_HOST || '127.0.0.1',
  port: Number(process.env.VOICE_PORT || 8788),
  origin: process.env.VOICE_ORIGIN || 'http://localhost:8788',
  bridgeSecret: process.env.VOICE_BRIDGE_SECRET || '',
  maxClients: Math.max(2,Math.min(100,Number(process.env.VOICE_MAX_CLIENTS || 50))),
  radius: Math.max(2,Math.min(100,Number(process.env.VOICE_RADIUS || 32))),
  whisperRadius: 8,
  maxFrame: 5000,
  maxBuffer: 64*1024,
  voiceEnabled: true,
  trustCloudflare: process.env.VOICE_TRUST_CF==='true'
};
if(import.meta.url === 'file://' + process.argv[1] && config.bridgeSecret.length < 32) {
  console.error('VOICE_BRIDGE_SECRET minimal 32 karakter. Tidak menjalankan gateway.');
  process.exit(1);
}
export function createGateway(options = config) {
  const cfg = {...config,...options};
  if(cfg.bridgeSecret.length<32)throw Error('VOICE_BRIDGE_SECRET minimal 32 karakter');
  const pairing = new Map(),sessions=new Map(),clients=new Map(),players=new Map(),attempts=new Map();
  let bridge=null, svcReady=false, counters={up:0,down:0,dropped:0}, generation=0;
  const now=()=>Date.now();
  const clientAddress=req=>{
    const forwarded=String(req.headers['cf-connecting-ip']||'');
    return cfg.trustCloudflare&&isIP(forwarded)?forwarded:req.socket.remoteAddress;
  };
  const allowAttempt=address=>{
    const current=now(),key=String(address||'unknown');
    const record=attempts.get(key);
    if(!record||record.until<current){attempts.set(key,{n:1,until:current+60000});return true;}
    record.n++;return record.n<=8;
  };
  const rand=(n=24)=>randomBytes(n).toString('base64url');
  const safe=(a,b)=> {
    const x=Buffer.from(a||''),y=Buffer.from(b||'');
    return x.length===y.length && timingSafeEqual(x,y);
  };
  const validUUID=x=>typeof x==='string'&&/^[0-9a-f-]{36}$/i.test(x);
  const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store','Access-Control-Allow-Origin':cfg.origin,
    'Access-Control-Allow-Credentials':'true','Vary':'Origin',
    'X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  const tell=(sock,data)=>{
    if(sock?.readyState===WebSocket.OPEN&&sock.bufferedAmount<cfg.maxBuffer)
      sock.send(JSON.stringify(data));else counters.dropped++;
  };
  const nearby=(a,b,whisperOverride=false)=>{
    if(!a||!b||a.world!==b.world)return false;
    // No leakage from a private group back to proximity.
    if(a.group||b.group)return !!a.group&&a.group===b.group;
    const dx=a.x-b.x,dy=a.y-b.y,dz=a.z-b.z;
    const r=a.whisper||whisperOverride?cfg.whisperRadius:cfg.radius;
    return dx*dx+dy*dy+dz*dz<=r*r;
  };
  const publicState=uuid=>{
    const p=players.get(uuid);
    const online=[...players.values()].filter(x=>x.uuid!==uuid&&nearby(p,x))
      .map(x=>({uuid:x.uuid,name:x.name,bedrock:x.bedrock,
        distance:Math.round(Math.hypot(x.x-p.x,x.y-p.y,x.z-p.z))}));
    return {t:'state',status:bridge&&svcReady?'connected':'disconnected',
      self:p?{uuid:p.uuid,name:p.name,world:p.world,group:p.group||'',
        muted:!!p.muted,deafened:!!p.deafened,whisper:!!p.whisper,
        volume:p.volume}:null,
      nearby:online,players:players.size,gatewayUp:!!bridge};
  };
  function detachBrowser(uuid,reason='disconnected'){
    const current=clients.get(uuid);
    if(current){clients.delete(uuid);try{current.close(4001,reason);}catch{}}
  }
  function detachBridge(){
    const old=bridge;bridge=null;svcReady=false;players.clear();pairing.clear();sessions.clear();generation++;
    for(const [uuid,ws] of clients){tell(ws,{t:'error',code:'BRIDGE_OFFLINE'});ws.close(1012,'Minecraft offline');}
    clients.clear();
    if(old&&old.readyState===WebSocket.OPEN)old.close(1012,'replaced');
  }
  function broadcast(){
    for(const [uuid,ws] of clients)tell(ws,publicState(uuid));
  }
  function handleBridge(msg){
    if(msg.t==='snapshot'){
      svcReady=msg.voiceReady===true;
      if(!Array.isArray(msg.players)||msg.players.length>cfg.maxClients+30)return;
      const updated=new Map();
      for(const p of msg.players){
        if(!validUUID(p.uuid)||typeof p.name!=='string'||p.name.length>40||
           !Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(p.z)||
           !/^[a-z0-9_.:-]{1,100}$/i.test(p.world||''))continue;
        updated.set(p.uuid,{uuid:p.uuid,name:p.name,world:p.world,
          x:p.x,y:p.y,z:p.z,yaw:Number.isFinite(p.yaw)?p.yaw:0,bedrock:!!p.bedrock,muted:!!p.muted,
          deafened:!!p.deafened,whisper:!!p.whisper,
          volume:Number.isFinite(p.volume)?Math.max(0,Math.min(200,p.volume)):100,
          group:typeof p.group==='string'?p.group.slice(0,48):''});
      }
      players.clear();for(const [key,p] of updated)players.set(key,p);
      for(const uuid of clients.keys())if(!players.get(uuid)?.bedrock)detachBrowser(uuid,'offline');
      broadcast();
    }else if(msg.t==='code'){
      if(!validUUID(msg.uuid)||!players.get(msg.uuid)?.bedrock)return;
      if(typeof msg.code!=='string'||!/^[A-HJ-NP-Z2-9]{8}$/.test(msg.code))return;
      const expires=Number(msg.expires);
      if(!(expires>now()&&expires<=now()+180000))return;
      for(const [key,v] of pairing)if(v.uuid===msg.uuid)pairing.delete(key);
      pairing.set(msg.code,{uuid:msg.uuid,expires,generation});
    }else if(msg.t==='audio'){
      // Native Java PCM frame forwarded only to nearby browser recipients.
      if(!validUUID(msg.uuid)||players.get(msg.uuid)?.bedrock)return;
      const sender=players.get(msg.uuid);
      if(!sender||sender.muted||!checkPCM(msg.pcm,cfg.maxFrame))return;
      for(const [uuid,ws] of clients){
        const recipient=players.get(uuid);
        if(recipient&&!recipient.deafened&&nearby(sender,recipient,msg.whisper===true))
          tell(ws,{t:'audio',uuid:msg.uuid,pcm:msg.pcm,
            dx:sender.x-recipient.x,dz:sender.z-recipient.z,yaw:recipient.yaw});
      }
      counters.down++;
    }else if(msg.t==='config'){
      const radius=Number(msg.radius);
      if(Number.isFinite(radius)&&radius>=2&&radius<=100)cfg.radius=radius;
      const whisperRadius=Number(msg.whisperRadius);
      if(Number.isFinite(whisperRadius)&&whisperRadius>=2&&whisperRadius<=cfg.radius)
        cfg.whisperRadius=whisperRadius;
      if(typeof msg.groupsAllowed==='boolean')cfg.groupsAllowed=msg.groupsAllowed;
    }else if(msg.t==='kick'&&validUUID(msg.uuid)){
      detachBrowser(msg.uuid,'moderated');
      for(const [key,v] of sessions)if(v.uuid===msg.uuid)sessions.delete(key);
    }
  }
  function checkPCM(pcm,max){
    if(typeof pcm!=='string'||pcm.length>Math.ceil(max*4/3)+8||
       !/^[A-Za-z0-9+/]*={0,2}$/.test(pcm))return false;
    const buff=Buffer.from(pcm,'base64');
    return buff.length===1920; // 20ms of 48kHz 16-bit mono PCM
  }
  const server=http.createServer(async(req,res)=>{
    const origin=req.headers.origin;
    if(origin&&origin!==cfg.origin){json(res,403,{error:'ORIGIN_DENIED'});return;}
    if(req.method==='OPTIONS'){
      res.writeHead(204,{'Access-Control-Allow-Origin':cfg.origin,
        'Access-Control-Allow-Headers':'Content-Type, Authorization',
        'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
        'Access-Control-Max-Age':'600','Vary':'Origin'});res.end();return;
    }
    if(req.url==='/api/health'&&req.method==='GET'){
      json(res,200,{ready:!!bridge&&svcReady,players:players.size,sessions:clients.size});return;
    }
    if(req.url==='/api/pair'&&req.method==='POST'){
      if(!origin){json(res,403,{error:'ORIGIN_DENIED'});return;}
      if(!allowAttempt(clientAddress(req))){json(res,429,{error:'RATE_LIMIT'});return;}
      if(!bridge||!svcReady){json(res,503,{error:'SERVER_OFFLINE'});return;}
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>512){json(res,413,{error:'TOO_LARGE'});return;}chunks.push(chunk);}
      let code='';
      try{code=JSON.parse(Buffer.concat(chunks).toString()).code;}catch{}
      if(typeof code!=='string'){json(res,400,{error:'INVALID_CODE'});return;}
      let entry;
      for(const [key,v] of pairing)if(safe(key,code)){entry=v;pairing.delete(key);break;}
      if(!entry||entry.expires<now()||entry.generation!==generation||
         !players.get(entry.uuid)?.bedrock){json(res,401,{error:'INVALID_CODE'});return;}
      if(clients.has(entry.uuid))detachBrowser(entry.uuid,'new session');
      for(const [key,v] of sessions)if(v.uuid===entry.uuid)sessions.delete(key);
      const token=rand();
      sessions.set(token,{uuid:entry.uuid,expires:now()+15*60000,uses:0});
      json(res,200,{ok:true,token,expiresIn:900,
        player:{uuid:entry.uuid,name:players.get(entry.uuid).name}});return;
    }
    if(req.url==='/api/disconnect'&&req.method==='POST'){
      if(!origin){json(res,403,{error:'ORIGIN_DENIED'});return;}
      const token=String(req.headers.authorization||'').replace(/^Bearer /,'');
      const state=sessions.get(token);
      if(!state||state.expires<now()){json(res,401,{error:'SESSION_EXPIRED'});return;}
      for(const [key,v] of sessions)if(v.uuid===state.uuid)sessions.delete(key);
      detachBrowser(state.uuid,'user');
      json(res,200,{ok:true});return;
    }
    if(req.url==='/api/ticket'&&req.method==='POST'){
      if(!origin){json(res,403,{error:'ORIGIN_DENIED'});return;}
      const token=String(req.headers.authorization||'').replace(/^Bearer /,'');
      const state=sessions.get(token);
      if(!state||state.expires<now()||!bridge||!svcReady||!players.get(state.uuid)?.bedrock){
        json(res,401,{error:'SESSION_EXPIRED'});return;
      }
      const ticket=rand(18);sessions.set('ticket:'+ticket,{uuid:state.uuid,expires:Math.min(now()+15000,state.expires),sessionExpiry:state.expires});
      json(res,200,{ticket});return;
    }
    json(res,404,{error:'NOT_FOUND'});
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:8192,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head)=>{
    const url=new URL(req.url,'http://localhost');
    if(req.headers.origin&&req.headers.origin!==cfg.origin){socket.destroy();return;}
    const isBridge=url.pathname==='/bridge';
    const isBrowser=url.pathname==='/ws';
    if(!isBridge&&!isBrowser){socket.destroy();return;}
    let uuid='',sessionExpiry=0;
    if(isBridge){
      const key=String(req.headers.authorization||'').replace(/^Bearer /,'');
      if(!safe(key,cfg.bridgeSecret)){socket.destroy();return;}
    }else{
      const ticket=sessions.get('ticket:'+url.searchParams.get('ticket'));
      if(!ticket||ticket.expires<now()||!bridge||!players.get(ticket.uuid)?.bedrock){
        socket.destroy();return;
      }
      uuid=ticket.uuid;sessionExpiry=ticket.sessionExpiry;sessions.delete('ticket:'+url.searchParams.get('ticket'));
      if(clients.size>=cfg.maxClients&&!clients.has(uuid)){socket.destroy();return;}
    }
    wss.handleUpgrade(req,socket,head,ws=>{
      if(isBridge){
        if(bridge)detachBridge();
        bridge=ws;generation++;
        ws.on('message',(bytes,binary)=>{if(binary||bytes.length>8192)return;
          try{handleBridge(JSON.parse(bytes.toString()));}catch{counters.dropped++;}});
        ws.on('close',()=>{if(bridge===ws)detachBridge();});
        tell(ws,{t:'hello',generation});
      }else{
        detachBrowser(uuid,'reconnected');clients.set(uuid,ws);
        tell(ws,publicState(uuid));
        const expiry=setTimeout(()=>ws.close(4001,'session expired'),Math.max(1,sessionExpiry-now()));
        expiry.unref();ws.on('close',()=>clearTimeout(expiry));
        let sec=Math.floor(now()/1000),frames=0;
        ws.on('message',(bytes,binary)=>{
          if(binary||bytes.length>8192)return;
          let msg;try{msg=JSON.parse(bytes.toString());}catch{return;}
          if(clients.get(uuid)!==ws||!bridge)return;
          const sender=players.get(uuid);
          if(!sender?.bedrock)return;
          if(msg.t==='audio'){
            if(sender.muted||!checkPCM(msg.pcm,cfg.maxFrame)){counters.dropped++;return;}
            const t=Math.floor(now()/1000);if(t!==sec){sec=t;frames=0;}
            if(++frames>55){counters.dropped++;return;}
            tell(bridge,{t:'audio',uuid,pcm:msg.pcm,whisper:sender.whisper});
            for(const [id,recipientWs] of clients) {
              const recipient=players.get(id);
              if(id!==uuid&&recipient&&!recipient.deafened&&nearby(sender,recipient))
                tell(recipientWs,{t:'audio',uuid,pcm:msg.pcm,
                  dx:sender.x-recipient.x,dz:sender.z-recipient.z,yaw:recipient.yaw});
            }
            counters.up++;
          }else if(msg.t==='control'&&typeof msg.action==='string'&&
                   ['mute','unmute','deafen','undeafen','whisper','normal','group','leave-group','volume'].includes(msg.action)){
            tell(bridge,{t:'control',uuid,action:msg.action,
              value:typeof msg.value==='string'?msg.value.slice(0,48):String(msg.value||'')});
          }
        });
        ws.on('close',()=>{if(clients.get(uuid)===ws)clients.delete(uuid);});
      }
    });
  });
  const prune=setInterval(()=>{
    for(const [key,v] of sessions)if(v.expires<now())sessions.delete(key);
    for(const [key,v] of pairing)if(v.expires<now())pairing.delete(key);
    for(const [key,v] of attempts)if(v.until<now())attempts.delete(key);
    broadcast();
  },2000);prune.unref();
  return {server,close:async()=>{clearInterval(prune);wss.close();
    for(const ws of clients.values())ws.terminate();
    bridge?.terminate();await new Promise(resolve=>server.close(resolve));},
    debug:()=>({players:players.size,pairing:pairing.size,clients:clients.size,...counters})};
}
if(import.meta.url==='file://'+process.argv[1]){
  const app=createGateway();
  app.server.listen(config.port,config.host,()=>{
    console.log('SSCircle Cross Voice Gateway bound on '+config.host+':'+config.port);
  });
}
