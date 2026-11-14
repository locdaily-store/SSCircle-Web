import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Desktop and mobile navigation show unseen published updates, not draft records',()=>{
 const nav=source('public-unified.js'),css=source('public-unified.css'),worker=source('_worker.js');
 assert.match(nav,/data-nav-update/);
 assert.match(nav,/data-nav-total/);
 assert.match(nav,/sscircle-nav-seen-v1-/);
 assert.match(nav,/localStorage\.setItem/);
 assert.match(nav,/api\/public\/nav-updates/);
 assert.match(nav,/isCurrent\(kind\)/);
 assert.match(css,/ssc-hamburger-notice/);
 assert.match(css,/ssc-nav-notice/);
 assert.match(worker,/path==='\/api\/public\/nav-updates'/);
 assert.match(worker,/status='published'/);
 assert.match(worker,/published_at<=\?/);
 assert.match(worker,/eventsEnabled!==false/);
 assert.match(worker,/Date\.parse\(e\.endAt\)>Date\.now\(\)/);
});
test('Page-specific closed message is used rather than status checks for disabled pages',()=>{
 const worker=source('_worker.js'),closed=source('page-closed.js'),html=source('page-closed.html');
 for(const section of ['voting','events','announcements','gallery','guide','seasons','registration']){
   assert.ok(closed.includes(section+':'),section+' closure content missing');
 }
 assert.match(worker,/Location:'\/page-closed\.html\?section=voting'/);
 assert.match(worker,/Location:'\/page-closed\.html\?section=seasons'/);
 assert.match(worker,/Location:'\/page-closed\.html\?section=registration'/);
 assert.match(worker,/closedSection/);
 assert.match(worker,/settings\.eventsEnabled===false/);
 assert.match(worker,/settings\.galleryPageEnabled===false/);
 assert.match(worker,/settings\.gettingStarted\?\.enabled===false/);
 assert.match(worker,/sscAnnouncementSettings\(parse\(row\?\.settings\)\)\.enabled/);
 assert.match(html,/id="ssc-closed-title"/);
});
test('Closed and extensionless public routes are handled by Worker',()=>{
 const routes=JSON.parse(source('_routes.json'));
 const checked=['/voting','/voting.html','/events','/events.html','/announcements','/announcements.html','/gallery','/gallery.html','/how-to-play','/how-to-play.html','/seasons','/seasons.html','/registration','/registration.html'];
 for(const path of checked)assert.ok(routes.include.includes(path),'Worker route missing: '+path);
 assert.match(source('page-closed.js'),/textContent/);
 for(const name of ['public-unified.js','page-closed.js'])assert.doesNotThrow(()=>new Function(source(name)),name);
});
