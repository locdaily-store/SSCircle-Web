import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHmac,pbkdf2Sync} from 'node:crypto';
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

test('permintaan diterima dicatat tetapi tidak membocorkan kode sebelum verifikasi identitas',async()=>{
 const x=fixture();
 const req=await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{}});
 assert.equal(req.status,200,JSON.stringify(req.data));
 assert.equal(req.data.delivered,false);
 const list=await x.request('/api/player/mailbox');
 assert.equal(list.data.activationRequest,'pending');
 assert.equal(list.data.items.length,1);
 assert.equal(list.data.items[0].canReveal,false);
 assert.equal(JSON.stringify(list.data).includes('encrypted_secret'),false);
 const noAdmin=await x.request('/api/admin/mailbox/approve',{method:'POST',body:{id:ID,verification:'identity-confirmed'}});
 assert.equal(noAdmin.status,401);
 assert.equal((await x.request('/api/player/mailbox',{cookie:''})).status,403);
 assert.equal((await x.request('/mailbox',{cookie:''})).status,302);
 assert.equal((await x.request('/mailbox',{cookie:x.another})).status,302);
 const denied=await x.request('/api/player/mailbox');
 assert.equal(denied.data.items[0].type,'information');
});

test('verifikasi oleh admin mengirim kode AES-GCM ke Mail Box, bukan respons publik',async()=>{
 const x=fixture();
 await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{}});
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
 const again=await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{}});
 assert.equal(again.data.delivered,true);
 assert.equal((await x.request('/api/player/mailbox')).data.items.length,2);
 const used=await x.request('/api/player/security/activate',{method:'POST',body:{invite:revealed.data.code,password:'KataSandiKuat#2040'}});
 assert.equal(used.status,200,JSON.stringify(used.data));
 const reused=await x.request('/api/player/mailbox/reveal',{method:'POST',body:{id:row.id}});
 assert.equal(reused.status,410);
});

test('kode hanya diterbitkan otomatis jika approval sudah ada dan valid satu kali',async()=>{
 const x=fixture();
 const approved=await x.request('/api/admin/mailbox/approve',{method:'POST',cookie:x.admin,
  body:{id:ID,verification:'identity-confirmed'}});
 assert.equal(approved.status,200);
 assert.equal(approved.data.delivered,false);
 const req=await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{}});
 assert.equal(req.status,200);assert.equal(req.data.delivered,true);
 const row=x.db.prepare('SELECT consumed_at FROM member_mailbox_approvals WHERE application_id=?').get(ID);
 assert.ok(row.consumed_at);
 const second=await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{}});
 assert.equal(second.data.delivered,true);
 assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM member_mailbox WHERE type=?').get('activation').n,1);
});

test('Voting yang dimatikan tidak dapat dibuka melalui URL ataupun API',async()=>{
 const x=fixture();
 const state=await x.request('/api/voting/status',{cookie:''});
 assert.equal(state.status,200);assert.equal(state.data.enabled,false);
 const html=await x.request('/voting');assert.equal(html.status,302);
 assert.match(html.response.headers.get('Location'),/akses-voting=ditutup/);
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
 const message=(await x.request('/api/player/mailbox')).data.items[0];
 for(const status of ['pending','rejected']){
  x.db.prepare('UPDATE submissions SET status=? WHERE id=?').run(status,ID);
  const list=await x.request('/api/player/mailbox');
  assert.equal(list.status,200);
  assert.equal(list.data.applicationStatus,status);
  assert.equal(list.data.items.length,1);
  assert.equal(list.data.items[0].canReveal,false);
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
  const requested=await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{}});
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
 await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{}});
 const originalBatch=x.env.DB.batch;
 x.env.DB.batch=async()=>{throw Error('temporary transaction failure');};
 const failed=await x.request('/api/admin/mailbox/approve',{method:'POST',cookie:x.admin,
   body:{id:ID,verification:'identity-confirmed'}});
 assert.equal(failed.status,503);
 assert.equal(x.db.prepare('SELECT consumed_at FROM member_mailbox_approvals WHERE application_id=?').get(ID).consumed_at,null);
 assert.equal(x.db.prepare("SELECT COUNT(*) AS n FROM member_mailbox WHERE type='activation'").get().n,0);
 x.env.DB.batch=originalBatch;
 const retry=await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{}});
 assert.equal(retry.status,200,JSON.stringify(retry.data));
 assert.equal(retry.data.delivered,true);
 const mailbox=await x.request('/api/player/mailbox');
 assert.equal(mailbox.data.items.filter(item=>item.canReveal).length,1);
});

test('mark-as-read checks ownership and keeps normal repeat reads idempotent',async()=>{
 const x=fixture();
 await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{}});
 const id=(await x.request('/api/player/mailbox')).data.items[0].id;
 assert.equal((await x.request('/api/player/mailbox/read',{method:'POST',cookie:x.another,body:{id}})).status,404);
 assert.equal((await x.request('/api/player/mailbox/read',{method:'POST',body:{id}})).status,200);
 assert.equal((await x.request('/api/player/mailbox/read',{method:'POST',body:{id}})).status,200);
});

test('if D1 committed but response was lost, same invite remains recoverable',async()=>{
 const x=fixture();
 await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{}});
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
 const repeated=await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{}});
 assert.equal(repeated.data.delivered,true);
 assert.equal(x.db.prepare("SELECT COUNT(*) AS n FROM member_mailbox WHERE type='activation'").get().n,1);
});

test('Mail Box batch actions reject other members and never delete a live code',async()=>{
 const x=fixture();
 await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{}});
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
 await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{}});
 const message=(await x.request('/api/player/mailbox')).data.items[0];
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
   body:{id:ID,status:'accepted'}});
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
   body:{id:ID,status:'rejected',reason:'Dokumen belum lengkap'}});
 assert.equal(rejected.status,200,JSON.stringify(rejected.data));
 const after=await x.request('/api/player/mailbox');
 assert.equal(after.data.items.find(row=>row.content.includes('Dokumen belum lengkap')).discordCTA,null);
});
