import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHmac,createHash,pbkdf2Sync} from 'node:crypto';
const source=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const SECRET='mailbox-regression-secret',ADMIN='mailbox-admin-verify';
const ID='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const CODE='AAAAFFFFBBBBCCCCDDDD';
function signed(name,payload,key){const p=Buffer.from(JSON.stringify(payload)).toString('base64url');
 return name+'='+p+'.'+createHmac('sha256',key).update(p).digest('base64url');}
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE submissions(id TEXT PRIMARY KEY,status TEXT,tracking_code TEXT,submitted_at TEXT,rejection_reason TEXT DEFAULT '');
 CREATE TABLE form_config(id INTEGER PRIMARY KEY,settings TEXT,pages TEXT,questions TEXT,updated_at TEXT);
 CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER,expires_at INTEGER);
 CREATE TABLE revoked_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER);`);
 db.prepare('INSERT INTO submissions(id,status,tracking_code,submitted_at) VALUES(?,?,?,?)').run(ID,'accepted',CODE,'2026-11-07T00:00:00Z');
 db.prepare('INSERT INTO submissions(id,status,tracking_code,submitted_at) VALUES(?,?,?,?)').run(OTHER,'accepted','112233445566778899AA','2026-11-07T01:00:00Z');
 let settings={seasonArchiveEnabled:true,homeVotingEnabled:false,homeVotingPermanent:true,
  homeVotingQuestions:[{id:'q1',title:'A',options:[{id:'o1',label:'One'},{id:'o2',label:'Two'}]}]};
 db.prepare('INSERT INTO form_config VALUES(1,?,?,?,?)').run(JSON.stringify(settings),JSON.stringify([{id:'page-1',title:'Registration',description:'',blocks:[],routes:{}}]),'[]','v1');
 const DB={prepare(sql){let args=[],statement;try{statement=db.prepare(sql)}catch(err){throw Error('SQL: '+sql+'\n'+err.message)}
 return {bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},
  async run(){const res=statement.run(...args);return {meta:{changes:res.changes}};},
  async all(){return {results:statement.all(...args)}}};}};
 DB.batch=async statements=>{
   db.exec('BEGIN IMMEDIATE');
   try {
     const results=[];
     for(const statement of statements)results.push(await statement.run());
     db.exec('COMMIT');
     return results;
   }catch(error){db.exec('ROLLBACK');throw error;}
 };
 const env={DB,SESSION_SECRET:SECRET,ADMIN_PASSWORD:ADMIN,
  ASSETS:{fetch:async()=>new Response('private content',{status:200})}};
 const expires=Math.floor(Date.now()/1000)+3600;
 const member=signed('ssc_player',{id:ID,exp:expires},SECRET+'|player-session');
 const another=signed('ssc_player',{id:OTHER,exp:expires},SECRET+'|player-session');
 const admin=signed('ssc_s6_admin',{exp:expires},SECRET+'|'+ADMIN);
 async function request(path,{method='GET',body,cookie=member}={}){
  let payload=body;
  if(path==='/api/player/security/activate'&&body?.password?.length>=8){
    const salt=Buffer.alloc(16,29).toString('base64url');
    payload={invite:body.invite,salt,
      proof:pbkdf2Sync(body.password,salt,220000,32,'sha256').toString('base64url')};
  }
  const response=await worker.fetch(new Request('https://sscircle.example'+path,{method,
    headers:{Origin:'https://sscircle.example',Cookie:cookie, 'User-Agent':'test-mailbox',
      ...(payload?{'Content-Type':'application/json'}:{})},
    ...(payload?{body:JSON.stringify(payload)}:{})}),env);
  let data=null;try{data=await response.clone().json()}catch{}
  return {status:response.status,data,response};
 }
 return {request,db,member,another,admin,env};
}

// Password already exists: recovery must still require independent admin approval.
async function seedActivated(x){
 await x.request('/api/player/security/state');
 const now=new Date().toISOString();
 x.db.prepare(`INSERT INTO member_credentials
   (application_id,password_salt,password_hash,iterations,created_at,updated_at)
   VALUES(?,?,?,?,?,?)`).run(ID,'c2VlZA','v2.'+'a'.repeat(43),220000,now,now);
}

test('anggota Diterima mendapat kode pertama otomatis tanpa membocorkan kode ke respons',async()=>{
 const x=fixture();
 const req=await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{}});
 assert.equal(req.status,200,JSON.stringify(req.data));
 assert.equal(req.data.delivered,true);
 assert.equal(req.data.firstActivation,true);
 const list=await x.request('/api/player/mailbox');
 assert.equal(list.data.activationRequest,'sent');
 assert.equal(list.data.items.filter(m=>m.type==='activation').length,1);
 assert.equal(list.data.items.find(m=>m.type==='activation').canReveal,true);
 assert.equal(JSON.stringify(list.data).includes('encrypted_secret'),false);
 const noAdmin=await x.request('/api/admin/mailbox/approve',{method:'POST',body:{id:ID,verification:'identity-confirmed'}});
 assert.equal(noAdmin.status,401);
 assert.equal((await x.request('/api/player/mailbox',{cookie:''})).status,403);
 assert.equal((await x.request('/mailbox',{cookie:''})).status,302);
 assert.equal((await x.request('/mailbox',{cookie:x.another})).status,302);
 const denied=await x.request('/api/player/mailbox');
 assert.ok(denied.data.items.some(m=>m.type==='activation'));
});

test('verifikasi oleh admin mengirim kode AES-GCM ke Mail Box, bukan respons publik',async()=>{
 const x=fixture();
 await seedActivated(x);
 await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{purpose:'recovery'}});
 const approved=await x.request('/api/admin/mailbox/approve',{method:'POST',body:{id:ID,verification:'identity-confirmed'},cookie:x.admin});
 assert.equal(approved.status,200,JSON.stringify(approved.data));
 assert.equal(approved.data.delivered,true);
 assert.equal('invite' in approved.data,false);
 const mail=await x.request('/api/player/mailbox');
 assert.equal(mail.status,200,JSON.stringify(mail.data));
 assert.equal(mail.data.activationRequest,'sent');
 const row=mail.data.items.find(m=>m.type==='activation');
 assert.ok(row?.canReveal);
 assert.equal(row.expiresAt!==null,true);
 const raw=x.db.prepare('SELECT encrypted_secret,secret_nonce,expires_at FROM member_mailbox WHERE id=?').get(row.id);
 assert.ok(raw.encrypted_secret.length>25);
 assert.equal(raw.secret_nonce.length,16);
 const other=await x.request('/api/player/mailbox/reveal',{method:'POST',body:{id:row.id},cookie:x.another});
 assert.equal(other.status,410); // Other member cannot reveal anyone else's secret
 const revealed=await x.request('/api/player/mailbox/reveal',{method:'POST',body:{id:row.id}});
 assert.equal(revealed.status,200,JSON.stringify(revealed.data));
 assert.match(revealed.data.code,/^[A-Za-z0-9_-]{32}$/);
 assert.notEqual(raw.encrypted_secret,revealed.data.code);
 const again=await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{purpose:'recovery'}});
 assert.equal(again.data.delivered,true);
 assert.equal((await x.request('/api/player/mailbox')).data.items.filter(m=>m.type!=='registration_code').length,2);
 const used=await x.request('/api/player/security/activate',{method:'POST',body:{invite:revealed.data.code,password:'KataSandiKuat#2040'}});
 assert.equal(used.status,200,JSON.stringify(used.data));
 const reused=await x.request('/api/player/mailbox/reveal',{method:'POST',body:{id:row.id}});
 assert.equal(reused.status,410);
});

test('jalur approval admin tetap dapat menerbitkan kode pemulihan sekali pakai',async()=>{
 const x=fixture();
 await seedActivated(x);
 const approved=await x.request('/api/admin/mailbox/approve',{method:'POST',cookie:x.admin,
  body:{id:ID,verification:'identity-confirmed'}});
 assert.equal(approved.status,200);
 assert.equal(approved.data.delivered,false);
 const req=await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{purpose:'recovery'}});
 assert.equal(req.status,200);assert.equal(req.data.delivered,true);
 const row=x.db.prepare('SELECT consumed_at FROM member_mailbox_approvals WHERE application_id=?').get(ID);
 assert.ok(row.consumed_at);
 const second=await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{purpose:'recovery'}});
 assert.equal(second.data.delivered,true);
 assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM member_mailbox WHERE type=?').get('activation').n,1);
});

test('Voting yang dimatikan tidak dapat dibuka melalui URL ataupun API',async()=>{
 const x=fixture();
 const state=await x.request('/api/voting/status',{cookie:''});
 assert.equal(state.status,200);assert.equal(state.data.enabled,false);
 const html=await x.request('/voting');assert.equal(html.status,302);
 assert.equal(html.response.headers.get('Location'),'/page-closed.html?section=voting');
 assert.equal((await x.request('/voting.html')).status,302);
 const api=await x.request('/api/voting');assert.equal(api.status,403);
 assert.equal((await x.request('/api/voting/vote',{method:'POST',body:{questionId:'q1',optionId:'o1'}})).status>=400,true);
 x.db.prepare('UPDATE form_config SET settings=? WHERE id=1').run(JSON.stringify({homeVotingEnabled:true,homeVotingPermanent:true,
   homeVotingQuestions:[{id:'q1',title:'A',options:[{id:'o1',label:'One'},{id:'o2',label:'Two'}]}]}));
 assert.equal((await x.request('/api/voting/status',{cookie:''})).data.enabled,true);
 assert.equal((await x.request('/voting')).status,200);
 assert.equal((await x.request('/api/voting')).status,200);
});

test('pendaftar pending/rejected dapat membaca notifikasi sendiri, tidak bisa meminta/membuka kode aktivasi',async()=>{
 const x=fixture();
 // Membuat satu pesan privat melalui alur lama, lalu mengubah status pendaftar.
 await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{}});
 const message=(await x.request('/api/player/mailbox')).data.items.find(m=>m.type==='activation');
 for(const status of ['pending','rejected']){
  x.db.prepare('UPDATE submissions SET status=? WHERE id=?').run(status,ID);
  const list=await x.request('/api/player/mailbox');
  assert.equal(list.status,200);
  assert.equal(list.data.applicationStatus,status);
  assert.equal(list.data.items.filter(m=>m.type==='activation').length,1);
  assert.equal(list.data.items.find(m=>m.type==='activation').canReveal,false);
  assert.equal(list.data.items.find(m=>m.type==='registration_code').content.includes(CODE),true);
  assert.equal((await x.request('/mailbox')).status,200);
  const legacy=await x.request('/mailbox.html');
  assert.equal(legacy.status,302);
  assert.equal(legacy.response.headers.get('Location'),'/mailbox');
  assert.match((await x.request('/mailbox')).response.headers.get('Cache-Control'),/no-store/);
  assert.equal((await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{}})).status,403);
  assert.equal((await x.request('/api/player/mailbox/reveal',{
    method:'POST',body:{id:message.id}})).status,403);
  assert.equal((await x.request('/api/player/mailbox',{cookie:''})).status,403);
  assert.equal((await x.request('/mailbox',{cookie:''})).status,302);
  const outsider=await x.request('/api/player/mailbox',{cookie:x.another});
  assert.equal(outsider.status,200);
  assert.equal(outsider.data.items.some(m=>m.id===message.id),false);
 }
});

test('Mail Box delete only affects owner, while a live activation code stays available',async()=>{
  const x=fixture();
  await seedActivated(x);
  const requested=await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{purpose:'recovery'}});
  assert.equal(requested.status,200);
  let list=await x.request('/api/player/mailbox');
  const info=list.data.items.find(item=>item.type==='information');
  assert.ok(info);
  const outsider=await x.request('/api/player/mailbox/delete',{method:'POST',cookie:x.another,body:{id:info.id}});
  assert.equal(outsider.status,404);
  const deleted=await x.request('/api/player/mailbox/delete',{method:'POST',body:{id:info.id}});
  assert.equal(deleted.status,200);
  list=await x.request('/api/player/mailbox');
  assert.equal(list.data.items.some(item=>item.id===info.id),false);
  await x.request('/api/admin/mailbox/approve',{method:'POST',cookie:x.admin,
    body:{id:ID,verification:'identity-confirmed'}});
  const activation=(await x.request('/api/player/mailbox')).data.items.find(item=>item.canReveal);
  assert.ok(activation);
  assert.equal((await x.request('/api/player/mailbox/delete',{method:'POST',body:{id:activation.id}})).status,409);
  assert.equal((await x.request('/api/player/mailbox/reveal',{method:'POST',body:{id:activation.id}})).status,200);
});

test('failed transaction restores approval so a later request can issue one invite',async()=>{
 const x=fixture();
 await seedActivated(x);
 await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{purpose:'recovery'}});
 const originalBatch=x.env.DB.batch;
 x.env.DB.batch=async()=>{throw Error('temporary transaction failure');};
 const failed=await x.request('/api/admin/mailbox/approve',{method:'POST',cookie:x.admin,
   body:{id:ID,verification:'identity-confirmed'}});
 assert.equal(failed.status,503);
 assert.equal(x.db.prepare('SELECT consumed_at FROM member_mailbox_approvals WHERE application_id=?').get(ID).consumed_at,null);
 assert.equal(x.db.prepare("SELECT COUNT(*) AS n FROM member_mailbox WHERE type='activation'").get().n,0);
 x.env.DB.batch=originalBatch;
 const retry=await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{purpose:'recovery'}});
 assert.equal(retry.status,200,JSON.stringify(retry.data));
 assert.equal(retry.data.delivered,true);
 const mailbox=await x.request('/api/player/mailbox');
 assert.equal(mailbox.data.items.filter(item=>item.canReveal).length,1);
});

test('mark-as-read checks ownership and keeps normal repeat reads idempotent',async()=>{
 const x=fixture();
 await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{}});
 const id=(await x.request('/api/player/mailbox')).data.items.find(m=>m.type==='activation').id;
 assert.equal((await x.request('/api/player/mailbox/read',{method:'POST',cookie:x.another,body:{id}})).status,404);
 assert.equal((await x.request('/api/player/mailbox/read',{method:'POST',body:{id}})).status,200);
 assert.equal((await x.request('/api/player/mailbox/read',{method:'POST',body:{id}})).status,200);
});

test('if D1 committed but response was lost, same invite remains recoverable',async()=>{
 const x=fixture();
 await seedActivated(x);
 await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{purpose:'recovery'}});
 const originalBatch=x.env.DB.batch;
 x.env.DB.batch=async statements=>{
  await originalBatch(statements);
  throw Error('temporary transport interruption after commit');
 };
 const approved=await x.request('/api/admin/mailbox/approve',{method:'POST',cookie:x.admin,
   body:{id:ID,verification:'identity-confirmed'}});
 assert.equal(approved.status,200,JSON.stringify(approved.data));
 assert.equal(approved.data.delivered,true);
 const activation=(await x.request('/api/player/mailbox')).data.items.filter(x=>x.type==='activation');
 assert.equal(activation.length,1);
 assert.equal(activation[0].canReveal,true);
 const repeated=await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{purpose:'recovery'}});
 assert.equal(repeated.data.delivered,true);
 assert.equal(x.db.prepare("SELECT COUNT(*) AS n FROM member_mailbox WHERE type='activation'").get().n,1);
});

test('Mail Box batch actions reject other members and never delete a live code',async()=>{
 const x=fixture();
 await seedActivated(x);
 await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{purpose:'recovery'}});
 await x.request('/api/admin/mailbox/approve',{method:'POST',cookie:x.admin,
   body:{id:ID,verification:'identity-confirmed'}});
 const list=(await x.request('/api/player/mailbox')).data.items;
 const code=list.find(item=>item.canReveal);
 const info=list.find(item=>item.type==='information');
 assert.ok(code&&info);
 const call=(action,ids,cookie)=>x.request('/api/player/mailbox/manage',{
   method:'POST',body:{action,ids},...(cookie?{cookie}:{})});
 assert.equal((await call('delete',[info.id,code.id])).status,409);
 assert.equal((await call('delete',[info.id],x.another)).status,404);
 assert.equal((await call('read',[info.id],x.another)).status,404);
 assert.equal((await call('delete',[info.id,info.id])).status,400);
 assert.equal((await call('read',[])).status,400);
 assert.equal((await call('read',['invalid'])).status,400);
 assert.equal((await call('read',[info.id])).status,200);
 assert.equal((await x.request('/api/player/mailbox')).data.items.find(item=>item.id===info.id).read,true);
 const deleted=await call('delete',[info.id]);
 assert.equal(deleted.status,200,JSON.stringify(deleted.data));
 assert.equal(deleted.data.deleted,1);
 const after=(await x.request('/api/player/mailbox')).data.items;
 assert.equal(after.some(item=>item.id===info.id),false);
 assert.equal(after.some(item=>item.id===code.id&&item.canReveal),true);
});

test('Mail Box batch operations require a valid owner session, including status-only applicants',async()=>{
 const x=fixture();
 await seedActivated(x);
 await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{purpose:'recovery'}});
 const message=(await x.request('/api/player/mailbox')).data.items.find(m=>m.type==='information');
 assert.equal((await x.request('/api/player/mailbox/manage',{
   method:'POST',cookie:'',body:{action:'read',ids:[message.id]}})).status,403);
 x.db.prepare('UPDATE submissions SET status=? WHERE id=?').run('rejected',ID);
 assert.equal((await x.request('/api/player/mailbox/manage',{
   method:'POST',body:{action:'read',ids:[message.id]}})).status,200);
 assert.equal((await x.request('/api/player/mailbox/manage',{
   method:'POST',cookie:x.another,body:{action:'delete',ids:[message.id]}})).status,404);
 assert.equal((await x.request('/api/player/mailbox/manage',{
   method:'POST',body:{action:'delete',ids:[message.id]}})).status,200);
});


test('Accepted status Mail Box includes custom Discord invite CTA, never for rejected status',async()=>{
 const x=fixture();
 const entry=JSON.parse(x.db.prepare('SELECT settings FROM form_config WHERE id=1').get().settings);
 Object.assign(entry,{
   mailboxAcceptedTitle:'Pendaftaranmu diterima oleh SSCircle',
   mailboxAcceptedBody:'Akunmu lolos seleksi. Silakan lakukan aktivasi akun.',
   mailboxAcceptedDiscordNote:'IP Address server Minecraft ada di Discord SSCircle Community.',
   mailboxAcceptedDiscordButton:'Gabung Discord untuk melihat IP',
   mailboxAcceptedDiscordEnabled:true,
   homeDiscordUrl:'https://discord.gg/vQQSgY2GRS'
 });
 x.db.prepare('UPDATE form_config SET settings=? WHERE id=1').run(JSON.stringify(entry));
 x.db.prepare("UPDATE submissions SET status='pending' WHERE id=?").run(ID);
 const changed=await x.request('/api/admin/status',{method:'PATCH',cookie:x.admin,
   body:{id:ID,status:'accepted',expectedRevision:0}});
 assert.equal(changed.status,200,JSON.stringify(changed.data));
 const inbox=await x.request('/api/player/mailbox');
 assert.equal(inbox.status,200,JSON.stringify(inbox.data));
 const accepted=inbox.data.items.find(row=>row.type==='status');
 assert.ok(accepted,JSON.stringify(inbox.data));
 assert.equal(accepted.title,entry.mailboxAcceptedTitle);
 assert.equal(accepted.content,entry.mailboxAcceptedBody);
 assert.equal(accepted.discordCTA.label,entry.mailboxAcceptedDiscordButton);
 assert.equal(accepted.discordCTA.note,entry.mailboxAcceptedDiscordNote);
 assert.equal(accepted.discordCTA.url,entry.homeDiscordUrl);
 const rejected=await x.request('/api/admin/status',{method:'PATCH',cookie:x.admin,
   body:{id:ID,status:'rejected',reason:'Dokumen belum lengkap',expectedRevision:1}});
 assert.equal(rejected.status,200,JSON.stringify(rejected.data));
 const after=await x.request('/api/player/mailbox');
 assert.equal(after.data.items.find(row=>row.content.includes('Dokumen belum lengkap')).discordCTA,null);
});

test('self-service activation spends an old admin preapproval to prevent later recovery bypass',async()=>{
 const x=fixture();
 const approved=await x.request('/api/admin/mailbox/approve',{method:'POST',cookie:x.admin,
   body:{id:ID,verification:'identity-confirmed'}});
 assert.equal(approved.status,200,JSON.stringify(approved.data));
 assert.equal(approved.data.delivered,false);
 const issued=await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{}});
 assert.equal(issued.status,200,JSON.stringify(issued.data));
 assert.equal(issued.data.delivered,true);
 const approval=x.db.prepare('SELECT consumed_at FROM member_mailbox_approvals WHERE application_id=?').get(ID);
 assert.ok(approval.consumed_at,'Preapproval must not carry into password recovery');
 const first=(await x.request('/api/player/mailbox')).data.items.find(m=>m.type==='activation');
 const code=await x.request('/api/player/mailbox/reveal',{method:'POST',body:{id:first.id}});
 assert.equal(code.status,200,JSON.stringify(code.data));
 const activated=await x.request('/api/player/security/activate',{method:'POST',
   body:{invite:code.data.code,password:'NewSecurePass#2040'}});
 assert.equal(activated.status,200,JSON.stringify(activated.data));
 const recovery=await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{purpose:'recovery'}});
 assert.equal(recovery.status,200,JSON.stringify(recovery.data));
 assert.equal(recovery.data.delivered,false,'Recovery needs a NEW admin approval');
});

test('Diterima menerbitkan kode awal otomatis ketika status diperbarui',async()=>{
 const x=fixture();
 x.db.prepare("UPDATE submissions SET status='pending' WHERE id=?").run(ID);
 const changed=await x.request('/api/admin/status',{method:'PATCH',cookie:x.admin,
   body:{id:ID,status:'accepted',expectedRevision:0}});
 assert.equal(changed.status,200,JSON.stringify(changed.data));
 const inbox=await x.request('/api/player/mailbox');
 assert.equal(inbox.status,200,JSON.stringify(inbox.data));
 assert.equal(inbox.data.hasPassword,false);
 assert.equal(inbox.data.activationRequest,'sent');
 const code=inbox.data.items.filter(i=>i.type==='activation'&&i.canReveal);
 assert.equal(code.length,1,'Kode otomatis masuk tanpa klik atau approval admin');
 const second=await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{}});
 assert.equal(second.data.delivered,true);
 assert.equal(x.db.prepare("SELECT COUNT(*) AS n FROM member_mailbox WHERE application_id=? AND type='activation'").get(ID).n,1);
});
test('akun sudah aktif tidak dapat meminta reset tanpa memilih pemulihan secara eksplisit',async()=>{
 const x=fixture();await seedActivated(x);
 const original=await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{}});
 assert.equal(original.status,403,JSON.stringify(original.data));
 assert.match(original.data.error,/password Dashboard/i);
 const row=x.db.prepare('SELECT status FROM member_activation_requests WHERE application_id=?').get(ID);
 assert.equal(row,undefined);
 const intentional=await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{purpose:'recovery'}});
 assert.equal(intentional.status,200,JSON.stringify(intentional.data));
 assert.equal(intentional.data.recovery,true);
});
test('header Registration tidak membuat tombol Mail Box dan avatar Profile',()=>{
 const src=readFileSync(new URL('../public-unified.js',import.meta.url),'utf8');
 assert.match(src,/const isRegistration=route\(page\)==='\/registration'/);
 assert.match(src,/isRegistration\?'':/);
 assert.match(src,/if\(!isRegistration\)\{/);
});

test('kode verifikasi akun aktif otomatis hanya setelah login Dashboard aman',async()=>{
 const x=fixture();
 await x.request('/api/player/security/state');
 const saltBytes=Buffer.alloc(16,29);
 const salt=saltBytes.toString('base64url');
 const password='TestSecurePassword#2026';
 const proof=pbkdf2Sync(password,saltBytes,220000,32,'sha256').toString('base64url');
 const hash='v2.'+createHash('sha256').update('sscircle-member-verifier-v2|'+proof).digest('base64url');
 const now=new Date().toISOString();
 x.db.prepare(`INSERT INTO member_credentials
   (application_id,password_salt,password_hash,iterations,created_at,updated_at)
   VALUES(?,?,?,?,?,?)`).run(ID,salt,hash,220000,now,now);
 const denied=await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{}});
 assert.equal(denied.status,403,JSON.stringify(denied.data));
 const login=await x.request('/api/player/security/login',{method:'POST',body:{code:CODE,proof}});
 assert.equal(login.status,200,JSON.stringify(login.data));
 const cookie=login.response.headers.getSetCookie().find(v=>v.startsWith('ssc_member_secure=')).split(';')[0];
 const secure=x.member+'; '+cookie;
 const issued=await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{},cookie:secure});
 assert.equal(issued.status,200,JSON.stringify(issued.data));
 assert.equal(issued.data.delivered,true);
 assert.equal(issued.data.verification,true);
 const inbox=await x.request('/api/player/mailbox',{cookie:secure});
 const row=inbox.data.items.find(item=>item.title==='Kode verifikasi akun tersedia');
 assert.ok(row?.canReveal);
 const outsider=await x.request('/api/player/mailbox',{cookie:x.member});
 assert.equal(outsider.data.items.find(item=>item.id===row.id).canReveal,false);
 assert.equal((await x.request('/api/player/mailbox/reveal',{
   method:'POST',body:{id:row.id},cookie:x.member})).status,403);
 const revealed=await x.request('/api/player/mailbox/reveal',{
   method:'POST',body:{id:row.id},cookie:secure});
 assert.equal(revealed.status,200);
 assert.match(revealed.data.code,/^[A-Za-z0-9_-]{32}$/);
 const again=await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{},cookie:secure});
 assert.equal(again.status,200);
 assert.equal(x.db.prepare("SELECT COUNT(*) AS n FROM member_mailbox WHERE type='activation'").get().n,1);
});

test('tombol Minta kode tetap tampil pada akun dengan password',()=>{
 const widget=readFileSync(new URL('../mailbox-widget.js',import.meta.url),'utf8');
 const standalone=readFileSync(new URL('../mailbox.js',import.meta.url),'utf8');
 assert.match(widget,/\$\('ssc-mailbox-request'\)\.hidden=false/);
 assert.match(standalone,/\$\('mailbox-request-button'\)\.hidden=false/);
});

test('pendaftar baru dan lama mendapatkan kode ASLI tersimpan privat dan tidak bisa dihapus',async()=>{
 const x=fixture();
 // Initializing the Mail Box backfills all pre-existing submissions, not only
 // the one opening the inbox. No new code, email, or re-registration is needed.
 const mine=await x.request('/api/player/mailbox');
 assert.equal(mine.status,200,JSON.stringify(mine.data));
 assert.equal(x.db.prepare("SELECT COUNT(*) AS n FROM member_mailbox WHERE type='registration_code'").get().n,2);
 const notice=mine.data.items.find(m=>m.type==='registration_code');
 assert.ok(notice);
 assert.equal(notice.title,'Kode pendaftaran tersimpan');
 assert.ok(notice.content.includes(CODE));
 assert.equal(notice.registrationCode,CODE,'Copy field must contain only the original code');
 assert.equal(notice.canReveal,false);
 assert.equal(notice.read,false);
 const stored=x.db.prepare("SELECT content FROM member_mailbox WHERE id=?").get(notice.id);
 assert.ok(!stored.content.includes(CODE),'Do not duplicate bearer code in mailbox database');
 const other=await x.request('/api/player/mailbox',{cookie:x.another});
 assert.equal(other.status,200);
 const theirCode='112233445566778899AA';
 assert.ok(other.data.items.some(m=>m.type==='registration_code'&&m.content.includes(theirCode)));
 assert.equal(other.data.items.find(m=>m.type==='registration_code').registrationCode,theirCode);
 assert.ok(!other.data.items.some(m=>m.type==='registration_code'&&m.content.includes(CODE)));
 assert.ok(!other.data.items.some(m=>m.registrationCode===CODE));
 const unauthorized=await x.request('/api/player/mailbox',{cookie:''});
 assert.equal(unauthorized.status,403);
 const del=await x.request('/api/player/mailbox/delete',{method:'POST',body:{id:notice.id}});
 assert.equal(del.status,409);
 const batch=await x.request('/api/player/mailbox/manage',{method:'POST',body:{action:'delete',ids:[notice.id]}});
 assert.equal(batch.status,409);
 for(const status of ['pending','rejected','accepted']){
   x.db.prepare('UPDATE submissions SET status=? WHERE id=?').run(status,ID);
   const response=await x.request('/api/player/mailbox');
   assert.equal(response.status,200);
   assert.equal(response.data.applicationStatus,status);
   assert.equal(response.data.items.filter(m=>m.type==='registration_code').length,1);
   assert.ok(response.data.items.find(m=>m.type==='registration_code').content.includes(CODE));
   assert.equal(response.data.items.find(m=>m.type==='registration_code').registrationCode,CODE);
 }
 assert.equal(x.db.prepare("SELECT COUNT(*) AS n FROM member_mailbox WHERE application_id=? AND type='registration_code'").get(ID).n,1);
});

test('registrasi baru setelah schema initialization tetap menerima kode via status notification',async()=>{
 const x=fixture();
 await x.request('/api/player/mailbox');
 const fresh='33333333-3333-4333-8333-333333333333';
 const code='CDEF1234CDEF1234CDEF';
 x.db.prepare('INSERT INTO submissions(id,status,tracking_code,submitted_at) VALUES(?,?,?,?)')
   .run(fresh,'pending',code,new Date().toISOString());
 // This is the same handler used by the /api/apply commit path.
 const adminStatus=await x.request('/api/admin/status',{method:'PATCH',cookie:x.admin,
   body:{id:fresh,status:'accepted',expectedRevision:0}});
 assert.equal(adminStatus.status,200,JSON.stringify(adminStatus.data));
 const row=x.db.prepare("SELECT id,content FROM member_mailbox WHERE application_id=? AND type='registration_code'").get(fresh);
 assert.ok(row,'A new member must get its permanent message without having opened the inbox');
 assert.ok(!row.content.includes(code),'Registration code stays in submissions');
});

test('salin kode pendaftaran tersedia dalam Mail Box modal dan halaman penuh',()=>{
 const popup=readFileSync(new URL('../mailbox-widget.js',import.meta.url),'utf8');
 const full=readFileSync(new URL('../mailbox.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../mailbox.html',import.meta.url),'utf8');
 for(const source of [popup,full]){
   assert.match(source,/registrationCode/,'Code must come from authenticated response');
   assert.match(source,/navigator\.clipboard\.writeText\(code\)/,'Copy button must use Clipboard API');
   assert.match(source,/Kode pendaftaran berhasil disalin/,'Copy must report success');
 }
 assert.match(popup,/id="ssc-mailbox-registration-copy"/);
 assert.match(html,/id="mailbox-registration-copy"/);
});

test('admin live sync rejects stale acceptance/rejection without overwriting the previous decision',async()=>{
 const x=fixture();
 const live=await x.request('/api/admin/live',{cookie:x.admin});
 assert.equal(live.status,200,JSON.stringify(live.data));
 assert.equal(Number.isInteger(live.data.submissionsRevision),true);
 const roster=await x.request('/api/admin/submissions',{cookie:x.admin});
 assert.equal(roster.status,200,JSON.stringify(roster.data));
 const original=roster.data.items.find(v=>v.id===ID);
 assert.equal(original.statusRevision,0);
 const missing=await x.request('/api/admin/status',{method:'PATCH',cookie:x.admin,
   body:{id:ID,status:'pending'}});
 assert.equal(missing.status,428);
 const first=await x.request('/api/admin/status',{method:'PATCH',cookie:x.admin,
   body:{id:ID,status:'pending',expectedRevision:original.statusRevision}});
 assert.equal(first.status,200,JSON.stringify(first.data));
 assert.equal(first.data.statusRevision,1);
 const stale=await x.request('/api/admin/status',{method:'PATCH',cookie:x.admin,
   body:{id:ID,status:'rejected',reason:'Another admin did not see the update',
      expectedRevision:original.statusRevision}});
 assert.equal(stale.status,409,JSON.stringify(stale.data));
 assert.equal(x.db.prepare('SELECT status FROM submissions WHERE id=?').get(ID).status,'pending');
 const refreshed=await x.request('/api/admin/submissions',{cookie:x.admin});
 assert.equal(refreshed.data.items.find(v=>v.id===ID).statusRevision,1);
 const after=await x.request('/api/admin/live',{cookie:x.admin});
 assert.ok(after.data.submissionsRevision>live.data.submissionsRevision);
});
