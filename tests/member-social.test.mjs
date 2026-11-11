import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac,createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const source=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
const SECRET='member-friends-fixture-secret-2026',now=()=>Math.floor(Date.now()/1000);
function signed(name,payload,key) {
 const p=Buffer.from(JSON.stringify(payload)).toString('base64url');
 return name+'='+p+'.'+createHmac('sha256',key).update(p).digest('base64url');
}
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE submissions(id TEXT PRIMARY KEY,status TEXT,tracking_code TEXT,submitted_at TEXT);CREATE TABLE revoked_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER);CREATE TABLE form_config(id INTEGER PRIMARY KEY,settings TEXT,pages TEXT,questions TEXT,updated_at TEXT);CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER,expires_at INTEGER);');
 for(const [id,code] of [[A,'AAAAAAAAAAAAAAAAAAAA'],[B,'BBBBBBBBBBBBBBBBBBBB'],[C,'CCCCCCCCCCCCCCCCCCCC']])
   db.prepare('INSERT INTO submissions VALUES(?,?,?,?)').run(id,'accepted',code,'2026-11-11T01:00:00Z');
 db.prepare('INSERT INTO form_config VALUES(1,?,?,?,?)').run(
   JSON.stringify({seasonArchiveEnabled:true,homeLeaderboardSeasons:[]}),
   JSON.stringify([{id:'main',title:'Form',description:'',blocks:[],routes:{}}]),'[]','v1');
 const DB={prepare(sql){
   let statement=db.prepare(sql),args=[];
   return {bind(...a){args=a;return this;},async first(){return statement.get(...args)||null;},
     async run(){const r=statement.run(...args);return {meta:{changes:r.changes}};},
     async all(){return {results:statement.all(...args)}}};
 }};
 DB.batch=async statements=>{db.exec('BEGIN IMMEDIATE');try{const values=[];for(const s of statements)values.push(await s.run());db.exec('COMMIT');return values;}catch(e){db.exec('ROLLBACK');throw e;}};
 const env={DB,SESSION_SECRET:SECRET,ADMIN_PASSWORD:'test-admin-password',
  ASSETS:{fetch:async()=>new Response('private', {status:200})}};
 const expiry=now()+3600,sessions=new Map();
 async function initialize(){
  const player=signed('ssc_player',{id:A,exp:expiry},SECRET+'|player-session');
  const response=await worker.fetch(new Request('https://sscircle.test/api/player/profile',{headers:{Cookie:player}}),env);
  assert.equal(response.status,200);
  for(const id of [A,B,C]){
    const sid=randomUUID();
    const secure=signed('ssc_member_secure',{id,sid,epoch:0,exp:expiry},SECRET+'|member-secure');
    db.prepare('INSERT INTO member_secure_sessions(id,application_id,token_hash,client_label,created_at,expires_at) VALUES(?,?,?,?,?,?)')
      .run(sid,id,createHash('sha256').update(secure.split('=')[1]).digest('base64url'),'Browser test',new Date().toISOString(),expiry);
    sessions.set(id,signed('ssc_player',{id,exp:expiry},SECRET+'|player-session')+'; '+secure);
  }
  db.prepare('INSERT INTO member_profiles(application_id,display_name,bio,visibility,show_stats) VALUES(?,?,?,?,?)')
    .run(A,'Alpha Builder','Privat','private',1);
  db.prepare('INSERT INTO member_profiles(application_id,display_name,bio,visibility,show_stats) VALUES(?,?,?,?,?)')
    .run(B,'Beta Explorer','Senang menjelajah','members',1);
  db.prepare('INSERT INTO member_profiles(application_id,display_name,bio,visibility,show_stats) VALUES(?,?,?,?,?)')
    .run(C,'Charlie','Tidak untuk umum','private',0);
 }
 async function call(id,path,{method='GET',body,cookie}={}){
  const res=await worker.fetch(new Request('https://sscircle.test'+path,{method,
    headers:{Cookie:cookie===undefined?sessions.get(id)||'':cookie,
      Origin:'https://sscircle.test',...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})}),env);
  let data=null;try{data=await res.clone().json()}catch{}
  return {status:res.status,data,res};
 }
 return {db,initialize,call};
}
test('directory respects privacy and secure dashboard sessions',async()=>{
 const x=fixture();await x.initialize();
 const r=await x.call(A,'/api/player/social/search?q=Beta');
 assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.items[0].displayName,'Beta Explorer');
 assert.equal((await x.call(A,'/api/player/social/search?q=Charlie')).data.items.length,0);
 assert.equal((await x.call(A,'/api/player/social/profile?id='+C)).status,404);
 assert.equal((await x.call(B,'/api/player/social/profile?id='+A)).status,404);
 assert.equal((await x.call(A,'/api/player/social/search?q=Beta',{cookie:''})).status,403);
 assert.equal((await x.call(A,'/api/player/social/action',{method:'POST',body:{id:B,action:'request'},cookie:''})).status,403);
});
test('incoming friendship can be accepted through private Mail Box',async()=>{
 const x=fixture();await x.initialize();
 const result=await x.call(A,'/api/player/social/action',{method:'POST',body:{id:B,action:'request'}});
 assert.equal(result.status,200,JSON.stringify(result.data));
 const mail=await x.call(B,'/api/player/mailbox');assert.equal(mail.status,200);
 const notification=mail.data.items.find(i=>i.type==='friend_request');
 assert.ok(notification);assert.equal(notification.friendSenderId,A);
 assert.equal((await x.call(A,'/api/player/social/action',{method:'POST',body:{id:B,action:'accept'}})).status,403);
 assert.equal((await x.call(B,'/api/player/social/action',{method:'POST',body:{id:A,action:'accept'}})).status,200);
 assert.equal((await x.call(B,'/api/player/social/profile?id='+A)).status,200);
 assert.ok((await x.call(A,'/api/player/mailbox')).data.items.some(i=>i.type==='friend_response'));
 assert.equal((await x.call(A,'/api/player/social/friends')).data.items[0].relationship,'friends');
 assert.equal((await x.call(A,'/api/player/social/action',{method:'POST',body:{id:B,action:'remove'}})).status,200);
 assert.equal((await x.call(B,'/api/player/social/profile?id='+A)).status,404);
});
test('declined requests cannot spam and private members cannot be invited',async()=>{
 const x=fixture();await x.initialize();
 assert.equal((await x.call(A,'/api/player/social/action',{method:'POST',body:{id:C,action:'request'}})).status,404);
 assert.equal((await x.call(A,'/api/player/social/action',{method:'POST',body:{id:B,action:'request'}})).status,200);
 assert.equal((await x.call(B,'/api/player/social/action',{method:'POST',body:{id:A,action:'decline'}})).status,200);
 assert.equal((await x.call(A,'/api/player/social/action',{method:'POST',body:{id:B,action:'request'}})).status,429);
 assert.equal((await x.call(C,'/api/player/mailbox')).data.items.length,0);
});


