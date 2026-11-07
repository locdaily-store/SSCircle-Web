import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const source=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const ID='11111111-1111-4111-8111-111111111111';
const SECRET='member-v1036-test-secret',PASS='member-v1036-admin';
const CODE='AAAABBBBCCCCDDDDEEEE';
function signed(name,body,key){
  const part=Buffer.from(JSON.stringify(body)).toString('base64url');
  return name+'='+part+'.'+createHmac('sha256',key).update(part).digest('base64url');
}
function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE submissions(id TEXT PRIMARY KEY,status TEXT,tracking_code TEXT,submitted_at TEXT);
    CREATE TABLE form_config(id INTEGER PRIMARY KEY,settings TEXT,pages TEXT,questions TEXT,updated_at TEXT);
    CREATE TABLE revoked_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER);
    CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER,expires_at INTEGER);`);
  db.prepare('INSERT INTO submissions VALUES(?,?,?,?)').run(ID,'accepted',CODE,'2026-11-07T09:00:00Z');
  const settings={seasonArchiveEnabled:true,homeLeaderboardSeasons:[{
    id:'s6',title:'Season 6',archivePublished:true,archiveStatus:'ended',
    archiveAwards:[{title:'Best Builder',player:'TestUser',memberId:ID,description:'Castle'},
      {title:'Event Winner',player:'OtherUser',description:'Old text-only award'}],entries:[]
  }]};
  const pages=[{id:'page-1',title:'Registration',description:'',blocks:[],routeQuestionId:'',routes:{}}];
  db.prepare('INSERT INTO form_config VALUES(1,?,?,?,?)').run(JSON.stringify(settings),JSON.stringify(pages),'[]','rev-one');
  const DB={prepare(sql){const statement=db.prepare(sql);let args=[];
    return {bind(...a){args=a;return this;},async first(){return statement.get(...args)||null;},
      async run(){const r=statement.run(...args);return {meta:{changes:r.changes}};},
      async all(){return {results:statement.all(...args)}}};}};
  const env={DB,SESSION_SECRET:SECRET,ADMIN_PASSWORD:PASS,
    ASSETS:{fetch:async()=>new Response('asset',{status:200})}};
  const exp=Math.floor(Date.now()/1000)+3600;
  const player=signed('ssc_player',{id:ID,exp},SECRET+'|player-session');
  const admin=signed('ssc_s6_admin',{exp},SECRET+'|'+PASS);
  async function req(path,{method='GET',payload,cookie=player}={}){
    const response=await worker.fetch(new Request('https://sscircle.test'+path,
      {method,headers:{Origin:'https://sscircle.test',Cookie:cookie,
        ...(payload?{'Content-Type':'application/json'}:{})},
        ...(payload?{body:JSON.stringify(payload)}:{})}),env);
    let data;try{data=await response.clone().json()}catch{data=null}
    return {response,status:response.status,data};
  }
  return {req,db,admin,player};
}
test('dashboard memisahkan profil privat dari dokumen publik dan award lama',async()=>{
  const t=fixture();
  const guest=await t.req('/api/player/profile',{cookie:''});
  assert.equal(guest.status,403);
  const result=await t.req('/api/player/profile');
  assert.equal(result.status,200,JSON.stringify(result.data));
  assert.equal(result.data.profile.visibility,'private');
  assert.equal(result.data.accounts.length,0);
  assert.equal(result.data.statistics.length,0);
  assert.equal(result.data.achievements.length,1);
  assert.equal(result.data.achievements[0].title,'Best Builder');
  const publicData=await t.req('/api/form',{cookie:''});
  assert.equal(publicData.status,200);
  assert.equal(publicData.data.settings.homeLeaderboardSeasons[0].archiveAwards[0].memberId,undefined);
  assert.equal(publicData.data.settings.homeLeaderboardSeasons[0].archiveAwards[0].title,'Best Builder');
});
test('pengaturan profil disimpan dan mengikuti kebijakan admin',async()=>{
  const t=fixture();
  const edited=await t.req('/api/player/profile',{method:'PUT',
    payload:{displayName:'Pemain S6',bio:'Membangun kastil.',visibility:'public',showStats:true,eventAlerts:false}});
  assert.equal(edited.status,200,JSON.stringify(edited.data));
  assert.equal(edited.data.profile.visibility,'private');
  const policy=await t.req('/api/admin/member-policy',{method:'PUT',cookie:t.admin,
    payload:{allowBio:true,allowPublic:true,allowStats:true,allowEventAlerts:true}});
  assert.equal(policy.status,200,JSON.stringify(policy.data));
  const nowPublic=await t.req('/api/player/profile',{method:'PUT',
    payload:{displayName:'Pemain S6',bio:'Membangun kastil.',visibility:'public',showStats:true,eventAlerts:true}});
  assert.equal(nowPublic.status,200,JSON.stringify(nowPublic.data));
  assert.equal(nowPublic.data.profile.visibility,'public');
  const refreshed=await t.req('/api/player/profile');
  assert.equal(refreshed.data.profile.displayName,'Pemain S6');
  assert.equal(refreshed.data.profile.bio,'Membangun kastil.');
  const bad=await t.req('/api/player/profile',{method:'PUT',
    payload:{displayName:'<script>',bio:'',visibility:'public',showStats:true,eventAlerts:true}});
  assert.equal(bad.status,400);
});
test('admin dapat melihat anggota dan mencabut seluruh token sesi lama',async()=>{
  const t=fixture();
  await t.req('/api/player/profile');
  const roster=await t.req('/api/admin/member-center',{cookie:t.admin});
  assert.equal(roster.status,200,JSON.stringify(roster.data));
  assert.equal(roster.data.items.length,1);
  assert.equal(roster.data.items[0].id,ID);
  assert.equal(roster.data.awards[0].memberId,ID);
  const denied=await t.req('/api/admin/member-center',{cookie:t.player});
  assert.equal(denied.status,401);
  const revoked=await t.req('/api/admin/member-revoke',{method:'POST',cookie:t.admin,payload:{id:ID}});
  assert.equal(revoked.status,200,JSON.stringify(revoked.data));
  assert.equal((await t.req('/api/player/me')).status,401);
  const relog=await t.req('/api/player/login',{method:'POST',cookie:'',payload:{code:CODE}});
  assert.equal(relog.status,200,JSON.stringify(relog.data));
  const newCookie=relog.response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(newCookie);
  assert.equal((await t.req('/api/player/profile',{cookie:newCookie})).status,200);
});
test('status pending/rejected tidak dapat mengakses data anggota',async()=>{
  const t=fixture();
  await t.req('/api/player/profile');
  for(const status of ['pending','rejected']){
    t.db.prepare('UPDATE submissions SET status=? WHERE id=?').run(status,ID);
    const result=await t.req('/api/player/profile');
    assert.equal(result.status,403,status);
  }
});
