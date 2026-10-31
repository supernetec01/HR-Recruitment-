import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {createApp} from '../server/app.mjs';
import {bootstrapAdmin,createAccount} from '../server/accounts.mjs';
import {openDatabase} from '../server/db.mjs';

const password = randomBytes(24).toString('hex');
const pdf = readFileSync(new URL('./fixtures/cv.pdf',import.meta.url));
const jobData = {title:'QA regression JD',department:'QA',location:'Super Net fixture',openings:1,description:'Synthetic job description for recruitment regression testing.'};
let directory,db,server,base,admin,hrA,hrB;
async function request(path,{method='GET',data,form,idem,session=admin}={}) {
  const headers = {'X-Requested-With':'SuperNet'};
  if (session) headers.Cookie=session;
  if (data) headers['Content-Type']='application/json';
  if (idem) headers['Idempotency-Key']=idem;
  const result=await fetch(`${base}/api/v1${path}`,{method,headers,body:form || (data ? JSON.stringify(data) : undefined)});
  return {status:result.status,body:await result.json(),headers:result.headers};
}
async function login(username) {
  const result=await request('/login',{method:'POST',session:'',data:{login:username,password}});
  assert.equal(result.status,200);return result.headers.get('set-cookie').split(';')[0];
}
function form(data,withCV=false) {
  const result=new FormData();for(const [key,value] of Object.entries(data))result.set(key,String(value));
  if(withCV)result.set('file',new Blob([pdf]),'QA CV.pdf');
  return result;
}
async function candidate(data={},withCV=false) {
  const result=await request('/candidates',{method:'POST',idem:randomUUID(),form:form({fullName:'QA candidate',source:'Email',...data},withCV)});
  assert.equal(result.status,200);return result.body.candidate;
}
async function job(data={}) {
  const result=await request('/jobs',{method:'POST',idem:randomUUID(),data:{...jobData,...data}});
  assert.equal(result.status,201);return result.body.job;
}
before(async()=>{
  directory=mkdtempSync(join(tmpdir(),'supernet-qa-fixes-'));
  const instance=createApp({dataDir:directory});db=instance.db;
  bootstrapAdmin(db,{username:'admin',password});
  createAccount(db,{username:'hr-a',name:'HR A',role:'hr',password});
  createAccount(db,{username:'hr-b',name:'HR B',role:'hr',password});
  server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  base=`http://127.0.0.1:${server.address().port}`;
  admin=await login('admin');hrA=await login('hr-a');hrB=await login('hr-b');
});
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();rmSync(directory,{recursive:true,force:true});});

test('Two HR snapshots cannot overwrite each other or partially save a stale edit',async()=>{
  const profile=await candidate({notes:'Original note'});
  const first=(await request(`/candidates/${profile.id}`,{session:hrA})).body;
  const second=(await request(`/candidates/${profile.id}`,{session:hrB})).body;
  const changed=await request(`/candidates/${profile.id}`,{session:hrA,method:'PATCH',data:{notes:'New note from HR A',expectedRevision:first.revision}});
  assert.equal(changed.status,200);assert.equal(changed.body.candidate.revision,first.revision+1);
  const count=db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE candidate_id=? AND action='candidate.updated'").get(profile.id).n;
  const stale=await request(`/candidates/${profile.id}`,{session:hrB,method:'PATCH',data:{notes:'Stale note from HR B',fullName:'Stale name',expectedRevision:second.revision}});
  assert.equal(stale.status,409);assert.equal(stale.body.code,'CANDIDATE_CONFLICT');
  const stored=(await request(`/candidates/${profile.id}`)).body;
  assert.equal(stored.notes,'New note from HR A');assert.equal(stored.full_name,profile.full_name);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE candidate_id=? AND action='candidate.updated'").get(profile.id).n,count);
  assert.equal((await request(`/candidates/${profile.id}`,{method:'PATCH',data:{notes:'Missing revision'}})).status,428);
  const unchanged=await request(`/candidates/${profile.id}`,{method:'PATCH',data:{notes:stored.notes,expectedRevision:stored.revision}});
  assert.equal(unchanged.body.candidate.revision,stored.revision);
});

