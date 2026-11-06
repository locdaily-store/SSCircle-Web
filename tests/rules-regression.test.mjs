import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';

const file = readFileSync(new URL('../_worker.js', import.meta.url),'utf8');
const worker = (await import('data:text/javascript;base64,' + Buffer.from(file).toString('base64'))).default;
const secret='rules-test-secret', pass='rules-test-admin-password';
function setup() {
  const row = {settings:JSON.stringify({open:true,cooldownMinutes:0}),pages:JSON.stringify([{id:'page-1',title:'Pendaftaran',description:'',blocks:[],routeQuestionId:'',routes:{}}]),questions:'[]',updated_at:'rev-one'};
  const env={SESSION_SECRET:secret,ADMIN_PASSWORD:pass,ASSETS:{fetch:async r=>new Response('asset: '+new URL(r.url).pathname,{headers:{'Content-Type':'text/html'}})}, DB:{prepare(sql){return {args:[],bind(...args){this.args=args;return this;}, async first(){
    if(/FROM form_config/.test(sql))return {...row};
    if(/SELECT count FROM rate_limits/.test(sql))return {count:1};
    if(/FROM rate_limits/.test(sql))return null;
    if(/revoked_sessions/.test(sql))return null;
    throw Error('Unmocked first: '+sql);
  },async run(){
    if(/UPDATE form_config/.test(sql)){const [settings,pages,questions,revision,old]=this.args;if(row.updated_at!==old)return {meta:{changes:0}};Object.assign(row,{settings,pages,questions,updated_at:revision});return{meta:{changes:1}};}
    if(/rate_limits/.test(sql))return{meta:{changes:1}};
    throw Error('Unmocked run: '+sql);
  }};}}};
  const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
  const signature=(value,key)=>createHmac('sha256',key).update(value).digest('base64url');
  const payload=encode({exp:Math.floor(Date.now()/1000)+3600});
  const adminCookie='ssc_s6_admin='+payload+'.'+signature(payload,secret+'|'+pass);
  async function request(path,{method='GET',body,cookie=''}={}) {
    return worker.fetch(new Request('https://sscircle.example'+path,{method,headers:{Origin:'https://sscircle.example',...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
  }
  return {row,env,request,adminCookie};
}
test('pendaftar tidak dapat langsung membuka /registration atau mengirim formulir sebelum setuju',async()=>{
  const {request}=setup();
  const result=await request('/registration');
  assert.equal(result.status,302);assert.equal(result.headers.get('Location'),'/rules');
  assert.equal((await request('/registration.html')).status,302);
  assert.equal((await request('/rules')).status,200);
  const api=await request('/api/rules'); const data=await api.json();
  assert.equal(api.status,200);assert.equal(data.rulesSections.length,2);
  assert.equal(data.rulesSections.reduce((n,s)=>n+s.items.length,0),16);
  assert.ok(data.version);
  const denied=await request('/api/apply',{method:'POST',body:{answers:{},website:''}});
  assert.equal(denied.status,403);assert.match((await denied.json()).error,/Server Rules/);
});
test('tanda tangan aturan mengizinkan akses dan menolak versi yang sudah berubah',async()=>{
  const {request,row}=setup();
  const data=await (await request('/api/rules')).json();
  assert.equal((await request('/api/rules/agree',{method:'POST',body:{agreed:false,version:data.version}})).status,400);
  const approved=await request('/api/rules/agree',{method:'POST',body:{agreed:true,version:data.version}});
  assert.equal(approved.status,200);
  const setCookie=approved.headers.get('Set-Cookie');
  assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Lax/);assert.match(setCookie,/Secure/);
  const cookie=setCookie.split(';')[0];
  const allowed=await request('/registration',{cookie});
  assert.equal(allowed.status,200);assert.match(await allowed.text(),/asset:/);
  assert.equal((await request('/registration.html',{cookie})).headers.get('Location'),'/registration');
  row.settings=JSON.stringify({open:true,cooldownMinutes:0,rulesTitle:'Aturan SSCircle yang baru'});
  assert.equal((await request('/registration',{cookie})).status,302);
  assert.equal((await request('/api/rules/agree',{method:'POST',body:{agreed:true,version:data.version}})).status,409);
});
test('akun admin dapat menyimpan seluruh teks dan kategori aturan tanpa mengubah halaman lain',async()=>{
  const {request,row,adminCookie}=setup();
  const d=await (await request('/api/admin/form',{cookie:adminCookie})).json();
  d.settings.rulesTitle='Aturan Season S6';
  d.settings.rulesSections[0].title='Komunitas Season S6';
  d.settings.rulesSections[0].items.push({id:'extra-rule',text:'Aturan tambahan S6',detail:'Gunakan bahasa sopan di Discord.'});
  const res=await request('/api/admin/form',{method:'PUT',body:{settings:d.settings,pages:d.pages,revision:d.revision},cookie:adminCookie});
  assert.equal(res.status,200,await res.clone().text());
  const updated=await (await request('/api/rules')).json();
  assert.equal(updated.rulesTitle,'Aturan Season S6');
  assert.equal(updated.rulesSections[0].items.at(-1).text,'Aturan tambahan S6');
  assert.equal(JSON.parse(row.settings).rulesSections[0].title,'Komunitas Season S6');
});
test('preview editor tidak perlu menyetujui rules untuk memuat tampilan Registration',async()=>{
  const {request}=setup();
  const preview=await request('/registration?ssc_registration_preview=1');
  assert.equal(preview.status,200);
});
test('event baru dari Admin tersimpan di D1 dan tampil pada API publik', async () => {
  const { request, row, adminCookie } = setup();
  const initial = await (await request('/api/events')).json();
  assert.equal(initial.enabled, true);
  assert.deepEqual(initial.events, []);
  const form = await (await request('/api/admin/form',{cookie:adminCookie})).json();
  form.settings.eventsTitle = 'Jadwal SSCircle S6';
  form.settings.eventsItems = [{id:'event-testing',title:'Ender Dragon Battle',description:'Berkumpul di spawn.',
    image:'assets/gallery/sscircle-01.webp',location:'Spawn',startAt:'2026-11-15T11:00:00.000Z',endAt:'2026-11-15T13:00:00.000Z'}];
  const saved = await request('/api/admin/form',{method:'PUT',body:{settings:form.settings,pages:form.pages,revision:form.revision},cookie:adminCookie});
  assert.equal(saved.status,200,await saved.clone().text());
  const publicData = await (await request('/api/events')).json();
  assert.equal(publicData.title,'Jadwal SSCircle S6');
  assert.equal(publicData.events.length,1);
  assert.equal(publicData.events[0].title,'Ender Dragon Battle');
  assert.equal(JSON.parse(row.settings).eventsItems.length,1);
});
test('server menolak durasi event terbalik dan validasi gambar yang tidak aman',async()=>{
  const {request,adminCookie}=setup();
  const form=await (await request('/api/admin/form',{cookie:adminCookie})).json();
  form.settings.eventsItems=[{id:'event-broken',title:'Jadwal keliru',description:'',startAt:'2026-11-15T13:00:00.000Z',endAt:'2026-11-15T11:00:00.000Z'}];
  let response=await request('/api/admin/form',{method:'PUT',body:{settings:form.settings,pages:form.pages,revision:form.revision},cookie:adminCookie});
  assert.notEqual(response.status,200);
  form.settings.eventsItems[0].endAt='2026-11-15T15:00:00.000Z';
  form.settings.eventsItems[0].image='javascript:alert(1)';
  response=await request('/api/admin/form',{method:'PUT',body:{settings:form.settings,pages:form.pages,revision:form.revision},cookie:adminCookie});
  assert.notEqual(response.status,200);
});
test('aturan default yang dihapus tidak muncul kembali dari konfigurasi lama',async()=>{
  const {request,row}=setup();
  const original=(await (await request('/api/rules')).json()).rulesSections;
  row.settings=JSON.stringify({open:true,rulesSections:[{...original[0],items:[...original[0].items,{id:'community-7',text:'Bagikan konten di tempatnya',detail:'Teks lama.'}]},original[1]]});
  const result=await (await request('/api/rules')).json();
  assert.equal(result.rulesSections[0].items.some(x=>x.text==='Bagikan konten di tempatnya'),false);
});
