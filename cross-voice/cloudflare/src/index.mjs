// SSCircle Cross Voice: Cloudflare Durable Object gateway, no Node.js server required.
// Protocol compatible with SSCircleCrossVoice Paper plugin and SSCircle Voice browser.
// Audio is forwarded in memory only. Durable Object SQLite stores ONLY hashes of pairing
// codes and short-lived access tokens; no audio recordings, usernames or position history.

import {DurableObject} from 'cloudflare:workers';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE=/^[A-HJ-NP-Z2-9]{8}$/;
const BASE64=/^[A-Za-z0-9+/]*={0,2}$/;
const TOKEN=/^[a-f0-9]{64}$/;
const MAX_WS=16400, MAX_FRAMES=4, MAX_BUFFER=65536;
const now=()=>Date.now();
const enc=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
const randomToken=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
async function digest(value){
  return hex(await crypto.subtle.digest('SHA-256',enc.encode(value)));
}
function safeEqual(a,b){
  // Fixed-length secret comparator; do not log credentials.
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
function allowedOrigin(env){
  const origin=String(env.VOICE_ORIGIN||'').trim();
  try{
    const url=new URL(origin);
    return (url.protocol==='https:'||
      url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))&&
      url.origin===origin&&url.username===''&&url.password===''?origin:'';
  }catch{return '';}
}
const error=(status,code,origin,more={})=>reply(status,{error:code,...more},origin);
function reply(status,payload,origin,headers={}){
  return new Response(JSON.stringify(payload),{status,headers:{
    'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Vary':'Origin',
    ...(origin?{'Access-Control-Allow-Origin':origin}:{}),...headers}});
}
function pcmValid(frame){
  if(typeof frame!=='string'||frame.length!==2560||!BASE64.test(frame))return false;
  try{return atob(frame).length===1920;}catch{return false;}
}
function parseJson(value){
  if(typeof value!=='string'||value.length>MAX_WS)return null;
  try{return JSON.parse(value);}catch{return null;}
}
function isPlayer(p){
  return p&&UUID.test(p.uuid||'')&&typeof p.name==='string'&&p.name.length>0&&p.name.length<=40&&
    [p.x,p.y,p.z].every(Number.isFinite)&&
    typeof p.world==='string'&&/^[a-z0-9_.:-]{1,100}$/i.test(p.world);
}
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
function validVoiceBatch(packet){
  const list=packet.t==='audio'? [{pcm:packet.pcm,whisper:packet.whisper}]:packet.frames;
  if(!Array.isArray(list)||list.length<1||list.length>MAX_FRAMES)return null;
  const frames=[];
  for(const f of list){
    if(!f||!pcmValid(f.pcm))return null;
    frames.push({pcm:f.pcm,whisper:f.whisper===true});
  }
  return frames;
}

export default {
  async fetch(request,env){
    const url=new URL(request.url),origin=allowedOrigin(env),incoming=request.headers.get('Origin');
    if(!origin)return error(503,'ORIGIN_NOT_CONFIGURED','');
    if(incoming&&incoming!==origin)return error(403,'ORIGIN_DENIED',origin);
    if(request.method==='OPTIONS'){
      if(!incoming)return error(403,'ORIGIN_DENIED',origin);
      return new Response(null,{status:204,headers:{
        'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers':'Content-Type, Authorization',
        'Access-Control-Max-Age':'600','Vary':'Origin'}});
    }
    if(!['/api/health','/api/pair','/api/ticket','/api/disconnect','/ws','/bridge'].includes(url.pathname))
      return error(404,'NOT_FOUND',origin);
    if(!['GET','POST'].includes(request.method))return error(405,'METHOD_NOT_ALLOWED',origin);
    const secret=String(env.VOICE_BRIDGE_SECRET||'');
    if(secret.length<32||secret.length>256)return error(503,'BRIDGE_NOT_CONFIGURED',origin);
    const websocket=url.pathname==='/bridge'||url.pathname==='/ws';
    if(websocket&&request.headers.get('Upgrade')?.toLowerCase()!=='websocket')
      return error(426,'UPGRADE_REQUIRED',origin);
    if(url.pathname==='/bridge'){
      const token=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
      if(!safeEqual(token,secret))return error(401,'BRIDGE_AUTH_REQUIRED',origin);
    }else if(url.pathname!=='/api/health'&&!incoming){
      // Browser endpoints must have browser Origin. Java bridge has no Origin.
      return error(403,'ORIGIN_REQUIRED',origin);
    }
    const max=Number(env.VOICE_MAX_CLIENTS||50);
    const id=env.VOICE_ROOM.idFromName(String(env.VOICE_SERVER_KEY||'sscircle-main'));
    const stub=env.VOICE_ROOM.get(id);
    // Override spoofable public request headers. Only Worker supplies trusted CF IP.
    const forwarded=new Headers(request.headers);
    forwarded.set('X-Voice-Origin',origin);
    forwarded.set('X-Voice-Client-IP',request.headers.get('CF-Connecting-IP')||'unknown');
    forwarded.delete('CF-Connecting-IP');
    forwarded.set('X-Voice-Max-Clients',String(Number.isFinite(max)?clamp(max,2,100):50));
    return stub.fetch(new Request(request,{headers:forwarded}));
  }
};

