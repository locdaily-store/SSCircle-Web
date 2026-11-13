import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const code = readFileSync(new URL('../_worker.js', import.meta.url), 'utf8');
const worker = (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE submissions(id TEXT PRIMARY KEY,status TEXT,tracking_code TEXT,submitted_at TEXT); CREATE TABLE revoked_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER); CREATE TABLE form_config(id INTEGER PRIMARY KEY,settings TEXT,pages TEXT,questions TEXT,updated_at TEXT); CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER,expires_at INTEGER);');
  const id = '11111111-1111-4111-8111-111111111111';
  db.prepare('INSERT INTO submissions VALUES(?,?,?,?)').run(id, 'accepted', 'AAAABBBBCCCCDDDD0000', '2026-11-13');

  const DB = {
    prepare(sql) {
      const statement = db.prepare(sql);
      let args = [];
      return {
        bind(...values) {args = values; return this;},
        async run() {
          const result = statement.run(...args);
          return {meta: {changes: result.changes}};
        },
        async first() {return statement.get(...args) || null;},
        async all() {return {results: statement.all(...args)};}
      };
    },
    async batch(statements) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const items = [];
        for (const statement of statements) items.push(await statement.run());
        db.exec('COMMIT');
        return items;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  };

  const secret = 'notices-test-secret', password = 'notices-test-password';
  const part = Buffer.from(JSON.stringify({exp: Math.floor(Date.now() / 1000) + 3600}))
    .toString('base64url');
  const cookie = 'ssc_s6_admin=' + part + '.' +
    createHmac('sha256', secret + '|' + password).update(part).digest('base64url');
  const env = {DB, ADMIN_PASSWORD: password, SESSION_SECRET: secret,
    ASSETS: {fetch: async () => new Response('asset', {status: 200})}};

  async function call(method, payload) {
    const response = await worker.fetch(new Request('https://sscircle.test/api/admin/notifications', {
      method,
      headers: {
        Cookie: cookie,
        Origin: 'https://sscircle.test',
        ...(payload ? {'Content-Type': 'application/json'} : {})
      },
      ...(payload ? {body: JSON.stringify(payload)} : {})
    }), env);
    return {status: response.status, body: await response.json()};
  }
  return {db, id, call};
}

test('hapus pengumuman permanen juga menghapus tanda baca', async () => {
  const t = setup();
  assert.equal((await t.call('GET')).status, 200);
  const posted = await t.call('POST', {
    title: 'Pengumuman event', content: 'Kegiatan komunitas hari ini',
    priority: 'normal', audience: 'accepted', link: ''
  });
  assert.equal(posted.status, 201, JSON.stringify(posted.body));
  const id = posted.body.id;
  t.db.prepare('INSERT INTO notice_receipts(application_id,notice_id,read_at) VALUES(?,?,?)')
    .run(t.id, id, new Date().toISOString());

  assert.equal((await t.call('DELETE', {id, mode: 'archive'})).status, 200);
  assert.equal((await t.call('GET')).body.items[0].id, id);
  assert.equal((await t.call('DELETE', {id, mode: 'delete'})).status, 200);
  assert.equal((await t.call('GET')).body.items.length, 0);
  assert.equal(t.db.prepare('SELECT COUNT(*) AS total FROM notice_receipts').get().total, 0);
});

test('hapus seluruh arsip tidak menghapus pengumuman aktif', async () => {
  const t = setup();
  const publish = title => t.call('POST', {
    title, content: 'Pesan pengumuman SSCircle',
    priority: 'normal', audience: 'accepted', link: ''
  });
  const old = await publish('Pengumuman lama');
  const current = await publish('Pengumuman aktif');
  assert.equal(old.status, 201);
  assert.equal(current.status, 201);
  assert.equal((await t.call('DELETE', {id: old.body.id, mode: 'archive'})).status, 200);
  assert.equal((await t.call('DELETE', {mode: 'delete-archived'})).status, 400);
  const cleared = await t.call('DELETE', {
    mode: 'delete-archived', confirmation: 'HAPUS RIWAYAT'
  });
  assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
  assert.equal(cleared.body.deleted, 1);
  const remaining = (await t.call('GET')).body.items;
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, current.body.id);
});
