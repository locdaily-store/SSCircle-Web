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
