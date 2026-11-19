// AudioWorklet: capture mono PCM 48 kHz in 20 ms frames. No recording persistence.
class SSCircleMicrophone extends AudioWorkletProcessor {
  constructor(){
    super();this.frame=new Float32Array(960);this.used=0;this.inputRate=sampleRate;
    this.phase=0;this.previous=0;this.muted=false;this.level=0;this.sensitivity=0.02;
    this.port.onmessage=e=>{
      if(e.data?.t==='mute')this.muted=!!e.data.value;
      if(e.data?.t==='sensitivity')this.sensitivity=Number(e.data.value)||0.02;
    };
  }
  process(inputs,outputs){
    const out=outputs[0]?.[0];if(out)out.fill(0); // never monitor microphone through speaker by default
    const input=inputs[0]?.[0];
    if(!input)return true;
    let sum=0;for(const sample of input)sum+=sample*sample;
    const rms=Math.sqrt(sum/input.length);
    this.level=rms;
    this.port.postMessage({t:'level',value:rms});
    if(this.muted)return true;
    // Linear resample to 48k output if browser ignored requested AudioContext rate.
    for(let i=0;i<input.length;i++){
      const s=Math.max(-1,Math.min(1,input[i]));
      this.phase+=48000/this.inputRate;
      while(this.phase>=1){
        this.phase-=1;
        this.frame[this.used++]=s;
        if(this.used===960){
          if(rms>=this.sensitivity || this.sensitivity===0)
            this.port.postMessage({t:'pcm',frame:this.frame},[this.frame.buffer]);
          this.frame=new Float32Array(960);this.used=0;
        }
      }
      this.previous=s;
    }
    return true;
  }
}
registerProcessor('sscircle-microphone',SSCircleMicrophone);
