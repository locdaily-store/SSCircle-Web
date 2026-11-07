import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
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
    const Cookie=cookie===undefined?(auth==='admin'?cookies.admin:
      auth==='guest'?'':cookies.legacy+(cookies.secure?'; '+cookies.secure:'')):cookie;
    const response=await worker.fetch(new Request('https://sscircle.example'+path,{method,
      headers:{Cookie,Origin:'https://sscircle.example','User-Agent':'Test Browser',
        ...(data?{'Content-Type':'application/json'}:{})},
      ...(data?{body:JSON.stringify(data)}:{})}),env);
    let result=null;try{result=await response.clone().json()}catch{}
    if(update)absorb(response);
    return {status:response.status,data:result,response};
  }
  return {call,db,cookies};
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
