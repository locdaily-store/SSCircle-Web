import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac,pbkdf2Sync,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const source=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const SECRET='sscircle-link-tests-session',ADMIN='sscircle-link-tests-admin';
const SERVER='sscircle-link-tests-server-private-key-very-long';
const ID='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const CODE='AAAABBBBCCCCDDDDEEEE',UUID='a3b127cc-89de-4875-b456-8de073b2e211',PASSWORD='MyPassword#2045';
function signed(name,body,key){
 const base=Buffer.from(JSON.stringify(body)).toString('base64url');
 return name+'='+base+'.'+createHmac('sha256',key).update(base).digest('base64url');
}
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON;');
 db.exec([
  'CREATE TABLE submissions(id TEXT PRIMARY KEY,status TEXT,tracking_code TEXT,submitted_at TEXT)',
  'CREATE TABLE form_config(id INTEGER PRIMARY KEY,settings TEXT,pages TEXT,questions TEXT,updated_at TEXT)',
  'CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER,expires_at INTEGER)',
  'CREATE TABLE revoked_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER)'
 ].join(';')+';');
 db.prepare('INSERT INTO submissions VALUES(?,?,?,?)').run(ID,'accepted',CODE,'2026-11-08T00:00:00Z');
 db.prepare('INSERT INTO submissions VALUES(?,?,?,?)').run(OTHER,'accepted','BBBBCCCCDDDDEEEEFFFF','2026-11-08T00:01:00Z');
 db.prepare('INSERT INTO form_config VALUES(1,?,?,?,?)').run(
  JSON.stringify({seasonArchiveEnabled:false}),
  JSON.stringify([{id:'page1',title:'Registration',description:'',blocks:[]}]),'[]','v1');
 const DB={prepare(sql){const stmt=db.prepare(sql);let args=[];
  return {bind(...v){args=v;return this;},
    async first(){return stmt.get(...args)||null},
    async all(){return {results:stmt.all(...args)}},
    async run(){const r=stmt.run(...args);return {meta:{changes:r.changes}}}};
 }};
 DB.batch=async qs=>{
  db.exec('BEGIN IMMEDIATE');
  try{const out=[];for(const q of qs)out.push(await q.run());db.exec('COMMIT');return out;}
  catch(error){db.exec('ROLLBACK');throw error;}
 };
 const env={DB,ADMIN_PASSWORD:ADMIN,SESSION_SECRET:SECRET,
  SSCIRCLE_LINK_SERVER_SECRET:SERVER,ASSETS:{fetch:async()=>new Response('ok',{status:200})}};
 const expiry=Math.floor(Date.now()/1000)+3600;
 const member=signed('ssc_player',{id:ID,exp:expiry},SECRET+'|player-session');
 const other=signed('ssc_player',{id:OTHER,exp:expiry},SECRET+'|player-session');
 const admin=signed('ssc_s6_admin',{exp:expiry},SECRET+'|'+ADMIN);
 const secure={};
 async function call(path,{method='GET',data,cookie=member}={}){
  let body=data;
  if(path==='/api/player/security/activate'&&data?.password){
   const salt=Buffer.alloc(16,42).toString('base64url');
   body={invite:data.invite,salt,
    proof:pbkdf2Sync(data.password,salt,220000,32,'sha256').toString('base64url')};
  }
  const res=await worker.fetch(new Request('https://sscircle.test'+path,{
   method,headers:{Cookie:cookie,Origin:'https://sscircle.test',
    ...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  }),env);
  for(const c of res.headers.getSetCookie?.()||[]){
   if(c.startsWith('ssc_member_secure=')){
    const isOther=cookie===other||cookie.startsWith(other+';');
    secure[isOther?'other':'member']=c.split(';')[0];
   }
  }
  let json=null;try{json=await res.clone().json()}catch{}
  return {status:res.status,json,res};
 }
 async function active(isOther=false){
  const id=isOther?OTHER:ID,cookie=isOther?other:member;
  const invited=await call('/api/admin/member-invite',{method:'POST',cookie:admin,
   data:{id,verification:'identity-confirmed'}});
  assert.equal(invited.status,200,JSON.stringify(invited.json));
  const activated=await call('/api/player/security/activate',{method:'POST',cookie,
   data:{invite:invited.json.invite,password:PASSWORD}});
  assert.equal(activated.status,200,JSON.stringify(activated.json));
  return cookie+'; '+secure[isOther?'other':'member'];
 }
 async function claim(payload,{nonce=randomUUID(),timestamp=Math.floor(Date.now()/1000),key=SERVER}={}){
  const raw=JSON.stringify(payload);
  const signature=createHmac('sha256',key)
   .update('POST\n/api/minecraft/link/claim\n'+timestamp+'\n'+nonce+'\n'+raw)
   .digest('base64url');
  const res=await worker.fetch(new Request('https://sscircle.test/api/minecraft/link/claim',{
   method:'POST',headers:{'Content-Type':'application/json','X-SSC-Timestamp':String(timestamp),
    'X-SSC-Nonce':nonce,'X-SSC-Signature':signature},body:raw
  }),env);
  return {status:res.status,json:await res.json()};
 }
 return {active,call,claim,db,env,admin};
}
const payload=(code,id=UUID)=>({code,provider:'java_premium',providerId:id,
 username:'TestSteve',authSource:'mojang-online'});
