import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {pbkdf2Sync,webcrypto} from 'node:crypto';
const script=readFileSync(new URL('../member-password-client.js',import.meta.url),'utf8');
function fixture(){
  let captured=[];
  const sandbox={
    window:{},
    crypto:webcrypto,
    TextEncoder,
    console,
    btoa,
    fetch:async(path,opts)=>{
      captured.push({path,opts});
      return new Response(JSON.stringify({salt:'EBAQEBAQEBAQEBAQEBAQEA',iterations:220000}),
        {status:200,headers:{'Content-Type':'application/json'}});
    },
    Response
  };
  runInNewContext(script,sandbox);
  return {api:sandbox.window.SSCirclePassword,captured};
}
test('activation derives 220k PBKDF2 rounds in browser and sends no password',async()=>{
  const {api}=fixture();
  const password='Secure#2026';
  const result=await api.create(password);
  assert.match(result.salt,/^[A-Za-z0-9_-]{22}$/);
  assert.match(result.proof,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(JSON.stringify(result).includes(password),false);
  assert.equal(result.proof,
    pbkdf2Sync(password,result.salt,220000,32,'sha256').toString('base64url'));
  await assert.rejects(()=>api.create('short'),/8/);
});
test('login first obtains salt, derives same proof, never sends raw password to salt endpoint',async()=>{
  const {api,captured}=fixture();
  const password='ExistingMember#2026';
  const result=await api.login('AAAAFFFFBBBBCCCCDDDD',password);
  assert.equal(captured[0].path,'/api/player/security/key-info');
  assert.equal(JSON.stringify(captured[0].opts).includes(password),false);
  assert.equal(JSON.stringify(result).includes(password),false);
  assert.equal(result.proof,
    pbkdf2Sync(password,'EBAQEBAQEBAQEBAQEBAQEA',220000,32,'sha256').toString('base64url'));
});
