import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const code=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
const password='season-test-password',secret='season-test-secret';
function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE form_config(id INTEGER PRIMARY KEY,settings TEXT,pages TEXT,questions TEXT,updated_at TEXT);
    CREATE TABLE revoked_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER);
    CREATE TABLE media(id TEXT PRIMARY KEY,visibility TEXT);`);
  const pages=JSON.stringify([{id:'page-1',title:'Pendaftaran',description:'',blocks:[],routeQuestionId:'',routes:{}}]);
  db.prepare('INSERT INTO form_config VALUES(1,?,?,?,?)').run(JSON.stringify({homeLeaderboardSeasons:[{id:'season-1',title:'Leaderboard S1',entries:[{name:'Pemain Lama',score:'12'}]}]}),pages,'[]','rev-one');
  const env={SESSION_SECRET:secret,ADMIN_PASSWORD:password,DB:{prepare(sql){const stmt=db.prepare(sql);let args=[];
    return {bind(...x){args=x;return this;},async first(){return stmt.get(...args)||null;},async run(){const r=stmt.run(...args);return {meta:{changes:r.changes}};},async all(){return {results:stmt.all(...args)}}};}},
    ASSETS:{fetch:async req=>new Response('ASSET '+new URL(req.url).pathname,{status:200})}};
  const e=Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
  const cookie='ssc_s6_admin='+e+'.'+createHmac('sha256',secret+'|'+password).update(e).digest('base64url');
  async function req(path,{method='GET',payload,admin=false}={}){
    const r=await worker.fetch(new Request('https://sscircle.test'+path,{method,headers:{Origin:'https://sscircle.test',...(admin?{Cookie:cookie}:{}),...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})}),env);
    let data;try{data=await r.json();}catch{data=null;}
    return {status:r.status,data,headers:r.headers};
  }
  return {req,db};
}
async function save(t,patch){
  const form=await t.req('/api/admin/form',{admin:true});assert.equal(form.status,200);
  patch(form.data.settings);
  return t.req('/api/admin/form',{admin:true,method:'PUT',payload:{settings:form.data.settings,pages:form.data.pages,revision:form.data.revision}});
}

test('arsip dinonaktifkan secara default dan preview tetap dapat dibuka',async()=>{
  const t=fixture();
  const closed=await t.req('/seasons');
  assert.equal(closed.status,302);
  assert.equal(closed.headers.get('location'),'/page-closed.html?section=seasons');
  const closedHtml=await t.req('/seasons.html');
  assert.equal(closedHtml.status,302);
  assert.equal(closedHtml.headers.get('location'),'/page-closed.html?section=seasons');
  assert.equal((await t.req('/seasons?ssc_season_preview=1')).status,200);
  assert.equal((await t.req('/seasons.html?ssc_theme_preview=1')).status,302);
});

test('leaderboard lama tetap ada; season draft tidak tiba-tiba dipublikasikan',async()=>{
  const t=fixture();
  const initial=await t.req('/api/admin/form',{admin:true});
  assert.equal(initial.data.settings.homeLeaderboardSeasons[0].entries[0].name,'Pemain Lama');
  assert.equal(initial.data.settings.homeLeaderboardSeasons[0].archivePublished,undefined);
  const result=await save(t,s=>{s.seasonArchiveEnabled=true;s.homeSeasonHighlightsEnabled=true;});
  assert.equal(result.status,200,JSON.stringify(result.data));
  assert.equal((await t.req('/seasons')).status,200);
  const publicForm=await t.req('/api/form');
  assert.equal(publicForm.data.settings.homeLeaderboardSeasons[0].archivePublished,false);
  assert.equal(publicForm.data.settings.homeLeaderboardSeasons[0].archiveSummary,undefined);
  assert.equal(publicForm.data.settings.homeLeaderboardSeasons[0].entries[0].name,'Pemain Lama');
});

test('season lengkap: tanggal, prestasi, foto, status publik, urutan tersimpan',async()=>{
  const t=fixture();
  const result=await save(t,s=>{
    Object.assign(s,{seasonArchiveEnabled:true,homeSeasonHighlightsEnabled:true,homeSeasonHighlightsCount:3,homeSeasonHighlightsStyle:'timeline'});
    const first=s.homeLeaderboardSeasons[0];
    Object.assign(first,{archivePublished:true,archiveStartDate:'2026-01-05',archiveEndDate:'2026-06-01',archiveStatus:'ended',
      archiveSummary:'Dari base sederhana sampai kota besar.',archiveCover:'assets/gallery/sscircle-01.webp',
      archiveMemories:[{src:'assets/gallery/sscircle-02.webp',caption:'Opening S1'}],
      archiveBuilds:[{title:'Castle',builder:'BuilderA',src:'assets/gallery/sscircle-03.webp',description:'Benteng pertama'}],
      archiveAwards:[{title:'Builder terbaik',player:'BuilderA',description:'Untuk kastil komunitas.'}]});
    s.homeLeaderboardSeasons.unshift({id:'season-2',title:'Season 2',archivePublished:true,archiveStatus:'active',archiveStartDate:'2026-08-01',archiveCover:'',archiveSummary:'Musim kedua.',entries:[],archiveMemories:[],archiveBuilds:[],archiveAwards:[]});
  });
  assert.equal(result.status,200,JSON.stringify(result.data));
  const publicForm=await t.req('/api/form');const settings=publicForm.data.settings;
  assert.equal(settings.seasonArchiveEnabled,true);
  assert.equal(settings.homeSeasonHighlightsStyle,'timeline');
  assert.deepEqual(settings.homeLeaderboardSeasons.map(s=>s.id),['season-2','season-1']);
  assert.equal(settings.homeLeaderboardSeasons[1].entries[0].score,'12');
  assert.equal(settings.homeLeaderboardSeasons[1].archiveBuilds[0].builder,'BuilderA');
  assert.equal(settings.homeLeaderboardSeasons[1].archiveAwards[0].title,'Builder terbaik');
  assert.equal((await t.req('/seasons')).status,200);
});

test('metadata season draft tidak dikirim ke API publik, tetapi ranking lama tetap bisa dibaca',async()=>{
  const t=fixture();
  const stored=await save(t,s=>{
    s.seasonArchiveEnabled=true;
    s.homeLeaderboardSeasons[0].archivePublished=false;
    s.homeLeaderboardSeasons[0].archiveSummary='Rencana internal belum diumumkan.';
    s.homeLeaderboardSeasons[0].archiveCover='assets/gallery/sscircle-01.webp';
  });
  assert.equal(stored.status,200);
  const publicData=await t.req('/api/form');
  assert.equal(publicData.data.settings.homeLeaderboardSeasons[0].archiveSummary,undefined);
  assert.equal(publicData.data.settings.homeLeaderboardSeasons[0].entries[0].name,'Pemain Lama');
  const adminData=await t.req('/api/admin/form',{admin:true});
  assert.equal(adminData.data.settings.homeLeaderboardSeasons[0].archiveSummary,'Rencana internal belum diumumkan.');
});

test('backend menolak data season tidak valid, foto berbahaya, tanggal terbalik',async()=>{
  for(const mutate of [
    s=>{s.homeLeaderboardSeasons[0].archiveCover='javascript:alert(1)';},
    s=>{s.homeLeaderboardSeasons[0].archiveStartDate='2026-11-10';s.homeLeaderboardSeasons[0].archiveEndDate='2026-01-10';},
    s=>{s.homeLeaderboardSeasons[0].archiveMemories=Array.from({length:13},()=>({src:'assets/gallery/sscircle-01.webp',caption:''}));},
    s=>{s.homeLeaderboardSeasons[0].archiveStartDate='2026-02-30';}
  ]){
    const t=fixture();const result=await save(t,mutate);assert.equal(result.status,400,JSON.stringify(result.data));
  }
});

test('foto arsip yang masih digunakan dilindungi dari penghapusan',async()=>{
  const source=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
  assert.match(source,/for\(const season of settings\.homeLeaderboardSeasons \|\| \[\]\)/);
  assert.match(source,/\.\.\.settings\.homeLeaderboardSeasons\.flatMap\(season=>/);
});

test('V10.47.2: Admin selects a valid stats season; activation time is server-controlled',async()=>{
 const t=fixture();
 const rejected=await save(t,s=>{s.statSeasonId='season-does-not-exist';});
 assert.equal(rejected.status,400,JSON.stringify(rejected.data));
 const valid=await save(t,s=>{
   s.statSeasonId='season-1';
   s.statSeasonActivatedAt='2001-01-01T00:00:00Z'; // Browser cannot backdate the epoch.
 });
 assert.equal(valid.status,200,JSON.stringify(valid.data));
 const first=JSON.parse(t.db.prepare('SELECT settings FROM form_config WHERE id=1').get().settings);
 const activated=Date.parse(first.statSeasonActivatedAt);
 assert.ok(Number.isFinite(activated));
 assert.ok(Math.abs(activated-Date.now())<10_000);
 const again=await save(t,s=>{
   s.homeSeasonHighlightsEnabled=true;
   s.statSeasonActivatedAt='2001-01-01T00:00:00Z';
 });
 assert.equal(again.status,200,JSON.stringify(again.data));
 const second=JSON.parse(t.db.prepare('SELECT settings FROM form_config WHERE id=1').get().settings);
 assert.equal(second.statSeasonActivatedAt,first.statSeasonActivatedAt);
 const disabled=await save(t,s=>{s.statSeasonId='';});
 assert.equal(disabled.status,200,JSON.stringify(disabled.data));
 const after=JSON.parse(t.db.prepare('SELECT settings FROM form_config WHERE id=1').get().settings);
 assert.equal(after.statSeasonId,'');
 assert.equal(after.statSeasonActivatedAt,'');
});
