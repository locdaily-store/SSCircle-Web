import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const text=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(text).toString('base64'))).default;
const SECRET='pr78-test-session',ADMIN='pr78-test-admin';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
const codes=['AAAAFFFFBBBBCCCCDDDD','112233445566778899AA','CDEF1234CDEF1234CDEF'],question='minecraft-username';
const signed=(name,payload,key)=>{const part=Buffer.from(JSON.stringify(payload)).toString('base64url');return name+'='+part+'.'+createHmac('sha256',key).update(part).digest('base64url');};
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE submissions(id TEXT PRIMARY KEY,status TEXT,tracking_code TEXT,submitted_at TEXT,rejection_reason TEXT DEFAULT "",answers TEXT,question_snapshot TEXT); CREATE TABLE form_config(id INTEGER PRIMARY KEY,settings TEXT,pages TEXT,questions TEXT,updated_at TEXT); CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER,expires_at INTEGER); CREATE TABLE revoked_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER);');
 for(const [i,id] of [A,B,C].entries())db.prepare('INSERT INTO submissions(id,status,tracking_code,submitted_at,answers,question_snapshot) VALUES(?,?,?,?,?,?)').run(id,['pending','rejected','accepted'][i],codes[i],'2026-11-23T00:00:00Z',JSON.stringify({[question]:'OldMinecraft'+i}),JSON.stringify([{id:question,title:'Username Minecraft / IGN'}]));
 db.prepare('INSERT INTO form_config VALUES(1,?,?,?,?)').run('{}','[]','[]','v1');
 const DB={prepare(sql){let values=[],stmt;try{stmt=db.prepare(sql)}catch(e){throw Error(sql+'\n'+e.message)}
  return {bind(...args){values=args;return this},async first(){return stmt.get(...values)||null},async run(){const r=stmt.run(...values);return{meta:{changes:r.changes}}},async all(){return{results:stmt.all(...values)}}};},
  async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=[];for(const stmt of statements)out.push(await stmt.run());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}};
 const exp=Math.floor(Date.now()/1000)+3600,cookies={};
 for(const [i,id] of [A,B,C].entries())cookies[['a','b','c'][i]]=signed('ssc_player',{id,exp},SECRET+'|player-session');
 cookies.admin=signed('ssc_s6_admin',{exp},SECRET+'|'+ADMIN);
 const env={DB,SESSION_SECRET:SECRET,ADMIN_PASSWORD:ADMIN,ASSETS:{fetch:async()=>new Response('ok',{status:200})}};
 async function req(path,{method='GET',payload,cookie=cookies.a}={}){
  const response=await worker.fetch(new Request('https://sscircle.test'+path,{method,headers:{Cookie:cookie,Origin:'https://sscircle.test',...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})}),env);
  let data=null;try{data=await response.clone().json()}catch{}return{status:response.status,data};
 }
 return {req,db,cookies};
}
const target='/api/admin/notifications/direct';
test('Admin can resolve registration codes for pending, rejected and accepted applicants',async()=>{
 const t=fixture();
 for(const [i,code] of codes.entries()){
  const r=await t.req(target+'/lookup?code='+code,{cookie:t.cookies.admin});
  assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal(r.data.status,['pending','rejected','accepted'][i]);
  assert.equal(r.data.questions[0].id,question);
 }
 assert.equal((await t.req(target+'/lookup?code='+codes[0])).status,401);
});
test('Direct messages reach exactly one applicant and cannot be accessed by other sessions',async()=>{
 const t=fixture();
 for(const [i,code] of codes.entries()){
  const sent=await t.req(target,{cookie:t.cookies.admin,method:'POST',payload:{action:'send',code,title:'Perbaiki data Minecraft',content:'Silakan periksa username Minecraft.',questions:[{prompt:'Apa username yang benar?',fieldId:question}]}});
  assert.equal(sent.status,201,JSON.stringify(sent.data));
  const id=sent.data.id,owner=t.cookies[['a','b','c'][i]],stranger=t.cookies[['b','c','a'][i]];
  const inbox=await t.req('/api/player/mailbox',{cookie:owner});
  assert.equal(inbox.data.items.filter(x=>x.id===id&&x.type==='direct_message').length,1);
  assert.equal(inbox.data.items.find(x=>x.id===id).directThreadId,id);
  assert.equal((await t.req('/api/player/mailbox/direct?id='+id,{cookie:owner})).status,200);
  assert.equal((await t.req('/api/player/mailbox/direct?id='+id,{cookie:stranger})).status,404);
  assert.equal((await t.req('/api/player/mailbox/delete',{method:'POST',cookie:owner,payload:{id}})).status,409);
 }
});
test('Reply and admin approval update registration answers but preserve rejected status',async()=>{
 const t=fixture();
 const sent=await t.req(target,{method:'POST',cookie:t.cookies.admin,payload:{code:codes[1],title:'Perbaikan Username',content:'Periksa data.',questions:[{prompt:'Username terbaru?',fieldId:question}]}});
 assert.equal(sent.status,201,JSON.stringify(sent.data));const id=sent.data.id;
 assert.equal((await t.req('/api/player/mailbox/direct/reply',{method:'POST',cookie:t.cookies.a,payload:{threadId:id,message:'Bad'}})).status,404);
 const reply=await t.req('/api/player/mailbox/direct/reply',{method:'POST',cookie:t.cookies.b,payload:{threadId:id,message:'Perbaikan',answers:{q1:'NewMinecraftName'}}});
 assert.equal(reply.status,200,JSON.stringify(reply.data));
 assert.equal(JSON.parse(t.db.prepare('SELECT answers FROM submissions WHERE id=?').get(B).answers)[question],'OldMinecraft1');
 const thread=(await t.req(target+'?id='+id,{cookie:t.cookies.admin})).data.thread;
 const applied=await t.req(target,{method:'POST',cookie:t.cookies.admin,payload:{action:'apply',threadId:id,replyId:thread.replies[0].id}});
 assert.equal(applied.status,200,JSON.stringify(applied.data));
 assert.equal(JSON.parse(t.db.prepare('SELECT answers FROM submissions WHERE id=?').get(B).answers)[question],'NewMinecraftName');
 assert.equal(t.db.prepare('SELECT status FROM submissions WHERE id=?').get(B).status,'rejected');
 assert.equal((await t.req(target,{method:'POST',cookie:t.cookies.admin,payload:{action:'apply',threadId:id,replyId:thread.replies[0].id}})).status,409);
 assert.equal((await t.req(target,{method:'POST',cookie:t.cookies.admin,payload:{action:'close',threadId:id}})).status,200);
 assert.equal((await t.req('/api/player/mailbox/direct/reply',{method:'POST',cookie:t.cookies.b,payload:{threadId:id,message:'Late reply'}})).status,409);
});
test('Recovery auto issue cannot be abused with registration-code-only cookie',async()=>{
 const t=fixture();await t.req('/api/player/security/state',{cookie:t.cookies.c});
 t.db.prepare('INSERT INTO member_credentials(application_id,password_salt,password_hash,iterations,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(C,'salt','v2.'+'A'.repeat(43),220000,new Date().toISOString(),new Date().toISOString());
 const r=await t.req('/api/player/mailbox/request-recovery',{method:'POST',cookie:t.cookies.c,payload:{}});
 assert.equal(r.status,403,JSON.stringify(r.data));
 assert.equal(t.db.prepare("SELECT COUNT(*) n FROM member_mailbox WHERE type='activation'").get().n,0);
});
test('Both private message UIs and recovery endpoint are wired',()=>{
 const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 assert.match(src('notification-direct-admin.js'),/Kirim ke Mail Box pendaftar/);
 assert.match(src('mailbox-direct.js'),/api\/player\/mailbox\/direct\/reply/);
 assert.match(src('mailbox-widget.js'),/SSCircleDirectMailbox/);
 assert.match(src('mailbox.js'),/mailbox-direct/);
 assert.match(src('_worker.js'),/request-recovery/);
});