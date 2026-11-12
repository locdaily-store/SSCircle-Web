import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac,createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const src=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'))).default;
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
const secret='community-fixture-secret';
const signed=(name,data,key)=>{const p=Buffer.from(JSON.stringify(data)).toString('base64url');return name+'='+p+'.'+createHmac('sha256',key).update(p).digest('base64url');};
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE submissions(id TEXT PRIMARY KEY,status TEXT,tracking_code TEXT,submitted_at TEXT);CREATE TABLE revoked_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER);CREATE TABLE form_config(id INTEGER PRIMARY KEY,settings TEXT,pages TEXT,questions TEXT,updated_at TEXT);CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER,expires_at INTEGER);");
 for(const [id,status] of [[A,'accepted'],[B,'accepted'],[C,'pending']])db.prepare("INSERT INTO submissions VALUES(?,?,?,?)").run(id,status,'CODE'+id.slice(0,8),'2026-11-12');
 db.prepare("INSERT INTO form_config VALUES(1,?,?,?,?)").run(JSON.stringify({eventsEnabled:true,eventsItems:[]}),JSON.stringify([{id:'main',title:'Form',description:'',blocks:[],routes:{}}]),'[]','v1');
 const DB={prepare(sql){const statement=db.prepare(sql);let args=[];return {bind(...v){args=v;return this;},async first(){return statement.get(...args)||null;},async run(){const r=statement.run(...args);return {meta:{changes:r.changes}};},async all(){return {results:statement.all(...args)}}};}};
 DB.batch=async items=>{db.exec('BEGIN IMMEDIATE');try{const result=[];for(const item of items)result.push(await item.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
 const env={DB,SESSION_SECRET:secret,ADMIN_PASSWORD:'admin-test-2026',ASSETS:{fetch:async()=>new Response('asset',{status:200})}};
 const exp=Math.floor(Date.now()/1000)+3600;
 const sessions=new Map(),admin=signed('ssc_s6_admin',{exp},secret+'|'+env.ADMIN_PASSWORD);
 async function init(){
   const starter=signed('ssc_player',{id:A,exp},secret+'|player-session');
   const response=await worker.fetch(new Request('https://sscircle.test/api/player/profile',{headers:{Cookie:starter}}),env);
   assert.equal(response.status,200,'Initialize member tables');
   for(const id of [A,B]){
     const sid=randomUUID(),secure=signed('ssc_member_secure',{id,sid,epoch:0,exp},secret+'|member-secure');
     db.prepare('INSERT INTO member_secure_sessions(id,application_id,token_hash,client_label,created_at,expires_at) VALUES(?,?,?,?,?,?)')
       .run(sid,id,createHash('sha256').update(secure.split('=')[1]).digest('base64url'),'test','2026-11-13',exp);
     sessions.set(id,signed('ssc_player',{id,exp},secret+'|player-session')+'; '+secure);
   }
   sessions.set(C,signed('ssc_player',{id:C,exp},secret+'|player-session'));
 }
 async function call(path,{who=A,method='GET',payload,asAdmin=false}={}){
   const res=await worker.fetch(new Request('https://sscircle.test'+path,{method,headers:{Origin:'https://sscircle.test',Cookie:asAdmin?admin:sessions.get(who)||'',...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})}),env);
   let data=null;try{data=await res.json();}catch{}
   return {status:res.status,data};
 }
 return {db,init,call};
}
test('member event must be approved before registration, attendance or awards',async()=>{
 const t=fixture();await t.init();const start=new Date(Date.now()+3*86400000).toISOString();
 const data={executor:'Alpha dan Staff SSCircle',title:'Kompetisi Build Bersama',technical:'Peserta membangun rumah dan dinilai oleh panitia di server Minecraft.',startAt:start,prizes:['Rank Event','Badge Juara Kedua']};
 assert.equal((await t.call('/api/community/events/propose',{who:C,method:'POST',payload:data})).status,403);
 const created=await t.call('/api/community/events/propose',{method:'POST',payload:data});
 assert.equal(created.status,201,JSON.stringify(created.data));
 const eventId=created.data.id;
 assert.equal((await t.call('/api/community/events/join',{method:'POST',payload:{eventId}})).status,404);
 let publicEvents=await t.call('/api/events');assert.equal(publicEvents.status,200);
 assert.equal(publicEvents.data.events.length,0,'Pending proposal is not public');
 assert.equal((await t.call('/api/admin/community/events',{who:B})).status,401);
 const review=await t.call('/api/admin/community/events/review',{asAdmin:true,method:'POST',payload:{id:eventId,action:'approved',capacity:2}});
 assert.equal(review.status,200,JSON.stringify(review.data));
 publicEvents=await t.call('/api/events');assert.equal(publicEvents.data.events[0].title,data.title);
 assert.equal((await t.call('/api/community/events/join',{method:'POST',payload:{eventId}})).status,201);
 assert.equal((await t.call('/api/community/events/join',{method:'POST',payload:{eventId}})).status,409,'One registration per member');
 assert.equal((await t.call('/api/community/events/join',{who:B,method:'POST',payload:{eventId}})).status,201);
 assert.equal((await t.call('/api/community/events/join',{who:C,method:'POST',payload:{eventId}})).status,403);
 assert.equal((await t.call('/api/admin/community/events/award',{asAdmin:true,method:'POST',payload:{eventId,memberId:B,rank:1}})).status,403,'Winner must attend');
 const check=await t.call('/api/admin/community/events/check-in',{asAdmin:true,method:'POST',payload:{eventId,memberId:B}});
 assert.equal(check.status,200,JSON.stringify(check.data));
 const prize=await t.call('/api/admin/community/events/award',{asAdmin:true,method:'POST',payload:{eventId,memberId:B,rank:1}});
 assert.equal(prize.status,200,JSON.stringify(prize.data));
 assert.equal((await t.call('/api/admin/community/events/award',{asAdmin:true,method:'POST',payload:{eventId,memberId:B,rank:1}})).status,409);
 const result=await t.call('/api/community/achievements',{who:B});
 assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.awards.length,1);
});
test('achievement rules evaluate only member snapshots and do not duplicate claims',async()=>{
 const t=fixture();await t.init();
 t.db.prepare('INSERT INTO player_stat_snapshots(application_id,season_id,playtime_seconds,mob_kills,deaths,blocks_mined,last_synced_at) VALUES(?,?,?,?,?,?,?)')
   .run(A,'season-test',360100,1050,2,100,'2026-11-13');
 const a=await t.call('/api/community/achievements');const b=await t.call('/api/community/achievements');
 assert.equal(a.status,200,JSON.stringify(a.data));assert.equal(b.status,200,JSON.stringify(b.data));
 const earned=a.data.achievements.filter(x=>x.earnedAt).map(x=>x.id);
 assert.deepEqual(new Set(earned),new Set(['dedicated-player','monster-hunter']));
 assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM community_achievement_claims WHERE member_id=?').get(A).n,2);
});
