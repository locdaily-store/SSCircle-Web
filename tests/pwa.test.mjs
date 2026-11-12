import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('PWA SSCircle memiliki manifest, jalur instalasi, dan halaman offline',()=>{
 const manifest=JSON.parse(read('manifest.webmanifest'));
 assert.equal(manifest.name,'SSCircle Server');
 assert.equal(manifest.display,'standalone');
 assert.ok(manifest.icons.some(x=>x.type==='image/svg+xml'&&x.sizes==='any'));
 for(const name of ['service-worker.js','pwa-register.js','pwa-ui.css','offline.html','assets/sscircle-pwa-icon.svg'])
  assert.ok(existsSync(new URL('../'+name,import.meta.url)),name);
 assert.match(read('pwa-register.js'),/beforeinstallprompt/);
 assert.match(read('pwa-register.js'),/serviceWorker\.register/);
 assert.match(read('offline.html'),/Koneksi terputus/);
});
test('PWA tidak menyimpan data anggota, admin, ataupun respons API secara offline',()=>{
 const sw=read('service-worker.js');
 assert.match(sw,/path\.startsWith\('\/api\/'\)/);
 for(const root of ['/admin','/my-sscircle','/mailbox','/status','/registration'])
  assert.ok(sw.includes("path.startsWith('"+root+"')"),root);
 assert.match(sw,/req\.mode==='navigate'/);
 assert.doesNotMatch(sw,/caches\.open\(.*member|cache\.put\(.*\/api/i);
});
test('halaman umum merujuk manifest aplikasi dan tidak mengganti navigasi Profile',()=>{
 const html=read('my-sscircle.html');
 assert.match(html,/rel="manifest"/);
 assert.match(html,/notification-preferences\.js/);
 for(const name of ['index.html','events.html','mailbox.html'])
  assert.match(read(name),/rel="manifest"/,name);
 assert.equal((html.match(/data-profile-section="preferences"/g)||[]).length,1);
});
