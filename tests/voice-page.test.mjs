import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const originalPolicy="default-src 'self'; script-src 'self'; connect-src 'self'";
const env=override=>({
  VOICE_PUBLIC_URL:'https://voice.sscircle.example',
  ASSETS:{fetch:async()=>new Response('<!doctype html><html><body>SSCircle</body></html>',{
    status:200,headers:{
      'Content-Type':'text/html; charset=utf-8',
      'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy':originalPolicy
    }
  })},
  ...override
});
const get=(path,vars)=>worker.fetch(new Request('https://sscircle.test'+path),env(vars),{waitUntil(){}});
test('Only Voice document grants microphone access and selected gateway CSP',async()=>{
  for(const path of ['/voice','/voice.html']){
    const response=await get(path);
    assert.equal(response.status,200);
    assert.match(response.headers.get('permissions-policy'),/microphone=\(self\)/);
    const csp=response.headers.get('content-security-policy');
    assert.match(csp,/connect-src 'self' https:\/\/voice\.sscircle\.example wss:\/\/voice\.sscircle\.example/);
    assert.match(csp,/script-src 'self'/);
    assert.doesNotMatch(csp,/unsafe-inline/);
  }
  const normal=await get('/index.html');
  assert.equal(normal.headers.get('permissions-policy'),'camera=(), microphone=(), geolocation=()');
  assert.equal(normal.headers.get('content-security-policy'),originalPolicy);
});
test('Voice config is dynamic, no-store and does not expose gateway secret',async()=>{
  const response=await get('/voice-config.js');
  assert.equal(response.status,200);
  const js=await response.text();
  assert.equal(js,'window.SSCIRCLE_VOICE_GATEWAY = "https://voice.sscircle.example";');
  assert.match(response.headers.get('content-type'),/javascript/);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.doesNotMatch(js,/SECRET|TOKEN|PASSWORD/);
});
test('CSP refuses unconfigured or malformed external gateway URLs',async()=>{
  for(const input of ['', 'http://unsafe.example','https://user:pass@evil.example',
    'https://trusted.example/stealth', 'https://trusted.example/?token=secret']){
    const response=await get('/voice',{VOICE_PUBLIC_URL:input});
    assert.doesNotMatch(response.headers.get('content-security-policy'),/trusted\.example|unsafe\.example|evil\.example/);
    assert.match(response.headers.get('content-security-policy'),/connect-src 'self';/);
    const config=await get('/voice-config.js',{VOICE_PUBLIC_URL:input});
    assert.equal(await config.text(),'window.SSCIRCLE_VOICE_GATEWAY = "";');
  }
});
