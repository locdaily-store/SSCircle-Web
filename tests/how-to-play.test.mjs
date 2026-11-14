import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('How to Play is linked from Homepage hero and Join our Circle',()=>{
 const home=source('index.html');
 assert.match(home,/id="home-explore-button"[\s\S]*?href="how-to-play\.html"[\s\S]*?home-hero-voting-button/);
 assert.match(home,/id="home-process-button"[\s\S]*?href="how-to-play\.html"/);
 assert.match(home,/How to Play/);
});

test('Guide renders six onboarding topics, search, FAQ and accessible step navigation',()=>{
 const html=source('how-to-play.html'),script=source('how-to-play.js'),css=source('how-to-play.css');
 assert.match(html,/id="howto-search"/);
 assert.match(html,/id="howto-categories"/);
 assert.match(html,/id="howto-faq-list"/);
 assert.match(html,/id="howto-prev"/);
 assert.match(html,/id="howto-next"/);
 assert.match(html,/id="howto-page-title"/);
 assert.match(html,/public-unified\.js/);
 for(const id of ['registration','account','minecraft','playing','community','help'])assert.match(script,new RegExp("id:'"+id+"'"));
 assert.match(script,/window\.SSCircleHowToPlayDefaults=defaults/);
 assert.match(script,/aria-pressed/);
 assert.match(script,/replaceChildren/);
 assert.match(script,/textContent/);
 assert.match(css,/max-width:760px/);
 assert.doesNotThrow(()=>new Function(script));
});

test('Admin Control can edit and preview tutorial content via the shared form save',()=>{
 const html=source('admin.html'),admin=source('admin.js'),editor=source('how-to-play-admin.js');
 assert.match(html,/data-tab="howto-admin"/);
 assert.match(html,/id="howto-admin-general"/);
 assert.match(html,/id="howto-admin-categories"/);
 assert.match(html,/id="howto-admin-faq"/);
 assert.match(html,/id="howto-admin-save"/);
 assert.match(html,/id="howto-preview-frame"/);
 assert.match(admin,/SSCircleHowToPlayAdmin\?\.render\(data, dirtyMark\)/);
 assert.match(admin,/'#howto-admin-save'/);
 assert.match(admin,/\$\('#howto-admin-save'\)\.onclick = save/);
 assert.match(editor,/SSCircleImagePicker\.mount/);
 assert.match(editor,/ssc-howto-preview/);
 assert.match(editor,/SSC[i]?ircleHowToPlayDefaults/);
 assert.doesNotThrow(()=>new Function(editor));
});

test('Worker validates guide and authenticates per-member checklist',()=>{
 const worker=source('_worker.js');
 assert.match(worker,/out\.howToPlay =/);
 assert.match(worker,/guide\.categories\.length > 12/);
 assert.match(worker,/guide\.faq\.length > 24/);
 assert.match(worker,/allowedDiscord/);
 assert.match(worker,/imageSource\(image, 'Gambar tutorial'\)/);
 assert.match(worker,/\/api\/player\/how-to-play-progress/);
 assert.match(worker,/await playerSession\(req,env\)/);
 assert.match(worker,/member_onboarding_progress/);
 assert.match(worker,/ON CONFLICT\(application_id\)/);
 assert.match(source('how-to-play.js'),/localStorage\.setItem/);
 assert.match(source('how-to-play.js'),/accountProgress=true/);
});

test('Shared header uses the supplied envelope style instead of a text glyph',()=>{
 const shell=source('public-unified.js'),icon=source('assets/mailbox-icon.svg'),css=source('public-unified.css');
 assert.match(shell,/assets\/mailbox-icon\.svg/);
 assert.match(shell,/How to Play/);
 assert.match(icon,/<svg/);
 assert.match(icon,/viewBox="0 0 256 256"/);
 assert.match(css,/\.ssc-mailbox-icon/);
 assert.doesNotThrow(()=>new Function(shell));
});
