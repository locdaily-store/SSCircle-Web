import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Getting Started public page and entry points are connected',()=>{
 const home=src('index.html'),page=src('how-to-play.html'),header=src('public-unified.js');
 assert.match(home,/id="home-explore-button"/);
 assert.match(home,/id="home-guide-button"[^>]*href="how-to-play\.html"/);
 assert.match(home,/id="home-process-guide"[^>]*href="how-to-play\.html"/);
 assert.match(page,/id="howto-category-list"/);
 assert.match(page,/id="howto-search"/);
 assert.match(page,/id="howto-faq-list"/);
 assert.match(page,/id="howto-account-guide"/);
 assert.match(header,/\['How to Play','\/how-to-play\.html'\]/);
});
test('Mailbox icon is themed and notification count stays connected',()=>{
 const header=src('public-unified.js'),css=src('public-unified.css');
 assert.match(header,/mailbox-envelope\.svg/);
 assert.match(header,/data-open-mailbox/);
 assert.match(header,/data-mailbox-count hidden/);
 assert.match(css,/\.ssc-mailbox-icon/);
 assert.match(src('assets/mailbox-envelope.svg'),/<svg/);
});
test('Guide editor is wired to Admin Control and publishes only intentionally',()=>{
 const html=src('admin.html'),admin=src('admin.js'),editor=src('getting-started-admin.js');
 assert.match(html,/data-tab="getting-started-admin"/);
 assert.match(html,/id="getting-started-admin-editor"/);
 assert.match(html,/id="getting-started-preview-frame"/);
 assert.match(admin,/SSCircleGettingStartedAdmin\?\.render\(data, dirtyMark\)/);
 assert.match(editor,/settings\.gettingStartedDraft/);
 assert.match(editor,/data\.settings\.gettingStarted=clone\(draft\)/);
 assert.match(editor,/SSCircleImagePicker\.mount/);
});
test('Worker validates guide contents and keeps drafts off public API',()=>{
 const worker=src('_worker.js');
 assert.match(worker,/out\.gettingStarted=validateGuide/);
 assert.match(worker,/out\.gettingStartedDraft=validateGuide/);
 assert.match(worker,/delete f\.settings\.gettingStartedDraft/);
 assert.match(worker,/1–20 langkah/);
});
test('Public guide has accessible progress controls and safe media handling',()=>{
 const script=src('getting-started.js');
 assert.match(script,/localStorage\.setItem/);
 assert.match(script,/aria-pressed/);
 assert.match(script,/ssc-howto-preview/);
 assert.match(script,/youtube-nocookie\.com/);
 assert.match(script,/textContent/);
 for(const path of ['getting-started-data.js','getting-started.js','getting-started-admin.js','public-unified.js']){
   assert.doesNotThrow(()=>new Function(src(path)),path);
 }
});

test('Saving the How to Play page publishes the edited guide and verifies public API',()=>{
 const editor=src('getting-started-admin.js'),admin=src('admin.js'),page=src('getting-started.js');
 assert.match(editor,/function beforeSave\(\{draftOnly=false\}=\{\}\)/);
 assert.match(editor,/if\(!draftOnly\)/);
 assert.match(editor,/data\.settings\.gettingStarted=clone\(draft\)/);
 assert.match(editor,/SSCIRCLESaveGettingStarted|SSCircleSaveGettingStarted/);
 assert.match(admin,/SSCIRCLEGettingStartedAdmin|SSCircleGettingStartedAdmin/);
 assert.match(admin,/beforeSave\(\{draftOnly: options\?\.draftOnly === true\}\)/);
 assert.match(admin,/SSCIRCLE\.getForm|SSCircle\.getForm/);
 assert.match(admin,/served\.sections\?\.length/);
 assert.match(page,/v\.settings\?\.gettingStarted\|\|defaults/);
});
