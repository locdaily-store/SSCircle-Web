import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('Season Lifecycle is integrated into the existing Admin Control tab',()=>{
 const admin=read('admin.html'),editor=read('seasons-admin.js');
 assert.equal((admin.match(/data-tab="seasons-admin"/g)||[]).length,1);
 assert.match(editor,/Season Lifecycle Management/);
 assert.match(editor,/Persiapkan penutupan/);
 assert.match(editor,/Periksa snapshot akhir/);
 assert.match(editor,/Akhiri Season/);
 assert.match(editor,/Mulai Season/);
 assert.match(editor,/Arsipkan Season lama/);
 assert.match(editor,/Simpan jadwal/);
 assert.match(editor,/lifecycleRequest\(season,'end'/);
 assert.match(editor,/seasonChoice\.disabled=true/);
 assert.match(editor,/choice\.disabled=true/);
 assert.match(editor,/archiveFinalizedAt/);
});

test('Timeline and awards use the same shared Season Archive source',()=>{
 const editor=read('seasons-admin.js'),publicPage=read('seasons.js');
 const worker=read('_worker.js');
 assert.match(editor,/archiveTimeline/);
 assert.match(editor,/autoAwards:auto\.checked/);
 assert.match(publicPage,/season-timeline-list/);
 assert.match(publicPage,/archiveSnapshot/);
 assert.match(worker,/seasonClosingPreview/);
 assert.match(worker,/archiveAwards=awards/);
 assert.match(worker,/COALESCE\(updated_at,''\)=\?/);
 assert.match(worker,/season\.entries=old\.entries\|\|\[\]/);
});

test('Season Lifecycle CSS is shared and provides narrow-screen controls',()=>{
 for(const page of ['admin.html','seasons.html'])
   assert.match(read(page),/season-lifecycle\.css\?v=10\.63\.0/);
 const css=read('season-lifecycle.css');
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/\.season-timeline-entry/);
 assert.match(css,/\.season-lifecycle-actions/);
});
