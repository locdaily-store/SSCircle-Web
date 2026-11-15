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
    CREATE TABLE media(id TEXT PRIMARY KEY,visibility TEXT);
    CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER,expires_at INTEGER);`);
  const pages=JSON.stringify([{id:'page-1',title:'Pendaftaran',description:'',blocks:[],routeQuestionId:'',routes:{}}]);
  db.prepare('INSERT INTO form_config VALUES(1,?,?,?,?)').run(JSON.stringify({homeLeaderboardSeasons:[{id:'season-1',title:'Leaderboard S1',entries:[{name:'Pemain Lama',score:'12'}]}]}),pages,'[]','rev-one');
  const env={SESSION_SECRET:secret,ADMIN_PASSWORD:password,DB:{prepare(sql){const stmt=db.prepare(sql);let args=[];
    return {bind(...x){args=x;return this;},async first(){return stmt.get(...args)||null;},async run(){const r=stmt.run(...args);return {meta:{changes:r.changes}};},async all(){return {results:stmt.all(...args)}}};}},
    ASSETS:{fetch:async req=>new Response('ASSET '+new URL(req.url).pathname,{status:200})}};
  const e=Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
  const cookie='ssc_s6_admin='+e+'.'+createHmac('sha256',secret+'|'+password).update(e).digest('base64url');
  async function req(path,{method='GET',payload,admin=false,headers={}}={}){
    const r=await worker.fetch(new Request('https://sscircle.test'+path,{method,headers:{Origin:'https://sscircle.test',...(admin?{Cookie:cookie}:{}),...(payload?{'Content-Type':'application/json'}:{}),...headers},...(payload?{body:JSON.stringify(payload)}:{})}),env);
    let data;try{data=await r.json();}catch{data=null;}
    return {status:r.status,data,headers:r.headers};
  }
  return {req,db,env};
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

test('period is server-owned and cannot be switched using the general admin form',async()=>{
 const t=fixture();
 const rejected=await save(t,s=>{s.statSeasonId='season-does-not-exist';});
 assert.equal(rejected.status,409,JSON.stringify(rejected.data));
 const bypass=await save(t,s=>{
   s.statSeasonId='season-1';
   s.statSeasonActivatedAt='2001-01-01T00:00:00Z';
 });
 assert.equal(bypass.status,409);
 const planned=await save(t,s=>{s.homeLeaderboardSeasons[0].archiveStatus='planned';});
 assert.equal(planned.status,200);
 const before=await t.req('/api/admin/form',{admin:true});
 const opened=await seasonAction(t,'start',before.data.revision);
 assert.equal(opened.status,200);
 const activated=Date.parse(opened.data.settings.statSeasonActivatedAt);
 assert.ok(Number.isFinite(activated));
 assert.ok(Math.abs(activated-Date.now())<10_000);
 const edit=await save(t,s=>{s.homeSeasonHighlightsEnabled=true;s.statSeasonActivatedAt='2001-01-01T00:00:00Z';});
 assert.equal(edit.status,200);
 const read=(await t.req('/api/admin/form',{admin:true})).data.settings;
 assert.equal(read.statSeasonActivatedAt,opened.data.settings.statSeasonActivatedAt);
 const disabled=await save(t,s=>{s.statSeasonId='';});
 assert.equal(disabled.status,409);
 const statusChange=await save(t,s=>{s.homeLeaderboardSeasons[0].archiveStatus='ended';});
 assert.equal(statusChange.status,409);
});

test('badge navigasi hanya memuat event aktif/mendatang dan pengumuman terbit',async()=>{
  const t=fixture();
  const now=Date.now();
  const settings={
    eventsEnabled:true,
    eventsItems:[
      {id:'event-baru',title:'Event baru',description:'Kegiatan',startAt:new Date(now+86400000).toISOString(),endAt:new Date(now+172800000).toISOString()},
      {id:'event-lama',title:'Event lama',startAt:new Date(now-172800000).toISOString(),endAt:new Date(now-86400000).toISOString()}
    ]
  };
  t.db.prepare('UPDATE form_config SET settings=? WHERE id=1').run(JSON.stringify(settings));
  const result=await t.req('/api/public/nav-updates');
  assert.equal(result.status,200);
  assert.deepEqual(result.data.announcements,[]);
  assert.equal(result.data.events.length,1);
  assert.equal(result.data.events[0].id,'event-baru');
  assert.match(result.data.events[0].version,/Event baru/);
});

async function seasonAction(t,action,revision,other={}){
 return t.req('/api/admin/seasons/lifecycle',{
   admin:true,method:'POST',payload:{
     action,seasonId:'season-1',revision,
     confirmation:{start:'START SEASON',prepare:'PREPARE SEASON',end:'END SEASON'}[action],
     ...other
   }
 });
}

test('lifecycle starts a dedicated stats period and freezes the final leaderboard',async()=>{
 const t=fixture();
 const draft=await save(t,s=>{
   s.seasonArchiveEnabled=true;
   s.homeLeaderboardSeasons[0].archiveStatus='planned';
   s.homeLeaderboardSeasons[0].archivePublished=false;
   s.homeLeaderboardSeasons[0].archiveAwards=[
     {title:'Pemain Teraktif',player:'Pilihan Admin',description:'Penghargaan pilihan admin.'}
   ];
 });
 assert.equal(draft.status,200,JSON.stringify(draft.data));
 const before=await t.req('/api/admin/form',{admin:true});
 const started=await seasonAction(t,'start',before.data.revision,{publish:true});
 assert.equal(started.status,200,JSON.stringify(started.data));
 assert.equal(started.data.settings.statSeasonId,'season-1');
 assert.equal(started.data.season.archiveStatus,'active');
 assert.equal(started.data.season.archiveTimeline[0].kind,'opening');
 const activeKey='season:season-1:'+started.data.settings.statSeasonActivatedAt;
 t.db.exec(`CREATE TABLE player_stat_snapshots (
   application_id TEXT NOT NULL,season_id TEXT NOT NULL,
   playtime_seconds INTEGER NOT NULL DEFAULT 0,deaths INTEGER NOT NULL DEFAULT 0,
   mob_kills INTEGER NOT NULL DEFAULT 0,blocks_mined INTEGER NOT NULL DEFAULT 0,
   last_synced_at TEXT NOT NULL DEFAULT '');
   CREATE TABLE minecraft_accounts (
     id TEXT PRIMARY KEY,application_id TEXT,username TEXT,verified_at TEXT);
   CREATE TABLE minecraft_account_stat_progress (
     account_id TEXT,season_id TEXT,total_playtime INTEGER,total_deaths INTEGER,
     total_mobs INTEGER,total_blocks INTEGER,last_captured_at TEXT);
   CREATE TABLE minecraft_sync_status (
     id INTEGER PRIMARY KEY,seen_at TEXT,pending_count INTEGER,capture_backlog INTEGER,
     delivery_code TEXT);
 `);
 const member='11111111-1111-4111-8111-111111111111';
 const account='22222222-2222-4222-8222-222222222222';
 t.db.prepare('INSERT INTO minecraft_accounts VALUES(?,?,?,?)')
   .run(account,member,'BuilderA',new Date().toISOString());
 // Legacy member snapshot is intentionally stale; modern per-account data wins.
 t.db.prepare('INSERT INTO player_stat_snapshots VALUES(?,?,?,?,?,?,?)')
   .run(member,activeKey,15,1,1,1,new Date().toISOString());
 t.db.prepare('INSERT INTO minecraft_account_stat_progress VALUES(?,?,?,?,?,?,?)')
   .run(account,activeKey,7380,2,44,90,new Date().toISOString());
 t.db.prepare('INSERT INTO minecraft_sync_status VALUES(?,?,?,?,?)')
   .run(1,new Date().toISOString(),0,0,'SYNC_OK');
 const preview=await t.req('/api/admin/seasons/lifecycle?seasonId=season-1',{admin:true});
 assert.equal(preview.status,200);
 assert.equal(preview.data.preview.playerCount,1);
 assert.equal(preview.data.preview.entries[0].name,'BuilderA');
 const premature=await seasonAction(t,'end',started.data.revision);
 assert.equal(premature.status,400);
 const prepared=await seasonAction(t,'prepare',started.data.revision);
 assert.equal(prepared.status,200,JSON.stringify(prepared.data));
 const beforeAck=await seasonAction(t,'end',prepared.data.revision,{autoAwards:true});
 assert.equal(beforeAck.status,409,'must wait for signed Paper acknowledgement');
 const commandId=prepared.data.season.archiveSyncCommandId;
 t.db.prepare('UPDATE minecraft_sync_commands SET completed_at=? WHERE id=?')
   .run(new Date().toISOString(),commandId);
 t.db.prepare('UPDATE minecraft_sync_status SET seen_at=?,pending_count=1 WHERE id=1')
   .run(new Date().toISOString());
 const busy=await seasonAction(t,'end',prepared.data.revision,{autoAwards:true});
 assert.equal(busy.status,409,'must wait for empty Paper upload queue');
 t.db.prepare('UPDATE minecraft_sync_status SET seen_at=?,pending_count=0 WHERE id=1')
   .run(new Date().toISOString());
 const finished=await seasonAction(t,'end',prepared.data.revision,{autoAwards:true});
 assert.equal(finished.status,200,JSON.stringify(finished.data));
 assert.equal(finished.data.season.archiveAwards.length,3);
 assert.equal(finished.data.season.archiveAwards[0].player,'Pilihan Admin');
 assert.equal(finished.data.season.archiveAwards.filter(a=>a.title==='Pemain Teraktif').length,1);
 assert.equal(finished.data.season.archiveAwards.find(a=>a.title==='Pembasmi Monster').memberId,
   member);
 assert.equal(finished.data.settings.statSeasonId,'');
 assert.equal(finished.data.season.archiveStatus,'ended');
 assert.equal(finished.data.season.archiveSnapshot.playerCount,1);
 assert.deepEqual(finished.data.season.entries,[{name:'BuilderA',score:'2 jam 3 menit'}]);
 assert.deepEqual(finished.data.season.archiveTimeline.map(x=>x.kind),['opening','closing']);
 const publicForm=await t.req('/api/form');
 assert.equal(publicForm.data.settings.homeLeaderboardSeasons[0].archiveSnapshot.playerCount,1);
 const reopen=await seasonAction(t,'start',finished.data.revision);
 assert.equal(reopen.status,409);
 const deleteArchived=await save(t,s=>{s.homeLeaderboardSeasons=[];});
 assert.equal(deleteArchived.status,409);
 const tamper=await save(t,s=>{
   s.homeLeaderboardSeasons[0].archiveSnapshot={capturedAt:'2000-01-01T00:00:00.000Z',playerCount:9999};
   s.homeLeaderboardSeasons[0].entries=[{name:'Peringkat palsu',score:'100000'}];
 });
 assert.equal(tamper.status,200);
 const persisted=(await t.req('/api/admin/form',{admin:true})).data.settings.homeLeaderboardSeasons[0];
 assert.equal(persisted.archiveSnapshot.playerCount,1);
 assert.equal(persisted.entries[0].name,'BuilderA');
 assert.equal(persisted.archiveLeaderboards[0].entries[0].name,'BuilderA');
 const extraBoard=await save(t,settings=>{
   const season=settings.homeLeaderboardSeasons[0];
   season.archiveLeaderboards[0].entries[0].name='Pemain palsu';
   season.archiveLeaderboards.push({id:'builders',title:'Builder Terbaik',
     entries:[{name:'Builder B',score:'Kastil Besar'}]});
 });
 assert.equal(extraBoard.status,200,JSON.stringify(extraBoard.data));
 const after=(await t.req('/api/admin/form',{admin:true})).data.settings.homeLeaderboardSeasons[0];
 assert.equal(after.archiveLeaderboards[0].entries[0].name,'BuilderA',
   'final snapshot cannot be edited');
 assert.equal(after.archiveLeaderboards[1].title,'Builder Terbaik',
   'additional manual boards remain editable after finalization');
});

test('planned opening requires explicit override before its scheduled time',async()=>{
 const t=fixture();
 const draft=await save(t,s=>{s.homeLeaderboardSeasons[0].archiveStatus='planned';});
 assert.equal(draft.status,200);
 const admin=await t.req('/api/admin/form',{admin:true});
 const scheduled=await seasonAction(t,'schedule',admin.data.revision,{
   scheduledAt:new Date(Date.now()+86400000).toISOString()
 });
 assert.equal(scheduled.status,200,JSON.stringify(scheduled.data));
 const blocked=await seasonAction(t,'start',scheduled.data.revision);
 assert.equal(blocked.status,409);
 const started=await seasonAction(t,'start',scheduled.data.revision,{overrideSchedule:true});
 assert.equal(started.status,200);
 assert.equal(started.data.season.archiveScheduledAt,'');
 const replay=await seasonAction(t,'start',scheduled.data.revision,{overrideSchedule:true});
 assert.equal(replay.status,409,'stale revision must not replay transitions');
});

test('lifecycle requires admin session and rejects competing seasons',async()=>{
 const t=fixture();
 assert.equal((await t.req('/api/admin/seasons/lifecycle?seasonId=season-1')).status,401);
 const draft=await save(t,s=>{
   s.homeLeaderboardSeasons[0].archiveStatus='planned';
   s.homeLeaderboardSeasons.push({
     id:'season-2',title:'Season 2',entries:[],archiveStatus:'planned',archivePublished:false
   });
 });
 assert.equal(draft.status,200);
 const form=await t.req('/api/admin/form',{admin:true});
 const started=await seasonAction(t,'start',form.data.revision);
 assert.equal(started.status,200);
 const second=await t.req('/api/admin/seasons/lifecycle',{
   admin:true,method:'POST',payload:{
     action:'start',seasonId:'season-2',revision:started.data.revision,
     confirmation:'START SEASON'
   }
 });
 assert.equal(second.status,409);
 assert.equal(second.data.error.includes('Akhiri Season'),true);
 const active=(await t.req('/api/admin/form',{admin:true})).data.settings.homeLeaderboardSeasons;
 assert.equal(active.filter(x=>x.archiveStatus==='active').length,1);
});

test('legacy active Season can be archived without a live stats period',async()=>{
 const t=fixture();
 const initial=await save(t,s=>{
   s.seasonArchiveEnabled=true;
   s.homeLeaderboardSeasons[0].archiveStatus='active';
   s.homeLeaderboardSeasons[0].archivePublished=true;
 });
 assert.equal(initial.status,200);
 const form=await t.req('/api/admin/form',{admin:true});
 assert.equal(form.data.settings.statSeasonId,'');
 const archived=await seasonAction(t,'archiveLegacy',form.data.revision,{
   confirmation:'ARCHIVE SEASON',publish:true
 });
 assert.equal(archived.status,200,JSON.stringify(archived.data));
 assert.equal(archived.data.season.archiveStatus,'ended');
 assert.equal(archived.data.season.entries[0].name,'Pemain Lama');
 assert.equal(archived.data.season.archiveSnapshot,null);
 assert.ok(archived.data.season.archiveFinalizedAt);
 assert.equal(archived.data.season.archiveTimeline[0].kind,'closing');
 const repeated=await seasonAction(t,'archiveLegacy',archived.data.revision,{
   confirmation:'ARCHIVE SEASON'
 });
 assert.equal(repeated.status,409);
});

test('multi-board Season leaderboards keep legacy homepage results and stay isolated',async()=>{
 const t=fixture();
 const result=await save(t,settings=>{
   settings.seasonArchiveEnabled=true;
   const season=settings.homeLeaderboardSeasons[0];
   season.archivePublished=true;
   season.archiveLeaderboards=[
     {id:'main',title:'Pemain Teraktif',entries:[
       {name:'Pemain Lama',score:'12'},{name:'Pemain Baru',score:'10'}]},
     {id:'builder',title:'Builder Terbaik',entries:[
       {name:'Kreator A',score:'Castle'},{name:'Kreator B',score:'Village'}]},
     {id:'event',title:'Pemenang Event',entries:[{name:'Juara A',score:'1st'}]}
   ];
 });
 assert.equal(result.status,200,JSON.stringify(result.data));
 const saved=(await t.req('/api/admin/form',{admin:true})).data.settings.homeLeaderboardSeasons[0];
 assert.equal(saved.archiveLeaderboards.length,3);
 assert.deepEqual(saved.archiveLeaderboards.map(board=>board.title),
   ['Pemain Teraktif','Builder Terbaik','Pemenang Event']);
 assert.deepEqual(saved.entries,saved.archiveLeaderboards[0].entries,
   'first titled board mirrors legacy homepage entries');
 assert.equal(saved.archiveLeaderboards[1].entries[0].name,'Kreator A');
 const publicSettings=(await t.req('/api/form')).data.settings.homeLeaderboardSeasons[0];
 assert.equal(publicSettings.archiveLeaderboards.length,3);
 assert.equal(publicSettings.archiveLeaderboards[2].entries[0].score,'1st');
 const changed=await save(t,settings=>{
   settings.homeLeaderboardSeasons[0].archiveLeaderboards[1].entries[0].score='Grand Castle';
 });
 assert.equal(changed.status,200);
 const after=(await t.req('/api/admin/form',{admin:true})).data.settings.homeLeaderboardSeasons[0];
 assert.equal(after.entries[0].score,'12');
 assert.equal(after.archiveLeaderboards[1].entries[0].score,'Grand Castle');
});

test('legacy single-board rankings migrate without duplication after a normal edit',async()=>{
 const t=fixture();
 const initial=(await t.req('/api/admin/form',{admin:true})).data.settings.homeLeaderboardSeasons[0];
 assert.equal(initial.archiveLeaderboards,undefined);
 assert.equal(initial.entries.length,1);
 const saved=await save(t,settings=>{settings.seasonArchiveEnabled=true;});
 assert.equal(saved.status,200,JSON.stringify(saved.data));
 const season=(await t.req('/api/admin/form',{admin:true})).data.settings.homeLeaderboardSeasons[0];
 assert.deepEqual(season.archiveLeaderboards,[{
   id:'main',title:'Leaderboard Season',entries:[{name:'Pemain Lama',score:'12'}]
 }]);
 assert.deepEqual(season.entries,season.archiveLeaderboards[0].entries);
 const second=await save(t,settings=>{settings.seasonArchiveDescription='Test';});
 assert.equal(second.status,200);
 const check=(await t.req('/api/admin/form',{admin:true})).data.settings.homeLeaderboardSeasons[0];
 assert.equal(check.archiveLeaderboards.length,1);
});

test('multi-board validation rejects duplicate IDs, blank titles and overflow',async()=>{
 const invalid=[
   [{id:'main',title:'Peringkat',entries:[]},{id:'main',title:'Duplikat',entries:[]}],
   [{id:'main',title:' ',entries:[]}],
   Array.from({length:9},(_,i)=>({id:'board-'+i,title:'Board '+i,entries:[]})),
   [{id:'main',title:'Leaderboard',entries:Array.from({length:21},(_,i)=>({
     name:'Pemain '+i,score:String(i)
   }))}],
   [{id:'main',title:'Leaderboard',entries:'bukan-array'}]
 ];
 for(const archiveLeaderboards of invalid){
   const t=fixture();
   const outcome=await save(t,settings=>{
     settings.homeLeaderboardSeasons[0].archiveLeaderboards=archiveLeaderboards;
   });
   assert.equal(outcome.status,400,JSON.stringify({archiveLeaderboards,outcome}));
 }
});

test('unpublished boards stay hidden from public form metadata',async()=>{
 const t=fixture();
 const result=await save(t,settings=>{
   settings.seasonArchiveEnabled=true;
   const season=settings.homeLeaderboardSeasons[0];
   season.archivePublished=false;
   season.archiveLeaderboards=[{id:'main',title:'Draft rahasia',entries:[
     {name:'Pemain Lama',score:'12'}]}];
 });
 assert.equal(result.status,200);
 const publicSeason=(await t.req('/api/form')).data.settings.homeLeaderboardSeasons[0];
 assert.equal(publicSeason.archiveLeaderboards,undefined);
 assert.equal(publicSeason.entries[0].name,'Pemain Lama');
});

test('Homepage may feature a secondary leaderboard without changing the official snapshot',async()=>{
 const t=fixture();
 const stored=await save(t,settings=>{
   const season=settings.homeLeaderboardSeasons[0];
   season.archivePublished=true;
   season.archiveLeaderboards=[
     {id:'main',title:'Pemain Teraktif',entries:[{name:'Pemain A',score:'300 jam'}]},
     {id:'builders',title:'Builder Terbaik',entries:[{name:'Builder B',score:'Juara'}]}
   ];
   season.homeFeaturedLeaderboardId='builders';
 });
 assert.equal(stored.status,200,JSON.stringify(stored.data));
 const admin=(await t.req('/api/admin/form',{admin:true})).data.settings.homeLeaderboardSeasons[0];
 assert.equal(admin.homeFeaturedLeaderboardId,'builders');
 assert.equal(admin.entries[0].name,'Pemain A');
 const pub=(await t.req('/api/form')).data.settings.homeLeaderboardSeasons[0];
 assert.equal(pub.homeFeaturedLeaderboard.title,'Builder Terbaik');
 assert.equal(pub.homeFeaturedLeaderboard.entries[0].name,'Builder B');
 assert.equal(pub.entries[0].name,'Pemain A');
});

test('Homepage featured selection safely falls back when the selected board is removed',async()=>{
 const t=fixture();
 const first=await save(t,settings=>{
   const season=settings.homeLeaderboardSeasons[0];
   season.archiveLeaderboards=[
     {id:'main',title:'Utama',entries:[{name:'Pemain A',score:'1'}]},
     {id:'event',title:'Event',entries:[{name:'Pemain B',score:'2'}]}
   ];
   season.homeFeaturedLeaderboardId='event';
 });
 assert.equal(first.status,200);
 const changed=await save(t,settings=>{
   settings.homeLeaderboardSeasons[0].archiveLeaderboards.pop();
 });
 assert.equal(changed.status,200,JSON.stringify(changed.data));
 const season=(await t.req('/api/admin/form',{admin:true})).data.settings.homeLeaderboardSeasons[0];
 assert.equal(season.homeFeaturedLeaderboardId,'main');
 assert.equal(season.archiveLeaderboards.length,1);
});

test('Homepage featured board does not publish other Draft archive boards',async()=>{
 const t=fixture();
 const result=await save(t,settings=>{
   settings.homeLeaderboardEnabled=true;
   settings.seasonArchiveEnabled=true;
   const season=settings.homeLeaderboardSeasons[0];
   season.archivePublished=false;
   season.archiveLeaderboards=[
     {id:'main',title:'Pemain Teraktif',entries:[{name:'Pemain A',score:'10'}]},
     {id:'featured',title:'Event Utama',entries:[{name:'Juara B',score:'1st'}]},
     {id:'private',title:'Catatan privat',entries:[{name:'Rahasia',score:'99'}]}
   ];
   season.homeFeaturedLeaderboardId='featured';
 });
 assert.equal(result.status,200,JSON.stringify(result.data));
 const season=(await t.req('/api/form')).data.settings.homeLeaderboardSeasons[0];
 assert.equal(season.homeFeaturedLeaderboard.title,'Event Utama');
 assert.equal(season.homeFeaturedLeaderboard.entries[0].name,'Juara B');
 assert.equal(season.archiveLeaderboards,undefined);
 assert.equal(JSON.stringify(season).includes('Catatan privat'),false);
});

test('Cloudflare Cron requires secret and only starts one explicitly scheduled Season',async()=>{
 const t=fixture();
 const planned=await save(t,s=>{s.homeLeaderboardSeasons[0].archiveStatus='planned';});
 assert.equal(planned.status,200);
 const form=await t.req('/api/admin/form',{admin:true});
 const future=new Date(Date.now()+60000).toISOString();
 const unconfigured=await seasonAction(t,'schedule',form.data.revision,{scheduledAt:future,autoStart:true});
 assert.equal(unconfigured.status,503,'auto open is rejected before Cloudflare configuration');
 const token='a-very-long-secret-unique-to-season-cron-2026';
 t.env.SEASON_CRON_TOKEN=token;
 const scheduled=await seasonAction(t,'schedule',form.data.revision,{scheduledAt:future,autoStart:true});
 assert.equal(scheduled.status,200,JSON.stringify(scheduled.data));
 assert.equal((await t.req('/api/internal/seasons/tick',{method:'POST',headers:{Authorization:'Bearer bad-secret'}})).status,401);
 const early=await t.req('/api/internal/seasons/tick',{method:'POST',headers:{Authorization:'Bearer '+token}});
 assert.equal(early.data.started,0,'Cron must not open before the deadline');
 const settings=JSON.parse(t.db.prepare('SELECT settings FROM form_config WHERE id=1').get().settings);
 settings.homeLeaderboardSeasons[0].archiveScheduledAt=new Date(Date.now()-2000).toISOString();
 t.db.prepare('UPDATE form_config SET settings=? WHERE id=1').run(JSON.stringify(settings));
 const opened=await t.req('/api/internal/seasons/tick',{method:'POST',headers:{Authorization:'Bearer '+token}});
 assert.equal(opened.status,200,JSON.stringify(opened.data));
 assert.equal(opened.data.started,1);
 const repeated=await t.req('/api/internal/seasons/tick',{method:'POST',headers:{Authorization:'Bearer '+token}});
 assert.equal(repeated.data.started,0,'Cron replay cannot open Season twice');
 const actual=(await t.req('/api/admin/form',{admin:true})).data.settings;
 assert.equal(actual.statSeasonId,'season-1');
 assert.equal(actual.homeLeaderboardSeasons[0].archiveAutoOpen,false);
 assert.equal(actual.homeLeaderboardSeasons[0].archivePublished,false,'Cron must not force publish a private Season');
});
