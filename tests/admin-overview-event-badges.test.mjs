import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('pending event proposals drive sidebar and collapsed mobile navigation badges',()=>{
  const page=src('admin.html'),editor=src('community-events-admin.js'),worker=src('_worker.js'),css=src('overview-dashboard.css');
  assert.match(page,/id="community-event-badge"/);
  assert.match(page,/id="community-event-mobile-badge"/);
  assert.match(page,/id="admin-nav-toggle"/);
  assert.match(editor,/\/api\/admin\/community\/events\/pending-count/);
  assert.match(editor,/getElementById\('community-event-mobile-badge'\)/);
  assert.match(editor,/badge\.hidden=count===0/);
  assert.match(editor,/new CustomEvent\('sscircle:event-proposals-pending'/);
  assert.match(editor,/window\.addEventListener\('focus'/);
  assert.match(editor,/visibilitychange/);
  assert.match(worker,/COUNT\(\*\) AS total FROM community_event_proposals WHERE status='pending'/);
  assert.match(css,/\.community-event-mobile-badge\[hidden\]/);
  assert.match(css,/\.sidebar-mobile-toggle \.community-event-mobile-badge/);
});
test('Overview dashboard shows real membership totals and actionable pending event queue',()=>{
  const overview=src('overview-dashboard.js'),css=src('overview-dashboard.css'),page=src('admin.html');
  assert.match(overview,/data\?\.submissions/);
  assert.match(overview,/ssc-overview-operational-tiles/);
  assert.match(overview,/ssc-overview-event-pending/);
  assert.match(overview,/sscircle:event-proposals-pending/);
  assert.match(overview,/eventPendingChanged/);
  assert.match(overview,/community-events-admin/);
  assert.match(overview,/\/api\/admin\/announcements/);
  assert.match(page,/id="overview-insights"/);
  assert.match(css,/\.ssc-overview-operational-tiles/);
  assert.match(css,/@media\(max-width:480px\)/);
});
test('Changed Admin Control scripts load with fresh asset version',()=>{
  const page=src('admin.html');
  for(const file of ['overview-dashboard.js','overview-dashboard.css','community-events-admin.js']){
    assert.ok(page.includes(file+'?v=10.61.0'),file+' should refresh cache');
  }
});
test('Dashboard Javascript has valid syntax',()=>{
  for(const path of ['overview-dashboard.js','community-events-admin.js']){
    assert.doesNotThrow(()=>new Function(src(path)),path);
  }
});
