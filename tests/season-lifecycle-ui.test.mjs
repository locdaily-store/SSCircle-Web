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

test('Season editor manages multiple titled boards without duplicating the legacy leaderboard editor',()=>{
 const editor=read('seasons-admin.js'),publicPage=read('seasons.js');
 assert.match(editor,/\+ Tambah leaderboard/);
 assert.match(editor,/Judul leaderboard/);
 assert.match(editor,/Maksimal 8 leaderboard per Season/);
 assert.match(editor,/archiveLeaderboards/);
 assert.match(editor,/syncPrimary\(\)/);
 assert.doesNotMatch(editor,/Leaderboard season \(\$\{season\.entries\.length\}\/20\)/);
 assert.match(publicPage,/season-archive-leaderboard-grid/);
 assert.match(publicPage,/board\.title/);
 assert.match(publicPage,/Array\.isArray\(season\.archiveLeaderboards\)/);
});

test('Season award recipient search accepts member names, Minecraft username and full IDs',()=>{
 const editor=read('seasons-admin.js'),css=read('season-lifecycle.css');
 assert.match(editor,/season-member-search/);
 assert.match(editor,/Cari nama pemain, username Minecraft atau ID anggota/);
 assert.match(editor,/\/api\/admin\/member-center\?offset=/);
 assert.match(editor,/\/api\/admin\/minecraft\/links/);
 assert.match(editor,/searchable\.includes\(q\)/);
 assert.match(editor,/item\.memberId=member\.id/);
 assert.match(editor,/Lepas tautan anggota/);
 assert.match(css,/\.season-member-results\[hidden\]/);
 assert.match(css,/\.season-admin-leaderboards/);
});
