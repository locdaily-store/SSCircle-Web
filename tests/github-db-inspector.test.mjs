import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const code = readFileSync(new URL('../_worker.js', import.meta.url), 'utf8');
const worker = (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
const ORIGIN = 'https://locdaily-store.github.io';
const KEY = 'inspector-test-key-not-a-real-production-key-123456789';
function mockEnvironment(options = {}) {
  const queried = [];
  const env = {
    DB: {
      prepare(sql) {
        queried.push(sql);
        return {
          bind() { return this; },
          async run() {
            if (/INSERT INTO rate_limits/.test(sql)) return { meta:{ changes:1 } };
            throw Error('Unrecognized write: ' + sql);
          },
          async first() {
            if (/SELECT count FROM rate_limits/.test(sql)) return { count:1 };
            if (/COUNT\(\*\)/.test(sql)) return { total:7 };
            throw Error('Unrecognized read: ' + sql);
          },
          async all() {
            if (/sqlite_master/.test(sql)) return { results:[
              {name:'applications'}, {name:'submissions'}, {name:'member_profiles'}] };
            if (/PRAGMA table_info/.test(sql)) return { results:[
              {name:'id',type:'TEXT',notnull:1,pk:1},
              {name:'password_hash',type:'TEXT',notnull:0,pk:0}] };
            throw Error('Unrecognized listing: ' + sql);
          }
        };
      }
    },
    SESSION_SECRET:'unit-test-only',
    SSCIRCLE_GITHUB_INSPECTOR_TOKEN:KEY,
    ...options
  };
  return { env, queried };
}
function fetchInspector(env, { method='GET', path='', token=KEY, origin=ORIGIN }={}) {
  const headers = {};
  if (origin !== null) headers.Origin = origin;
  if (token !== null) headers.Authorization = 'Bearer ' + token;
  return worker.fetch(new Request('https://example.pages.dev/api/github/database/inspect' + path,
    { method, headers }), env);
}
test('Inspector refuses unconfigured, missing and invalid keys before any DB read', async () => {
  const { env, queried }=mockEnvironment();
  assert.equal((await fetchInspector({...env,SSCIRCLE_GITHUB_INSPECTOR_TOKEN:''})).status,503);
  assert.equal((await fetchInspector(env,{token:null})).status,401);
  assert.equal((await fetchInspector(env,{token:'x'.repeat(35)})).status,401);
  assert.equal(queried.length,0);
});
test('Inspector enforces exact GitHub Pages origin and CORS preflight', async () => {
  const { env, queried }=mockEnvironment();
  const forbidden=await fetchInspector(env,{origin:'https://untrusted.example'});
  assert.equal(forbidden.status,403);
  assert.equal(forbidden.headers.get('access-control-allow-origin'),null);
  const preflight=await fetchInspector(env,{method:'OPTIONS',token:null});
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('access-control-allow-origin'),ORIGIN);
  assert.match(preflight.headers.get('access-control-allow-headers'),/Authorization/i);
  assert.equal(queried.length,0);
});
test('Inspector lists table names only, never records or credentials', async () => {
  const { env, queried }=mockEnvironment();
  const response=await fetchInspector(env);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const body=await response.json();
  assert.deepEqual(body.tables,['applications','submissions','member_profiles']);
  assert.equal(body.source,'live');
  assert.equal(body.rows,undefined);
  assert.equal(body.records,undefined);
  assert.equal(body.token,undefined);
  assert.ok(queried.every(sql=>!/SELECT \*/i.test(sql)));
});
test('Inspector displays one allowlisted table schema and count, not actual values', async () => {
  const { env, queried }=mockEnvironment();
  const response=await fetchInspector(env,{path:'?table=submissions'});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.table.rowCount,7);
  assert.deepEqual(body.table.columns.map(x=>x.name),['id','password_hash']);
  assert.equal(body.table.columns[0].primaryKey,true);
  assert.equal(body.table.rows,undefined);
  assert.equal(queried.filter(sql=>/COUNT\(\*\)/.test(sql)).length,1);
  const attack=await fetchInspector(env,{path:'?table=' + encodeURIComponent('submissions";DROP TABLE users;--')});
  assert.equal(attack.status,404);
});
test('Inspector rejects mutations and never issues write query except rate limiting', async () => {
  const { env, queried }=mockEnvironment();
  assert.equal((await fetchInspector(env,{method:'POST'})).status,405);
  assert.ok(queried.every(sql=>!/(?:UPDATE |DELETE FROM|DROP TABLE|ALTER TABLE)/i.test(sql)));
});
test('GitHub Pages inspector does not embed access tokens or expose raw record previews',()=>{
  const html=readFileSync(new URL('../docs/database-inspector/index.html',import.meta.url),'utf8');
  assert.match(html,/type="password"/);
  assert.match(html,/credentials:'omit'/);
  assert.match(html,/cache:'no-store'/);
  assert.match(html,/textContent/);
  assert.doesNotMatch(html,/localStorage|sessionStorage/);
  assert.doesNotMatch(html,/SELECT\s+\*/i);
});
