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
      async all(){return {results:statement.all(...args)}}};},
    async batch(statements){
      db.exec('BEGIN');
      const result=[];
      try{
        for(const statement of statements)result.push(await statement.run());
        db.exec('COMMIT');return result;
      }catch(error){db.exec('ROLLBACK');throw error;}
    }};
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
test('pengaturan privat memerlukan sesi aman dan kebijakan admin tersimpan',async()=>{
  const t=fixture();
  const edited=await t.req('/api/player/profile',{method:'PUT',payload:{
    displayName:'Pemain S6',bio:'Membangun kastil.',visibility:'public',showStats:true,eventAlerts:false}});
  assert.equal(edited.status,403,'Sesi kode pendaftaran tidak berhak mengedit profil');
  const policy=await t.req('/api/admin/member-policy',{method:'PUT',cookie:t.admin,
    payload:{allowBio:true,allowPublic:true,allowStats:true,allowEventAlerts:true}});
  assert.equal(policy.status,200,JSON.stringify(policy.data));
  const refreshed=await t.req('/api/player/profile');
  assert.equal(refreshed.status,200);
  assert.equal(refreshed.data.policy.allowPublic,true);
  assert.equal(refreshed.data.profile.visibility,'private');
  // Pengeditan setelah login password diuji oleh security.test.mjs.
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

test('only rejected members can be permanently purged with a typed code',async()=>{
 const t=fixture();
 const route='/api/admin/member-purge?memberId='+ID;
 assert.equal((await t.req(route,{cookie:t.player})).status,401);
 assert.equal((await t.req(route,{cookie:t.admin})).status,409);
 t.db.prepare("UPDATE submissions SET status='rejected' WHERE id=?").run(ID);
 const preview=await t.req(route,{cookie:t.admin});
 assert.equal(preview.status,200,JSON.stringify(preview.data));
 assert.equal(preview.data.confirmation,'HAPUS DATA 11111111');
 const request={id:ID,confirmation:preview.data.confirmation,revision:preview.data.revision};
 assert.equal((await t.req('/api/admin/member-purge',{method:'POST',cookie:t.admin,
   payload:{...request,confirmation:'invalid'}})).status,409);
 const setup=await t.req('/api/admin/member-center',{cookie:t.admin});
 assert.equal(setup.status,200);
 const account='22222222-2222-4222-8222-222222222222';
 t.db.prepare('INSERT INTO minecraft_accounts (id,application_id,provider,provider_id,username,verified_at) VALUES(?,?,?,?,?,?)')
   .run(account,ID,'java_premium','33333333-3333-4333-8333-333333333333','ErasedUser',new Date().toISOString());
 t.db.prepare('INSERT INTO minecraft_account_stat_progress (account_id,season_id,last_captured_at,total_playtime) VALUES(?,?,?,?)')
   .run(account,'',new Date().toISOString(),3600);
 const result=await t.req('/api/admin/member-purge',{method:'POST',cookie:t.admin,payload:request});
 assert.equal(result.status,200,JSON.stringify(result.data));
 assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM submissions').get().n,0);
 assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM minecraft_accounts').get().n,0);
 assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM minecraft_account_stat_progress').get().n,0);
 const settings=JSON.parse(t.db.prepare('SELECT settings FROM form_config WHERE id=1').get().settings);
 assert.equal(settings.homeLeaderboardSeasons[0].archiveAwards.some(a=>a.memberId===ID),false);
 assert.equal(settings.homeLeaderboardSeasons[0].archiveAwards.length,1);
});

test('saved seven-section Profile layout preserves its order after adding Social',async()=>{
 const t=fixture();
 const previous=['explore','stats','achievements','linking','security','welcome','preferences'];
 const row=t.db.prepare('SELECT settings FROM form_config WHERE id=1').get();
 t.db.prepare('UPDATE form_config SET settings=? WHERE id=1')
   .run(JSON.stringify({...JSON.parse(row.settings),profilePageSections:previous}));
 const response=await t.req('/api/form',{cookie:''});
 assert.equal(response.status,200,JSON.stringify(response.data));
 const current=response.data.settings.profilePageSections;
 assert.equal(current.length,8);
 assert.ok(current.includes('social'));
 assert.deepEqual(current.filter(x=>x!=='social'),previous);
 assert.ok(current.indexOf('social')<current.indexOf('explore'));
});

test('daftar anggota admin menampilkan username Minecraft dari jawaban pendaftaran',async()=>{
 const t=fixture();
 // Fixture dasar tidak punya kolom jawaban: daftar tetap tampil, hanya tanpa nama pendaftar.
 const legacy=await t.req('/api/admin/member-center',{cookie:t.admin});
 assert.equal(legacy.status,200,JSON.stringify(legacy.data));
 assert.equal(legacy.data.items[0].applicantName,'');
 t.db.exec('ALTER TABLE submissions ADD COLUMN answers TEXT;ALTER TABLE submissions ADD COLUMN question_snapshot TEXT');
 const set=(answers,questions)=>t.db.prepare('UPDATE submissions SET answers=?,question_snapshot=? WHERE id=?')
   .run(answers,questions,ID);
 const name=async()=>(await t.req('/api/admin/member-center',{cookie:t.admin})).data.items[0].applicantName;
 // Username Minecraft didahulukan walau pertanyaan Discord berada di urutan pertama.
 set(JSON.stringify({discord:'disc#1',ign:'  JasitS  '}),JSON.stringify([
   {id:'discord',title:'Apa username Discord Kamu?'},{id:'ign',title:'Sebutkan username Minecraft kamu!'}]));
 assert.equal(await name(),'JasitS');
 // Aturan lama admin.js tetap berlaku bila tidak ada pertanyaan yang menyebut Minecraft.
 set(JSON.stringify({a:'Nama IGN',b:'x'}),JSON.stringify([{id:'a',title:'Isi nickname kamu'}]));
 assert.equal(await name(),'Nama IGN');
 // Tanpa snapshot pertanyaan, kunci jawaban bernama ign dipakai.
 set(JSON.stringify({ign:'Cadangan'}),'[]');
 assert.equal(await name(),'Cadangan');
 // Jawaban kosong, bukan teks, atau JSON rusak tidak merusak daftar.
 set(JSON.stringify({ign:'   '}),'[]');assert.equal(await name(),'');
 set(JSON.stringify({ign:['x']}),'[]');assert.equal(await name(),'');
 set('{bukan json','[]');assert.equal(await name(),'');
 set(JSON.stringify({ign:'Pan\u0007jang'+'x'.repeat(100)}),'[]');
 const long=await name();
 assert.ok(long.length<=64&&!/[\u0000-\u001f]/.test(long));
 // Kode pendaftaran bersifat rahasia dan tidak ikut dikirim ke daftar ini.
 const roster=await t.req('/api/admin/member-center',{cookie:t.admin});
 assert.equal(JSON.stringify(roster.data).includes(CODE),false);
 // Hanya admin yang dapat membaca daftar.
 assert.equal((await t.req('/api/admin/member-center',{cookie:t.player})).status,401);
});
