import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHmac,createHash,randomUUID} from 'node:crypto';

const source=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const SECRET='sscircle-friends-integration-secret';
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const C='33333333-3333-4333-8333-333333333333';
const P='44444444-4444-4444-8444-444444444444';
const png='iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAZ0lEQVR42u3QAQEAIAgAIHNdn3rZIf2hMIFz369YLGM5AQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAwQQP4KwMUjsyocAAAAABJRU5ErkJggg==';
function hmac(key,value){return createHmac('sha256',key).update(value).digest('base64url');}
function cookie(name,body,key){
 const part=Buffer.from(JSON.stringify(body)).toString('base64url');
 return name+'='+part+'.'+hmac(key,part);
}
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE submissions (id TEXT PRIMARY KEY,status TEXT,tracking_code TEXT,submitted_at TEXT);'+
  'CREATE TABLE form_config(id INTEGER PRIMARY KEY,settings TEXT,pages TEXT,questions TEXT,updated_at TEXT);'+
  'CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER,expires_at INTEGER);'+
  'CREATE TABLE revoked_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER);');
 db.prepare('INSERT INTO form_config VALUES(1,?,?,?,?)').run(
   JSON.stringify({seasonArchiveEnabled:true,homeLeaderboardSeasons:[]}),
   JSON.stringify([{id:'page1',title:'Registration',blocks:[],routes:{}}]),'[]','v1');
 for(const [id,status,code] of [[A,'accepted','A'.repeat(20)],[B,'accepted','B'.repeat(20)],
    [C,'accepted','C'.repeat(20)],[P,'pending','D'.repeat(20)]])
   db.prepare('INSERT INTO submissions VALUES(?,?,?,?)').run(id,status,code,'2026-11-07T09:00:00Z');
 const DB={prepare(sql){const stmt=db.prepare(sql);let args=[];
   return {bind(...values){args=values;return this;},
     async first(){return stmt.get(...args)||null;},
     async all(){return {results:stmt.all(...args)};},
     async run(){const r=stmt.run(...args);return {meta:{changes:r.changes}};}};}};
 DB.batch=async(statements)=>{
   db.exec('BEGIN IMMEDIATE');
   try{const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}
   catch(e){db.exec('ROLLBACK');throw e;}
 };
 const env={DB,SESSION_SECRET:SECRET,ADMIN_PASSWORD:'staff-only',
    ASSETS:{fetch:async()=>new Response('HTML',{status:200})}};
 const exp=Math.floor(Date.now()/1000)+3600;
 const players={};const strong={};
 for(const id of [A,B,C,P]){
   players[id]=cookie('ssc_player',{id,sessionVersion:0,exp},SECRET+'|player-session');
 }
 async function bootstrap(){
   await call('/api/player/profile',{id:A,strongSession:false});
   for(const id of [A,B,C]){
     const sid=randomUUID();
     const raw=cookie('ssc_member_secure',{id,sid,epoch:0,exp,nonce:randomUUID()},SECRET+'|member-secure');
     const token=raw.split('=').slice(1).join('=');
     const hash=createHash('sha256').update(token).digest('base64url');
     db.prepare('INSERT INTO member_secure_sessions(id,application_id,token_hash,client_label,created_at,expires_at) VALUES(?,?,?,?,?,?)')
       .run(sid,id,hash,'Test Browser','2026-11-11T00:00:00Z',exp);
     strong[id]=raw;
   }
   db.prepare('INSERT INTO member_profiles(application_id,display_name,bio,visibility,show_stats) VALUES(?,?,?,?,?)')
     .run(A,'Alice','Bio Alice','members',1);
   db.prepare('INSERT INTO member_profiles(application_id,display_name,bio,visibility,show_stats) VALUES(?,?,?,?,?)')
     .run(B,'Bima','Bio Bima','members',1);
   db.prepare('INSERT INTO member_profiles(application_id,display_name,bio,visibility,show_stats) VALUES(?,?,?,?,?)')
     .run(C,'Charlie','Rahasia','private',0);
 }
 async function call(path,{id=A,strongSession=true,method='GET',body}={}){
   const cookieHeader=[players[id],strongSession?strong[id]:''].filter(Boolean).join('; ');
   const response=await worker.fetch(new Request('https://sscircle.example'+path,{
     method,headers:{Cookie:cookieHeader,Origin:'https://sscircle.example',
       'CF-Connecting-IP':'203.0.113.2',
       ...(body?{'Content-Type':'application/json'}:{})},
     ...(body?{body:JSON.stringify(body)}:{})}),env);
   let value=null;try{value=await response.clone().json()}catch{}
   return {status:response.status,value,response};
 }
 return {call,bootstrap,db,env};
}
test('directory requires accepted password session and respects member privacy, stats and skin',async()=>{
 const x=fixture();await x.bootstrap();
 assert.equal((await x.call('/api/player/community/search',{strongSession:false})).status,403);
 assert.equal((await x.call('/api/player/community/search',{id:P})).status,403);
 const list=await x.call('/api/player/community/search?q=bim');
 assert.equal(list.status,200,JSON.stringify(list.value));
 assert.deepEqual(list.value.items.map(i=>i.displayName),['Bima']);
 const searchPrivate=await x.call('/api/player/community/search?q=Charlie');
 assert.equal(searchPrivate.value.items.length,0);
 assert.equal((await x.call('/api/player/community/profile/'+C)).status,404);
 const profile=await x.call('/api/player/community/profile/'+B);
 assert.equal(profile.status,200);
 assert.equal(profile.value.profile.bio,'Bio Bima');
 assert.equal(JSON.stringify(profile.value).includes('tracking_code'),false);
 // Public profiles may be disabled by admin, without disabling "Anggota" visibility.
 const saved=await x.call('/api/player/profile',{id:C,method:'PUT',body:{
   displayName:'Charlie',bio:'Bio anggota',visibility:'members',showStats:false,eventAlerts:true}});
 assert.equal(saved.status,200,JSON.stringify(saved.value));
 assert.equal(saved.value.profile.visibility,'members');
 const visible=await x.call('/api/player/community/profile/'+C);
 assert.equal(visible.status,200);
 assert.equal(visible.value.profile.showStats,false);
 assert.deepEqual(visible.value.statistics,[]);
 x.db.prepare("UPDATE member_profiles SET visibility='private' WHERE application_id=?").run(C);
 assert.equal((await x.call('/api/player/community/profile/'+C)).status,404);
 const accountId=randomUUID(),now='2026-11-11T01:00:00Z',hash='c'.repeat(64);
 x.db.prepare('INSERT INTO minecraft_accounts(id,application_id,provider,provider_id,username,verified_at) VALUES(?,?,?,?,?,?)')
  .run(accountId,B,'java_offline',randomUUID(),'BimaMC',now);
 x.db.prepare('INSERT INTO minecraft_account_stat_progress(account_id,season_id,last_captured_at,total_playtime,total_deaths,total_mobs,total_blocks) VALUES(?,?,?,?,?,?,?)')
  .run(accountId,'all-time',now,7200,3,15,150);
 x.db.prepare('INSERT INTO minecraft_account_skin_state VALUES(?,?,?,?,?)').run(accountId,hash,'classic','skinsrestorer',now);
 x.db.prepare('INSERT INTO minecraft_account_skin_images VALUES(?,?,?,?)').run(accountId,hash,png,now);
 const profile2=await x.call('/api/player/community/profile/'+B);
 assert.equal(profile2.value.statistics[0].playtimeSeconds,7200);
 assert.equal(profile2.value.accounts[0].providerId,undefined);
 assert.equal(profile2.value.accounts[0].communitySkin,true);
 assert.equal((await x.call('/api/player/community/skin/'+accountId)).status,200);
 assert.equal((await x.call('/api/player/community/skin/'+accountId,{strongSession:false})).status,403);
 x.db.prepare("UPDATE member_profiles SET visibility='private' WHERE application_id=?").run(B);
 assert.equal((await x.call('/api/player/community/skin/'+accountId)).status,404);
});
test('friend requests reach only recipient Mail Box; recipient accepts; duplicate/spoof rejected',async()=>{
 const x=fixture();await x.bootstrap();
 assert.equal((await x.call('/api/player/community/request',{method:'POST',body:{memberId:A}})).status,400);
 assert.equal((await x.call('/api/player/community/request',{method:'POST',body:{memberId:C}})).status,404);
 assert.equal((await x.call('/api/player/community/request',{strongSession:false,method:'POST',body:{memberId:B}})).status,403);
 const sent=await x.call('/api/player/community/request',{method:'POST',body:{memberId:B}});
 assert.equal(sent.status,200,JSON.stringify(sent.value));
 assert.equal((await x.call('/api/player/community/request',{method:'POST',body:{memberId:B}})).status,409);
 const alice=await x.call('/api/player/community/connections');
 assert.equal(alice.value.items[0].state,'sent');
 const mailbox=await x.call('/api/player/mailbox',{id:B});
 const invitation=mailbox.value.items.find(m=>m.type==='friend_request');
 assert.ok(invitation);
 assert.equal(invitation.friendRequestId,sent.value.id);
 assert.equal((await x.call('/api/player/mailbox',{id:B,strongSession:false})).value.items[0].friendRequestId,null);
 assert.equal((await x.call('/api/player/mailbox',{id:A})).value.items.some(m=>m.type==='friend_request'),false);
 assert.equal((await x.call('/api/player/community/respond',{id:C,method:'POST',body:{id:sent.value.id,action:'accept'}})).status,404);
 const accepted=await x.call('/api/player/community/respond',{id:B,method:'POST',body:{id:sent.value.id,action:'accept'}});
 assert.equal(accepted.status,200);
 assert.equal((await x.call('/api/player/community/respond',{id:B,method:'POST',body:{id:sent.value.id,action:'accept'}})).status,404);
 assert.equal((await x.call('/api/player/community/connections')).value.items[0].state,'friends');
 assert.equal((await x.call('/api/player/mailbox',{id:A})).value.items.some(m=>m.type==='friend_accepted'),true);
 assert.equal((await x.call('/api/player/community/remove',{id:B,method:'POST',body:{memberId:A}})).status,200);
 assert.equal((await x.call('/api/player/community/connections')).value.items.length,0);
});
test('declines and request cancellations do not permit unauthorized actions',async()=>{
 const x=fixture();await x.bootstrap();
 const sent=await x.call('/api/player/community/request',{method:'POST',body:{memberId:B}});
 assert.equal((await x.call('/api/player/community/remove',{id:B,method:'POST',body:{memberId:A}})).status,404);
 const declined=await x.call('/api/player/community/respond',{id:B,method:'POST',
   body:{id:sent.value.id,action:'decline'}});
 assert.equal(declined.status,200);
 assert.equal((await x.call('/api/player/community/request',{method:'POST',body:{memberId:B}})).status,429);
 assert.equal((await x.call('/api/player/mailbox',{id:B})).value.items[0].friendRequestId,null);
 const x2=fixture();await x2.bootstrap();
 assert.equal((await x2.call('/api/player/community/request',{method:'POST',body:{memberId:B}})).status,200);
 assert.equal((await x2.call('/api/player/community/remove',{method:'POST',body:{memberId:B}})).status,200);
 assert.equal((await x2.call('/api/player/community/connections')).value.items.length,0);
});