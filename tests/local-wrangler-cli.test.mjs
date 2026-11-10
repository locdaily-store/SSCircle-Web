import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const sourceRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');

test('Wrangler 4.160.0: D1 --local and Pages dev CLI binding are compatible',()=>{
  const fixture=mkdtempSync(join(tmpdir(),'sscircle-wrangler-local-'));
  const add=(relative,data)=>{
    const out=join(fixture,relative);
    mkdirSync(dirname(out),{recursive:true});
    writeFileSync(out,data,'utf8');
  };
  const copy=(relative)=>{
    const out=join(fixture,relative);
    mkdirSync(dirname(out),{recursive:true});
    copyFileSync(join(sourceRoot,relative),out);
  };
  try{
    for(const name of ['scripts/local-dev.mjs','scripts/build-local.mjs',
      'wrangler.local.toml','dev/local-schema.sql','dev/local-seed.sql'])copy(name);
    add('package.json','{"name":"mock-sscircle-local","private":true}');
    add('index.html','<!doctype html><title>Local fixture</title>');
    add('_worker.js','export default {fetch: () => new Response("ok")};');
    add('node_modules/wrangler/bin/wrangler.js',
      "import {appendFileSync} from 'node:fs';"+
      "appendFileSync('calls.jsonl', JSON.stringify(process.argv.slice(2))+'\\n');");

    const execute=action=>{
      const result=spawnSync(process.execPath,[join(fixture,'scripts/local-dev.mjs'),action],
        {cwd:fixture,encoding:'utf8',timeout:10000});
      assert.equal(result.status,0,(result.stdout||'')+'\n'+(result.stderr||''));
    };
    execute('init');
    execute('check');
    execute('dev');
    const args=readFileSync(join(fixture,'calls.jsonl'),'utf8')
      .trim().split(/\r?\n/).map(x=>JSON.parse(x));
    assert.equal(args.length,6);
    for(const row of args.slice(0,5)){
      assert.deepEqual(row.slice(0,3),['d1','execute','DB']);
      assert.ok(row.includes('--local'), 'D1 wajib lokal');
      assert.ok(!row.includes('--preview'), '--preview menyebabkan error 4.160.0');
      assert.ok(!row.includes('--remote'), 'jangan pernah menulis D1 production');
      assert.equal(row[row.indexOf('--config')+1],join(fixture,'wrangler.local.toml'));
      assert.equal(row[row.indexOf('--persist-to')+1],join(fixture,'.wrangler/state'));
    }
    assert.ok(args[0].includes('--yes') && args[1].includes('--yes'));
    assert.ok(args[2].includes('--command'));
    const pages=args[5];
    assert.deepEqual(pages.slice(0,2),['pages','dev']);
    assert.ok(!pages.includes('--config'),'Pages 4.160.0 rejects --config');
    assert.ok(!pages.includes('--remote'),'Pages must not access production');
    assert.equal(pages[pages.indexOf('--d1')+1],'DB=DB');
    assert.equal(pages[pages.indexOf('--persist-to')+1],join(fixture,'.wrangler/state'));
    assert.equal(pages[pages.indexOf('--ip')+1],'127.0.0.1');
    assert.equal(pages[pages.indexOf('--port')+1],'8788');
    assert.deepEqual(pages.filter(x=>x.startsWith('MEDIA_MODE=') || x.startsWith('STORAGE_LIMIT_MB=')),
      ['MEDIA_MODE=D1','STORAGE_LIMIT_MB=500']);
    assert.match(readFileSync(join(fixture,'wrangler.local.toml'),'utf8'),
      /preview_database_id\s*=\s*"DB"/);
  }finally{rmSync(fixture,{recursive:true,force:true});}
});

test('local bootstrap refuses default root wrangler config that Pages would auto-load',()=>{
  const fixture=mkdtempSync(join(tmpdir(),'sscircle-wrangler-guard-'));
  const put=(relative,content)=>{const dest=join(fixture,relative);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,content);};
  try{
    for(const file of ['scripts/local-dev.mjs','scripts/build-local.mjs','wrangler.local.toml']){
      const dest=join(fixture,file);mkdirSync(dirname(dest),{recursive:true});copyFileSync(join(sourceRoot,file),dest);
    }
    put('package.json','{"private":true,"type":"module"}');
    put('wrangler.toml','name = "this-may-be-production"');
    const run=spawnSync(process.execPath,[join(fixture,'scripts/local-dev.mjs'),'dev'],{cwd:fixture,encoding:'utf8'});
    assert.equal(run.status,1);
    assert.match(run.stderr,/Ditemukan wrangler.toml/);
    assert.ok(!run.stderr.includes('secret'));
  }finally{rmSync(fixture,{recursive:true,force:true});}
});
