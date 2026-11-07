import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('Profile remains a member-only route and layout settings are validated',()=>{
  const worker=source('_worker.js');
  assert.match(worker,/path === '\/my-sscircle'/);
  assert.match(worker,/member\.status !== 'accepted'/);
  assert.match(worker,/profilePageSections/);
  assert.match(worker,/profilePageHidden/);
  assert.match(worker,/id === 'security'/);
});
test('Mail Box uses private API and inserts untrusted content as text only',()=>{
  const widget=source('mailbox-widget.js');
  const html=source('my-sscircle.html');
  assert.match(widget,/document\.createElement\('dialog'\)/);
  assert.match(widget,/textContent=item\.content/);
  assert.match(widget,/\/api\/player\/mailbox\/delete/);
  assert.match(widget,/item\.canReveal===true/);
  assert.match(html,/data-open-mailbox/);
  assert.match(html,/mailbox-widget\.js/);
  assert.doesNotMatch(html,/>My SSCircle</);
});
test('Admin can edit Profile with mock preview without reading private data',()=>{
  const admin=source('admin.html');
  const editor=source('profile-admin.js');
  const preview=source('profile-preview.html');
  const theme=source('color-theme-admin.js');
  assert.match(admin,/id="profile-admin"/);
  assert.match(admin,/id="profile-admin-preview-frame"/);
  assert.match(editor,/profilePageSections/);
  assert.match(editor,/profilePageHidden/);
  assert.match(preview,/data-profile-section="security"/);
  assert.doesNotMatch(preview,/player-dashboard\.js/);
  assert.match(theme,/profile-preview\.html/);
  assert.match(theme,/\.player-security/);
});
test('Legacy mail route redirects to Profile and deletion scopes owner',()=>{
  const worker=source('_worker.js');
  assert.match(worker,/Location:'\/my-sscircle\?mailbox=1'/);
  assert.match(worker,/if\(path==='\/api\/player\/mailbox\/delete'/);
  assert.match(worker,/DELETE FROM member_mailbox WHERE id=\? AND application_id=\?/);
});
