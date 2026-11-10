import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const origin='https://sscircle.pages.dev';
const ready=()=>({
  DB:{prepare(sql){
    assert.match(sql,/sqlite_master/);
    return {async first(){return {name:'submissions'};}};
  }},
  SESSION_SECRET:'existing-session-secret',
  ADMIN_PASSWORD:'existing-admin-password',
  SSCIRCLE_LINK_SERVER_SECRET:'m'.repeat(48),
  ASSETS:{fetch:async()=>new Response('<html>Profile</html>',{status:200})}
});
const call=(env,path)=>worker.fetch(new Request(origin+path),env);

test('runtime readiness from live binding and existing schema',async()=>{
  const r=await call(ready(),'/api/health');
  assert.equal(r.status,200);
  const x=await r.json();
  assert.equal(x.release,'10.49.1.1');
  assert.equal(x.status,'ready');
  assert.equal(x.services.profile,'ready');
  assert.equal(x.services.admin,'ready');
  assert.equal(x.services.minecraft,'ready');
  assert.equal(x.checks.data,'ready');
  assert.equal(x.supportCode,'SSC-OK');
  assert.match(r.headers.get('cache-control'),/no-store/);
});
test('missing D1 binding gives safe support code and branded maintenance',async()=>{
  const env=ready();delete env.DB;
  const r=await call(env,'/api/health');
  const x=await r.json();
  assert.equal(x.checks.data,'binding-missing');
  assert.equal(x.services.profile,'maintenance');
  assert.equal(x.supportCode,'SSC-D01');
  const page=await call(env,'/my-sscircle');
  assert.equal(page.status,503);
  assert.match(page.headers.get('content-type'),/text\/html/);
  const body=await page.text();
  assert.match(body,/Profile sementara tidak tersedia/);
  assert.doesNotMatch(body,/SESSION_SECRET|Cloudflare D1|existing-session-secret|existing-admin-password/);
});
test('missing session and missing admin secret are distinguished',async()=>{
  const a=ready();delete a.SESSION_SECRET;
  const x=await (await call(a,'/api/health')).json();
  assert.equal(x.checks.data,'ready');
  assert.equal(x.checks.playerSession,'unavailable');
  assert.equal(x.supportCode,'SSC-S01');
  assert.equal((await call(a,'/my-sscircle')).status,503);
  const b=ready();delete b.ADMIN_PASSWORD;
  const y=await (await call(b,'/api/health')).json();
  assert.equal(y.services.profile,'ready');
  assert.equal(y.services.admin,'maintenance');
  assert.equal(y.supportCode,'SSC-A01');
  assert.equal((await call(b,'/my-sscircle')).status,302);
});
test('wrong/empty DB and query errors do not leak SQL errors',async()=>{
  const missing=ready();missing.DB.prepare=()=>({async first(){return null;}});
  const a=await (await call(missing,'/api/health')).json();
  assert.equal(a.checks.data,'schema-missing');
  assert.equal(a.services.profile,'maintenance');
  const broken=ready();broken.DB.prepare=()=>{throw Error('private-error-must-not-leak');};
  const response=await call(broken,'/api/health');
  const raw=await response.text();
  assert.match(raw,/query-failed/);
  assert.doesNotMatch(raw,/private-error-must-not-leak/);
});
test('public readiness never includes secret values or applicant rows',async()=>{
  const env=ready();
  const text=await (await call(env,'/api/health')).text();
  for(const val of [env.SESSION_SECRET,env.ADMIN_PASSWORD,env.SSCIRCLE_LINK_SERVER_SECRET])
    assert.equal(text.includes(val),false);
  assert.equal(text.includes('submissions'),false);
});