test('shareable member ID is distinct from the registration login code',async()=>{
 const x=fixture();await x.initialize();
 const own=await x.call(A,'/api/player/me');
 assert.equal(own.status,200);
 assert.equal(own.data.memberId,'SSC-M'+A.slice(-12).toUpperCase());
 assert.notEqual(own.data.memberId,own.data.code);
 const result=await x.call(A,'/api/player/social/search?q=SSC-M'+B.slice(-12));
 assert.equal(result.status,200,JSON.stringify(result.data));
 assert.equal(result.data.items.length,1);
 assert.equal(result.data.items[0].id,B);
 assert.equal(result.data.items[0].memberId,'SSC-M'+B.slice(-12).toUpperCase());
 assert.equal((await x.call(A,'/api/player/social/search?q=BBBBBBBBBBBBBBBBBBBB')).data.items.length,0,
   'Registration tracking code must not be searchable');
 assert.equal((await x.call(B,'/api/player/social/search?q=SSC-M'+A.slice(-12))).data.items.length,0,
   'Private member ID must not bypass visibility');
 const profile=await x.call(A,'/api/player/social/profile?id='+B);
 assert.equal(profile.data.memberId,'SSC-M'+B.slice(-12).toUpperCase());
 assert.equal(profile.data.avatarAccountId,null);
 assert.equal(JSON.stringify(profile.data).includes('BBBBBBBBBBBBBBBBBBBB'),false);
});

