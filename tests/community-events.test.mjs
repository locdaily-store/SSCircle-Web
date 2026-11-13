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


test('admin can customize member event questions and keep submitted answers', async () => {
  const t = fixture();
  await t.init();
  const endpoint = '/api/admin/community/events/form';
  assert.equal((await t.call(endpoint)).status, 401);
  const first = await t.call(endpoint, {asAdmin: true});
  assert.equal(first.status, 200, JSON.stringify(first.data));

  const form = first.data.settings;
  form.maxPending = 1;
  form.defaultCapacity = 12;
  form.fields.splice(1, 0, {
    id: 'custom_theme', label: 'Tema event',
    type: 'select', required: true,
    placeholder: '', options: ['Fantasy', 'Survival']
  });
  const saved = await t.call(endpoint, {
    asAdmin: true, method: 'PUT',
    payload: {revision: first.data.revision, settings: form}
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal((await t.call(endpoint, {
    asAdmin: true, method: 'PUT',
    payload: {revision: first.data.revision, settings: form}
  })).status, 409);

  const answers = {
    executor: 'Alpha dan panitia', title: 'Festival Rumah',
    technical: 'Peserta membuat bangunan yang dinilai oleh pengurus SSCircle.',
    startAt: new Date(Date.now() + 86400000 * 7).toISOString(),
    prizes: ['Badge Builder'], custom_theme: 'Fantasy'
  };
  assert.equal((await t.call('/api/community/events/propose', {
    method: 'POST', payload: {answers: {...answers, custom_theme: 'Invalid'}}
  })).status, 400);
  const proposal = await t.call('/api/community/events/propose', {
    method: 'POST', payload: {answers}
  });
  assert.equal(proposal.status, 201, JSON.stringify(proposal.data));
  assert.equal((await t.call('/api/community/events/propose', {
    method: 'POST', payload: {answers}
  })).status, 409, 'Pending limit must be enforced');

  const review = await t.call('/api/admin/community/events', {asAdmin: true});
  assert.equal(review.status, 200, JSON.stringify(review.data));
  const entry = review.data.proposals.find(item => item.id === proposal.data.id);
  assert.equal(entry.formAnswers.custom_theme, 'Fantasy');
  assert.equal(entry.formFields[1].label, 'Tema event');
  assert.equal(entry.capacity, 12);
});

test('required event name and start date cannot be deleted from form', async () => {
  const t = fixture();
  await t.init();
  const first = await t.call('/api/admin/community/events/form', {asAdmin: true});
  const form = first.data.settings;
  form.fields = form.fields.filter(item => item.id !== 'title');
  const response = await t.call('/api/admin/community/events/form', {
    asAdmin: true, method: 'PUT',
    payload: {revision: first.data.revision, settings: form}
  });
  assert.equal(response.status, 400);
});


test('Achievement auto-grant, hours, migration and pending badge API remain consistent',async()=>{
 const t=fixture();await t.init();
 const endpoint='/api/admin/community/achievements';
 const initial=await t.call(endpoint,{asAdmin:true});
 assert.equal(initial.status,200,JSON.stringify(initial.data));
 const playtime=initial.data.rules.find(x=>x.id==='dedicated-player');
 assert.equal(playtime.metric,'playtime_hours');
 assert.equal(playtime.target,100);
 const rule={id:'event-checkin-once',title:'Pertama Hadir',description:'Ikut satu event',
   metric:'events_attended',target:1,enabled:true,autoGrant:false};
 const inactive=await t.call(endpoint,{method:'POST',asAdmin:true,payload:rule});
 assert.equal(inactive.status,200,JSON.stringify(inactive.data));
 t.db.prepare("INSERT INTO community_event_signups(event_id,member_id,state,joined_at,checked_in_at) VALUES(?,?,'attended',?,?)")
   .run('custom-event-test',A,'2026-11-13','2026-11-13');
 const check=await t.call(endpoint+'/recheck',{method:'POST',asAdmin:true,payload:{afterId:''}});
 assert.equal(check.status,200,JSON.stringify(check.data));
 assert.equal(t.db.prepare("SELECT COUNT(*) n FROM community_achievement_claims WHERE rule_id=? AND member_id=?")
   .get(rule.id,A).n,0,'Disabled auto-grant never awards itself');
 const enabled=await t.call(endpoint,{method:'POST',asAdmin:true,payload:{...rule,autoGrant:true}});
 assert.equal(enabled.status,200,JSON.stringify(enabled.data));
 const awarded=await t.call(endpoint+'/recheck',{method:'POST',asAdmin:true,payload:{afterId:''}});
 assert.equal(awarded.status,200,JSON.stringify(awarded.data));
 assert.equal(t.db.prepare("SELECT COUNT(*) n FROM community_achievement_claims WHERE rule_id=? AND member_id=?")
   .get(rule.id,A).n,1);
 await t.call(endpoint+'/recheck',{method:'POST',asAdmin:true,payload:{afterId:''}});
 assert.equal(t.db.prepare("SELECT COUNT(*) n FROM community_achievement_claims WHERE rule_id=? AND member_id=?")
   .get(rule.id,A).n,1,'Rechecking cannot grant duplicate achievement');
 const latest=await t.call(endpoint,{asAdmin:true});
 assert.equal(latest.data.rules.find(x=>x.id===rule.id).awarded,1);
 const removed=await t.call(endpoint,{asAdmin:true,method:'DELETE',
   payload:{id:rule.id,confirmation:'HAPUS ACHIEVEMENT'}});
 assert.equal(removed.status,200,JSON.stringify(removed.data));
});
