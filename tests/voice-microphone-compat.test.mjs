import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const src=readFileSync(new URL('../voice-worklet.js',import.meta.url),'utf8');
function setup(){
 let classType,events=[];
 class FakeAudioWorkletProcessor{
   constructor(){this.port={onmessage:null,postMessage(x){events.push(x)}};}
 }
 runInNewContext(src,{AudioWorkletProcessor:FakeAudioWorkletProcessor,
   Float32Array,Number,Math,sampleRate:48000,
   registerProcessor(name,C){
     assert.equal(name,'sscircle-microphone');classType=C;
   }});
 const worklet=new classType();
 const feed=samples=>{
   let pos=0;while(pos<samples.length){
     const part=samples.slice(pos,pos+128);pos+=part.length;
     worklet.process([[part]],[[new Float32Array(part.length)]]);
   }
 };
 return {worklet,events,feed};
}

test('20ms speech packet sends when final 128-sample quantum is silent',()=>{
 const a=setup(),samples=new Float32Array(960);
 for(let i=0;i<768;i++)samples[i]=.018*Math.sin(i*.17);
 a.worklet.port.onmessage({data:{t:'sensitivity',value:.004}});
 a.feed(samples);
 assert.equal(a.events.filter(x=>x.t==='pcm').length,1,
   'VAD must use whole packet RMS');
});

test('Push-to-Talk zero sensitivity sends quiet PCM; mute prevents transmission',()=>{
 const a=setup();a.worklet.port.onmessage({data:{t:'sensitivity',value:0}});
 a.feed(new Float32Array(960));
 assert.equal(a.events.filter(x=>x.t==='pcm').length,1);
 a.worklet.port.onmessage({data:{t:'mute',value:true}});
 a.feed(new Float32Array(960).fill(.1));
 assert.equal(a.events.filter(x=>x.t==='pcm').length,1);
});

test('speech hangover is short and quiet frames stop transmitting',()=>{
 const a=setup();a.worklet.port.onmessage({data:{t:'sensitivity',value:.005}});
 a.feed(new Float32Array(960).fill(.02));
 for(let k=0;k<14;k++)a.feed(new Float32Array(960));
 assert.equal(a.events.filter(x=>x.t==='pcm').length,12);
});

test('Voice Activation defaults on; permission and mic start remain explicit',()=>{
 const html=readFileSync(new URL('../voice.html',import.meta.url),'utf8');
 assert.match(html,/<option value="voice" selected>/);
 assert.match(html,/id="start-mic"/);
 assert.match(html,/id="mic-meter"/);
 const js=readFileSync(new URL('../voice.js',import.meta.url),'utf8');
 assert.match(js,/getUserMedia\(/);
 assert.match(js,/voice-worklet\.js\?v=10\.55\.82/);
 assert.match(js,/OverconstrainedError/);
});

test('Android captures quieter microphones with compatibility fallback',()=>{
 const java=readFileSync(new URL('../cross-voice/mobile/android/app/src/main/java/id/sscircle/voice/app/VoiceAudioEngine.java',import.meta.url),'utf8');
 assert.match(java,/MediaRecorder\.AudioSource\.VOICE_COMMUNICATION/);
 assert.match(java,/MediaRecorder\.AudioSource\.MIC/);
 assert.match(java,/silentFrames >= 350/);
 assert.match(java,/rms >= 0\.002/);
 assert.doesNotMatch(java,/rms < 0\.012/);
});
