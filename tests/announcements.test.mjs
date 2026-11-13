import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const code=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE revoked_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER); CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER,expires_at INTEGER);');
 const DB={prepare(sql){
   const statement=db.prepare(sql);let args=[];
   return {bind(...values){args=values;return this;},
     async run(){const r=statement.run(...args);return {meta:{changes:r.changes}};},
     async first(){return statement.get(...args)||null;},
     async all(){return {results:statement.all(...args)};}};
 }};
 const secret='announcements-test-secret',password='announcements-test-password';
 const part=Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
 const cookie='ssc_s6_admin='+part+'.'+createHmac('sha256',secret+'|'+password).update(part).digest('base64url');
 const env={DB,SESSION_SECRET:secret,ADMIN_PASSWORD:password,ASSETS:{fetch:async()=>new Response('asset')}};
 async function call(path,method='GET',payload,{asAdmin=true,origin='https://sscircle.test'}={}){
   const response=await worker.fetch(new Request('https://sscircle.test'+path,{method,
     headers:{Origin:origin,...(asAdmin?{Cookie:cookie}:{}),...(payload?{'Content-Type':'application/json'}:{})},
     ...(payload?{body:JSON.stringify(payload)}:{})}),env);
   return {status:response.status,body:await response.json()};
 }
 return {db,call};
}
const article=(more={})=>({title:'Pembukaan season baru',
 excerpt:'Persiapkan perjalanan berikutnya.',
 content:'Season baru dimulai minggu depan.\n\nSemua anggota diundang.',
 category:'Update Server',imageUrl:'https://images.example.org/cover.webp',
 imageAlt:'Spawn server',images:['https://images.example.org/a.webp'],
 status:'draft',pinned:true,publishedAt:'2026-01-01T00:00:00.000Z',...more});

test('publik menyembunyikan draft dan admin harus login dan menggunakan origin sah',async()=>{
 const f=fixture();
 assert.equal((await f.call('/api/announcements')).status,200);
 assert.equal((await f.call('/api/admin/announcements','GET',undefined,{asAdmin:false})).status,401);
 assert.equal((await f.call('/api/admin/announcements','POST',article(),{origin:'https://other.example'})).status,403);
 const created=await f.call('/api/admin/announcements','POST',article());
 assert.equal(created.status,201,JSON.stringify(created.body));
 assert.equal((await f.call('/api/announcements')).body.items.length,0);
 const admin=await f.call('/api/admin/announcements');
 assert.equal(admin.body.counts.draft,1);
 assert.equal(admin.body.items[0].images.length,1);
});
test('artikel bisa terbit, diperbarui dengan revisi aman, dan dihapus',async()=>{
 const f=fixture();
 const unsafe=await f.call('/api/admin/announcements','POST',article({imageUrl:'http://unsafe.example/photo.png'}));
 assert.equal(unsafe.status,400);
 const created=await f.call('/api/admin/announcements','POST',article({status:'published'}));
 assert.equal(created.status,201,JSON.stringify(created.body));
 const pub=(await f.call('/api/announcements')).body;
 assert.equal(pub.items.length,1);
 const prev=pub.items[0];
 const updated=await f.call('/api/admin/announcements','PUT',{...prev,title:'Judul baru'});
 assert.equal(updated.status,200,JSON.stringify(updated.body));
 assert.equal((await f.call('/api/admin/announcements','PUT',{...prev,title:'Versi usang'})).status,409);
 assert.equal((await f.call('/api/admin/announcements','DELETE',{id:created.body.id,updatedAt:prev.updatedAt})).status,409);
 assert.equal((await f.call('/api/admin/announcements','DELETE',{id:created.body.id,updatedAt:updated.body.updatedAt})).status,200);
 assert.equal((await f.call('/api/announcements')).body.items.length,0);
});
test('jadwal terbit, pengaturan halaman, dan konflik Admin',async()=>{
 const f=fixture();
 const created=await f.call('/api/admin/announcements','POST',article({status:'published',publishedAt:'2036-01-01T00:00:00.000Z'}));
 assert.equal(created.status,201);
 assert.equal((await f.call('/api/announcements')).body.items.length,0);
 const admin=(await f.call('/api/admin/announcements')).body;
 assert.equal((await f.call('/api/admin/announcements/settings','PUT',{revision:'salah',settings:{title:'X'}})).status,409);
 const saved=await f.call('/api/admin/announcements/settings','PUT',{revision:admin.settingsRevision,
   settings:{enabled:false,title:'Kabar SSCircle',subtitle:'Update hari ini'}});
 assert.equal(saved.status,200);
 const pub=(await f.call('/api/announcements')).body;
 assert.equal(pub.settings.title,'Kabar SSCircle');
 assert.equal(pub.items.length,0);
});
test('halaman dan Admin terhubung tanpa mengolah HTML berita mentah',()=>{
 const page=readFileSync(new URL('../announcements.html',import.meta.url),'utf8');
 const client=readFileSync(new URL('../announcements.js',import.meta.url),'utf8');
 const admin=readFileSync(new URL('../admin.html',import.meta.url),'utf8');
 assert.match(page,/id="ann-list"/);
 assert.match(admin,/data-tab="announcements-admin"/);
 assert.match(admin,/value="announcements.html"/);
 assert.doesNotMatch(client,/\.innerHTML\s*=/);
});