export class VoiceRoom extends DurableObject {
  constructor(ctx,env){
    super(ctx,env);
    this.env=env;
    this.players=new Map();
    this.clients=new Map();
    this.bridge=null;
    this.bridgeEpoch='';
    this.svcReady=false;
    this.lastSnapshot=0;
    this.lastPrune=0;
    this.radius=32;
    this.whisperRadius=8;
    this.groupsAllowed=true;
    this.counters={up:0,down:0,dropped:0};
    this.maxClients=clamp(Number(env.VOICE_MAX_CLIENTS)||50,2,100);
    this.origin=allowedOrigin(env);
    // SQL storage is synchronous. No raw codes or tokens are stored here.
    this.sql=ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS voice_pairing (code_hash TEXT PRIMARY KEY, uuid TEXT NOT NULL, expires INTEGER NOT NULL, epoch TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS voice_sessions (token_hash TEXT PRIMARY KEY, uuid TEXT NOT NULL, expires INTEGER NOT NULL, epoch TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS voice_tickets (ticket_hash TEXT PRIMARY KEY, uuid TEXT NOT NULL, expires INTEGER NOT NULL, session_expires INTEGER NOT NULL, epoch TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS voice_limits (ip_hash TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires INTEGER NOT NULL)');
    for(const ws of ctx.getWebSockets()){
      const entry=ws.deserializeAttachment();
      if(entry?.type==='bridge'){
        this.bridge=ws;
        this.bridgeEpoch=entry.epoch||'';
      }else if(entry?.type==='browser'&&UUID.test(entry.uuid||'')){
        this.clients.set(entry.uuid,ws);
      }
    }
  }
  rows(query,...args){return this.sql.exec(query,...args).toArray();}
  sqlPrune(){
    const clock=now();
    this.sql.exec('DELETE FROM voice_pairing WHERE expires < ?',clock);
    this.sql.exec('DELETE FROM voice_sessions WHERE expires < ?',clock);
    this.sql.exec('DELETE FROM voice_tickets WHERE expires < ?',clock);
    this.sql.exec('DELETE FROM voice_limits WHERE expires < ?',clock);
  }
  tokenFlush(){
    this.sql.exec('DELETE FROM voice_pairing');
    this.sql.exec('DELETE FROM voice_sessions');
    this.sql.exec('DELETE FROM voice_tickets');
  }
  healthy(){return !!this.bridge&&this.svcReady&&now()-this.lastSnapshot<5000;}
  authorizedOrigin(req){return req.headers.get('X-Voice-Origin')===this.origin&&!!this.origin;}
  sent(ws,packet){
    try{
      if(ws?.readyState!==1||ws.bufferedAmount>MAX_BUFFER){this.counters.dropped++;return false;}
      ws.send(JSON.stringify(packet));return true;
    }catch{this.counters.dropped++;return false;}
  }
  event(ws){return ws?.deserializeAttachment()||{};}
  clientOut(uuid,reason='disconnected'){
    const sock=this.clients.get(uuid);
    if(!sock)return;
    this.clients.delete(uuid);
    if(this.bridge)this.sent(this.bridge,{t:'session',uuid,connected:false});
    try{sock.close(4001,reason);}catch{}
  }
  bridgeOut(reason='bridge offline'){
    const old=this.bridge;
    this.bridge=null;this.bridgeEpoch='';this.svcReady=false;this.lastSnapshot=0;
    this.players.clear();
    this.tokenFlush();
    for(const [id,sock] of this.clients){
      this.sent(sock,{t:'error',code:'BRIDGE_OFFLINE'});
      try{sock.close(1012,'Minecraft offline');}catch{}
    }
    this.clients.clear();
    if(old)try{old.close(1012,reason);}catch{}
  }
  publicState(uuid){
    const p=this.players.get(uuid);
    const nearby=[];
    if(p)for(const other of this.players.values()){
      if(other.uuid===uuid||!this.near(p,other))continue;
      nearby.push({uuid:other.uuid,name:other.name,bedrock:other.bedrock,
        distance:Math.round(Math.hypot(other.x-p.x,other.y-p.y,other.z-p.z))});
    }
    return {t:'state',status:this.healthy()?'connected':'disconnected',
      self:p?{uuid:p.uuid,name:p.name,world:p.world,group:p.group,
        muted:p.muted,deafened:p.deafened,whisper:p.whisper,volume:p.volume}:null,
      nearby,players:this.players.size,gatewayUp:!!this.bridge};
  }
  broadcast(){for(const [uuid,ws]of this.clients)this.sent(ws,this.publicState(uuid));}
  near(a,b,whisper=false){
    if(!a||!b||a.world!==b.world)return false;
    if(a.group||b.group)return this.groupsAllowed&&!!a.group&&a.group===b.group;
    const dx=a.x-b.x,dy=a.y-b.y,dz=a.z-b.z;
    const radius=a.whisper||whisper?this.whisperRadius:this.radius;
    return dx*dx+dy*dy+dz*dz<=radius*radius;
  }
  async allowAttempt(req){
    const raw=String(req.headers.get('X-Voice-Client-IP')||'unknown').slice(0,90);
    const id=await digest('ip:'+raw);
    const current=this.rows('SELECT attempts,expires FROM voice_limits WHERE ip_hash=?',id)[0];
    const clock=now();
    const count=current&&current.expires>clock?current.attempts+1:1;
    this.sql.exec('INSERT INTO voice_limits (ip_hash,attempts,expires) VALUES (?,?,?) ON CONFLICT(ip_hash) DO UPDATE SET attempts=excluded.attempts,expires=excluded.expires',
      id,count,current&&current.expires>clock?current.expires:clock+60000);
    return count<=8;
  }
  async consumeBody(req){
    if(Number(req.headers.get('Content-Length')||0)>512)return null;
    const body=await req.text();
    if(body.length>512)return null;
    return parseJson(body);
  }
  async fetch(req){
    const url=new URL(req.url),path=url.pathname,method=req.method;
    if(!this.authorizedOrigin(req))return error(403,'ORIGIN_DENIED',this.origin);
    if(path==='/api/health'&&method==='GET'){
      return reply(200,{ready:this.healthy(),players:this.players.size,
        sessions:this.clients.size,mode:'durable-object',audio:{
          up:this.counters.up,down:this.counters.down,dropped:this.counters.dropped}},this.origin);
    }
    if(path==='/api/pair'&&method==='POST'){
      if(!req.headers.get('Origin'))return error(403,'ORIGIN_REQUIRED',this.origin);
      if(!await this.allowAttempt(req))return error(429,'RATE_LIMIT',this.origin);
      if(!this.healthy())return error(503,'SERVER_OFFLINE',this.origin);
      const data=await this.consumeBody(req);
      const code=data?.code;
      if(typeof code!=='string'||!CODE.test(code))return error(401,'INVALID_CODE',this.origin);
      const hashed=await digest('code:'+code);
      // DELETE RETURNING is atomic. The second identical request has no row.
      const matches=this.rows('DELETE FROM voice_pairing WHERE code_hash=? RETURNING uuid,expires,epoch',hashed);
      const entry=matches[0],p=entry&&this.players.get(entry.uuid);
      if(!entry||entry.expires<now()||entry.epoch!==this.bridgeEpoch||!p?.bedrock)
        return error(401,'INVALID_CODE',this.origin);
      this.clientOut(entry.uuid,'new pairing');
      this.sql.exec('DELETE FROM voice_sessions WHERE uuid=?',entry.uuid);
      this.sql.exec('DELETE FROM voice_tickets WHERE uuid=?',entry.uuid);
      const token=randomToken(),expiry=now()+15*60_000,hash=await digest('session:'+token);
      this.sql.exec('INSERT INTO voice_sessions (token_hash,uuid,expires,epoch) VALUES (?,?,?,?)',
        hash,entry.uuid,expiry,this.bridgeEpoch);
      return reply(200,{ok:true,token,expiresIn:900,player:{uuid:entry.uuid,name:p.name}},this.origin);
    }
    if(path==='/api/ticket'&&method==='POST'){
      if(!req.headers.get('Origin'))return error(403,'ORIGIN_REQUIRED',this.origin);
      const token=req.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
      if(!TOKEN.test(token))return error(401,'SESSION_EXPIRED',this.origin);
      const hash=await digest('session:'+token);
      const state=this.rows('SELECT uuid,expires,epoch FROM voice_sessions WHERE token_hash=?',hash)[0];
      if(!state||state.expires<now()||state.epoch!==this.bridgeEpoch||
        !this.healthy()||!this.players.get(state.uuid)?.bedrock)
        return error(401,'SESSION_EXPIRED',this.origin);
      const ticket=randomToken(),key=await digest('ticket:'+ticket);
      const expiry=Math.min(now()+15000,state.expires);
      this.sql.exec('INSERT INTO voice_tickets (ticket_hash,uuid,expires,session_expires,epoch) VALUES (?,?,?,?,?)',
        key,state.uuid,expiry,state.expires,this.bridgeEpoch);
      return reply(200,{ticket},this.origin);
    }
    if(path==='/api/disconnect'&&method==='POST'){
      if(!req.headers.get('Origin'))return error(403,'ORIGIN_REQUIRED',this.origin);
      const token=req.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
      if(!TOKEN.test(token))return error(401,'SESSION_EXPIRED',this.origin);
      const hash=await digest('session:'+token);
      const entry=this.rows('DELETE FROM voice_sessions WHERE token_hash=? RETURNING uuid,expires',hash)[0];
      if(!entry||entry.expires<now())return error(401,'SESSION_EXPIRED',this.origin);
      this.sql.exec('DELETE FROM voice_tickets WHERE uuid=?',entry.uuid);
      this.clientOut(entry.uuid,'user disconnected');
      return reply(200,{ok:true},this.origin);
    }
    if((path==='/bridge'||path==='/ws')&&method==='GET'&&
      req.headers.get('Upgrade')?.toLowerCase()==='websocket'){
      if(path==='/bridge'){
        const secret=String(this.env.VOICE_BRIDGE_SECRET||'');
        const value=req.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
        if(!safeEqual(value,secret))return error(401,'BRIDGE_AUTH_REQUIRED',this.origin);
      }
      let uuid='',expires=0;
      if(path==='/ws'){
        if(req.headers.get('Origin')!==this.origin)return error(403,'ORIGIN_DENIED',this.origin);
        if(!this.healthy())return error(503,'SERVER_OFFLINE',this.origin);
        const ticket=url.searchParams.get('ticket')||'';
        if(!TOKEN.test(ticket))return error(401,'INVALID_TICKET',this.origin);
        const hashed=await digest('ticket:'+ticket);
        const entry=this.rows('DELETE FROM voice_tickets WHERE ticket_hash=? RETURNING uuid,expires,session_expires,epoch',hashed)[0];
        if(!entry||entry.expires<now()||entry.epoch!==this.bridgeEpoch||
            !this.players.get(entry.uuid)?.bedrock)
          return error(401,'INVALID_TICKET',this.origin);
        uuid=entry.uuid;expires=entry.session_expires;
        if(this.clients.size>=this.maxClients&&!this.clients.has(uuid))
          return error(429,'CONNECTION_LIMIT',this.origin);
      }
      const pair=new WebSocketPair(),[client,server]=Object.values(pair);
      if(path==='/bridge'){
        if(this.bridge)this.bridgeOut('replaced by new Minecraft server');
        this.bridgeEpoch=crypto.randomUUID();
        this.bridge=server;
        this.lastSnapshot=0;this.svcReady=false;
        this.players.clear();
        this.tokenFlush();
        this.ctx.acceptWebSocket(server,['bridge']);
        server.serializeAttachment({type:'bridge',epoch:this.bridgeEpoch});
        this.sent(server,{t:'hello',generation:this.bridgeEpoch});
      }else{
        this.clientOut(uuid,'reconnected');
        this.ctx.acceptWebSocket(server,['client']);
        server.serializeAttachment({type:'browser',uuid,expires,epoch:this.bridgeEpoch,second:0,frames:0});
        this.clients.set(uuid,server);
        this.sent(this.bridge,{t:'session',uuid,connected:true});
        this.sent(server,this.publicState(uuid));
      }
      return new Response(null,{status:101,webSocket:client});
    }
    return error(404,'NOT_FOUND',this.origin);
  }
  // Avoid storing audio payloads in SQL, KV, logs or WebSocket attachments.
  async webSocketMessage(ws,raw){
    if(typeof raw!=='string'||raw.length>MAX_WS){this.counters.dropped++;return;}
    const message=parseJson(raw);
    if(!message||typeof message.t!=='string')return;
    const attachment=this.event(ws);
    if(attachment.type==='bridge'&&ws===this.bridge){
      await this.bridgeMessage(message);
    }else if(attachment.type==='browser'){
      if(ws!==this.clients.get(attachment.uuid))return;
      if(attachment.expires<now()||attachment.epoch!==this.bridgeEpoch||
         !this.healthy()||!this.players.get(attachment.uuid)?.bedrock){
        this.clientOut(attachment.uuid,'session expired');return;
      }
      this.browserMessage(ws,attachment,message);
    }
  }
  async bridgeMessage(m){
    if(m.t==='snapshot'){
      if(!Array.isArray(m.players)||m.players.length>this.maxClients+30)return;
      const fresh=new Map();
      for(const p of m.players){
        if(!isPlayer(p))continue;
        fresh.set(p.uuid,{uuid:p.uuid,name:p.name,world:p.world,
          x:p.x,y:p.y,z:p.z,yaw:Number.isFinite(p.yaw)?p.yaw:0,
          bedrock:p.bedrock===true,muted:p.muted===true,
          deafened:p.deafened===true,whisper:p.whisper===true,
          group:typeof p.group==='string'?p.group.slice(0,48):'',
          volume:Number.isFinite(p.volume)?clamp(p.volume,0,200):100});
      }
      this.lastSnapshot=now();this.svcReady=m.voiceReady===true;
      this.players=fresh;
      for(const uuid of this.clients.keys())if(!fresh.get(uuid)?.bedrock)
        this.clientOut(uuid,'player offline');
      // Sessions have a fixed lifetime. A snapshot is a cheap cleanup cadence.
      if(now()-this.lastPrune>60000){this.sqlPrune();this.lastPrune=now();}
      for(const [id,sock]of this.clients){
        if(this.event(sock).expires<=now())this.clientOut(id,'session expired');
      }
      this.broadcast();
    }else if(m.t==='config'){
      const r=Number(m.radius),w=Number(m.whisperRadius);
      if(Number.isFinite(r)&&r>=2&&r<=100)this.radius=r;
      if(Number.isFinite(w)&&w>=2&&w<=this.radius)this.whisperRadius=w;
      if(typeof m.groupsAllowed==='boolean')this.groupsAllowed=m.groupsAllowed;
    }else if(m.t==='code'){
      if(!CODE.test(m.code||'')||!UUID.test(m.uuid||'')||!this.players.get(m.uuid)?.bedrock)return;
      const expiry=Number(m.expires);
      if(!Number.isFinite(expiry)||expiry<=now()||expiry>now()+180000)return;
      const epoch=this.bridgeEpoch;
      const hash=await digest('code:'+m.code);
      if(!this.bridge||this.bridgeEpoch!==epoch)return;
      this.sql.exec('DELETE FROM voice_pairing WHERE uuid=?',m.uuid);
      this.sql.exec('INSERT INTO voice_pairing (code_hash,uuid,expires,epoch) VALUES (?,?,?,?) ON CONFLICT(code_hash) DO UPDATE SET uuid=excluded.uuid,expires=excluded.expires,epoch=excluded.epoch',
        hash,m.uuid,expiry,epoch);
    }else if(m.t==='kick'&&UUID.test(m.uuid||'')){
      this.sql.exec('DELETE FROM voice_sessions WHERE uuid=?',m.uuid);
      this.sql.exec('DELETE FROM voice_tickets WHERE uuid=?',m.uuid);
      this.clientOut(m.uuid,'moderated');
    }else if(m.t==='audio'||m.t==='audioBatch'){
      if(!UUID.test(m.uuid||''))return;
      const sender=this.players.get(m.uuid);
      if(!sender||sender.bedrock||sender.muted||!this.healthy())return;
      const frames=validVoiceBatch(m);if(!frames){this.counters.dropped++;return;}
      for(const [uuid,sock]of this.clients){
        const target=this.players.get(uuid);
        if(!target||target.deafened)continue;
        const audible=frames.filter(f=>this.near(sender,target,f.whisper));
        if(!audible.length)continue;
        this.sent(sock,{t:'audioBatch',uuid:m.uuid,frames:audible,
          dx:sender.x-target.x,dy:sender.y-target.y,dz:sender.z-target.z,
          yaw:target.yaw});
      }
      this.counters.down+=frames.length;
    }
  }
  browserMessage(ws,attachment,m){
    if(m.t==='control'){
      const actions=['mute','unmute','deafen','undeafen','whisper','normal','group','leave-group','volume'];
      if(actions.includes(m.action)){
        this.sent(this.bridge,{t:'control',uuid:attachment.uuid,action:m.action,
          value:String(m.value??'').slice(0,48)});
      }
      return;
    }
    if(m.t!=='audio'&&m.t!=='audioBatch')return;
    const source=this.players.get(attachment.uuid);
    if(!source||source.muted||!this.healthy())return;
    const frames=validVoiceBatch(m);
    if(!frames){this.counters.dropped++;return;}
    const second=Math.floor(now()/1000);
    const used=attachment.second===second?attachment.frames:0;
    if(used+frames.length>55){this.counters.dropped+=frames.length;return;}
    ws.serializeAttachment({...attachment,second,frames:used+frames.length});
    // Paper receives raw PCM and encodes Opus using official Simple Voice Chat API.
    this.sent(this.bridge,{t:'audioBatch',uuid:attachment.uuid,
      frames:frames.map(f=>({...f,whisper:source.whisper}))});
    // Bedrock-to-Bedrock takes a separate direct path (no double playback).
    for(const [uuid,client]of this.clients){
      if(uuid===attachment.uuid)continue;
      const target=this.players.get(uuid);
      if(!target||target.deafened)continue;
      const audible=frames.filter(f=>this.near(source,target,source.whisper));
      if(!audible.length)continue;
      this.sent(client,{t:'audioBatch',uuid:attachment.uuid,frames:audible,
        dx:source.x-target.x,dy:source.y-target.y,dz:source.z-target.z,
        yaw:target.yaw});
    }
    this.counters.up+=frames.length;
  }
  webSocketClose(ws){
    const info=this.event(ws);
    if(info.type==='bridge'&&ws===this.bridge)this.bridgeOut('Minecraft connection closed');
    else if(info.type==='browser'&&this.clients.get(info.uuid)===ws){
      this.clients.delete(info.uuid);
      this.sent(this.bridge,{t:'session',uuid:info.uuid,connected:false});
    }
  }
  webSocketError(ws){this.webSocketClose(ws);}
}
