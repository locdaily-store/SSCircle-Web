import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('Gallery has a dedicated Admin Control tab and preserves unified photo storage',()=>{
  const html=source('admin.html'),home=source('homepage-admin.js'),admin=source('admin.js');
  assert.match(html,/data-tab="gallery-admin"/);
  assert.match(html,/id="gallery-admin-editor"/);
  assert.match(html,/id="gallery-admin-preview-frame"/);
  assert.match(home,/standaloneGallery\.replaceChildren\(gallery\)/);
  assert.match(home,/gallery: \[\]/);
  assert.match(home,/state\.settings\.homeGallery/);
  assert.match(admin,/SSCircleGalleryAdmin\?\.render\(data\)/);
  assert.match(admin,/'#gallery-admin-save'/);
  assert.match(admin,/\$\('#gallery-admin-save'\)\.onclick = save/);
});

test('Gallery preview updates categories and colors without saving or fetching private state',()=>{
  const gallery=source('gallery.js'),preview=source('gallery-admin.js'),colors=source('color-theme-admin.js');
  assert.match(gallery,/ssc_theme_preview/);
  assert.match(gallery,/event\.source!==parent/);
  assert.match(gallery,/gallery-tabs'\)\.replaceChildren/);
  assert.match(gallery,/ssc-theme-preview-ready/);
  assert.match(preview,/ssc-theme-preview-settings/);
  assert.match(preview,/gallery-preview-desktop/);
  assert.match(preview,/gallery-preview-mobile/);
  assert.match(colors,/galleryPalette/);
  assert.match(colors,/renderGalleryColors/);
  assert.match(colors,/gallery\.html/);
  assert.match(colors,/themeOverrides/);
  assert.match(source('admin.html'),/id="gallery-color-editor"/);
});

test('Member badges are responsive medals, with earned and ongoing achievements distinct',()=>{
  const css=source('member-badges.css');
  const profile=source('player-dashboard.js'),achievements=source('community-achievements.js');
  assert.match(css,/repeat\(auto-fill,minmax/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.ssc-medal-emblem/);
  assert.match(profile,/player-award ssc-medal/);
  assert.match(profile,/ssc-community-award ssc-medal/);
  assert.match(achievements,/ssc-medal-earned/);
  assert.match(achievements,/ssc-medal-progress/);
  assert.match(source('my-sscircle.html'),/member-badges\.css/);
});

test('JavaScript entrypoints pass syntax parsing',()=>{
  for(const name of ['gallery-admin.js','gallery.js','homepage-admin.js','admin.js','color-theme-admin.js','community-achievements.js','player-dashboard.js'])
    assert.doesNotThrow(()=>new Function(source(name)),name);
});


test('Compact medals and Profile header spacing remain responsive',()=>{
  const medals=source('member-badges.css'),spacing=source('profile-workspace.css'),profile=source('my-sscircle.html');
  assert.match(medals,/min-height:164px/);
  assert.match(medals,/width:60px;\s*height:60px/);
  assert.match(medals,/min-height:150px/);
  assert.match(spacing,/padding-top:clamp\(80px,7vw,96px\)/);
  assert.match(spacing,/padding-top:76px/);
  assert.match(profile,/profile-workspace\.css\?v=10\.57\.1/);
});

test('Gallery editor has a clear sequence and current asset versions',()=>{
  const home=source('homepage-admin.js'),html=source('admin.html'),layout=source('gallery-admin.css');
  for(const text of ['01 · Informasi galeri','02 · Kategori foto','03 · Koleksi foto'])assert.ok(home.includes(text));
  assert.match(layout,/\.ssc-gallery-admin-editor \.home-admin-gallery-photo-row/);
  assert.match(html,/homepage-admin\.js\?v=10\.57\.1/);
  assert.match(html,/gallery-admin\.css\?v=10\.57\.1/);
  assert.match(source('gallery-admin.js'),/aria-pressed/);
});
