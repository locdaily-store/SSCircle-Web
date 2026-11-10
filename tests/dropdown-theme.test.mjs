import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=name=>readFileSync(resolve(root,name),'utf8');

test('all public and admin pages bust common stylesheet cache for V10.49.1.6',()=>{
  let count=0;
  for(const name of readdirSync(root).filter(x=>x.endsWith('.html'))){
    const html=read(name);
    if(!/href=["']style\.css\?v=/.test(html))continue;
    assert.match(html,/href=["']style\.css\?v=10\.49\.1\.6["']/,name);
    count++;
  }
  assert.ok(count>=10,`pages covered ${count}`);
});

test('native dropdown controls and options get opaque theme backgrounds and explicit text',()=>{
  const css=read('style.css');
  assert.match(css,/SSCIRCLE|SSCircle V10\.49\.1\.6: native select/);
  assert.match(css,/--ssc-select-surface:\s*var\(--ssc-input/);
  assert.match(css,/--ssc-select-ink:\s*var\(--ssc-input-text/);
  assert.match(css,/body select option,\s*body select optgroup\s*\{/);
  assert.match(css,/body select option:checked\s*\{/);
  assert.match(css,/color-scheme:\s*dark;/);
  assert.match(css,/body #ssc-mc-unlink-account/);
  assert.doesNotMatch(css.slice(css.indexOf('SSCircle V10.49.1.6: native select')),
    /appearance:\s*none/,'native keyboard and OS behavior remains available');
});

test('staging/runtime are aligned to the V10.49.1.6 release without schema changes',()=>{
  assert.match(read('_worker.js'),/const SSC_RUNTIME_RELEASE='10\.49\.1\.6'/);
  assert.match(read('package.json'),/"version":\s*"10\.49\.1\.6-local\.4"/);
  const changelog=read('docs/V10.49.1.6-STABILIZATION-AND-DROPDOWNS.md');
  assert.match(changelog,/tidak perlu migrasi D1/i);
});
