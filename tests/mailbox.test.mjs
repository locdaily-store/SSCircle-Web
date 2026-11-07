import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHmac} from 'node:crypto';
const source=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const SECRET='mailbox-regression-secret',ADMIN='mailbox-admin-verify';
const ID='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const CODE='AAAAFFFFBBBBCCCCDDDD';
function signed(name,payload,key){const p=Buffer.from(JSON.stringify(payload)).toString('base64url');
 return name+'='+p+'.'+createHmac('sha256',key).update(p).digest('base64url');}
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE submissions(id TEXT PRIMARY KEY,status TEXT,tracking_code TEXT,submitted_at TEXT);
 CREATE TABLE form_config(id INTEGER PRIMARY KEY,settings TEXT,pages TEXT,questions TEXT,updated_at TEXT);
 CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER,expires_at INTEGER);
 CREATE TABLE revoked_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER);`);
 db.prepare('INSERT INTO submissions VALUES(?,?,?,?)').run(ID,'accepted',CODE,'2026-11-07T00:00:00Z');
 db.prepare('INSERT INTO submissions VALUES(?,?,?,?)').run(OTHER,'accepted','112233445566778899AA','2026-11-07T01:00:00Z');
 let settings={seasonArchiveEnabled:true,homeVotingEnabled:false,homeVotingPermanent:true,
  homeVotingQuestions:[{id:'q1',title:'A',options:[{id:'o1',label:'One'},{id:'o2',label:'Two'}]}]};
 db.prepare('INSERT INTO form_config VALUES(1,?,?,?,?)').run(JSON.stringify(settings),JSON.stringify([{id:'page-1',title:'Registration',description:'',blocks:[],routes:{}}]),'[]','v1');
 const DB={prepare(sql){let args=[],statement;try{statement=db.prepare(sql)}catch(err){throw Error('SQL: '+sql+'\n'+err.message)}
 return {bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},
  async run(){const res=statement.run(...args);return {meta:{changes:res.changes}};},
  async all(){return {results:statement.all(...args)}}};}};
 const env={DB,SESSION_SECRET:SECRET,ADMIN_PASSWORD:ADMIN,
  ASSETS:{fetch:async()=>new Response('private content',{status:200})}};
 const expires=Math.floor(Date.now()/1000)+3600;
 const member=signed('ssc_player',{id:ID,exp:expires},SECRET+'|player-session');
 const another=signed('ssc_player',{id:OTHER,exp:expires},SECRET+'|player-session');
 const admin=signed('ssc_s6_admin',{exp:expires},SECRET+'|'+ADMIN);
 async function request(path,{method='GET',body,cookie=member}={}){
  const response=await worker.fetch(new Request('https://sscircle.example'+path,{method,
    headers:{Origin:'https://sscircle.example',Cookie:cookie, 'User-Agent':'test-mailbox',
      ...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})}),env);
  let data=null;try{data=await response.clone().json()}catch{}
  return {status:response.status,data,response};
 }
 return {request,db,member,another,admin};
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
 assert.equal((await x.request('/mailbox',{cookie:x.another})).status,200);
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

test('pendaftar pending dan rejected tidak berhak melihat Mail Box',async()=>{
 const x=fixture();
 for(const status of ['pending','rejected']){
  x.db.prepare('UPDATE submissions SET status=? WHERE id=?').run(status,ID);
  assert.equal((await x.request('/api/player/mailbox')).status,403);
  assert.equal((await x.request('/api/player/mailbox/request-activation',{method:'POST',body:{}})).status,403);
  assert.equal((await x.request('/mailbox')).status,302);
 }
});