test('Candidate supplementation invalidates an older edit without overwriting the new contact data',async()=>{
  const profile=await candidate({email:`${randomUUID()}@example.com`});
  const link=await request(`/candidates/${profile.id}/update-links`,{method:'POST',data:{hours:24}});
  assert.equal((await request('/public/update-links/'+link.body.path.split('/').pop(),{method:'POST',idem:randomUUID(),form:form({phone:'0901234567',consent:'true'})})).status,200);
  const stale=await request(`/candidates/${profile.id}`,{method:'PATCH',data:{phone:'',notes:'Draft before supplementation',expectedRevision:profile.revision}});
  assert.equal(stale.status,409);assert.equal((await request(`/candidates/${profile.id}`)).body.phone,'0901234567');
});

test('Received duplicate CVs can be linked or separated after a JD is paused or expires',async()=>{
  for(const status of ['closed','expired'])for(const resolution of ['link','separate']){
    const jd=await job(),email=`${randomUUID()}@example.com`;
    const existing=await candidate({email,notes:'Keep existing identity and consent'});
    const received=await request('/public/applications',{method:'POST',session:'',idem:randomUUID(),form:form({fullName:'Resubmitted identity',email,jobId:jd.id,consent:'true'},true)});
    assert.equal(received.status,200);
    const pending=(await request('/submissions')).body.find(row=>row.payload.email===email);
    assert.ok(pending);
    assert.equal((await request(`/jobs/${jd.id}`,{method:'PATCH',data:status==='closed'?{status:'closed'}:{applicationDeadline:'2000-01-01'}})).status,200);
    assert.equal((await request(`/public/jobs/${jd.id}`,{session:''})).status,404);
    const resolved=await request(`/submissions/${pending.id}/resolve`,{method:'POST',idem:randomUUID(),data:{resolution,targetId:existing.id,reason:'HR verified this received application.'}});
    assert.equal(resolved.status,200);assert.equal(resolved.body.candidate.applications[0].job_id,jd.id);
    assert.ok(resolved.body.candidate.documents.some(doc=>doc.id===pending.documents[0].id));
    if(resolution==='link'){assert.equal(resolved.body.candidate.id,existing.id);assert.equal(resolved.body.candidate.notes,existing.notes);assert.equal(resolved.body.candidate.consent_status,'pending');}
    else assert.notEqual(resolved.body.candidate.id,existing.id);
    assert.equal((await request(`/public/jobs/${jd.id}`,{session:''})).status,404);
    assert.equal((await request('/candidates',{method:'POST',idem:randomUUID(),form:form({fullName:'New application after close',source:'Email',jobId:jd.id})})).status,400);
  }
});

test('A rolled-back intake, upload, duplicate or supplement removes only its newly created CV file',async()=>{
  const jd=await job(),profile=await candidate({email:`${randomUUID()}@example.com`},true);
  const token=(await request(`/candidates/${profile.id}/update-links`,{method:'POST',data:{hours:24}})).body.path.split('/').pop();
  const cases=[
    {path:'/candidates',data:{fullName:'Rollback candidate',source:'Email'}},
    {path:`/candidates/${profile.id}/documents`,data:{}},
    {path:'/public/applications',data:{fullName:'Rollback duplicate',email:profile.email,jobId:jd.id,consent:'true'}},
    {path:`/public/update-links/${token}`,data:{phone:'0907654321',consent:'true'}},
  ];
  for(const entry of cases){
    const files=readdirSync(join(directory,'documents')).sort(),keep=new Map(files.map(name=>[name,readFileSync(join(directory,'documents',name))]));
    const counts=()=>Object.fromEntries(['candidates','applications','documents','submissions','audit_logs','idempotency_keys'].map(table=>[table,db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n]));
    const before=counts(),state=db.prepare('SELECT revision,phone,consent_status FROM candidates WHERE id=?').get(profile.id),idem=randomUUID();
    db.exec("CREATE TRIGGER qa_rollback BEFORE INSERT ON idempotency_keys BEGIN SELECT RAISE(ABORT,'Synthetic transaction failure'); END");
    try{
      const failed=await request(entry.path,{method:'POST',idem,form:form(entry.data,true)});assert.equal(failed.status,500,entry.path);
      assert.deepEqual(readdirSync(join(directory,'documents')).sort(),files,entry.path);
      assert.deepEqual(counts(),before);assert.deepEqual(db.prepare('SELECT revision,phone,consent_status FROM candidates WHERE id=?').get(profile.id),state);
      for(const [name,bytes] of keep)assert.deepEqual(readFileSync(join(directory,'documents',name)),bytes);
    }finally{db.exec('DROP TRIGGER qa_rollback');}
    assert.equal((await request(entry.path,{method:'POST',idem,form:form(entry.data,true)})).status,200);
    assert.equal(readdirSync(join(directory,'documents')).length,files.length+1);
  }
});

