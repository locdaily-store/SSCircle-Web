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

test('PWA install memberi petunjuk Safari tanpa memaksa browser yang tidak mendukung',()=>{
 const js=read('pwa-register.js');
 assert.match(js,/navigator\.maxTouchPoints>1/);
 assert.match(js,/beforeinstallprompt/);
 assert.match(js,/Tambahkan ke Layar Utama/);
 assert.match(js,/Tambahkan ke Dock/);
 assert.match(js,/window\.isSecureContext/);
 const manifest=JSON.parse(read('manifest.webmanifest'));
 assert.ok(manifest.categories.includes('games'));
 assert.ok(!manifest.categories.includes('social'));
 assert.ok(read('service-worker.js').includes('sscircle-public-v'+JSON.parse(read('package.json')).version));
});

test('V10.54 PWA displays the official website logo',()=>{
 const original=readFileSync(new URL('../assets/sscircle-logo.png',import.meta.url));
 const scalable=read('assets/sscircle-pwa-icon.svg');
 const embedded=/data:image\/png;base64,([A-Za-z0-9+/=]+)/.exec(scalable)?.[1];
 assert.ok(embedded,'Scalable icon must embed the original PNG');
 assert.deepEqual(Buffer.from(embedded,'base64'),original,'Icon artwork must be identical to official logo');
 assert.doesNotMatch(scalable,/<path\b/,'No substitute logo or recreated artwork');
 const manifest=JSON.parse(read('manifest.webmanifest'));
 assert.equal(manifest.icons[0].src,'/assets/sscircle-logo.png');
 assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'));
 assert.ok(read('service-worker.js').includes('sscircle-public-v'+JSON.parse(read('package.json')).version));
});
