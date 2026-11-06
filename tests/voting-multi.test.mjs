import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const code=readFileSync(new URL('../_worker.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
const secret='multi-vote-test-secret', password='private-test-password';
const id1='11111111-1111-4111-8111-111111111111', id2='22222222-2222-4222-8222-222222222222';
function cookie(name,payload,key){const p=Buffer.from(JSON.stringify(payload)).toString('base64url');
  return name+'='+p+'.'+createHmac('sha256',key).update(p).digest('base64url');}
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE form_config(id INTEGER PRIMARY KEY,settings TEXT,pages TEXT,questions TEXT,updated_at TEXT);
 CREATE TABLE submissions(id TEXT PRIMARY KEY,status TEXT,tracking_code TEXT,submitted_at TEXT);
 CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER,expires_at INTEGER);
 CREATE TABLE revoked_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER);`);
 const pages=JSON.stringify([{id:'page-1',title:'Pendaftaran',description:'',blocks:[],routeQuestionId:'',routes:{}}]);
 db.prepare('INSERT INTO form_config(id,settings,pages,questions,updated_at) VALUES (1,?,?,?,?)').run(JSON.stringify({open:true,cooldownMinutes:0,homeVotingEnabled:true,homeVotingPermanent:true,homeVotingResultsMode:'always'}),pages,'[]','initial');
 for(const [id,code] of [[id1,'AAAABBBBCCCCDDDD1111'],[id2,'AAAABBBBCCCCDDDD2222']])db.prepare('INSERT INTO submissions VALUES(?,?,?,?)').run(id,'accepted',code,new Date().toISOString());
 const DB={prepare(sql){const stmt=db.prepare(sql);let args=[];return{bind(...next){args=next;return this;},async first(){return stmt.get(...args)||null;},async run(){const r=stmt.run(...args);return {meta:{changes:r.changes}};},async all(){return {results:stmt.all(...args)}}};}};
 const env={DB,SESSION_SECRET:secret,ADMIN_PASSWORD:password,ASSETS:{fetch:async()=>new Response('asset',{status:200})}};
 const exp=Math.floor(Date.now()/1000)+3600;
 const admin=cookie('ssc_s6_admin',{exp},secret+'|'+password);
 const p1=cookie('ssc_player',{id:id1,exp},secret+'|player-session');
 const p2=cookie('ssc_player',{id:id2,exp},secret+'|player-session');
 async function call(path,{method='GET',payload,cookie:session=''}={}){
  const r=await worker.fetch(new Request('https://sscircle.test'+path,{method,headers:{Origin:'https://sscircle.test',...(session?{Cookie:session}:{}),...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})}),env);
  let data;try{data=await r.json();}catch{data=null;}
  return {status:r.status,data};
 }
 return {call,db,admin,p1,p2};
}
const q1={id:'question-1',title:'Event favorit?',description:'',images:[],options:[{id:'option-a',label:'Dragon',description:'',images:[]},{id:'option-b',label:'Build',description:'',images:[]}]};
const q2={id:'question-2',title:'Waktu yang cocok?',description:'',images:[],options:[{id:'option-c',label:'Sabtu',description:'',images:[]},{id:'option-d',label:'Minggu',description:'',images:[]}]};
async function seed(setup){const {call,admin}=setup;
 const initial=await call('/api/admin/form',{cookie:admin});assert.equal(initial.status,200);
 const settings=initial.data.settings;
 Object.assign(settings,{homeVotingEnabled:true,homeVotingPermanent:true,homeVotingResultsMode:'always',
 homeVotingQuestions:[q1,q2],homeUpcomingEnabled:true,homeUpcomingCount:3,homeUpcomingLayout:'slider',
 eventsItems:[{id:'event-test',title:'Contoh Event',startAt:'2026-12-01T12:00:00.000Z',endAt:'2026-12-01T14:00:00.000Z',image:'',description:'',location:''}]});
 return await call('/api/admin/form',{cookie:admin,method:'PUT',payload:{settings,pages:initial.data.pages,revision:initial.data.revision}});
}
test('banyak pertanyaan terpisah, one vote per applicant per question, results per question',async()=>{
 const t=setup(), saved=await seed(t);assert.equal(saved.status,200,JSON.stringify(saved.data));
 const homepage=await t.call('/api/form');assert.equal(homepage.data.settings.homeUpcomingCount,3);assert.equal(homepage.data.settings.homeUpcomingLayout,'slider');
 let result=await t.call('/api/voting',{cookie:t.p1});assert.equal(result.status,200);
 assert.equal(result.data.questions.length,2);assert.equal(result.data.questions[0].totalVotes,0);
 assert.equal((await t.call('/api/voting/vote',{cookie:t.p1,method:'POST',payload:{questionId:'question-1',optionId:'option-a'}})).status,200);
 assert.equal((await t.call('/api/voting/vote',{cookie:t.p1,method:'POST',payload:{questionId:'question-2',optionId:'option-d'}})).status,200);
 assert.equal((await t.call('/api/voting/vote',{cookie:t.p1,method:'POST',payload:{questionId:'question-1',optionId:'option-b'}})).status,409);
 assert.equal((await t.call('/api/voting/vote',{cookie:t.p1,method:'POST',payload:{questionId:'question-2',optionId:'option-a'}})).status,400);
 assert.equal((await t.call('/api/voting/vote',{cookie:t.p1,method:'POST',payload:{questionId:'fake',optionId:'option-a'}})).status,400);
 assert.equal((await t.call('/api/voting/vote',{cookie:t.p2,method:'POST',payload:{questionId:'question-1',optionId:'option-b'}})).status,200);
 result=await t.call('/api/voting',{cookie:t.p1});
 assert.equal(result.data.questions[0].totalVotes,2);assert.equal(result.data.questions[1].totalVotes,1);
 assert.equal(result.data.questions[0].results[0].percent,50);assert.equal(result.data.questions[1].results[1].percent,100);
 assert.deepEqual(new Set(result.data.votedQuestionIds),new Set(['question-1','question-2']));
 const admin=await t.call('/api/admin/voting',{cookie:t.admin});assert.equal(admin.status,200);
 assert.equal(admin.data.questions[0].totalVotes,2);assert.equal(admin.data.questions[1].totalVotes,1);
 const savedVotes=t.db.prepare('SELECT settings FROM form_config WHERE id=1').get();
 assert.deepEqual(JSON.parse(savedVotes.settings).homeVotingVotes.map(v=>v.questionId),['question-1','question-2','question-1']);
});
test('admin cannot erase voted option; reset updates revision and allows changing choices',async()=>{
 const t=setup();assert.equal((await seed(t)).status,200);
 assert.equal((await t.call('/api/voting/vote',{cookie:t.p1,method:'POST',payload:{questionId:'question-2',optionId:'option-c'}})).status,200);
 let state=await t.call('/api/admin/form',{cookie:t.admin});
 state.data.settings.homeVotingQuestions[1].options=state.data.settings.homeVotingQuestions[1].options.filter(o=>o.id!=='option-c');
 let response=await t.call('/api/admin/form',{cookie:t.admin,method:'PUT',payload:{settings:state.data.settings,pages:state.data.pages,revision:state.data.revision}});
 assert.equal(response.status,409);
 const reset=await t.call('/api/admin/voting/reset',{cookie:t.admin,method:'POST',payload:{confirmation:'RESET VOTING'}});
 assert.equal(reset.status,200);assert.ok(reset.data.revision);
 response=await t.call('/api/admin/form',{cookie:t.admin,method:'PUT',payload:{settings:state.data.settings,pages:state.data.pages,revision:reset.data.revision}});
 assert.equal(response.status,200,JSON.stringify(response.data));
});
test('old single-question votes belong to question-1, even if questions reordered',async()=>{
 const t=setup();
 const raw={homeVotingEnabled:true,homeVotingPermanent:true,homeVotingResultsMode:'always',
 homeVotingQuestion:'Pertanyaan lama',homeVotingOptions:[{id:'opsi-1',label:'Pilihan lama'}],
 homeVotingVotes:[{optionId:'opsi-1',voterKey:'app:'+id1,account:'Lama'}]};
 t.db.prepare('UPDATE form_config SET settings=? WHERE id=1').run(JSON.stringify(raw));
 const r=await t.call('/api/voting',{cookie:t.p1});assert.equal(r.status,200);
 assert.equal(r.data.questions[0].totalVotes,1);
 assert.ok(r.data.votedQuestionIds.includes('question-1'));
});
