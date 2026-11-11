import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=name=>readFileSync(resolve(root,name),'utf8');

test('all public and admin pages use dropdown stylesheet V10.49.1.6 or newer',()=>{
  let count=0;
  for(const name of readdirSync(root).filter(x=>x.endsWith('.html'))){
    const html=read(name);
    if(!/href=["']style\.css\?v=/.test(html))continue;
    const version=/href=["']style\.css\?v=10\.49\.1\.(\d+)["']/.exec(html);
    assert.ok(version,`${name}: missing SSCircle stylesheet version`);
    assert.ok(Number(version[1])>=6,`${name}: stale dropdown stylesheet version`);
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

test('runtime release is at least V10.51.1 while the local D1/dropdown baseline remains compatible',()=>{
  const match=/const SSC_RUNTIME_RELEASE='(\d+(?:\.\d+){2,3})'/.exec(read('_worker.js'));
  assert.ok(match,'Worker must declare its runtime release');
  const release=match[1].split('.').map(Number);
  const minimum=[10,51,1];
  const greater=release.some((value,i)=>value>(minimum[i]||0) &&
    release.slice(0,i).every((prior,j)=>prior===(minimum[j]||0)));
  assert.ok(greater||minimum.every((value,i)=>(release[i]||0)===value),
    'Worker release is older than V10.51.1: '+match[1]);
  assert.equal(JSON.parse(read("package.json")).version,match[1],"Package and Worker must use the same release");
  const changelog=read('docs/V10.49.1.6-STABILIZATION-AND-DROPDOWNS.md');
  assert.match(changelog,/tidak perlu migrasi D1/i);
});
