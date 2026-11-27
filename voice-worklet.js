// SSCircle microphone: mono PCM 48kHz, 960 samples per 20 ms frame.
// Microphone samples stay in memory and are never recorded to local storage.
class SSCircleMicrophone extends AudioWorkletProcessor {
  constructor(){
    super();
    this.frame=new Float32Array(960);this.used=0;this.frameEnergy=0;
    this.inputRate=sampleRate;this.phase=0;this.muted=false;
    this.sensitivity=0.006;this.hangover=0;
    this.port.onmessage=e=>{
      if(e.data?.t==='mute'){
        this.muted=!!e.data.value;
        if(this.muted){this.used=0;this.frameEnergy=0;this.hangover=0;}
      }
      if(e.data?.t==='sensitivity'){
        const value=Number(e.data.value);
        // Zero deliberately means no VAD when holding Push-to-Talk.
        if(Number.isFinite(value))this.sensitivity=Math.max(0,Math.min(.1,value));
      }
    };
  }
  process(inputs,outputs){
    const out=outputs[0]?.[0];if(out)out.fill(0); // no microphone feedback
    const input=inputs[0]?.[0];
    if(!input)return true;
    let sum=0;for(const sample of input)sum+=sample*sample;
    const rms=Math.sqrt(sum/input.length);
    this.port.postMessage({t:'level',value:rms});
    if(this.muted)return true;
    for(let i=0;i<input.length;i++){
      const s=Math.max(-1,Math.min(1,input[i]));
      this.phase+=48000/this.inputRate;
      while(this.phase>=1){
        this.phase-=1;
        this.frame[this.used++]=s;this.frameEnergy+=s*s;
        if(this.used===960){
          // Calculate energy for the WHOLE 20 ms packet, not the last
          // 128-sample render quantum. Preserve 240ms speech hangover.
          const frameRms=Math.sqrt(this.frameEnergy/960);
          const talking=frameRms>=this.sensitivity;
          if(talking)this.hangover=12;
          else if(this.hangover>0)this.hangover--;
          if(this.sensitivity===0||talking||this.hangover>0)
            this.port.postMessage({t:'pcm',frame:this.frame},[this.frame.buffer]);
          this.frame=new Float32Array(960);this.used=0;this.frameEnergy=0;
        }
      }
    }
    return true;
  }
}
registerProcessor('sscircle-microphone',SSCircleMicrophone);