test('Retrying JD creation returns the same job once and altered replay content is rejected',async()=>{
  const idem=randomUUID(),data={...jobData,title:'Retry-safe JD'};
  assert.equal((await request('/jobs',{method:'POST',data})).status,400);
  const first=await request('/jobs',{method:'POST',idem,data}),again=await request('/jobs',{method:'POST',idem,data});
  assert.equal(first.status,201);assert.equal(again.status,201);assert.deepEqual(again.body,first.body);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE id=?').get(first.body.id).n,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='job.created' AND json_extract(details,'$.jobId')=?").get(first.body.id).n,1);
  assert.equal((await request('/jobs',{method:'POST',idem,data:{...data,title:'Different retry content'}})).status,409);
  const other=await request('/jobs',{session:hrB,method:'POST',idem,data});assert.equal(other.status,201);assert.notEqual(other.body.id,first.body.id);
});

test('Old candidate databases gain a revision without losing their profile data',()=>{
  const path=mkdtempSync(join(tmpdir(),'supernet-candidate-migration-'));
  try{
    let old=openDatabase(path);old.prepare("INSERT INTO candidates(id,full_name,source,created_by,received_at,created_at,updated_at,notes) VALUES('legacy','Legacy candidate','Email','public','2026-01-01','2026-01-01','2026-01-01','Preserve these notes')").run();
    old.exec('ALTER TABLE candidates DROP COLUMN revision');old.close();
    old=openDatabase(path);const restored=old.prepare("SELECT * FROM candidates WHERE id='legacy'").get();
    assert.equal(restored.revision,1);assert.equal(restored.notes,'Preserve these notes');assert.equal(restored.full_name,'Legacy candidate');old.close();
  }finally{rmSync(path,{recursive:true,force:true});}
});

test('Exhausting public reads or CV submissions cannot consume the login rate limit',async()=>{
  const path=mkdtempSync(join(tmpdir(),'supernet-rate-isolation-')),instance=createApp({dataDir:path});
  bootstrapAdmin(instance.db,{username:'admin',password});
  const listener=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>listener.once('listening',resolve));
  const origin=`http://127.0.0.1:${listener.address().port}/api/v1`;
  try{
    for(let i=0;i<600;i++)assert.equal((await fetch(origin+'/public/jobs',{method:i%2?'HEAD':'GET'})).status,200);
    assert.equal((await fetch(origin+'/public/jobs')).status,429);
    const authenticate=()=>fetch(origin+'/login',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'SuperNet'},body:JSON.stringify({login:'admin',password})});
    assert.equal((await authenticate()).status,200);
    for(let i=0;i<30;i++)assert.equal((await fetch(origin+'/public/applications',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,400);
    assert.equal((await fetch(origin+'/public/applications',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,429);
    assert.equal((await authenticate()).status,200);
  }finally{await new Promise(resolve=>listener.close(resolve));instance.db.close();rmSync(path,{recursive:true,force:true});}
});
