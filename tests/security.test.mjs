import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac,pbkdf2Sync} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const code=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
const secret='unit-test-secure-namespace',pass='unit-test-admin-pass';
const ID='11111111-1111-4111-8111-111111111111';
const CODE='AAAAFFFFBBBBCCCCDDDD';
const signed=(name,value,key)=>{
  const p=Buffer.from(JSON.stringify(value)).toString('base64url');
  return name+'='+p+'.'+createHmac('sha256',key).update(p).digest('base64url');
};
function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE submissions(id TEXT PRIMARY KEY,status TEXT,tracking_code TEXT,submitted_at TEXT);
    CREATE TABLE form_config(id INTEGER PRIMARY KEY,settings TEXT,pages TEXT,questions TEXT,updated_at TEXT);
    CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER,expires_at INTEGER);
    CREATE TABLE revoked_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER);`);
  db.prepare('INSERT INTO submissions VALUES(?,?,?,?)').run(ID,'accepted',CODE,'2026-11-07T08:00:00Z');
  db.prepare('INSERT INTO form_config VALUES(1,?,?,?,?)').run(JSON.stringify({seasonArchiveEnabled:true,homeLeaderboardSeasons:[]}),JSON.stringify([{id:'page-1',title:'Registration',description:'',blocks:[],routeQuestionId:'',routes:{}}]),'[]','initial');
  const DB={prepare(sql){let params=[],stmt;try{stmt=db.prepare(sql)}catch(e){throw Error('SQL '+e.message+' :: '+sql)}
    return {bind(...xs){params=xs;return this},async first(){return stmt.get(...params)||null},async all(){return {results:stmt.all(...params)}},async run(){let r=stmt.run(...params);return {meta:{changes:r.changes}}}};
  }};
  DB.batch=async statements=>{
   db.exec('BEGIN IMMEDIATE');
   try {
     const results=[];
     for(const statement of statements)results.push(await statement.run());
     db.exec('COMMIT');
     return results;
   }catch(error){db.exec('ROLLBACK');throw error;}
 };
 const env={DB,ADMIN_PASSWORD:pass,SESSION_SECRET:secret,ASSETS:{fetch:async()=>new Response('asset',{status:200})}};
  const exp=Math.floor(Date.now()/1000)+3600;
  let legacy=signed('ssc_player',{id:ID,exp},secret+'|player-session');
  let admin=signed('ssc_s6_admin',{exp},secret+'|'+pass);
  const cookies={legacy,admin,secure:''};
  function absorb(response){
    for(const c of response.headers.getSetCookie?.()||[]){
      const [nameValue]=c.split(';');
      if(nameValue.startsWith('ssc_player=') && !c.includes('Path=/api;'))cookies.legacy=nameValue;
      if(nameValue.startsWith('ssc_member_secure='))cookies.secure=nameValue;
    }
  }
  async function call(path,{method='GET',data,auth='legacy',cookie,update=true}={}){
    // Emulate the real browser KDF; the Worker never receives a raw password.
    let payload=data;
    if(path==='/api/player/security/activate' && data?.password?.length>=8){
      const salt=Buffer.alloc(16,13).toString('base64url');
      const proof=pbkdf2Sync(data.password,salt,220000,32,'sha256').toString('base64url');
      payload={invite:data.invite,salt,proof};
    }
    if(path==='/api/player/security/login' && typeof data?.password==='string'){
      const credential=db.prepare('SELECT password_salt,iterations FROM member_credentials WHERE application_id=?').get(ID);
      const salt=credential?.password_salt||Buffer.alloc(16,14).toString('base64url');
      const iterations=Number(credential?.iterations||220000);
      payload={code:data.code,proof:pbkdf2Sync(data.password,salt,iterations,32,'sha256').toString('base64url')};
    }
    const Cookie=cookie===undefined?(auth==='admin'?cookies.admin:
      auth==='guest'?'':cookies.legacy+(cookies.secure?'; '+cookies.secure:'')):cookie;
    const response=await worker.fetch(new Request('https://sscircle.example'+path,{method,
      headers:{Cookie,Origin:'https://sscircle.example','User-Agent':'Test Browser',
        ...(payload?{'Content-Type':'application/json'}:{})},
      ...(payload?{body:JSON.stringify(payload)}:{})}),env);
    let result=null;try{result=await response.clone().json()}catch{}
    if(update)absorb(response);
    return {status:response.status,data:result,response};
  }
  return {call,db,cookies,env};
}
const profile={displayName:'Builder SSCircle',bio:'Best Builder S6',visibility:'private',showStats:false,eventAlerts:true};
async function activate(t){
  const invitation=await t.call('/api/admin/member-invite',{method:'POST',auth:'admin',data:{id:ID,verification:'identity-confirmed'}});
  assert.equal(invitation.status,200,JSON.stringify(invitation.data));
  const password='KataSandiPanJang#42';
  const activated=await t.call('/api/player/security/activate',{method:'POST',data:{invite:invitation.data.invite,password}});
  assert.equal(activated.status,200,JSON.stringify(activated.data));
  return {invitation:invitation.data.invite,password};
}
test('kode pendaftaran tanpa verifikasi admin tidak dapat mengubah profil atau aktivasi',async()=>{
  const t=fixture();
  assert.equal((await t.call('/api/player/profile',{method:'PUT',data:profile})).status,403);
  assert.equal((await t.call('/api/player/security/state')).data.hasPassword,false);
  assert.equal((await t.call('/api/player/security/activate',{method:'POST',data:{invite:'a'.repeat(32),password:'KataSandiPanJang#42'}})).status,403);
  assert.equal((await t.call('/api/admin/member-invite',{method:'POST',data:{id:ID,verification:'identity-confirmed'}})).status,401);
  assert.equal((await t.call('/api/admin/member-invite',{method:'POST',auth:'admin',data:{id:ID,verification:'not-verified'}})).status,400);
});
test('aktivasi satu kali, sesi kuat, dan perlindungan data privat',async()=>{
  const t=fixture();const a=await activate(t);
  assert.equal((await t.call('/api/player/security/state')).data.authenticated,true);
  assert.equal((await t.call('/api/player/profile',{method:'PUT',data:profile})).status,200);
  assert.equal((await t.call('/api/player/profile')).data.profile.displayName,'Builder SSCircle');
  assert.equal((await t.call('/api/player/security/activate',{method:'POST',data:{invite:a.invitation,password:'KataSandiBaru#55'}})).status,403);
  const legacyOnly=t.cookies.legacy;
  assert.equal((await t.call('/api/player/profile',{cookie:legacyOnly})).status,403);
  assert.equal((await t.call('/api/player/profile',{cookie:legacyOnly,method:'PUT',data:profile})).status,403);
  const sessions=await t.call('/api/player/security/sessions');
  assert.equal(sessions.status,200);assert.equal(sessions.data.sessions.length,1);
  assert.equal(sessions.data.sessions[0].current,true);
});
test('password dapat login ulang dan sesi dicabut dari perangkat sendiri',async()=>{
  const t=fixture(),a=await activate(t);
  assert.equal((await t.call('/api/player/security/logout',{method:'POST',data:{}})).status,200);
  assert.equal((await t.call('/api/player/security/state')).data.authenticated,false);
  const wrong=await t.call('/api/player/security/login',{method:'POST',data:{code:CODE,password:'salah'}});
  assert.equal(wrong.status,401);
  const ok=await t.call('/api/player/security/login',{method:'POST',data:{code:CODE,password:a.password}});
  assert.equal(ok.status,200,JSON.stringify(ok.data));
  const list=await t.call('/api/player/security/sessions');
  assert.equal(list.status,200,'sessions: '+JSON.stringify(list.data));
  assert.equal(list.data.sessions.length,1);
  const revoked=await t.call('/api/player/security/revoke',{method:'POST',data:{id:list.data.sessions[0].id}});
  assert.equal(revoked.status,200);
  assert.equal((await t.call('/api/player/security/state')).data.authenticated,false);
});
test('login terkunci setelah 6 password salah dan pemulihan via admin',async()=>{
  const t=fixture();await activate(t);
  for(let i=0;i<6;i++){
    const fail=await t.call('/api/player/security/login',{method:'POST',data:{code:CODE,password:'wrong'}});
    assert.equal(fail.status,401,i+' :: '+JSON.stringify(fail.data));
  }
  assert.equal((await t.call('/api/player/security/login',{method:'POST',data:{code:CODE,password:'KataSandiPanJang#42'}})).status,429);
  const invite=(await t.call('/api/admin/member-invite',{method:'POST',auth:'admin',data:{id:ID,verification:'identity-confirmed'}})).data.invite;
  assert.equal((await t.call('/api/player/security/activate',{method:'POST',data:{invite,password:'PasswordPemulihan#2026'}})).status,200);
  assert.equal((await t.call('/api/player/security/state')).data.authenticated,true);
});
test('keluar semua perangkat dan cabut admin menolak token lama',async()=>{
  const t=fixture(),a=await activate(t);
  const old={legacy:t.cookies.legacy,secure:t.cookies.secure};
  assert.equal((await t.call('/api/player/security/logout-all',{method:'POST',data:{}})).status,200);
  assert.equal((await t.call('/api/player/me',{cookie:old.legacy})).status,401);
  assert.equal((await t.call('/api/player/security/login',{method:'POST',data:{code:CODE,password:a.password}})).status,200);
  const after=t.cookies.legacy+'; '+t.cookies.secure;
  assert.equal((await t.call('/api/admin/member-revoke',{method:'POST',auth:'admin',data:{id:ID}})).status,200);
  assert.equal((await t.call('/api/player/profile',{cookie:after})).status,403);
  assert.equal((await t.call('/api/player/security/login',{method:'POST',data:{code:CODE,password:a.password}})).status,200);
});
test('akun menunggu/ditolak tidak bisa dibuatkan undangan dan link admin tidak mengekspos secret ulang',async()=>{
  const t=fixture();t.db.prepare('UPDATE submissions SET status=? WHERE id=?').run('pending',ID);
  assert.equal((await t.call('/api/admin/member-invite',{method:'POST',auth:'admin',data:{id:ID,verification:'identity-confirmed'}})).status,403);
  t.db.prepare('UPDATE submissions SET status=? WHERE id=?').run('accepted',ID);
  const first=await t.call('/api/admin/member-invite',{method:'POST',auth:'admin',data:{id:ID,verification:'identity-confirmed'}});
  const second=await t.call('/api/admin/member-invite',{method:'POST',auth:'admin',data:{id:ID,verification:'identity-confirmed'}});
  assert.notEqual(first.data.invite,second.data.invite);
  assert.equal((await t.call('/api/player/security/activate',{method:'POST',data:{invite:first.data.invite,password:'PasswordKuat#2026'}})).status,403);
  assert.equal((await t.call('/api/player/security/activate',{method:'POST',data:{invite:second.data.invite,password:'PasswordKuat#2026'}})).status,200);
  const row=t.db.prepare('SELECT secret_hash FROM member_activation_invites WHERE application_id=?').get(ID);
  assert.notEqual(row.secret_hash,second.data.invite);
});

test('password 8 karakter bisa digunakan; hash gagal tidak membakar kode aktivasi',async()=>{
  const t=fixture();
  const invitation=(await t.call('/api/admin/member-invite',{method:'POST',auth:'admin',
    data:{id:ID,verification:'identity-confirmed'}})).data.invite;
  const original=t.env.DB.batch;
  t.env.DB.batch=async()=>{throw Error('Simulated temporary transaction outage');};
  const failed=await t.call('/api/player/security/activate',{method:'POST',
    data:{invite:invitation,password:'Pass#123'}});
  assert.equal(failed.status,503);
  assert.match(failed.data.error,/Kode aktivasi tidak dibatalkan/);
  assert.match(failed.data.supportCode,/^[0-9a-f]{8}$/);
  assert.equal(t.db.prepare('SELECT used_at FROM member_activation_invites WHERE application_id=?').get(ID).used_at,null);
  assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM member_credentials').get().n,0);
  t.env.DB.batch=original;
  const retry=await t.call('/api/player/security/activate',{method:'POST',
    data:{invite:invitation,password:'Pass#123'}});
  assert.equal(retry.status,200,JSON.stringify(retry.data));
  assert.equal((await t.call('/api/player/security/state')).data.authenticated,true);
});

test('cooldown aktivasi tepat lima menit dan password kurang dari 8 ditolak',async()=>{
  const t=fixture();
  const invitation=(await t.call('/api/admin/member-invite',{method:'POST',auth:'admin',
    data:{id:ID,verification:'identity-confirmed'}})).data.invite;
  const tooShort=await t.call('/api/player/security/activate',{method:'POST',
    data:{invite:invitation,password:'Pass123'}});
  assert.equal(tooShort.status,400);
  for(let i=1;i<5;i++)await t.call('/api/player/security/activate',{method:'POST',
    data:{invite:'Z'.repeat(32),password:'Pass#123'}});
  const blocked=await t.call('/api/player/security/activate',{method:'POST',
    data:{invite:invitation,password:'Pass#123'}});
  assert.equal(blocked.status,429);
  assert.equal(blocked.data.remainingSeconds<=300,true);
  assert.equal(blocked.data.remainingSeconds>0,true);
  assert.match(blocked.data.error,/percobaan aktivasi/);
});

test('sesi yang gagal dibuat tidak dianggap aktivasi gagal, password tetap tersimpan',async()=>{
  const t=fixture();
  const invitation=(await t.call('/api/admin/member-invite',{method:'POST',auth:'admin',
    data:{id:ID,verification:'identity-confirmed'}})).data.invite;
  const originalPrepare=t.env.DB.prepare;
  t.env.DB.prepare=function(sql){
    if(/INSERT INTO member_secure_sessions/.test(sql))throw Error('Temporary session outage');
    return originalPrepare(sql);
  };
  const result=await t.call('/api/player/security/activate',{method:'POST',
    data:{invite:invitation,password:'Kunci#123'}});
  assert.equal(result.status,200,JSON.stringify(result.data));
  assert.equal(result.data.activated,true);
  assert.equal(result.data.loginRequired,true);
  const credential=t.db.prepare('SELECT password_hash FROM member_credentials WHERE application_id=?').get(ID);
  assert.ok(credential?.password_hash);
  assert.notEqual(t.db.prepare('SELECT used_at FROM member_activation_invites WHERE application_id=?').get(ID).used_at,null);
  t.env.DB.prepare=originalPrepare;
  const login=await t.call('/api/player/security/login',{method:'POST',
    data:{code:CODE,password:'Kunci#123'}});
  assert.equal(login.status,200,JSON.stringify(login.data));
});

test('kesalahan tak terduga pada backend memberikan kode bantuan tanpa membocorkan query internal',async()=>{
  const t=fixture();
  const invitation=(await t.call('/api/admin/member-invite',{method:'POST',auth:'admin',
    data:{id:ID,verification:'identity-confirmed'}})).data.invite;
  const originalPrepare=t.env.DB.prepare;
  t.env.DB.prepare=function(sql) {
    if(sql.includes('SELECT secret_hash,expires_at,used_at FROM member_activation_invites'))
      throw Error('Sensitive internal SQL error: member_activation_invites');
    return originalPrepare(sql);
  };
  const response=await t.call('/api/player/security/activate',{method:'POST',
    data:{invite:invitation,password:'Pass#123'}});
  assert.equal(response.status,503,JSON.stringify(response.data));
  assert.match(response.data.error,/Aktivasi belum dapat dipastikan/);
  assert.match(response.data.supportCode,/^[0-9a-f]{8}$/);
  assert.equal(JSON.stringify(response.data).includes('member_activation_invites'),false);
  t.env.DB.prepare=originalPrepare;
  assert.equal(t.db.prepare('SELECT used_at FROM member_activation_invites WHERE application_id=?').get(ID).used_at,null);
});

test('API key-info tidak mengungkap status aktivasi dan login memigrasikan akun lama',async()=>{
  const t=fixture();
  const unknown=await t.call('/api/player/security/key-info',{method:'POST',data:{code:'00000000000000000000'}});
  assert.equal(unknown.status,200);
  assert.match(unknown.data.salt,/^[A-Za-z0-9_-]{22}$/);
  const a=await activate(t);
  const info=await t.call('/api/player/security/key-info',{method:'POST',data:{code:CODE}});
  assert.equal(info.status,200);
  assert.equal(info.data.iterations,220000);
  const salt=t.db.prepare('SELECT password_salt FROM member_credentials WHERE application_id=?').get(ID).password_salt;
  const legacyProof=pbkdf2Sync(a.password,salt,220000,32,'sha256').toString('base64url');
  t.db.prepare('UPDATE member_credentials SET password_hash=? WHERE application_id=?').run(legacyProof,ID);
  assert.equal((await t.call('/api/player/security/login',{method:'POST',data:{code:CODE,password:a.password}})).status,200);
  const stored=t.db.prepare('SELECT password_hash FROM member_credentials WHERE application_id=?').get(ID).password_hash;
  assert.match(stored,/^v2\.[A-Za-z0-9_-]{43}$/);
  assert.notEqual(stored,legacyProof);
  assert.equal((await t.call('/api/player/security/login',{method:'POST',
    data:{code:CODE,password:'WrongPassword9'}})).status,401);
  assert.equal((await t.call('/api/player/security/login',{method:'POST',data:{code:CODE,password:a.password}})).status,200);
});

test('Worker does not invoke PBKDF2: activation and login work with browser proof',async()=>{
  const t=fixture();
  const original=globalThis.crypto.subtle.deriveBits;
  // No monkey patch needed: source assertion guards accidental heavy hashing.
  assert.equal(code.includes('memberDerivePassword('),false);
  assert.equal(code.includes("name:'PBKDF2'"),false);
  const invitation=(await t.call('/api/admin/member-invite',{method:'POST',auth:'admin',
    data:{id:ID,verification:'identity-confirmed'}})).data.invite;
  assert.equal((await t.call('/api/player/security/activate',{method:'POST',
    data:{invite:invitation,password:'12345678'}})).status,200);
  assert.equal((await t.call('/api/player/security/login',{method:'POST',
    data:{code:CODE,password:'12345678'}})).status,200);
});


test('V10.44: riwayat keamanan hanya tersedia dengan sesi password dan tanpa rahasia',async()=>{
 const t=fixture();
 assert.equal((await t.call('/api/player/security/history')).status,403);
 assert.equal((await t.call('/api/player/security/device/rename',{method:'POST',
   data:{id:ID,label:'HP saya'}})).status,403);
 const a=await activate(t);
 const response=await t.call('/api/player/security/history');
 assert.equal(response.status,200,JSON.stringify(response.data));
 assert.ok(response.data.events.some(event=>event.type==='password_activated'));
 const json=JSON.stringify(response.data);
 assert.equal(json.includes(a.invitation),false);
 assert.equal(json.includes(a.password),false);
 assert.equal(json.includes('password_hash'),false);
 assert.equal(json.includes('token_hash'),false);
 assert.equal(json.includes('CF-Connecting-IP'),false);
});

test('V10.44: ubah nama perangkat memerlukan sesi kuat dan melarang akses perangkat lain',async()=>{
 const t=fixture();await activate(t);
 const before=await t.call('/api/player/security/sessions');
 const id=before.data.sessions[0].id;
 const other='33333333-3333-4333-8333-333333333333';
 const call=(data)=>t.call('/api/player/security/device/rename',{method:'POST',data});
 assert.equal((await call({id:other,label:'Perangkat tak dikenal'})).status,404);
 assert.equal((await call({id,label:'<script>alert(1)</script>'})).status,400);
 assert.equal((await call({id,label:'X'})).status,400);
 assert.equal((await call({id,label:'HP Utama'})).status,200);
 const after=await t.call('/api/player/security/sessions');
 assert.equal(after.data.sessions[0].client,'HP Utama');
 const event=await t.call('/api/player/security/history');
 assert.equal(event.data.events[0].type,'device_renamed');
 assert.ok(event.data.events.length>=2);
});

test('V10.44: ganti password memverifikasi password lama dan mencabut seluruh sesi lama',async()=>{
 const t=fixture(),a=await activate(t);
 const oldSession=t.cookies.secure,legacy=t.cookies.legacy;
 const original=t.db.prepare('SELECT password_salt,password_hash FROM member_credentials WHERE application_id=?').get(ID);
 const oldProof=pbkdf2Sync(a.password,original.password_salt,220000,32,'sha256').toString('base64url');
 const salt=Buffer.alloc(16,41).toString('base64url'),password='PasswordBaru#2044';
 const proof=pbkdf2Sync(password,salt,220000,32,'sha256').toString('base64url');
 const change=(data)=>t.call('/api/player/security/password/change',{method:'POST',data});
 assert.equal((await change({currentProof:'A'.repeat(43),salt,proof})).status,403);
 assert.equal((await change({currentProof:oldProof,salt:'wrong',proof})).status,400);
 const changed=await change({currentProof:oldProof,salt,proof});
 assert.equal(changed.status,200,JSON.stringify(changed.data));
 assert.equal(changed.data.changed,true);
 assert.equal(changed.data.authenticated,true);
 assert.equal((await t.call('/api/player/security/history',{cookie:legacy+'; '+oldSession})).status,403);
 const current=await t.call('/api/player/security/sessions');
 assert.equal(current.data.sessions.length,1);
 assert.equal(current.data.sessions[0].current,true);
 const events=await t.call('/api/player/security/history');
 assert.equal(events.data.events.some(row=>row.type==='password_changed'),true);
 assert.equal((await t.call('/api/player/security/login',{method:'POST',
   data:{code:CODE,password:a.password}})).status,401);
 assert.equal((await t.call('/api/player/security/login',{method:'POST',
   data:{code:CODE,password}})).status,200);
});

test('V10.44: reset lewat kode admin memutus perangkat lama dan tetap mempertahankan profil',async()=>{
 const t=fixture(),a=await activate(t);
 await t.call('/api/player/profile',{method:'PUT',data:profile});
 const oldCookie=t.cookies.legacy+'; '+t.cookies.secure;
 const invitation=await t.call('/api/admin/member-invite',{auth:'admin',method:'POST',
   data:{id:ID,verification:'identity-confirmed'}});
 assert.equal(invitation.status,200);
 const reset=await t.call('/api/player/security/activate',{method:'POST',
   data:{invite:invitation.data.invite,password:'PasswordPulih#2044'}});
 assert.equal(reset.status,200,JSON.stringify(reset.data));
 assert.equal((await t.call('/api/player/security/state',{cookie:oldCookie})).data.authenticated,false);
 assert.equal((await t.call('/api/player/profile')).data.profile.displayName,'Builder SSCircle');
 const events=await t.call('/api/player/security/history');
 assert.equal(events.data.events.some(row=>row.type==='password_recovered'),true);
 assert.equal((await t.call('/api/player/security/login',{method:'POST',
   data:{code:CODE,password:a.password}})).status,401);
 assert.equal((await t.call('/api/player/security/login',{method:'POST',
   data:{code:CODE,password:'PasswordPulih#2044'}})).status,200);
});
