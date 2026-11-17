import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const paths=JSON.parse(readFileSync(new URL('../_routes.json',import.meta.url),'utf8'));
test('Pages routes its Voice assets through Worker policy guards',()=>{
  for(const path of ['/voice','/voice.html','/voice-config.js'])
    assert.ok(paths.include.includes(path),'Missing Pages route '+path);
});
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
  assert.equal(js,'window.SSCIRCLE_VOICE_GATEWAY = "https://voice.sscircle.example";window.SSCIRCLE_VOICE_DOWNLOADS = {"android":"","ios":""};');
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
    assert.equal(await config.text(),'window.SSCIRCLE_VOICE_GATEWAY = "";window.SSCIRCLE_VOICE_DOWNLOADS = {"android":"","ios":""};');
  }
});

test('Preview alias uses SSCircle Worker automatically if Pages variable is absent',async()=>{
  const previewUrl='https://voice-test.sscircle.pages.dev';
  const previewRequest=path=>worker.fetch(new Request(previewUrl+path),
    env({VOICE_PUBLIC_URL:''}),{waitUntil(){}});
  const config=await previewRequest('/voice-config.js');
  assert.equal(config.status,200);
  assert.equal(await config.text(),
    'window.SSCIRCLE_VOICE_GATEWAY = "https://sscircle-cross-voice.locdailymar.workers.dev";window.SSCIRCLE_VOICE_DOWNLOADS = {"android":"","ios":""};');
  const document=await previewRequest('/voice');
  const csp=document.headers.get('content-security-policy');
  assert.match(csp,/https:\/\/sscircle-cross-voice\.locdailymar\.workers\.dev/);
  assert.match(csp,/wss:\/\/sscircle-cross-voice\.locdailymar\.workers\.dev/);
  assert.match(document.headers.get('permissions-policy'),/microphone=\(self\)/);
  const production=await get('/voice-config.js',{VOICE_PUBLIC_URL:''});
  assert.equal(await production.text(),'window.SSCIRCLE_VOICE_GATEWAY = "";window.SSCIRCLE_VOICE_DOWNLOADS = {"android":"","ios":""};');
});

test('Valid Pages gateway variable overrides Preview fallback',async()=>{
  const config=await worker.fetch(new Request('https://voice-test.sscircle.pages.dev/voice-config.js'),
    env({VOICE_PUBLIC_URL:'https://custom-gateway.example'}),{waitUntil(){}});
  assert.equal(await config.text(),
    'window.SSCIRCLE_VOICE_GATEWAY = "https://custom-gateway.example";window.SSCIRCLE_VOICE_DOWNLOADS = {"android":"","ios":""};');
});

test('Static voice-config fallback is isolated to Preview hostname',()=>{
  const source=readFileSync(new URL('../voice-config.js',import.meta.url),'utf8');
  assert.match(source,/voice-test\.sscircle\.pages\.dev/);
  assert.match(source,/sscircle-cross-voice\.locdailymar\.workers\.dev/);
  assert.doesNotMatch(source,/VOICE_BRIDGE_SECRET\s*=/);
});

test('Voice app download links are injected only when official URL is configured',async()=>{
  const apk='https://github.com/locdaily-store/SSCircle-Web/releases/download/sscircle-voice-android-preview/SSCircle-Voice-Android.apk';
  const ios='https://testflight.apple.com/join/ABCDEFGH';
  const response=await get('/voice-config.js',{VOICE_ANDROID_APK_URL:apk,VOICE_IOS_APP_URL:ios});
  const source=await response.text();
  assert.match(source,/SSCIRCLE_VOICE_DOWNLOADS/);
  assert.ok(source.includes('SSCircle-Voice-Android.apk'));
  assert.ok(source.includes('testflight.apple.com'));
  for(const bad of ['javascript:alert(1)','https://attacker.invalid/app.apk',
    'https://github.com/locdaily-store/SSCircle-Web/releases/download/demo/evil.apk?token=abc']){
    const blocked=await get('/voice-config.js',{
      VOICE_ANDROID_APK_URL:bad,VOICE_IOS_APP_URL:'https://evil.invalid/join/ABCDEFGH'});
    assert.ok((await blocked.text()).includes('window.SSCIRCLE_VOICE_DOWNLOADS = {"android":"","ios":""};'));
  }
});
