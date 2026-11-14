import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const begin=source.indexOf('async function body(req, limit = 250000) {');
const end=source.indexOf('\nasync function cooldownKey(',begin);
assert.ok(begin>=0&&end>begin,'Worker JSON body helper not found');
const helper=source.slice(begin,end);
const decode=new Function('parse',helper+';return body;')(value=>{
  try{return JSON.parse(value)}catch{return null}
});

test('JSON size budget checks UTF-8 bytes, including Unicode payloads',async()=>{
  const text=JSON.stringify({note:'😀'.repeat(8)});
  assert.ok(text.length<Buffer.byteLength(text,'utf8'));
  const budget=text.length;
  const request=new Request('https://sscircle.test/api/test',{method:'POST',body:text});
  await assert.rejects(decode(request,budget),/Data terlalu besar/);
});

test('JSON size budget accepts a valid request within the byte limit',async()=>{
  const text=JSON.stringify({note:'Halo SSCircle 🎮'});
  const request=new Request('https://sscircle.test/api/test',{method:'POST',body:text});
  assert.deepEqual(await decode(request,Buffer.byteLength(text,'utf8')),{note:'Halo SSCircle 🎮'});
});

test('JSON size budget rejects Content-Length over limit before reading body',async()=>{
  let read=false;
  const req={headers:new Headers({'Content-Length':'200'}),async text(){read=true;return '{}'}};
  await assert.rejects(decode(req,16),/Data terlalu besar/);
  assert.equal(read,false);
});

test('JSON helper rejects arrays and invalid JSON',async()=>{
  const make=text=>new Request('https://sscircle.test/api/test',{method:'POST',body:text});
  await assert.rejects(decode(make('[]'),100),/tidak sesuai/);
  await assert.rejects(decode(make('{oops}'),100),/tidak sesuai/);
});

test('JSON body stops reading once an unknown-length stream crosses the byte cap',async()=>{
  const encoder=new TextEncoder();
  let pulls=0;
  const stream=new ReadableStream({
    pull(controller){
      pulls++;
      if(pulls===1)controller.enqueue(encoder.encode('{"note":"'));
      else if(pulls===2)controller.enqueue(encoder.encode('x'.repeat(100)));
      else controller.error(Error('Stream must not be read past the limit'));
    }
  });
  const request=new Request('https://sscircle.test/api/test',{
    method:'POST',body:stream,duplex:'half'
  });
  await assert.rejects(decode(request,24),/Data terlalu besar/);
  assert.equal(pulls,2);
});

test('JSON body accepts split multibyte UTF-8 across streaming chunks',async()=>{
  const bytes=new TextEncoder().encode(JSON.stringify({note:'🎮'}));
  const pivot=bytes.indexOf(0xF0)+2;
  assert.ok(pivot>2);
  const stream=new ReadableStream({
    start(controller){
      controller.enqueue(bytes.slice(0,pivot));
      controller.enqueue(bytes.slice(pivot));
      controller.close();
    }
  });
  const request=new Request('https://sscircle.test/api/test',{
    method:'POST',body:stream,duplex:'half'
  });
  assert.deepEqual(await decode(request,bytes.length),{note:'🎮'});
});