test('create code requires password and server configuration',async()=>{
 const x=fixture();
 assert.equal((await x.call('/api/player/minecraft/link/state')).status,403);
 const cookie=await x.active();
 x.env.SSCIRCLE_LINK_SERVER_SECRET='';
 assert.equal((await x.call('/api/player/minecraft/link/create',{method:'POST',cookie,data:{}})).status,503);
 x.env.SSCIRCLE_LINK_SERVER_SECRET=SERVER;
 const created=await x.call('/api/player/minecraft/link/create',{method:'POST',cookie,data:{}});
 assert.equal(created.status,200,JSON.stringify(created.json));
 assert.match(created.json.code,/^SC-[A-Za-z0-9_-]{24}$/);
 assert.equal(created.json.command,'/sscircle link '+created.json.code);
 assert.notEqual(x.db.prepare('SELECT code_hash FROM minecraft_link_challenges').get().code_hash,created.json.code);
});
test('server-only signed claim, nonce replay prevention and explicit confirmation',async()=>{
 const x=fixture(),cookie=await x.active();
 const created=await x.call('/api/player/minecraft/link/create',{method:'POST',cookie,data:{}});
 const data=payload(created.json.code);
 assert.equal((await x.claim(data,{key:'invalid-signing-key'})).status,401);
 assert.equal((await x.claim(data,{timestamp:Math.floor(Date.now()/1000)-300})).status,401);
 assert.equal((await x.claim({...data,authSource:'minecraft-name'})).status,403);
 const nonce=randomUUID();
 assert.equal((await x.claim(data,{nonce})).status,200);
 assert.equal((await x.claim(data,{nonce})).status,409);
 assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM minecraft_accounts').get().n,0);
 const status=await x.call('/api/player/minecraft/link/state',{cookie});
 assert.equal(status.json.pending.status,'needs_confirmation');
 assert.equal(status.json.pending.identity.username,'TestSteve');
 assert.equal((await x.call('/api/player/minecraft/link/confirm',{method:'POST',data:{}})).status,403);
 assert.equal((await x.call('/api/player/minecraft/link/confirm',{method:'POST',cookie,data:{}})).status,200);
 const profile=await x.call('/api/player/profile',{cookie});
 assert.equal(profile.json.accounts[0].provider,'java_premium');
 assert.equal((await x.call('/api/player/minecraft/link/confirm',{method:'POST',cookie,data:{}})).status,409);
});
test('duplicate identity across members is rejected',async()=>{
 const x=fixture(),one=await x.active(),two=await x.active(true);
 const a=await x.call('/api/player/minecraft/link/create',{method:'POST',cookie:one,data:{}});
 assert.equal((await x.claim(payload(a.json.code))).status,200);
 assert.equal((await x.call('/api/player/minecraft/link/confirm',{method:'POST',cookie:one,data:{}})).status,200);
 const b=await x.call('/api/player/minecraft/link/create',{method:'POST',cookie:two,data:{}});
 assert.equal((await x.claim(payload(b.json.code))).status,409);
 assert.equal((await x.call('/api/player/minecraft/link/state',{cookie:two})).json.linked,null);
});
test('expired or cancelled code is rejected, and unlink needs password reauthentication',async()=>{
 const x=fixture(),cookie=await x.active();
 const first=await x.call('/api/player/minecraft/link/create',{method:'POST',cookie,data:{}});
 assert.equal((await x.call('/api/player/minecraft/link/cancel',{method:'POST',cookie,data:{}})).status,200);
 assert.equal((await x.claim(payload(first.json.code))).status,404);
 const second=await x.call('/api/player/minecraft/link/create',{method:'POST',cookie,data:{}});
 x.db.prepare('UPDATE minecraft_link_challenges SET expires_at=?')
  .run('2020-01-01T00:00:00.000Z');
 assert.equal((await x.claim(payload(second.json.code))).status,404);
 const third=await x.call('/api/player/minecraft/link/create',{method:'POST',cookie,data:{}});
 assert.equal((await x.claim(payload(third.json.code))).status,200);
 assert.equal((await x.call('/api/player/minecraft/link/confirm',{method:'POST',cookie,data:{}})).status,200);
 assert.equal((await x.call('/api/player/minecraft/link/unlink',{method:'POST',cookie,
  data:{currentProof:'A'.repeat(43)}})).status,403);
 assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM minecraft_accounts').get().n,1);
 const salt=x.db.prepare('SELECT password_salt FROM member_credentials WHERE application_id=?')
  .get(ID).password_salt;
 const proof=pbkdf2Sync(PASSWORD,salt,220000,32,'sha256').toString('base64url');
 assert.equal((await x.call('/api/player/minecraft/link/unlink',{method:'POST',cookie,
  data:{currentProof:proof}})).status,200);
 assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM minecraft_accounts').get().n,0);
});
test('bedrock identity requires Floodgate authority, admin listing requires admin session',async()=>{
 const x=fixture(),cookie=await x.active();
 const created=await x.call('/api/player/minecraft/link/create',{method:'POST',cookie,data:{}});
 const bedrock={code:created.json.code,provider:'bedrock',providerId:'2000000123456789012',
  username:'Bedrock Tester',authSource:'minecraft-name'};
 assert.equal((await x.claim(bedrock)).status,403);
 assert.equal((await x.claim({...bedrock,authSource:'floodgate-xuid'})).status,200);
 assert.equal((await x.call('/api/player/minecraft/link/confirm',{method:'POST',cookie,data:{}})).status,200);
 assert.equal((await x.call('/api/player/minecraft/link/state',{cookie})).json.linked.provider,'bedrock');
 assert.equal((await x.call('/api/admin/minecraft/links',{cookie:''})).status,401);
 assert.equal((await x.call('/api/admin/minecraft/links',{cookie:x.admin})).json.links.length,1);
});

