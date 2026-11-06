// Pengujian sederhana Worker tanpa membuka database produksi.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const code = readFileSync(new URL('../_worker.js', import.meta.url), 'utf8');
const worker = (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
const secret = 'test-only-session', password = 'test-only-password';
const id = '11111111-1111-4111-8111-111111111111';
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = (value, key) => value + '.' + createHmac('sha256', key).update(value).digest('base64url');
const adminCookie = 'ssc_s6_admin=' + sign(encode({ exp: Math.floor(Date.now() / 1000) + 3600 }), secret + '|' + password);
const playerCookie = 'ssc_player=' + sign(encode({ id, exp: Math.floor(Date.now() / 1000) + 3600 }), secret + '|player-session');

function setup() {
  const row = { settings: '{}', pages: JSON.stringify([{ id: 'page-1', title: 'Pendaftaran', description: '', blocks: [], routes: {}, routeQuestionId: '' }]), questions: '[]', updated_at: 'rev-one' };
  let status = 'accepted';
  const DB = { prepare(sql) {
    return {
      args: [],
      bind(...args) { this.args = args; return this; },
      async first() {
        if (/FROM revoked_sessions/.test(sql)) return null;
        if (/FROM form_config/.test(sql)) return { ...row };
        if (/FROM submissions/.test(sql)) return { id, status, tracking_code: 'AAAABBBBCCCCDDDDEEEE', submitted_at: '2026-11-06' };
        if (/FROM media/.test(sql)) return { id: this.args[0] };
        throw Error('Missing DB mock: ' + sql);
      },
      async run() {
        if (/UPDATE form_config/.test(sql) && /COALESCE\(updated_at,''\)=\?/.test(sql)) {
          if ((row.updated_at || '') !== this.args.at(-1)) return { meta: { changes: 0 } };
          const [settings, pages, questions, revision] = this.args;
          row.settings = settings; row.pages = pages; row.questions = questions; row.updated_at = revision;
          return { meta: { changes: 1 } };
        }
        throw Error('Missing DB update mock: ' + sql);
      }
    };
  }};
  return { row, setStatus: next => { status = next; }, env: { DB, ADMIN_PASSWORD: password, SESSION_SECRET: secret, ASSETS: { fetch: async () => new Response('<html>Voting</html>', { status: 200 }) } } };
}
function fetchWorker(env, path, method = 'GET', payload, cookie = adminCookie) {
  return worker.fetch(new Request('https://sscircle.pages.dev' + path, { method, headers: { Origin: 'https://sscircle.pages.dev', Cookie: cookie, ...(payload ? { 'Content-Type': 'application/json' } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) }), env);
}
test('Admin menyimpan berdasarkan revisi; revisi lama ditolak', async () => {
  const { env, row } = setup();
  const initial = await (await fetchWorker(env, '/api/admin/form')).json();
  assert.equal(initial.revision, 'rev-one');
  const payload = { settings: initial.settings, pages: initial.pages, revision: initial.revision };
  const saved = await fetchWorker(env, '/api/admin/form', 'PUT', payload);
  assert.equal(saved.status, 200);
  const fresh = await (await fetchWorker(env, '/api/admin/form')).json();
  assert.notEqual(fresh.revision, initial.revision);
  assert.equal(row.updated_at, fresh.revision);
  assert.equal((await fetchWorker(env, '/api/admin/form', 'PUT', payload)).status, 409);
  assert.equal((await fetchWorker(env, '/api/admin/form', 'PUT', { settings: fresh.settings, pages: fresh.pages })).status, 428);
});
test('Halaman Voting hanya dapat dibuka dengan status diterima', async () => {
  const { env, setStatus } = setup();
  for (const [status, expected] of [['accepted',200],['pending',302],['rejected',302]]) {
    setStatus(status);
    const response = await fetchWorker(env, '/voting', 'GET', undefined, playerCookie);
    assert.equal(response.status, expected, status);
  }
  assert.equal((await fetchWorker(env, '/voting','GET',undefined,'')).status,302);
  setStatus('accepted');
  const response = await fetchWorker(env, '/voting.html','GET',undefined,playerCookie);
  assert.equal(response.status,302);
  assert.equal(new URL(response.headers.get('Location'),'https://sscircle.pages.dev').pathname,'/voting');
});
