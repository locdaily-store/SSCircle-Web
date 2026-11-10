import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ctx={window:{}};
runInNewContext(read('minecraft-skin-3d.js'),ctx);
const {mesh}=ctx.window.SSCircleSkin3D;
const count=part=>part.length/5;
const points=arr=>{
  const out=[];for(let i=0;i<arr.length;i+=5)out.push([arr[i],arr[i+1],arr[i+2]]);
  return out;
};
const region=(arr,start,length)=>points(arr.slice(start*5,(start+length)*5));
const extent=(values,axis)=>[Math.min(...values.map(v=>v[axis])),Math.max(...values.map(v=>v[axis]))];

test('all model dimensions use square pixel units and exact 6 cuboids',()=>{
  const classic=mesh('classic',64);
  assert.equal(classic.parts.length,6);
  assert.equal(classic.base.length,6*6*6*5);
  const points3=points(classic.base);
  assert.deepEqual(extent(points3,1),[-16,16]);
  for(let i=3;i<classic.base.length;i+=5){
    assert.ok(classic.base[i]>=0 && classic.base[i]<=1);
    assert.ok(classic.base[i+1]>=0 && classic.base[i+1]<=1);
  }
});

test('modern outer layer includes head hat, jacket, both sleeves and both pant legs',()=>{
  const m=mesh('classic',64);
  assert.deepEqual(Array.from(m.layers),['hat','jacket','right-sleeve','left-sleeve','right-pants','left-pants']);
  assert.equal(count(m.outer),m.layers.length*36);
  const headBase=region(m.base,0,36),hat=region(m.outer,0,36);
  assert.ok(extent(hat,0)[0]<extent(headBase,0)[0]);
  assert.ok(extent(hat,0)[1]>extent(headBase,0)[1]);
  assert.ok(extent(hat,2)[1]>extent(headBase,2)[1]);
});

test('slim arm is 3 pixels, classic arm is 4, with matching independent sleeves',()=>{
  const classic=mesh('classic',64),slim=mesh('slim',64);
  const armClassic=region(classic.base,72,36);
  const armSlim=region(slim.base,72,36);
  assert.equal(Math.round(extent(armClassic,0)[1]-extent(armClassic,0)[0]),4);
  assert.equal(Math.round(extent(armSlim,0)[1]-extent(armSlim,0)[0]),3);
  assert.equal(slim.slim,true);
  assert.equal(classic.slim,false);
});

test('legacy 64x32 skins retain hat overlay but not nonexistent jacket layers',()=>{
  const old=mesh('slim',32);
  assert.equal(old.slim,false);
  assert.deepEqual(Array.from(old.layers),['hat']);
  assert.equal(count(old.outer),36);
});

test('stable canvas projection uses uniform scale and paints depth-sorted visible faces',()=>{
  const s=read('minecraft-skin-3d.js');
  assert.match(s,/const pixels=\(height\/43\)\*zoom/);
  assert.match(s,/projected\.sort\(\(a,b\)=>a\.depth-b\.depth\)/);
  assert.match(s,/const normalZ=/);
  assert.match(s,/ctx\.drawImage\(image,f\.u,f\.v,f\.w,f\.h,0,0,f\.w,f\.h\)/);
  assert.doesNotMatch(s,/gl\.depthMask\(false\)/);
});

test('new dialog supports outer-layer switch, zoom buttons, drag and pinch on touch',()=>{
  const a=read('minecraft-avatars.js'),html=read('my-sscircle.html');
  assert.match(a,/data-skin-action="outer"/);
  assert.match(a,/data-skin-action="zoom-in"/);
  assert.match(a,/data-skin-action="zoom-out"/);
  assert.match(a,/pointermove/);
  assert.match(a,/fingers\.size===2/);
  assert.match(a,/lostpointercapture/);
  assert.match(html,/minecraft-skin-3d\.js\?v=10\.49\.1\.5/);
  assert.ok(html.indexOf('minecraft-skin-3d.js')<html.indexOf('minecraft-avatars.js'));
});

test('Canvas 2D draws proper face crops, outer layer toggles and uniform zoom',()=>{
  const calls={transforms:[],draws:[],clears:0};
  const ctx={
    setTransform:(...args)=>calls.transforms.push(args),
    clearRect:()=>calls.clears++,save:()=>{},restore:()=>{},
    beginPath:()=>{},rect:()=>{},clip:()=>{},
    drawImage:(...args)=>calls.draws.push(args),imageSmoothingEnabled:false
  };
  const fakeCanvas={width:0,height:0,getContext:(type)=>type==='2d'?ctx:null,
    getBoundingClientRect:()=>({width:400,height:430})};
  const context={window:{devicePixelRatio:1}};
  runInNewContext(read('minecraft-skin-3d.js'),context);
  const renderer=context.window.SSCircleSkin3D.create(fakeCanvas);
  assert.equal(renderer.method,'canvas2d');
  const image={naturalWidth:64,naturalHeight:64};
  assert.equal(renderer.setSkin(image,'slim'),true);
  assert.equal(fakeCanvas.width,400);
  assert.equal(fakeCanvas.height,430);
  const withOuter=calls.draws.length;
  assert.ok(withOuter>=10&&withOuter<=40,`visible faces: ${withOuter}`);
  for(const draw of calls.draws){
    assert.equal(draw[0],image);
    assert.ok(draw[1]>=0&&draw[2]>=0);
    assert.ok(draw[1]+draw[3]<=64&&draw[2]+draw[4]<=64);
  }
  calls.draws.length=0;
  renderer.setView({outer:false});
  assert.ok(calls.draws.length<withOuter);
  calls.draws.length=0;
  renderer.setView({outer:true,zoom:1.5,yaw:45});
  assert.ok(calls.draws.length>0);
  assert.ok(calls.transforms.every(v=>v.every(Number.isFinite)));
  renderer.clear();renderer.dispose();
});
