import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync, statSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildLocal} from '../scripts/build-local.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const source=readFileSync(resolve(root,'_worker.js'),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const sessionSecret='local-only-test-session-not-live';
const adminPassword='local-only-test-admin';
function dbFixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(readFileSync(resolve(root,'dev/local-schema.sql'),'utf8'));
 sqlite.exec(readFileSync(resolve(root,'dev/local-seed.sql'),'utf8'));
 sqlite.exec(readFileSync(resolve(root,'dev/local-seed.sql'),'utf8'));
 const DB={prepare(sql){let args=[];const stmt=sqlite.prepare(sql);return {
    bind(...v){args=v;return this;},async first(){return stmt.get(...args)||null;},
    async all(){return {results:stmt.all(...args)};},async run(){const r=stmt.run(...args);return {meta:{changes:r.changes}};}
  };}, async batch(stmts){
    sqlite.exec('BEGIN IMMEDIATE');try{const rows=[];for(const s of stmts)rows.push(await s.run());sqlite.exec('COMMIT');return rows;}
    catch(e){sqlite.exec('ROLLBACK');throw e;}
  }};
 const env={DB,SESSION_SECRET:sessionSecret,ADMIN_PASSWORD:adminPassword,MEDIA_MODE:'D1',
   SSCIRCLE_LINK_SERVER_SECRET:'x'.repeat(48),ASSETS:{fetch:async()=>new Response('<html>LOCAL</html>',{headers:{'Content-Type':'text/html'}})}};
 async function call(path,init={}){
   const response=await worker.fetch(new Request('http://localhost:8788'+path,init),env);
   let payload=null;try{payload=await response.clone().json();}catch{}
   return {response,payload,status:response.status};
 }
 return {sqlite,env,call};
}
test('localhost config selalu menggunakan DB sintetis, tanpa database production',()=>{
 const cfg=readFileSync(resolve(root,'wrangler.local.toml'),'utf8');
 assert.match(cfg,/preview_database_id\s*=\s*"DB"/);
 assert.match(cfg,/database_name\s*=\s*"sscircle-local"/);
 assert.match(cfg,/00000000-0000-4000-8000-000000000001/);
 assert.doesNotMatch(cfg,/pages_build_output_dir\s*=/);
 assert.doesNotMatch(cfg,/\bremote\s*=\s*true/);
});
test('builder hanya menyertakan aset publik/worker dan menyembunyikan dev/tools/SQL/secret',()=>{
 const result=buildLocal();const out=result.output;
 for(const f of ['_worker.js','_routes.json','index.html','admin.html','my-sscircle.html','assets/sscircle-logo.png'])
   assert.ok(existsSync(resolve(out,f)),f);
 for(const f of ['package.json','wrangler.local.toml','dev','scripts','tests','node_modules','.dev.vars','.dev.vars.example','.github','.gitignore','.vscode'])
   assert.equal(existsSync(resolve(out,f)),false,f);
});
test('local D1 schema dan data uji dapat dijalankan ulang tanpa duplikasi',()=>{
 const {sqlite}=dbFixture();
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM submissions').get().n,2);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_config').get().n,1);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM media_blobs').get().n,0);
});
test('halaman dan API lokal membaca D1 termasuk form, events, rules, status, session, admin',async()=>{
 const {call}=dbFixture();
 const health=await call('/api/health');
 assert.equal(health.status,200);
 assert.equal(health.payload.status,'ready',JSON.stringify(health.payload));
 assert.equal(health.payload.checks.data,'ready');
 for(const endpoint of ['/api/form','/api/rules','/api/events']){
  const result=await call(endpoint);
  assert.equal(result.status,200,endpoint+': '+JSON.stringify(result.payload));
 }
 const form=(await call('/api/form')).payload;
 assert.ok(form.pages.length>0);
 const status=await call('/api/status-check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'A1B2C3D4E5F601234567'})});
 assert.equal(status.status,200,JSON.stringify(status.payload));
 assert.equal(status.payload.status,'accepted');
 const login=await call('/api/player/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'A1B2C3D4E5F601234567'})});
 assert.equal(login.status,200,JSON.stringify(login.payload));
 const token=login.response.headers.get('set-cookie')?.match(/ssc_player=([^;]+)/)?.[1];
 assert.ok(token);
 const profile=await call('/my-sscircle',{headers:{Cookie:'ssc_player='+token}});
 assert.equal(profile.status,200,JSON.stringify(profile.payload));
 const me=await call('/api/player/me',{headers:{Cookie:'ssc_player='+token}});
 assert.equal(me.status,200);
 const guest=await call('/my-sscircle');assert.equal(guest.status,302);
 const admin=await call('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:adminPassword})});
 assert.equal(admin.status,200,JSON.stringify(admin.payload));
 const adminToken=admin.response.headers.get('set-cookie')?.match(/ssc_s6_admin=([^;]+)/)?.[1];
 assert.ok(adminToken);
 const adminForm=await call('/api/admin/form',{headers:{Cookie:'ssc_s6_admin='+adminToken}});
 assert.equal(adminForm.status,200,JSON.stringify(adminForm.payload));
});
test('pendaftaran contoh lokal benar-benar menulis ke DB dan terlihat admin',async()=>{
 const {call,sqlite}=dbFixture();
 const before=sqlite.prepare('SELECT COUNT(*) AS n FROM submissions').get().n;
 const applied=await call('/api/apply',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({answers:{'q-demo-nickname':'VisitorLocal'}})});
 assert.equal(applied.status,201,JSON.stringify(applied.payload));
 assert.match(applied.payload.reference,/^[A-F0-9]{20}$/);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM submissions').get().n,before+1);
 const checked=await call('/api/status-check',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({code:applied.payload.reference})});
 assert.equal(checked.status,200);
 assert.equal(checked.payload.status,'pending');
});
test('form/voting dari seed lokal tersedia tanpa data produksi',async()=>{
 const {call}=dbFixture();
 const login=await call('/api/player/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'A1B2C3D4E5F601234567'})});
 assert.equal(login.status,200);
 const token=login.response.headers.get('set-cookie')?.match(/ssc_player=([^;]+)/)?.[1];
 const got=await call('/api/voting',{headers:{Cookie:'ssc_player='+token}});
 assert.equal(got.status,200,JSON.stringify(got.payload));
 assert.equal(got.payload.enabled,true);
 assert.ok(got.payload.questions.length>=1);
 assert.ok(got.payload.questions[0].options.length>=2);
});
