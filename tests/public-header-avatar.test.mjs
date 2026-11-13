import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('Public header uses the logged-in primary Minecraft skin, never a guessed username', () => {
  const script = source('public-unified.js');
  const css = source('public-unified.css');
  assert.match(script, /fetch\('\/api\/player\/profile'/);
  assert.match(script, /accounts\.find\(a=>a\?\.isPrimary\)/);
  assert.match(script, /\/api\/player\/minecraft\/skin\//);
  assert.match(script, /ctx\.drawImage\(skin,8,8,8,8,0,0,64,64\)/);
  assert.match(script, /ctx\.drawImage\(skin,40,8,8,8,0,0,64,64\)/);
  assert.match(script, /profileFallback\.hidden=true/);
  assert.match(script, /window\.SSCirclePublicAvatar/);
  assert.match(css, /\.ssc-header-avatar-canvas\[hidden\]/);
  assert.match(css, /\.ssc-header-profile img\[hidden\]/);
});

test('Public navigation retains the shared themed shell and section selection', () => {
  const script = source('public-unified.js');
  const css = source('public-unified.css');
  const admin = source('community-events-admin.css');
  assert.match(script, /ssc-nav-active/);
  assert.match(script, /aria-current/);
  assert.match(script, /home-footer ssc-unified-footer/);
  assert.match(script, /admin-page/);
  assert.match(css, /column-gap:clamp/);
  assert.match(css, /--ssc-selected-text/);
  assert.match(admin, /#community-events-admin,#achievements-admin/);
});
