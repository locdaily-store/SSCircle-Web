/* SSCircle V10.40: PBKDF2 on the player's device, not inside a limited CPU Worker.
   The password NEVER leaves the browser. Only a salted, derived proof is sent
   through HTTPS and the Worker stores a separate SHA-256 verifier of that proof.
   A proof is password-equivalent; it must never be logged or placed in a URL. */
'use strict';
(() => {
  const ITERATIONS=220000;
  const text=new TextEncoder();
  const alphabet=/^[A-Za-z0-9_-]+$/;
  function base64url(bytes) {
    let raw='';
    for (const byte of bytes) raw+=String.fromCharCode(byte);
    return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function validPassword(password) {
    return typeof password==='string' && password.length>=8 && password.length<=128 &&
      !/[\x00-\x1f\x7f]/.test(password);
  }
  async function derive(password,salt,iterations=ITERATIONS){
    if(!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues)
      throw Error('Browser tidak mendukung keamanan password. Gunakan browser terbaru dengan HTTPS.');
    if(!validPassword(password))
      throw Error('Password harus terdiri dari 8–128 karakter tanpa karakter kontrol.');
    if(typeof salt!=='string'||salt.length!==22||!alphabet.test(salt)||
       !Number.isSafeInteger(iterations)||iterations<220000||iterations>500000)
      throw Error('Pengaturan keamanan akun tidak valid. Muat ulang halaman.');
    try{
      const key=await crypto.subtle.importKey('raw',text.encode(password),
        'PBKDF2',false,['deriveBits']);
      const result=await crypto.subtle.deriveBits({
        name:'PBKDF2',hash:'SHA-256',salt:text.encode(salt),
        iterations
      },key,256);
      return base64url(new Uint8Array(result));
    }catch(error){
      console.warn('[SSCircle] Perangkat tidak dapat menyelesaikan pengamanan password.');
      throw Error('Password tidak dapat diamankan di browser. Perbarui browser dan coba lagi.');
    }
  }
  async function create(password){
    if(!globalThis.crypto?.getRandomValues)
      throw Error('Browser tidak mendukung keamanan password. Gunakan browser terbaru dengan HTTPS.');
    const salt=base64url(crypto.getRandomValues(new Uint8Array(16)));
    const proof=await derive(password,salt,ITERATIONS);
    return {salt,proof};
  }
  async function login(code,password){
    if(typeof code!=='string'||!code.trim())throw Error('Masukkan kode pendaftaran.');
    if(!validPassword(password))throw Error('Masukkan password dashboard minimal 8 karakter.');
    let response;
    try{
      response=await fetch('/api/player/security/key-info',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify({code:code.trim()})
      });
    }catch{
      throw Error('Tidak dapat menghubungi server untuk login. Periksa koneksi.');
    }
    let data;
    try{data=await response.json()}catch{data={};}
    if(!response.ok){
      const error=new Error(data.error||'Pengaturan login tidak dapat dimuat.');
      error.status=response.status;
      throw error;
    }
    return {code:code.trim(),proof:await derive(password,data.salt,data.iterations)};
  }
  window.SSCirclePassword=Object.freeze({create,login});
})();
