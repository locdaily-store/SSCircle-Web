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
 x.db.prepare("UPDATE member_profiles SET visibility='friends' WHERE application_id=?").run(A);
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

 // A friends-only member becomes visible after friendship approval.
 x.db.prepare("UPDATE member_profiles SET visibility='friends' WHERE application_id=?").run(A);
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

test('member-only discovery can be disabled independently of public profiles',async()=>{
 const x=fixture();await x.initialize();
 const admin=signed('ssc_s6_admin',{exp:now()+3600},SECRET+'|test-admin-password');
 const defaultProfile=await x.call(B,'/api/player/profile');
 assert.equal(defaultProfile.status,200,JSON.stringify(defaultProfile.data));
 assert.equal(defaultProfile.data.policy.allowMembers,true);
 assert.equal(defaultProfile.data.policy.allowPublic,false);
 assert.equal((await x.call(A,'/api/player/social/search?q=Beta')).data.items.length,1);
 const flags={allowBio:true,allowMembers:false,allowPublic:false,allowStats:true,allowEventAlerts:true};
 let response=await x.call(A,'/api/admin/member-policy',{method:'PUT',cookie:admin,body:flags});
 assert.equal(response.status,200,JSON.stringify(response.data));
 assert.equal(response.data.policy.allowMembers,false);
 assert.equal(response.data.policy.allowPublic,false);
 assert.equal((await x.call(A,'/api/player/social/directory')).data.items.length,0);
 assert.equal((await x.call(A,'/api/player/social/search?q=Beta')).data.items.length,0);
 assert.equal((await x.call(A,'/api/player/social/profile?id='+B)).status,404);
 assert.equal((await x.call(B,'/api/player/profile',{method:'PUT',body:{
   displayName:'Beta Explorer',bio:'Tes',visibility:'members',showStats:false,eventAlerts:true
 }})).status,403);
 response=await x.call(A,'/api/admin/member-policy',{method:'PUT',cookie:admin,
   body:{...flags,allowMembers:true}});
 assert.equal(response.status,200,JSON.stringify(response.data));
 assert.equal((await x.call(A,'/api/player/social/search?q=Beta')).data.items.length,1);
 assert.equal((await x.call(B,'/api/player/profile',{method:'PUT',body:{
   displayName:'Beta Explorer',bio:'Tes',visibility:'members',showStats:false,eventAlerts:true
 }})).status,200);
 // Older admin clients must not silently reset the independently saved flag.
 response=await x.call(A,'/api/admin/member-policy',{method:'PUT',cookie:admin,
   body:{allowBio:true,allowPublic:false,allowStats:true,allowEventAlerts:true}});
 assert.equal(response.status,200);
 assert.equal(response.data.policy.allowMembers,true);
 // Enabling public profiles alone never changes private profiles.
 response=await x.call(A,'/api/admin/member-policy',{method:'PUT',cookie:admin,
   body:{...flags,allowMembers:false,allowPublic:true}});
 assert.equal(response.status,200);
 assert.equal((await x.call(A,'/api/player/social/search?q=Beta')).data.items.length,0);
 assert.equal((await x.call(B,'/api/player/profile',{method:'PUT',body:{
   displayName:'Beta Explorer',bio:'Tes',visibility:'public',showStats:false,eventAlerts:true
 }})).status,200);
 assert.equal((await x.call(A,'/api/player/social/search?q=Beta')).data.items.length,1);
 assert.equal((await x.call(A,'/api/player/social/profile?id='+C)).status,404);
});

test('an old D1 member_policy table upgrades without changing its saved permissions',async()=>{
 const x=fixture();
 x.db.exec(`CREATE TABLE member_policy (
   id INTEGER PRIMARY KEY CHECK(id=1),
   allow_bio INTEGER NOT NULL DEFAULT 1,
   allow_public INTEGER NOT NULL DEFAULT 0,
   allow_stats INTEGER NOT NULL DEFAULT 1,
   allow_event_alerts INTEGER NOT NULL DEFAULT 1,
   updated_at TEXT NOT NULL DEFAULT '')`);
 x.db.prepare('INSERT INTO member_policy(id,allow_bio,allow_public,allow_stats,allow_event_alerts,updated_at) VALUES(1,0,0,1,1,?)').run('old');
 await x.initialize();
 const migrated=x.db.prepare('SELECT * FROM member_policy WHERE id=1').get();
 assert.equal(migrated.allow_bio,0);
 assert.equal(migrated.allow_public,0);
 assert.equal(migrated.allow_members,1);
 assert.equal(migrated.updated_at,'old');
 assert.equal((await x.call(A,'/api/player/social/search?q=Beta')).data.items.length,1);
});

