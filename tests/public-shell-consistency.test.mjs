import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('community event and achievement headings use the same stacked structure',()=>{
  const html=source('admin.html'),css=source('community-events-admin.css');
  for(const id of ['community-events-admin','achievements-admin']){
    assert.match(html,new RegExp('id="'+id+'"[\\s\\S]*?dashboard-heading ssc-stacked-heading'));
  }
  assert.match(css,/ssc-stacked-heading-copy/);
  assert.match(css,/flex-direction:column/);
});
test('homepage gallery link uses palette-managed button instead of a hard-coded inline style',()=>{
  const html=source('index.html'),css=source('public-unified.css');
  assert.match(html,/class="home-button home-button-secondary ssc-gallery-all-button"/);
  assert.match(css,/--ssc-button-secondary/);
  assert.doesNotMatch(html,/class="home-nav-join" style="display:table/);
});
test('shared shell provides consistent navigation, active-state, mobile menu and footer',()=>{
  const script=source('public-unified.js'),css=source('public-unified.css');
  new Function(script);
  assert.match(script,/event\.stopImmediatePropagation\(\)/);
  assert.match(script,/ssc-menu-visible/);
  assert.match(script,/refreshActiveLinks/);
  assert.match(script,/ssc-public-inner/);
  assert.match(script,/aria-current/);
  assert.match(script,/One circle\. Endless stories/);
  assert.match(css,/body\.ssc-public-inner \.ssc-site-header/);
  assert.match(css,/\.ssc-menu-visible\{display:flex!important/);
  assert.match(css,/ssc-unified-footer \.ssc-footer-content/);
});
test('public routes share the same shell except Admin Control and previews',()=>{
  const files=['index.html','registration.html','status.html','events.html','announcements.html','gallery.html','rules.html','seasons.html','voting.html','my-sscircle.html','mailbox.html'];
  for(const file of files)assert.match(source(file),/public-unified\.js/);
  assert.doesNotMatch(source('admin.html'),/public-unified\.js/);
});
