// SSCircle local bootstrap: intentionally *no* Cloudflare API access.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { buildLocal } from './build-local.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const config=resolve(root,'wrangler.local.toml');
const vars=resolve(root,'.dev.vars');
const cli=resolve(root,'node_modules/wrangler/bin/wrangler.js');
// D1 command can use a custom config, but Wrangler 4.160.0 Pages dev cannot.
// Pages dev binds D1 using CLI flags instead, with the SAME local persistence key "DB".
const persistence=resolve(root,'.wrangler/state');
const d1Options=['--config',config,'--persist-to',persistence];
const pagesOptions=['--ip','127.0.0.1','--port','8788',
  '--compatibility-date','2026-11-10',
  '--d1','DB=DB',
  '--binding','MEDIA_MODE=D1',
  '--binding','STORAGE_LIMIT_MB=500',
  '--persist-to',persistence];

export function generateLocalVars(){
  if(existsSync(vars))return {created:false};
  const secret=()=>randomBytes(48).toString('base64url');
  const content='# HANYA LOCALHOST. JANGAN DI-COMMIT, JANGAN PAKAI SECRET PRODUCTION.\n'
    +'SESSION_SECRET='+secret()+'\n'
    +'ADMIN_PASSWORD='+randomBytes(20).toString('base64url')+'\n'
    +'SSCIRCLE_LINK_SERVER_SECRET='+secret()+'\n';
  writeFileSync(vars,content,{mode:0o600,flag:'wx'});
  return {created:true};
}
export function assertLocalOnly(){
  for(const candidate of ['wrangler.toml','wrangler.json','wrangler.jsonc']){
    if(existsSync(resolve(root,candidate)))
      throw Error('Ditemukan '+candidate+' di root. Pages otomatis membacanya; '
        +'pindahkan konfigurasi production tersebut ke tempat aman dahulu sebelum menjalankan localhost.');
  }
  const cfg=readFileSync(config,'utf8');
  if(!/database_name\s*=\s*"sscircle-local"/.test(cfg)
    || !/preview_database_id\s*=\s*"DB"/.test(cfg)
    || !/database_id\s*=\s*"00000000-0000-4000-8000-000000000001"/.test(cfg)
    || /pages_build_output_dir\s*=/.test(cfg))
    throw Error('Konfigurasi dev bukan DB sintetis. Operasi dibatalkan.');
}
function wrangler(args, wait=true){
  if(!existsSync(cli))throw Error('Wrangler belum terpasang. Jalankan: npm install');
  if(wait){
    const result=spawnSync(process.execPath,[cli,...args],{cwd:root,stdio:'inherit'});
    if(result.error)throw result.error;
    if(result.status!==0)throw Error('Perintah Wrangler gagal (exit '+result.status+').');
    return;
  }
  const child=spawn(process.execPath,[cli,...args],{cwd:root,stdio:'inherit'});
  for(const name of ['SIGINT','SIGTERM'])process.on(name,()=>child.kill(name));
  child.on('exit',(code,signal)=>process.exitCode=code ?? (signal?1:0));
}
function initialize(){
  assertLocalOnly();
  const result=buildLocal();
  console.log(`[SSCircle] Build .local-pages: ${result.files} file frontend dan Worker.`);
  const secret=generateLocalVars();
  if(secret.created)console.log('[SSCircle] Password dan secret dev dibuat di .dev.vars (jangan diunggah).');
  const runSQL=file=>{
    console.log('[SSCircle] D1 lokal: '+file);
    wrangler(['d1','execute','DB','--local','--yes','--file',resolve(root,'dev',file),...d1Options]);
  };
  runSQL('local-schema.sql');
  runSQL('local-seed.sql');
  console.log('[SSCircle] DB lokal siap. Contoh: A1B2C3D4E5F601234567 (diterima); B1B2C3D4E5F601234567 (menunggu).');
}
const action=process.argv[2]||'dev';
try{
  if(!['init','dev','check'].includes(action))throw Error('Opsi tidak dikenal: '+action);
  assertLocalOnly();
  if(action==='check'){
    wrangler(['d1','execute','DB','--local','--command',
      "SELECT (SELECT COUNT(*) FROM submissions) AS submissions, (SELECT COUNT(*) FROM form_config) AS form_config;",
      ...d1Options]);
  }else{
    initialize();
    if(action==='dev'){
      console.log('\n[SSCircle] Buka http://localhost:8788 (hanya di PC ini).');
      console.log('[SSCircle] Admin: http://localhost:8788/admin.html');
      console.log('[SSCircle] Password admin lokal tersimpan di .dev.vars');
      console.log('[SSCircle] Pages memakai --d1 DB=DB, data tetap lokal di .wrangler/state\n');
      wrangler(['pages','dev',resolve(root,'.local-pages'),...pagesOptions],false);
    }
  }
}catch(error){console.error('[SSCircle localhost] '+error.message);process.exitCode=1;}
