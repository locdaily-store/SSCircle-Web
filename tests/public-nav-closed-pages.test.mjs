import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Announcement and Event badges are rendered in shared desktop/mobile navigation',()=>{
 const nav=src('public-unified.js'),css=src('public-unified.css');
 assert.match(nav,/data-nav-update/);
 assert.match(nav,/data-nav-total/);
 assert.match(nav,/\/api\/public\/nav-updates/);
 assert.match(nav,/sscircle-nav-seen-v1-/);
 assert.match(nav,/localStorage\.setItem/);
 assert.match(nav,/const seenPrefix='sscircle-nav-seen-v1-'/);
 assert.match(nav,/const unread=visiting\?0:/);
 assert.match(nav,/mobile\.hidden=total===0/);
 assert.match(nav,/visibilitychange/);
 assert.match(nav,/120000/);
 assert.match(nav,/menu\.setAttribute\('aria-label',total/);
 assert.match(css,/ssc-hamburger-notice/);
 assert.match(css,/home-menu-button\{overflow:visible\}/);
 assert.match(css,/ssc-nav-notice\[hidden\]/);
});

test('Public updates endpoint only returns published announcements and current events',()=>{
 const worker=src('_worker.js');
 assert.match(worker,/path==='\/api\/public\/nav-updates'/);
 assert.match(worker,/status='published'/);
 assert.match(worker,/published_at<=\?/);
 assert.match(worker,/Date\.parse\(e\.endAt\)>Date\.now\(\)/);
 assert.match(worker,/eventsEnabled!==false/);
});

test('Closed and expired voting routes show the dedicated closed-page, not Cek Status',()=>{
 const worker=src('_worker.js'),voting=src('voting.js'),page=src('page-closed.js');
 assert.match(worker,/!votingRuntime\(voteSettings\)\.active/);
 assert.match(worker,/Location:'\/page-closed\.html\?section=voting'/);
 assert.match(voting,/location\.replace\('\/page-closed\.html\?section=voting'\)/);
 assert.match(page,/voting:\['Voting sedang ditutup'/);
});

test('Other disabled public pages have individual closed-page messages',()=>{
 const worker=src('_worker.js'),page=src('page-closed.js');
 for(const section of ['events','announcements','gallery','guide','seasons','registration']){
   assert.ok(page.includes(section+':['),section+' missing closed-page message');
 }
 assert.match(worker,/Location:'\/page-closed\.html\?section='\+closedSection/);
 assert.match(worker,/settings\.eventsEnabled===false/);
 assert.match(worker,/settings\.galleryPageEnabled===false/);
 assert.match(worker,/settings\.gettingStarted\?\.enabled===false/);
 assert.match(worker,/settings\.seasonArchiveEnabled!==true/);
});