test('Velocity only asserts Java Premium after checking per-player Mojang authentication',()=>{
 const java=readFileSync(new URL('../minecraft-link-velocity/src/main/java/id/sscircle/link/SSCircleLinkPlugin.java',import.meta.url),'utf8');
 assert.match(java,/player\.isOnlineMode\(\)/);
 assert.match(java,/getPlugin\("librelogin"\)/);
 assert.match(java,/isFloodgatePlayer/);
 assert.match(java,/SSCIRCLE_LINK_SERVER_SECRET/);
 assert.doesNotMatch(java,/System\.out\.println\(.*code/);
});

test('V10.45.3: signed website probe detects secret mismatch and clock drift',async()=>{
 const t=fixture(), path='/api/minecraft/link/diagnose';
 async function probe({key=SERVER,timestamp=Math.floor(Date.now()/1000),raw='{}'}={}){
  const nonce=randomUUID();
  const signature=createHmac('sha256',key)
   .update('POST\n'+path+'\n'+timestamp+'\n'+nonce+'\n'+raw)
   .digest('base64url');
  const response=await worker.fetch(new Request('https://sscircle.test'+path,{
   method:'POST',headers:{'Content-Type':'application/json','X-SSC-Timestamp':String(timestamp),
    'X-SSC-Nonce':nonce,'X-SSC-Signature':signature},body:raw
  }),t.env);
  return {status:response.status,json:await response.json()};
 }
 const ok=await probe();
 assert.equal(ok.status,200,JSON.stringify(ok.json));
 assert.equal(ok.json.code,'DIAGNOSTIC_OK');
 assert.equal(JSON.stringify(ok.json).includes(SERVER),false);
 const mismatch=await probe({key:'different-strong-secret-that-does-not-match'});
 assert.equal(mismatch.status,401);
 assert.equal(mismatch.json.code,'SIGNATURE_INVALID');
 const skew=await probe({timestamp:Math.floor(Date.now()/1000)-240});
 assert.equal(skew.status,401);
 assert.equal(skew.json.code,'CLOCK_SKEW');
 const bad=await probe({raw:'{"test":"anything"}'});
 assert.equal(bad.status,400);
 assert.equal(bad.json.code,'PAYLOAD_INVALID');
 t.env.SSCIRCLE_LINK_SERVER_SECRET='';
 const missing=await probe();
 assert.equal(missing.status,503);
 assert.equal(missing.json.code,'SERVER_SECRET_MISSING');
});

test('V10.46: signed AuthMe claim binds local Java account without Premium spoofing',async()=>{
 const x=fixture(),cookie=await x.active();
 const code=(await x.call('/api/player/minecraft/link/create',{method:'POST',cookie,data:{}})).json.code;
 const account='70a89d54-c32e-3942-a553-34f71cfde04d';
 const authme={code,provider:'java_offline',providerId:account,
   username:'LocalSteve',authSource:'authme-session'};
 assert.equal((await x.claim({...authme,authSource:'minecraft-name'})).status,403);
 assert.equal((await x.claim({...authme,provider:'java_premium'})).status,403);
 assert.equal((await x.claim({...authme,providerId:UUID})).status,403);
 assert.equal((await x.claim({...authme,username:'Name With Space'})).status,403);
 const accepted=await x.claim(authme);
 assert.equal(accepted.status,200,JSON.stringify(accepted.json));
 const confirmed=await x.call('/api/player/minecraft/link/confirm',{method:'POST',cookie,data:{}});
 assert.equal(confirmed.status,200,JSON.stringify(confirmed.json));
 assert.equal((await x.call('/api/player/minecraft/link/state',{cookie})).json.linked.provider,'java_offline');
});
test('V10.46: Bedrock verified Floodgate XUID still works independently from AuthMe',async()=>{
 const x=fixture(),cookie=await x.active();
 const code=(await x.call('/api/player/minecraft/link/create',{method:'POST',cookie,data:{}})).json.code;
 const data={code,provider:'bedrock',providerId:'12345678901234567',username:'.BedrockPlayer',
   authSource:'floodgate-xuid'};
 const accepted=await x.claim(data);
 assert.equal(accepted.status,200,JSON.stringify(accepted.json));
 assert.equal((await x.call('/api/player/minecraft/link/confirm',{method:'POST',cookie,data:{}})).status,200);
});

async function deliverStats(x,payload,{key=SERVER,nonce=randomUUID(),timestamp=Math.floor(Date.now()/1000)}={}){
 const raw=JSON.stringify(payload);
 const signature=createHmac('sha256',key)
   .update('POST\n/api/minecraft/stats/ingest\n'+timestamp+'\n'+nonce+'\n'+raw)
   .digest('base64url');
 const res=await worker.fetch(new Request('https://sscircle.test/api/minecraft/stats/ingest',{
   method:'POST',headers:{'Content-Type':'application/json','X-SSC-Timestamp':String(timestamp),
     'X-SSC-Nonce':nonce,'X-SSC-Signature':signature},body:raw
 }),x.env);
 return {status:res.status,json:await res.json()};
}
function statsPayload(provider='java_premium',providerId=UUID,authSource='mojang-online'){
 return {eventId:randomUUID(),provider,providerId,authSource,
   capturedAt:new Date().toISOString(),
   stats:{playtimeSeconds:7200,deaths:3,mobKills:41,blocksMined:501}};
}
test('V10.47: signed Vanilla stats are accepted only after member confirms link',async()=>{
 const x=fixture(),cookie=await x.active();
 const pre=await deliverStats(x,statsPayload());
 assert.equal(pre.status,404);
 assert.equal(pre.json.code,'STATS_NOT_LINKED');
 const created=await x.call('/api/player/minecraft/link/create',{method:'POST',cookie,data:{}});
 assert.equal((await x.claim(payload(created.json.code))).status,200);
 assert.equal((await x.call('/api/player/minecraft/link/confirm',{method:'POST',cookie,data:{}})).status,200);
 const first=statsPayload();
 assert.equal((await deliverStats(x,first,{key:'bad-signature'})).status,401);
 assert.equal((await deliverStats(x,{...first,authSource:'minecraft-name'})).status,400);
 const result=await deliverStats(x,first);
 assert.equal(result.status,200,JSON.stringify(result.json));
 assert.equal(result.json.code,'STATS_SYNCED');
 const profile=await x.call('/api/player/profile',{cookie});
 assert.deepEqual(profile.json.statistics[0]&&[
   profile.json.statistics[0].playtimeSeconds,
   profile.json.statistics[0].deaths,
   profile.json.statistics[0].mobKills,
   profile.json.statistics[0].blocksMined],[7200,3,41,501]);
 assert.notEqual(profile.json.statistics[0].updatedAt,'');
});
test('V10.47: retries deduplicate and out-of-order counters never decrease',async()=>{
 const x=fixture(),cookie=await x.active();
 const created=await x.call('/api/player/minecraft/link/create',{method:'POST',cookie,data:{}});
 await x.claim(payload(created.json.code));
 await x.call('/api/player/minecraft/link/confirm',{method:'POST',cookie,data:{}});
 const newer=statsPayload();
 const idempotent=await deliverStats(x,newer);
 assert.equal(idempotent.status,200);
 assert.equal((await deliverStats(x,newer)).json.code,'STATS_DUPLICATE');
 const replayNonce=randomUUID();
 assert.equal((await deliverStats(x,{...newer,eventId:randomUUID()},{nonce:replayNonce})).status,200);
 assert.equal((await deliverStats(x,{...newer,eventId:randomUUID()},{nonce:replayNonce})).status,409);
 const old={...newer,eventId:randomUUID(),
   capturedAt:new Date(Date.now()-60_000).toISOString(),
   stats:{playtimeSeconds:1000,deaths:1,mobKills:5,blocksMined:10}};
 const late=await deliverStats(x,old);
 // The old snapshot is from before linking: it cannot be reassigned later.
 assert.equal(late.status,410);
 const earlier={...newer,eventId:randomUUID(),
   stats:{playtimeSeconds:1000,deaths:1,mobKills:5,blocksMined:10}};
 assert.equal((await deliverStats(x,earlier)).status,200);
 const profile=(await x.call('/api/player/profile',{cookie})).json.statistics[0];
 assert.equal(profile.playtimeSeconds,7200);
 assert.equal(profile.mobKills,41);
 assert.equal(profile.blocksMined,501);
 const receiptCount=x.db.prepare('SELECT COUNT(*) AS n FROM minecraft_stat_receipts').get().n;
 assert.equal(receiptCount,3);
});
test('V10.47: AuthMe Non-Premium and Bedrock require matching signed identities',async()=>{
 for(const [provider,providerId,authSource,username] of [
   ['java_offline','70a89d54-c32e-3942-a553-34f71cfde04d','authme-session','LocalSteve'],
   ['bedrock','12345678901234567','floodgate-xuid','.BedrockUser']]){
   const x=fixture(),cookie=await x.active();
   const code=(await x.call('/api/player/minecraft/link/create',{method:'POST',cookie,data:{}})).json.code;
   assert.equal((await x.claim({code,provider,providerId,authSource,username})).status,200);
   assert.equal((await x.call('/api/player/minecraft/link/confirm',{method:'POST',cookie,data:{}})).status,200);
   const data=statsPayload(provider,providerId,authSource);
   assert.equal((await deliverStats(x,{...data,authSource:'minecraft-name'})).status,400);
   assert.equal((await deliverStats(x,data)).status,200);
   const profile=(await x.call('/api/player/profile',{cookie})).json;
   assert.equal(profile.statistics[0].deaths,3);
 }
});

test('V10.47.2: season starts at a fresh baseline and world resets never erase archived totals',async()=>{
 const x=fixture(),cookie=await x.active();
 const code=(await x.call('/api/player/minecraft/link/create',{method:'POST',cookie,data:{}})).json.code;
 assert.equal((await x.claim(payload(code))).status,200);
 assert.equal((await x.call('/api/player/minecraft/link/confirm',{method:'POST',cookie,data:{}})).status,200);
 const base=Date.now()+5000;
 const setSeason=(id,start)=>x.db.prepare('UPDATE form_config SET settings=? WHERE id=1')
   .run(JSON.stringify({statSeasonId:id,statSeasonActivatedAt:start,
     homeLeaderboardSeasons:[{id:'season-1',title:'Season Pertama'},{id:'season-2',title:'Season Kedua'}]}));
 const seasonStart=new Date(Date.now()-3000).toISOString();
 setSeason('season-1',seasonStart);
 function stat(at,play,deaths,mobs,blocks){
   return {...statsPayload(),capturedAt:new Date(base+at*1000).toISOString(),
     stats:{playtimeSeconds:play,deaths,mobKills:mobs,blocksMined:blocks}};
 }
 assert.equal((await deliverStats(x,stat(0,1000,8,40,300))).status,200);
 let profile=(await x.call('/api/player/profile',{cookie})).json;
 assert.equal(profile.activeStatSeason,'season:season-1:'+seasonStart);
 assert.equal(profile.statistics.find(s=>s.seasonId==='').playtimeSeconds,1000);
 assert.equal(profile.statistics.find(s=>s.seasonId===profile.activeStatSeason).playtimeSeconds,0);
 assert.equal((await deliverStats(x,stat(1,1100,9,43,310))).status,200);
 profile=(await x.call('/api/player/profile',{cookie})).json;
 assert.equal(profile.statistics.find(s=>s.seasonId===profile.activeStatSeason).playtimeSeconds,100);
 assert.equal(profile.statistics.find(s=>s.seasonId===profile.activeStatSeason).deaths,1);
 // Reset vanilla world stats. The new segment increments by the new raw value.
 assert.equal((await deliverStats(x,stat(2,10,1,2,3))).status,200);
 profile=(await x.call('/api/player/profile',{cookie})).json;
 assert.equal(profile.statistics.find(s=>s.seasonId==='').playtimeSeconds,1110);
 assert.equal(profile.statistics.find(s=>s.seasonId===profile.activeStatSeason).playtimeSeconds,110);
 assert.equal(profile.statistics.find(s=>s.seasonId===profile.activeStatSeason).deaths,2);
 const oldKey=profile.activeStatSeason;
 // Changing season creates a distinct epoch, with no deletion of old rows.
 const nextStart=new Date(base+2500).toISOString();
 setSeason('season-2',nextStart);
 assert.equal((await deliverStats(x,stat(3,70,2,5,13))).status,200);
 profile=(await x.call('/api/player/profile',{cookie})).json;
 assert.equal(profile.activeStatSeason,'season:season-2:'+nextStart);
 assert.equal(profile.statistics.find(s=>s.seasonId===oldKey).playtimeSeconds,110);
 assert.equal(profile.statistics.find(s=>s.seasonId===profile.activeStatSeason).playtimeSeconds,0);
 assert.equal(profile.statistics.find(s=>s.seasonId==='').playtimeSeconds,1170);
 assert.equal(profile.statistics.find(s=>s.seasonId===oldKey).seasonTitle,'Season Pertama');
 assert.equal(profile.statistics.find(s=>s.seasonId===profile.activeStatSeason).seasonTitle,'Season Kedua');
});
test('V10.47.2: out-of-order season snapshots are ignored rather than decreasing totals',async()=>{
 const x=fixture(),cookie=await x.active();
 const code=(await x.call('/api/player/minecraft/link/create',{method:'POST',cookie,data:{}})).json.code;
 await x.claim(payload(code));
 await x.call('/api/player/minecraft/link/confirm',{method:'POST',cookie,data:{}});
 const start=new Date(Date.now()-1000).toISOString();
 x.db.prepare('UPDATE form_config SET settings=? WHERE id=1')
  .run(JSON.stringify({statSeasonId:'season-1',statSeasonActivatedAt:start,
    homeLeaderboardSeasons:[{id:'season-1',title:'S1'}]}));
 const mk=(time,seconds)=>({...statsPayload(),eventId:randomUUID(),
   capturedAt:new Date(Date.now()+time).toISOString(),
   stats:{playtimeSeconds:seconds,deaths:1,mobKills:2,blocksMined:4}});
 const first=mk(11000,1000);
 assert.equal((await deliverStats(x,first)).status,200);
 const later=mk(13000,1050);
 assert.equal((await deliverStats(x,later)).status,200);
 const late=mk(12000,1010);
 assert.equal((await deliverStats(x,late)).status,200);
 const profile=(await x.call('/api/player/profile',{cookie})).json;
 assert.equal(profile.statistics.find(s=>s.seasonId==='').playtimeSeconds,1050);
 assert.equal(profile.statistics.find(s=>s.seasonId).playtimeSeconds,50);
 assert.equal((await deliverStats(x,later)).json.code,'STATS_DUPLICATE');
});

async function monitorBeat(x,body,{key=SERVER,nonce=randomUUID(),
  timestamp=Math.floor(Date.now()/1000)}={}){
  const raw=JSON.stringify(body);
  const signature=createHmac('sha256',key)
    .update('POST\n/api/minecraft/sync/heartbeat\n'+timestamp+'\n'+nonce+'\n'+raw)
    .digest('base64url');
  const response=await worker.fetch(
    new Request('https://sscircle.test/api/minecraft/sync/heartbeat',{
      method:'POST',headers:{
        'Content-Type':'application/json','X-SSC-Timestamp':String(timestamp),
        'X-SSC-Nonce':nonce,'X-SSC-Signature':signature
      },body:raw}),x.env);
  return {status:response.status,json:await response.json()};
}
function telemetryBody(override={}){
  return {pluginVersion:'10.48.0',onlineCount:19,pendingCount:3,
    captureBacklog:2,deliveryCode:'QUEUE_PENDING',lastSuccessAt:null,
    tps1m:19.78,completedCommandId:null,...override};
}
test('V10.48: only a signed Paper heartbeat can populate private health monitoring',async()=>{
  const x=fixture();
  const noAccess=await x.call('/api/admin/minecraft/sync');
  assert.equal(noAccess.status,401);
  const before=await x.call('/api/admin/minecraft/sync',{cookie:x.admin});
  assert.equal(before.status,200);
  assert.equal(before.json.connection,'no_data');
  assert.equal(before.json.telemetry,null);
  assert.equal((await monitorBeat(x,telemetryBody(),{key:'invalid-key'})).status,401);
  assert.equal((await monitorBeat(x,telemetryBody({deliveryCode:'server-password'}))).status,400);
  assert.equal((await monitorBeat(x,telemetryBody({tps1m:30}))).status,400);
  // V10.48.4.3: deployed plugin 10.48.4.2 uses FOUR version segments.
  // Old 10.x.y-only validation rejected every heartbeat with HTTP 400.
  assert.equal((await monitorBeat(x,telemetryBody({pluginVersion:'10.48.4.2'}))).status,200);
  assert.equal((await monitorBeat(x,telemetryBody({pluginVersion:'10.48.4.3'}))).status,200);
  assert.equal((await monitorBeat(x,telemetryBody({pluginVersion:'10.48.4.3.7'}))).status,400);
  assert.equal((await monitorBeat(x,telemetryBody({pluginVersion:'10.48.4.3;DROP'}))).status,400);
  const nonce=randomUUID();
  const accepted=await monitorBeat(x,telemetryBody(),{nonce});
  assert.equal(accepted.status,200,JSON.stringify(accepted.json));
  assert.equal(accepted.json.command,null);
  assert.equal((await monitorBeat(x,telemetryBody(),{nonce})).status,409);
  const status=await x.call('/api/admin/minecraft/sync',{cookie:x.admin});
  assert.equal(status.status,200,JSON.stringify(status.json));
  assert.equal(status.json.connection,'recent');
  assert.equal(status.json.telemetry.onlinePlayers,19);
  assert.equal(status.json.telemetry.pendingSnapshots,3);
  assert.equal(status.json.telemetry.tps1m,19.78);
  assert.equal(status.json.events[0].code,'QUEUE_PENDING');
  assert.equal(status.json.summary.linked,0);
  assert.equal(status.json.accounts.length,0);
  assert.equal(JSON.stringify(status.json).includes(SERVER),false);
});
test('V10.48: admin remote sync request is polled safely, acknowledged and rate-limited',async()=>{
  const x=fixture();
  assert.equal((await x.call('/api/admin/minecraft/sync/request',{method:'POST',data:{}})).status,401);
  const requested=await x.call('/api/admin/minecraft/sync/request',
    {method:'POST',cookie:x.admin,data:{}});
  assert.equal(requested.status,200,JSON.stringify(requested.json));
  assert.equal(requested.json.requested,true);
  const second=await x.call('/api/admin/minecraft/sync/request',
    {method:'POST',cookie:x.admin,data:{}});
  assert.equal(second.json.alreadyPending,true);
  assert.equal(second.json.id,requested.json.id);
  const polled=await monitorBeat(x,telemetryBody());
  assert.equal(polled.status,200);
  assert.deepEqual({id:polled.json.command.id,type:polled.json.command.type},
    {id:requested.json.id,type:'sync_now'});
  const done=await monitorBeat(x,telemetryBody({completedCommandId:requested.json.id,
    deliveryCode:'SYNC_OK',lastSuccessAt:new Date().toISOString()}));
  assert.equal(done.status,200,JSON.stringify(done.json));
  assert.equal(done.json.command,null);
  const status=await x.call('/api/admin/minecraft/sync',{cookie:x.admin});
  assert.equal(status.json.pendingCommand,null);
  assert.equal(status.json.telemetry.deliveryCode,'SYNC_OK');
  assert.equal(status.json.events.length,2);
  assert.equal((await x.call('/api/admin/minecraft/sync/request',
    {method:'POST',cookie:x.admin,data:{}})).status,429);
});
test('V10.48: monitor account listing only reflects verified Minecraft links',async()=>{
  const x=fixture(),cookie=await x.active();
  const code=(await x.call('/api/player/minecraft/link/create',
    {method:'POST',cookie,data:{}})).json.code;
  await x.claim(payload(code));
  let adminView=await x.call('/api/admin/minecraft/sync',{cookie:x.admin});
  assert.equal(adminView.json.summary.linked,0);
  await x.call('/api/player/minecraft/link/confirm',{method:'POST',cookie,data:{}});
  adminView=await x.call('/api/admin/minecraft/sync',{cookie:x.admin});
  assert.equal(adminView.json.summary.linked,1);
  assert.equal(adminView.json.summary.noStats,1);
  assert.equal(adminView.json.accounts[0].provider,'java_premium');
  assert.equal(adminView.json.accounts[0].username,'TestSteve');
  assert.equal(adminView.json.accounts[0].lastSyncAt,null);
});

test('V10.48.1: admin search and status filter cover every page, not only first 100 records',async()=>{
  const x=fixture();
  await x.call('/api/admin/minecraft/sync',{cookie:x.admin}); // Create additive member tables.
  const start=Date.now()-200000;
  // Use real connected records and member profiles; no synthetic browser data.
  const insertMember=x.db.prepare('INSERT INTO submissions(id,status,tracking_code,submitted_at) VALUES(?,?,?,?)');
  const insertLink=x.db.prepare('INSERT INTO minecraft_accounts(id,application_id,provider,provider_id,username,verified_at) VALUES(?,?,?,?,?,?)');
  const insertProfile=x.db.prepare('INSERT INTO member_profiles(application_id,display_name) VALUES(?,?)');
  for(let i=0;i<125;i++){
    const member='f'+String(i).padStart(7,'0')+'-1111-4111-8111-111111111111';
    const minecraft='c'+String(i).padStart(7,'0')+'-2222-4222-8222-222222222222';
    const timestamp=new Date(start+i*1000).toISOString();
    insertMember.run(member,'accepted','T'+String(i).padStart(19,'0'),timestamp);
    insertLink.run(minecraft,member,'java_premium',minecraft,
      i===0?'RareTarget':'Player_'+i,timestamp);
    if(i===0)insertProfile.run(member,'Hidden Finder');
    if(i===5)x.db.prepare("INSERT INTO player_stat_snapshots (application_id,season_id,playtime_seconds,deaths,mob_kills,blocks_mined,last_synced_at) VALUES(?,'',10,1,0,2,?)").run(member,timestamp);
  }
  const page=await x.call('/api/admin/minecraft/sync?offset=100',{cookie:x.admin});
  assert.equal(page.status,200,JSON.stringify(page.json));
  assert.equal(page.json.accounts.length,25);
  const found=await x.call('/api/admin/minecraft/sync?q=raretaRGET',{cookie:x.admin});
  assert.equal(found.status,200,JSON.stringify(found.json));
  assert.equal(found.json.accounts.length,1);
  assert.equal(found.json.accounts[0].username,'RareTarget');
  const byDisplay=await x.call('/api/admin/minecraft/sync?q=HIDDEN%20FINDER',{cookie:x.admin});
  assert.equal(byDisplay.json.accounts.length,1);
  const missing=await x.call('/api/admin/minecraft/sync?filter=missing',{cookie:x.admin});
  assert.equal(missing.json.accounts.length,100);
  assert.equal(missing.json.hasMore,true);
  const synced=await x.call('/api/admin/minecraft/sync?filter=synced',{cookie:x.admin});
  assert.equal(synced.json.accounts.length,1);
  assert.equal(synced.json.accounts[0].username,'Player_5');
  const wildcard=await x.call('/api/admin/minecraft/sync?q=%25',{cookie:x.admin});
  assert.equal(wildcard.json.accounts.length,0,'LIKE wildcards must not be treated as arbitrary search');
  const privateView=await x.call('/api/admin/minecraft/sync?filter=synced');
  assert.equal(privateView.status,401);
});

test('V10.48.2: signed FastLogin Premium/Cracked and unknown AuthMe get separate editions',async()=>{
  const id='70a89d54-c32e-3942-a553-34f71cfde04d';
  for(const [source,edition] of [
    ['fastlogin-premium','java_premium'],
    ['fastlogin-cracked','java_non_premium'],
    ['authme-session','java_unverified']]){
    const x=fixture(),cookie=await x.active();
    const code=(await x.call('/api/player/minecraft/link/create',{method:'POST',cookie,data:{}})).json.code;
    const claim={code,provider:'java_offline',providerId:id,username:'LocalSteve',authSource:source};
    assert.equal((await x.claim({...claim,provider:'java_premium'})).status,403);
    assert.equal((await x.claim(claim)).status,200);
    const pending=await x.call('/api/player/minecraft/link/state',{cookie});
    assert.equal(pending.json.pending.identity.edition,edition);
    assert.equal((await x.call('/api/player/minecraft/link/confirm',{method:'POST',cookie,data:{}})).status,200);
    const profile=await x.call('/api/player/profile',{cookie});
    assert.equal(profile.json.accounts[0].edition,edition);
    assert.equal((await x.call('/api/player/minecraft/link/state',{cookie})).json.linked.edition,edition);
    const admin=await x.call('/api/admin/minecraft/sync',{cookie:x.admin});
    assert.equal(admin.json.accounts[0].edition,edition);
  }
});
test('V10.48.2: signed newer sessions refresh edition; stale queued snapshots cannot revert it',async()=>{
  const x=fixture(),cookie=await x.active();
  const id='70a89d54-c32e-3942-a553-34f71cfde04d';
  const code=(await x.call('/api/player/minecraft/link/create',{method:'POST',cookie,data:{}})).json.code;
  await x.claim({code,provider:'java_offline',providerId:id,
    username:'LocalSteve',authSource:'authme-session'});
  await x.call('/api/player/minecraft/link/confirm',{method:'POST',cookie,data:{}});
  assert.equal((await x.call('/api/player/profile',{cookie})).json.accounts[0].edition,'java_unverified');
  const now=Date.now()+2000;
  const newer={...statsPayload('java_offline',id,'fastlogin-premium'),
    capturedAt:new Date(now+1000).toISOString()};
  assert.equal((await deliverStats(x,newer)).status,200);
  assert.equal((await x.call('/api/player/profile',{cookie})).json.accounts[0].edition,'java_premium');
  const stale={...statsPayload('java_offline',id,'fastlogin-cracked'),
    capturedAt:new Date(now).toISOString()};
  assert.equal((await deliverStats(x,stale)).status,200);
  assert.equal((await x.call('/api/player/profile',{cookie})).json.accounts[0].edition,'java_premium');
  const latest={...statsPayload('java_offline',id,'fastlogin-cracked'),
    capturedAt:new Date(now+2000).toISOString()};
  assert.equal((await deliverStats(x,latest)).status,200);
  assert.equal((await x.call('/api/player/profile',{cookie})).json.accounts[0].edition,'java_non_premium');
  const beforeWarning=await x.call('/api/admin/minecraft/sync',{cookie:x.admin});
  assert.ok(beforeWarning.json.accounts[0].securityWarnings.includes('SESI_OFFLINE_BELUM_PREMIUM'));
  assert.equal((await deliverStats(x,{...latest,authSource:'untrusted-nickname'})).status,400);
  const evidence=x.db.prepare('SELECT auth_source FROM minecraft_identity_evidence WHERE provider_id=?').get(id);
  assert.equal(evidence.auth_source,'fastlogin-cracked');
});
test('V10.48.2: legacy links keep UUID and are unverified until signed session evidence',async()=>{
  const x=fixture(),cookie=await x.active();
  await x.call('/api/player/profile',{cookie});
  const id='70a89d54-c32e-3942-a553-34f71cfde04d';
  x.db.prepare('INSERT INTO minecraft_accounts VALUES(?,?,?,?,?,?)').run(
    randomUUID(),ID,'java_offline',id,'LegacySteve',new Date(Date.now()-5000).toISOString());
  const before=(await x.call('/api/player/profile',{cookie})).json.accounts[0];
  assert.equal(before.edition,'java_unverified');
  const snapshot=statsPayload('java_offline',id,'fastlogin-premium');
  assert.equal((await deliverStats(x,snapshot)).status,200);
  const after=(await x.call('/api/player/profile',{cookie})).json.accounts[0];
  assert.equal(after.edition,'java_premium');
  assert.equal(x.db.prepare('SELECT provider_id FROM minecraft_accounts').get().provider_id,id);
});


test('V10.48.4: admin-only warnings expose unverified and stale FastLogin proof without moving accounts',async()=>{
  const x=fixture(),cookie=await x.active();
  const id='70a89d54-c32e-3942-a553-34f71cfde04d';
  const code=(await x.call('/api/player/minecraft/link/create',
    {method:'POST',cookie,data:{}})).json.code;
  assert.equal((await x.claim({code,provider:'java_offline',providerId:id,
    username:'LocalSteve',authSource:'authme-session'})).status,200);
  assert.equal((await x.call('/api/player/minecraft/link/confirm',
    {method:'POST',cookie,data:{}})).status,200);
  let adminView=await x.call('/api/admin/minecraft/sync',{cookie:x.admin});
  assert.ok(adminView.json.accounts[0].securityWarnings.includes('PREMIUM_BELUM_VERIFIKASI'));
  // Old historical proof must be visible as old, not as a current live session.
  x.db.prepare('UPDATE minecraft_identity_evidence SET auth_source=?, observed_at=? WHERE provider_id=?')
    .run('fastlogin-premium',new Date(Date.now()-9*86400000).toISOString(),id);
  adminView=await x.call('/api/admin/minecraft/sync',{cookie:x.admin});
  assert.equal(adminView.json.accounts[0].edition,'java_unverified');
  assert.ok(adminView.json.accounts[0].securityWarnings.includes('BUKTI_LOGIN_LAMA'));
  assert.equal((await x.call('/api/player/profile',{cookie})).json.accounts[0].edition,'java_unverified');
  assert.ok(adminView.json.accounts[0].identityProofAt);
  assert.equal((await x.call('/api/admin/minecraft/sync')).status,401);
  assert.equal(x.db.prepare('SELECT provider_id FROM minecraft_accounts').get().provider_id,id);
});

test('V10.48.4: duplicate display name across distinct verified accounts warns admins, never auto-links',async()=>{
  const x=fixture(),first=await x.active(),second=await x.active(true);
  async function link(cookie,providerId){
    const code=(await x.call('/api/player/minecraft/link/create',
      {method:'POST',cookie,data:{}})).json.code;
    assert.equal((await x.claim({code,provider:'java_premium',providerId,
      username:'DuplicateName',authSource:'mojang-online'})).status,200);
    assert.equal((await x.call('/api/player/minecraft/link/confirm',
      {method:'POST',cookie,data:{}})).status,200);
  }
  await link(first,UUID);
  await link(second,'a3b127cc-89de-4875-b456-8de073b2e212');
  const view=await x.call('/api/admin/minecraft/sync',{cookie:x.admin});
  assert.equal(view.status,200,JSON.stringify(view.json));
  assert.equal(view.json.summary.linked,2);
  assert.equal(view.json.accounts.length,2);
  assert.ok(view.json.accounts.every(a=>a.securityWarnings.includes('NAMA_SAMA_PERIKSA')));
});

async function deliverIdentity(x,payload,{nonce=randomUUID(),
  timestamp=Math.floor(Date.now()/1000),key=SERVER}={}){
  const raw=JSON.stringify(payload),route='/api/minecraft/identity/refresh';
  const signature=createHmac('sha256',key)
    .update('POST\n'+route+'\n'+timestamp+'\n'+nonce+'\n'+raw)
    .digest('base64url');
  const res=await worker.fetch(new Request('https://sscircle.test'+route,{
    method:'POST',headers:{'Content-Type':'application/json',
      'X-SSC-Timestamp':String(timestamp),'X-SSC-Nonce':nonce,
      'X-SSC-Signature':signature},body:raw
  }),x.env);
  return {status:res.status,json:await res.json()};
}

test('V10.48.4.1: independently refresh FastLoginPlus PREMIUM after a CRACKED claim without touching statistics',async()=>{
  const x=fixture(),cookie=await x.active();
  const id='70a89d54-c32e-3942-a553-34f71cfde04d';
  const code=(await x.call('/api/player/minecraft/link/create',
    {method:'POST',cookie,data:{}})).json.code;
  assert.equal((await x.claim({code,provider:'java_offline',providerId:id,
    username:'LocalSteve',authSource:'fastlogin-cracked'})).status,200);
  assert.equal((await x.call('/api/player/minecraft/link/confirm',
    {method:'POST',cookie,data:{}})).status,200);
  assert.equal((await x.call('/api/player/profile',{cookie})).json.accounts[0].edition,'java_non_premium');
  const statsBefore=x.db.prepare('SELECT COUNT(*) AS n FROM player_stat_snapshots').get().n;
  const premium={provider:'java_offline',providerId:id,authSource:'fastlogin-premium',
    observedAt:new Date(Date.now()+1000).toISOString()};
  assert.equal((await deliverIdentity(x,premium,{key:'not-the-server-secret'})).status,401);
  assert.equal((await deliverIdentity(x,{...premium,authSource:'minecraft-name'})).status,400);
  const result=await deliverIdentity(x,premium);
  assert.equal(result.status,200,JSON.stringify(result.json));
  assert.equal(result.json.code,'IDENTITY_UPDATED');
  assert.equal((await x.call('/api/player/profile',{cookie})).json.accounts[0].edition,'java_premium');
  assert.equal((await x.call('/api/player/minecraft/link/state',{cookie})).json.linked.edition,'java_premium');
  const admin=await x.call('/api/admin/minecraft/sync',{cookie:x.admin});
  assert.equal(admin.json.accounts[0].edition,'java_premium');
  assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM player_stat_snapshots').get().n,statsBefore);
  assert.equal(x.db.prepare('SELECT provider_id FROM minecraft_accounts').get().provider_id,id);
});

test('V10.48.4.1: identity-only endpoint requires linked accepted account, freshness, unique nonce',async()=>{
  const x=fixture(),cookie=await x.active();
  const id='70a89d54-c32e-3942-a553-34f71cfde04d';
  const proof={provider:'java_offline',providerId:id,authSource:'fastlogin-premium',
    observedAt:new Date().toISOString()};
  assert.equal((await deliverIdentity(x,proof)).status,404);
  const code=(await x.call('/api/player/minecraft/link/create',
    {method:'POST',cookie,data:{}})).json.code;
  await x.claim({code,provider:'java_offline',providerId:id,
    username:'LocalSteve',authSource:'authme-session'});
  // Signed evidence must not reserve a pending claim or bypass member confirmation.
  assert.equal((await deliverIdentity(x,proof)).status,404);
  await x.call('/api/player/minecraft/link/confirm',{method:'POST',cookie,data:{}});
  const latest={...proof,observedAt:new Date(Date.now()+2000).toISOString()};
  assert.equal((await deliverIdentity(x,latest,{timestamp:Math.floor(Date.now()/1000)-250})).status,401);
  assert.equal((await deliverIdentity(x,{...latest,observedAt:new Date(Date.now()-400000).toISOString()})).status,400);
  const nonce=randomUUID();
  assert.equal((await deliverIdentity(x,latest,{nonce})).status,200);
  assert.equal((await deliverIdentity(x,latest,{nonce})).status,409);
  const stale={...latest,authSource:'fastlogin-cracked',
    observedAt:new Date(Date.now()+1000).toISOString()};
  assert.equal((await deliverIdentity(x,stale)).json.code,'IDENTITY_ALREADY_NEWER');
  assert.equal((await x.call('/api/player/profile',{cookie})).json.accounts[0].edition,'java_premium');
  assert.equal((await x.call('/api/admin/minecraft/sync')).status,401);
});

test('V10.48.4.1: stale Non-Premium proof becomes unverified, then fresh proof restores Premium',async()=>{
  const x=fixture(),cookie=await x.active();
  const id='70a89d54-c32e-3942-a553-34f71cfde04d';
  const code=(await x.call('/api/player/minecraft/link/create',
    {method:'POST',cookie,data:{}})).json.code;
  await x.claim({code,provider:'java_offline',providerId:id,
    username:'LocalSteve',authSource:'fastlogin-cracked'});
  await x.call('/api/player/minecraft/link/confirm',{method:'POST',cookie,data:{}});
  x.db.prepare('UPDATE minecraft_identity_evidence SET observed_at=? WHERE provider_id=?')
    .run(new Date(Date.now()-8*86400000).toISOString(),id);
  assert.equal((await x.call('/api/player/profile',{cookie})).json.accounts[0].edition,'java_unverified');
  assert.equal((await x.call('/api/player/minecraft/link/state',{cookie})).json.linked.edition,'java_unverified');
  const result=await deliverIdentity(x,{provider:'java_offline',providerId:id,
    authSource:'fastlogin-premium',observedAt:new Date(Date.now()+1000).toISOString()});
  assert.equal(result.status,200);
  assert.equal((await x.call('/api/player/profile',{cookie})).json.accounts[0].edition,'java_premium');
});