test('V10.52: member privacy and invitation controls',async()=>{
 const x=fixture();await x.initialize();
 const first=await x.call(B,'/api/player/social/settings');
 assert.equal(first.status,200,JSON.stringify(first.data));
 assert.equal(first.data.settings.showFriends,false);
 const hidden={allowRequests:false,showFriends:true,showMutual:true,showBadges:false};
 assert.equal((await x.call(B,'/api/player/social/settings',{method:'PUT',body:hidden})).status,200);
 assert.equal((await x.call(A,'/api/player/social/action',{method:'POST',body:{id:B,action:'request'}})).status,403);
 assert.equal((await x.call(B,'/api/player/social/settings',{method:'PUT',body:{...hidden,allowRequests:true,showBadges:true}})).status,200);
 assert.equal((await x.call(A,'/api/player/social/action',{method:'POST',body:{id:B,action:'request'}})).status,200);
 assert.equal((await x.call(B,'/api/player/social/action',{method:'POST',body:{id:A,action:'accept'}})).status,200);
 assert.equal((await x.call(B,'/api/player/social/profile?id='+A)).status,404,'Private profile must stay private');
 assert.equal((await x.call(A,'/api/player/profile',{method:'PUT',body:{displayName:'Alpha Builder',bio:'Profile',visibility:'friends',showStats:false,eventAlerts:true}})).status,200);
 assert.equal((await x.call(B,'/api/player/social/profile?id='+A)).status,200);
 assert.equal((await x.call(C,'/api/player/social/profile?id='+A)).status,404);
 const detail=await x.call(A,'/api/player/social/profile?id='+B);
 assert.equal(detail.status,200,JSON.stringify(detail.data));
 assert.equal(detail.data.friendCount,1);
 assert.ok(Array.isArray(detail.data.mutualFriends));
 assert.equal((await x.call(A,'/api/player/social/settings',{method:'PUT',body:{allowRequests:true}})).status,400);
});
test('V10.52: badges and social policy require admin access',async()=>{
 const x=fixture();await x.initialize();
 const admin=signed('ssc_s6_admin',{exp:now()+3600},SECRET+'|test-admin-password');
 assert.equal((await x.call(A,'/api/admin/social-settings')).status,401);
 assert.equal((await x.call(A,'/api/admin/social-settings',{cookie:admin})).data.settings.maxPending,25);
 assert.equal((await x.call(A,'/api/admin/social-settings',{method:'PUT',cookie:admin,body:{requestsEnabled:false,maxPending:4,badgesEnabled:true}})).status,200);
 assert.equal((await x.call(A,'/api/player/social/action',{method:'POST',body:{id:B,action:'request'}})).status,403);
 assert.equal((await x.call(A,'/api/admin/social-settings',{method:'PUT',cookie:admin,body:{requestsEnabled:true,maxPending:4,badgesEnabled:true}})).status,200);
 const badge=await x.call(A,'/api/admin/member-badges',{method:'POST',cookie:admin,body:{memberId:B,title:'Season Builder',description:'Kontribusi spawn'}});
 assert.equal(badge.status,200,JSON.stringify(badge.data));
 assert.equal((await x.call(A,'/api/admin/member-badges',{cookie:admin})).data.items.length,1);
 assert.equal((await x.call(A,'/api/player/social/profile?id='+B)).data.communityBadges[0].title,'Season Builder');
 assert.equal((await x.call(A,'/api/admin/member-badges',{method:'DELETE',cookie:admin,body:{id:badge.data.id}})).status,200);
 assert.equal((await x.call(A,'/api/admin/member-badges',{cookie:admin})).data.items.length,0);
});

test('V10.52: directory filter and newest order keep private members hidden',async()=>{
 const x=fixture();await x.initialize();
 const D='44444444-4444-4444-8444-444444444444';
 x.db.prepare('INSERT INTO submissions VALUES(?,?,?,?)').run(D,'accepted','DDDDDDDDDDDDDDDDDDDD','2026-11-12T00:00:00Z');
 x.db.prepare('INSERT INTO member_profiles(application_id,display_name,visibility) VALUES(?,?,?)')
   .run(D,'Newest Member','members');
 x.db.prepare('INSERT INTO minecraft_accounts(id,application_id,provider,provider_id,username,verified_at) VALUES(?,?,?,?,?,?)')
   .run('55555555-5555-4555-8555-555555555555',B,'java_premium','premium-beta','Beta','2026-11-10');
 x.db.prepare('INSERT INTO minecraft_accounts(id,application_id,provider,provider_id,username,verified_at) VALUES(?,?,?,?,?,?)')
   .run('66666666-6666-4666-8666-666666666666',D,'bedrock','bedrock-new','Newest','2026-11-12');
 const all=await x.call(A,'/api/player/social/directory?order=recent&edition=all');
 assert.equal(all.status,200,JSON.stringify(all.data));
 assert.deepEqual(all.data.items.map(a=>a.id),[D,B]);
 const premium=await x.call(A,'/api/player/social/directory?edition=java_premium');
 assert.deepEqual(premium.data.items.map(a=>a.id),[B]);
 const bedrock=await x.call(A,'/api/player/social/directory?edition=bedrock');
 assert.deepEqual(bedrock.data.items.map(a=>a.id),[D]);
 assert.equal(JSON.stringify(all.data).includes('CCCCCCCCCCCCCCCCCCCC'),false);
});
test('V10.52: mutual friends are shared only with consent',async()=>{
 const x=fixture();await x.initialize();
 x.db.prepare("UPDATE member_profiles SET visibility='members' WHERE application_id=?").run(C);
 const actions=async(a,b,action)=>x.call(a,'/api/player/social/action',{method:'POST',body:{id:b,action}});
 assert.equal((await actions(A,B,'request')).status,200);
 assert.equal((await actions(B,A,'accept')).status,200);
 assert.equal((await actions(A,C,'request')).status,200);
 assert.equal((await actions(C,A,'accept')).status,200);
 assert.equal((await actions(B,C,'request')).status,200);
 assert.equal((await actions(C,B,'accept')).status,200);
 assert.deepEqual((await x.call(A,'/api/player/social/profile?id='+B)).data.mutualFriends,[]);
 const preferences={allowRequests:true,showFriends:false,showMutual:true,showBadges:true};
 assert.equal((await x.call(B,'/api/player/social/settings',{method:'PUT',body:preferences})).status,200);
 const result=await x.call(A,'/api/player/social/profile?id='+B);
 assert.equal(result.status,200,JSON.stringify(result.data));
 assert.equal(result.data.mutualFriends.length,1);
 assert.equal(result.data.mutualFriends[0].id,C);
 assert.equal(result.data.friendCount,null);
});
