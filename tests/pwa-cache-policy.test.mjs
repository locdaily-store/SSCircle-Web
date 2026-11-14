import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const code=readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');
const origin='https://sscircle.test';
const basic=(label,cacheControl='public,max-age=60')=>({
  label,ok:true,type:'basic',headers:new Headers({'Cache-Control':cacheControl}),
  clone(){return basic(label,cacheControl)}
});
function fixture(network){
  const handlers=new Map(),stores=new Map(),writes=[];
  const cache={
    async match(request){
      const key=typeof request==='string'?new URL(request,origin).href:request.url;
      for(const store of stores.values())if(store.has(key))return store.get(key);
      return undefined;
    },
    async open(name){
      if(!stores.has(name))stores.set(name,new Map());
      const store=stores.get(name);
      return {
        async addAll(paths){for(const path of paths)store.set(new URL(path,origin).href,basic('precache'))},
        async put(request,response){writes.push(request.url);store.set(request.url,response)}
      };
    },
    async keys(){return [...stores.keys()]},
    async delete(name){return stores.delete(name)}
  };
  const self={
    location:{origin},clients:{claim:async()=>{}},skipWaiting:async()=>{},
    addEventListener(name,fn){handlers.set(name,fn)}
  };
  runInNewContext(code,{self,caches:cache,fetch:network,URL,Response,Headers});
  async function request(path,{method='GET'}={}){
    let response;const pending=[];
    const event={
      request:new Request(origin+path,{method}),
      respondWith(promise){response=Promise.resolve(promise)},
      waitUntil(promise){pending.push(Promise.resolve(promise))}
    };
    handlers.get('fetch')(event);
    const result=response?await response:undefined;
    await Promise.all(pending);
    return result;
  }
  return {request,cache,stores,writes};
}

test('PWA fetches fresh JS even if a previous version is cached',async()=>{
  let calls=0;
  const app=fixture(async()=>{calls++;return basic('new-code')});
  const previous=await app.cache.open('sscircle-public-v10.55.6-readiness-1');
  const asset=new Request(origin+'/public-unified.js?v=9');
  await previous.put(asset,basic('old-code'));
  const res=await app.request('/public-unified.js?v=9');
  assert.equal(res.label,'new-code');
  assert.equal(calls,1);
  assert.ok(app.writes.length>=2);
});

test('PWA falls back to cached JavaScript only while offline',async()=>{
  const app=fixture(async()=>{throw Error('offline')});
  const previous=await app.cache.open('sscircle-public-v10.55.6-readiness-1');
  await previous.put(new Request(origin+'/public-unified.js?v=9'),basic('cached-code'));
  const res=await app.request('/public-unified.js?v=9');
  assert.equal(res.label,'cached-code');
});

test('PWA never intercepts member/API routes or stores suspicious query strings',async()=>{
  let calls=0;
  const app=fixture(async()=>{calls++;return basic('network')});
  for(const path of ['/api/player/profile','/admin.js','/my-sscircle','/mailbox','/registration',
    '/status','/announcements','/voting','/rules','/seasons']){
    assert.equal(await app.request(path),undefined,path);
  }
  assert.equal(await app.request('/public-unified.js?token=secret'),undefined);
  assert.equal(calls,0);
  assert.equal(app.writes.length,0);
});

test('PWA does not cache static responses marked private or no-store',async()=>{
  const app=fixture(async()=>basic('secret','private, no-store'));
  await app.request('/style.css?v=10');
  assert.equal(app.writes.length,0);
});
