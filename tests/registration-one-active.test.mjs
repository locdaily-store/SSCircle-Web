import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHmac} from 'node:crypto';

const code=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
const SECRET='test-registration-single-active-secret';
const A='11111111-1111-4111-8111-111111111111';
const CODE='AAAAFFFFBBBBCCCCDDDD';
const Q={id:'ign',title:'Username Minecraft / IGN',type:'short',required:true};
function cookie(id){
 const p=Buffer.from(JSON.stringify({id,exp:Math.floor(Date.now()/1000)+3600,sessionVersion:0})).toString('base64url');
 return 'ssc_player='+p+'.'+createHmac('sha256',SECRET+'|player-session').update(p).digest('base64url');
}
function fixture(status='pending', enabled=true){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE submissions(id TEXT PRIMARY KEY,submitted_at TEXT,status TEXT,answers TEXT,question_snapshot TEXT,tracking_code TEXT,rejection_reason TEXT);');
 db.exec('CREATE TABLE form_config(id INTEGER PRIMARY KEY,settings TEXT,pages TEXT,questions TEXT,updated_at TEXT);');
 db.exec('CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER,expires_at INTEGER);');
 db.exec('CREATE TABLE revoked_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER);');
 const pages=[{id:'first',title:'Registrasi',blocks:[{id:'q1',type:'question',question:Q}]}];
 db.prepare('INSERT INTO form_config VALUES(1,?,?,?,?)').run(
  JSON.stringify({open:true,rulesEnabled:false,cooldownMinutes:0,registrationOneActive:enabled}),
  JSON.stringify(pages),'[]',new Date().toISOString());
 if(status)db.prepare('INSERT INTO submissions VALUES(?,?,?,?,?,?,?)').run(
  A,new Date().toISOString(),status,JSON.stringify({ign:'OldName'}),JSON.stringify([Q]),CODE,
  status==='rejected'?'Username Minecraft sebelumnya salah':'');
 const DB={prepare(sql){
  const statement=db.prepare(sql);let args=[];
  return{bind(...v){args=v;return this},async first(){return statement.get(...args)||null},
   async all(){return{results:statement.all(...args)}},async run(){
    const r=statement.run(...args);return{meta:{changes:r.changes}}}};
 }};
 DB.batch=async statements=>{
  db.exec('BEGIN IMMEDIATE');
  try{const results=[];for(const statement of statements)results.push(await statement.run());
   db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}
 };
 const env={DB,SESSION_SECRET:SECRET,ASSETS:{fetch:async()=>new Response('asset')}};
 let counter=0;
 async function request(path,method='GET',body,member=''){
  const response=await worker.fetch(new Request('https://sscircle.example'+path,{
   method,headers:{'Origin':'https://sscircle.example','CF-Connecting-IP':'10.0.0.'+(++counter),
    ...(member?{Cookie:cookie(member)}:{}),...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})}),env);
  return {status:response.status,data:await response.json()};
 }
 const apply=(ign,member='')=>request('/api/apply','POST',{answers:{ign},website:''},member);
 return{db,request,apply};
}
test('Menunggu cannot send again, including with a changed username',async()=>{
 const x=fixture('pending');
 const e=await x.request('/api/registration/eligibility','GET',null,A);
 assert.equal(e.data.canSubmit,false);
 assert.equal(e.data.status,'pending');
 assert.equal((await x.apply('AnotherName',A)).status,409);
 assert.equal((await x.apply('oldname')).status,409);
 assert.equal(x.db.prepare('SELECT COUNT(*) n FROM submissions').get().n,1);
});
test('Diterima never creates a second registration',async()=>{
 const x=fixture('accepted');
 const e=await x.request('/api/registration/eligibility','GET',null,A);
 assert.equal(e.data.status,'accepted');assert.equal(e.data.canSubmit,false);
 assert.equal((await x.apply('DifferentName',A)).status,409);
});
test('Ditolak may resubmit with original code and archived answers',async()=>{
 const x=fixture('rejected');
 const e=await x.request('/api/registration/eligibility','GET',null,A);
 assert.equal(e.data.canResubmit,true);
 assert.match(e.data.reason,/sebelumnya salah/);
 const done=await x.apply('CorrectName',A);
 assert.equal(done.status,200,JSON.stringify(done.data));
 assert.equal(done.data.reapplication,true);
 assert.equal(done.data.reference,CODE);
 const row=x.db.prepare('SELECT status,tracking_code,answers,rejection_reason FROM submissions WHERE id=?').get(A);
 assert.equal(row.status,'pending');assert.equal(row.tracking_code,CODE);
 assert.equal(JSON.parse(row.answers).ign,'CorrectName');assert.equal(row.rejection_reason,'');
 const history=x.db.prepare('SELECT old_answers,old_reason FROM registration_attempt_history WHERE application_id=?').get(A);
 assert.equal(JSON.parse(history.old_answers).ign,'OldName');
 assert.match(history.old_reason,/sebelumnya salah/);
 assert.equal(x.db.prepare('SELECT COUNT(*) n FROM submissions').get().n,1);
 assert.equal((await x.apply('CorrectName',A)).status,409);
});
test('Two unrelated browsers cannot register the same Minecraft username',async()=>{
 const x=fixture(null);
 const result=await Promise.all([x.apply('PlayerUnique'),x.apply('playerunique')]);
 assert.deepEqual(result.map(v=>v.status).sort((a,b)=>a-b),[201,409]);
 assert.equal(x.db.prepare('SELECT COUNT(*) n FROM submissions').get().n,1);
});
test('Admin OFF switch restores original behavior',async()=>{
 const x=fixture('accepted',false);
 const e=await x.request('/api/registration/eligibility','GET',null,A);
 assert.equal(e.data.enabled,false);assert.equal(e.data.canSubmit,true);
 assert.equal((await x.apply('NextName',A)).status,201);
 assert.equal(x.db.prepare('SELECT COUNT(*) n FROM submissions').get().n,2);
});
test('UI and admin control show policy, rejection reason and updated cache version',()=>{
 const html=readFileSync(new URL('../registration.html',import.meta.url),'utf8');
 const admin=readFileSync(new URL('../admin.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(html,/id="registration-existing-banner"/);
 assert.match(html,/id="registration-rejected-banner"/);
 assert.match(html,/app\.js\?v=10\.65\.0/);
 assert.match(admin,/id="registration-one-active"/);
 assert.match(app,/getRegistrationEligibility/);
});
test('Rejected registration cannot be duplicated in a new browser without original code',async()=>{
 const x=fixture('rejected');
 const other=await x.apply('oldname');
 assert.equal(other.status,409,JSON.stringify(other.data));
 assert.equal(x.db.prepare('SELECT COUNT(*) n FROM submissions').get().n,1);
 const original=await x.request('/api/registration/eligibility','GET',null,A);
 assert.equal(original.data.canResubmit,true);
 const updated=await x.apply('OldName',A);
 assert.equal(updated.status,200,JSON.stringify(updated.data));
 assert.equal(updated.data.reference,CODE);
});
