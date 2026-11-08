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

test('Mail Box handles loading, recovery and duplicate deletes',()=>{
 const widget=source('mailbox-widget.js');
 const worker=source('_worker.js');
 assert.match(widget,/refreshTask/);
 assert.match(widget,/loadFailed/);
 assert.match(widget,/ssc-mailbox-signin/);
 assert.match(widget,/if\(deleting\)return/);
 assert.match(worker,/await env\.DB\.batch\(\[/);
});

test('Profile Studio has touch reorder, a mobile preview and validated presentation choices',()=>{
 const editor=source('profile-admin.js');
 const html=source('admin.html');
 const worker=source('_worker.js');
 const layout=source('profile-page-layout.js');
 assert.match(editor,/pointerdown/);
 assert.match(editor,/setPointerCapture/);
 assert.match(editor,/pointercancel/);
 assert.match(editor,/ArrowUp/);
 assert.match(editor,/profilePageHeroStyle/);
 assert.match(editor,/profilePageCardStyle/);
 assert.match(editor,/id!=='security'/);
 assert.match(html,/id="profile-preview-devices"/);
 assert.match(html,/data-profile-device="mobile"/);
 assert.match(layout,/is-profile-outlined/);
 assert.match(worker,/out\.profilePageHeroStyle/);
 assert.match(worker,/out\.profilePageCardStyle/);
});

test('Notification Center manages only selected message IDs via the protected API',()=>{
 const widget=source('mailbox-widget.js');
 const worker=source('_worker.js');
 assert.match(widget,/ssc-mailbox-select-all/);
 assert.match(widget,/ssc-mailbox-mark-selected/);
 assert.match(widget,/ssc-mailbox-delete-selected/);
 assert.match(widget,/!item\.canReveal/);
 assert.match(widget,/\/api\/player\/mailbox\/manage/);
 assert.match(worker,/if\(path==='\/api\/player\/mailbox\/manage'/);
 assert.match(worker,/new Set\(ids\)\.size!==ids\.length/);
 assert.match(worker,/WHERE application_id=\? AND id IN/);
});


test('V10.44 account recovery requires the verified Mail Box flow rather than username alone',()=>{
 const ui=source('my-sscircle.html');
 const script=source('player-dashboard.js');
 assert.match(ui,/id="player-recovery-request"/);
 assert.match(ui,/id="player-recovery-show"/);
 assert.match(ui,/id="player-recovery-back"/);
 assert.match(script,/\/api\/player\/mailbox\/request-activation/);
 assert.match(script,/window\.SSCircleMailbox/);
 assert.doesNotMatch(ui,/type="email".*pemulihan/i);
});
test('V10.44 credential and device management use only private authenticated APIs',()=>{
 const worker=source('_worker.js');
 const script=source('player-dashboard.js');
 const html=source('my-sscircle.html');
 assert.match(worker,/CREATE TABLE IF NOT EXISTS member_security_events/);
 assert.match(worker,/if\(path==='\/api\/player\/security\/password\/change'/);
 assert.match(worker,/if\(path==='\/api\/player\/security\/history'/);
 assert.match(worker,/if\(path==='\/api\/player\/security\/device\/rename'/);
 assert.match(script,/\/api\/player\/security\/password\/change/);
 assert.match(script,/\/api\/player\/security\/history/);
 assert.match(script,/\/api\/player\/security\/device\/rename/);
 assert.match(html,/id="player-change-password-form"/);
 assert.match(html,/id="player-security-history"/);
 assert.match(script,/textContent=labels\[event\.type\]/);
 assert.doesNotMatch(worker,/member_security_events.*client_ip/);
});

test('V10.47.2: stats use accessible inline SVG icons and a season filter without image dependencies',()=>{
 const html=readFileSync(new URL('../my-sscircle.html',import.meta.url),'utf8');
 const dashboard=readFileSync(new URL('../player-dashboard.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../player-dashboard.css',import.meta.url),'utf8');
 assert.equal((html.match(/data-stat-kind="/g)||[]).length,5);
 assert.equal((html.match(/class="player-stat-icon"/g)||[]).length,5);
 assert.match(html,/id="player-season-select"/);
 assert.match(dashboard,/activeStatSeason/);
 assert.match(dashboard,/player-stat-seasons/);
 assert.match(css,/\.player-stat-icon svg/);
 assert.match(css,/@media\(max-width:620px\)/);
});

test('V10.48: monitoring is integrated into private Admin Control and is responsive',()=>{
 const html=source('admin.html');
 const admin=source('admin.js');
 const widget=source('minecraft-sync-admin.js');
 const css=source('minecraft-sync-admin.css');
 const worker=source('_worker.js');
 assert.match(html,/data-tab="minecraft-sync-admin"/);
 assert.match(html,/id="minecraft-sync-root"/);
 assert.match(html,/minecraft-sync-admin\.js/);
 assert.match(html,/minecraft-sync-admin\.css/);
 assert.match(admin,/SSCircleMinecraftSyncAdmin\?\.load\(\)/);
 assert.match(widget,/api\/admin\/minecraft\/sync/);
 assert.match(widget,/pendingCommand/);
 assert.match(widget,/\.textContent=String\(text\)/);
 assert.doesNotMatch(widget,/\.innerHTML\s*=/);
 assert.match(css,/@media\(max-width:640px\)/);
 assert.match(worker,/if\(!await admin\(req,env\)\)/);
 assert.doesNotMatch(widget,/server-secret\.txt|SSCIRCLE_LINK_SERVER_SECRET/);
});