test('directory lists accepted discoverable members, with pagination and private friend exceptions',async()=>{
 const x=fixture();await x.initialize();
 const D='44444444-4444-4444-8444-444444444444';
 x.db.prepare('INSERT INTO submissions VALUES(?,?,?,?)').run(D,'pending','DDDDDDDDDDDDDDDDDDDD','2026-11-11');
 x.db.prepare('INSERT INTO member_profiles(application_id,display_name,visibility) VALUES(?,?,?)')
   .run(D,'Pending Applicant','members');
 let listing=await x.call(A,'/api/player/social/directory?offset=0');
 assert.equal(listing.status,200,JSON.stringify(listing.data));
 assert.deepEqual(listing.data.items.map(p=>p.id),[B]);
 assert.equal(listing.data.hasMore,false);
 assert.equal(JSON.stringify(listing.data).includes('DDDDDDDDDDDDDDDDDDDD'),false);
 assert.equal((await x.call(A,'/api/player/social/directory',{cookie:''})).status,403);
 assert.equal((await x.call(A,'/api/player/social/directory?offset=-1')).status,400);

 // A private member is discoverable to their accepted friend, but not a stranger.
 assert.equal((await x.call(B,'/api/player/social/directory')).data.items.length,0);
 assert.equal((await x.call(A,'/api/player/social/action',{method:'POST',body:{id:B,action:'request'}})).status,200);
 assert.equal((await x.call(B,'/api/player/social/action',{method:'POST',body:{id:A,action:'accept'}})).status,200);
 listing=await x.call(B,'/api/player/social/directory');
 assert.deepEqual(listing.data.items.map(p=>p.id),[A]);
 assert.equal((await x.call(B,'/api/player/social/search?q=SSC-M'+A.slice(-12))).data.items.length,1);
 assert.equal((await x.call(B,'/api/player/social/action',{method:'POST',body:{id:A,action:'remove'}})).status,200);
 assert.equal((await x.call(B,'/api/player/social/directory')).data.items.length,0);
});

test('member directory pages results without including a hidden or pending member',async()=>{
 const x=fixture();await x.initialize();
 for(let n=0;n<30;n++){
   const id=randomUUID();
   x.db.prepare('INSERT INTO submissions VALUES(?,?,?,?)')
     .run(id,'accepted','M'+String(n).padStart(19,'0'),'2026-11-11');
   x.db.prepare('INSERT INTO member_profiles(application_id,display_name,visibility) VALUES(?,?,?)')
     .run(id,'Member Test '+String(n).padStart(2,'0'),'members');
 }
 const first=await x.call(A,'/api/player/social/directory?offset=0');
 assert.equal(first.status,200,JSON.stringify(first.data));
 assert.equal(first.data.items.length,24);
 assert.equal(first.data.hasMore,true);
 assert.equal(first.data.nextOffset,24);
 const next=await x.call(A,'/api/player/social/directory?offset=24');
 assert.equal(next.status,200,JSON.stringify(next.data));
 assert.equal(next.data.hasMore,false);
 assert.equal(next.data.items.length,7);
 const ids=[...first.data.items,...next.data.items].map(p=>p.id);
 assert.equal(new Set(ids).size,31);
 assert.equal(ids.includes(A),false);
 assert.equal(ids.includes(C),false);
});

test('member social interface has an accessible real dialog and friend management controls',()=>{
 const html=readFileSync(new URL('../my-sscircle.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../member-social.js',import.meta.url),'utf8');
 assert.match(html,/<dialog id="ssc-social-modal"/);
 assert.match(html,/id="ssc-social-directory"/);
 assert.match(html,/id="ssc-social-more"/);
 for(const tab of ['friends','incoming','outgoing'])
   assert.match(html,new RegExp('data-ssc-friends-tab="'+tab+'"'));
 assert.match(js,/modal\.showModal\(\)/);
 assert.match(js,/createImageBitmap\(blob\)/);
 assert.match(js,/profileRequest\+\+/);
 assert.match(html,/SSC-M/);
 assert.doesNotMatch(js,/tracking_code|player\.code/);
});
