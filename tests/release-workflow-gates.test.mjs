import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Only the full release workflow packages Cloudflare automatically on PRs',()=>{
 const full=read('.github/workflows/validate-and-package.yml');
 const quick=read('.github/workflows/quick-cloudflare-zip.yml');
 assert.match(full,/^on:\s*\n\s+pull_request:/m);
 assert.match(full,/scripts\/package-cloudflare\.py/);
 assert.match(quick,/^on:\s*\n\s+workflow_dispatch:/m);
 assert.doesNotMatch(quick,/^\s+pull_request:/m);
 assert.match(quick,/scripts\/package-cloudflare\.py/);
});

test('Manual fast package has no duplicate node syntax checks',()=>{
 const quick=read('.github/workflows/quick-cloudflare-zip.yml');
 const checks=[...quick.matchAll(/^\s+node --check\s+([^\s]+)\s*$/gm)].map(row=>row[1]);
 assert.ok(checks.length>=5);
 assert.equal(new Set(checks).size,checks.length);
});
