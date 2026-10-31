import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { bootstrapAdmin, createAccount } from '../server/accounts.mjs';
import { openDatabase, now } from '../server/db.mjs';

const password='Evaluation-fixture-only-539!';let directory,db,server,base,admin,jobId;const sessions={},users={};let fixtureNumber=0;
const content={score:8.5,result:'pass',comments:'Có kinh nghiệm phù hợp với công việc và trả lời rõ ràng.',expectedRevision:0};
async function request(path,{session=admin,method='GET',data,idem,headers={}}={}){
  const h={'X-Requested-With':'SuperNet',...headers};if(session)h.Cookie=session;if(data)h['Content-Type']='application/json';if(idem)h['Idempotency-Key']=idem;
  const response=await fetch(`${base}/api/v1${path}`,{method,headers:h,body:data?JSON.stringify(data):undefined});return{status:response.status,body:await response.json().catch(()=>null),headers:response.headers};
}
const save=(i,data=content,options={})=>request(`/interviews/${i.id}/evaluation`,{session:sessions.interviewer,method:'PUT',data,idem:randomUUID(),...options});
async function fixture(status='completed',interviewerId=users.interviewer.id){
  const form=new FormData();for(const[k,v]of Object.entries({fullName:'Ứng viên đánh giá kiểm thử',email:`${randomUUID()}@example.com`,source:'Email',jobId}))form.set(k,v);
  const r=await fetch(`${base}/api/v1/candidates`,{method:'POST',headers:{Cookie:admin,'X-Requested-With':'SuperNet','Idempotency-Key':randomUUID()},body:form});assert.equal(r.status,200);const c=(await r.json()).candidate;
  const booked=await request('/interviews',{method:'POST',data:{applicationId:c.applications[0].id,interviewerId,startsAt:new Date(Date.now()+86400000*(++fixtureNumber)).toISOString(),durationMinutes:30,mode:'Online',location:'Phòng họp kiểm thử',contactConfirmed:true,contactEvidence:'Đã thống nhất trong dữ liệu kiểm thử.'}});assert.equal(booked.status,201,JSON.stringify(booked.body));
  const i={id:booked.body.id,candidate:c};
  if(status==='completed'){
    db.prepare('UPDATE interviews SET starts_at=?,ends_at=? WHERE id=?').run(new Date(Date.now()-7200000).toISOString(),new Date(Date.now()-5400000).toISOString(),i.id);
    assert.equal((await request(`/interviews/${i.id}`,{method:'PATCH',data:{status:'completed'}})).status,200);
  }else if(status==='cancelled')assert.equal((await request(`/interviews/${i.id}`,{method:'PATCH',data:{status:'cancelled'}})).status,200);
  return i;
}
before(async()=>{
  directory=mkdtempSync(join(tmpdir(),'supernet-evaluations-'));const instance=createApp({dataDir:directory});db=instance.db;users.admin=bootstrapAdmin(db,{username:'admin',password});
  for(const role of ['hr','boss','interviewer'])users[role]=createAccount(db,{username:`eval.${role}`,name:role,password,role},users.admin.id);
  users.other=createAccount(db,{username:'eval.other',name:'Người phỏng vấn khác',password,role:'interviewer'},users.admin.id);
  server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`;
  for(const[role,user]of Object.entries(users)){const r=await request('/login',{session:'',method:'POST',data:{login:user.username,password}});assert.equal(r.status,200);sessions[role]=r.headers.get('set-cookie').split(';')[0];}admin=sessions.admin;
  const job=await request('/jobs',{method:'POST',data:{title:'JD đánh giá',department:'Marketing',location:'TP. Hồ Chí Minh',description:'Mô tả công việc dùng riêng cho kiểm thử đánh giá phỏng vấn.',openings:1},idem:randomUUID()});assert.equal(job.status,201);jobId=job.body.id;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();rmSync(directory,{recursive:true,force:true});});
test('assigned interviewer saves comments, outcome and a score out of ten without changing hiring decisions',async()=>{
  const i=await fixture();const r=await save(i);assert.equal(r.status,200);assert.equal(r.body.evaluation.score,8.5);assert.equal(r.body.evaluation.reviewer_id,users.interviewer.id);assert.equal(r.body.evaluation.revision,1);
  const detail=(await request(`/candidates/${i.candidate.id}`)).body;assert.equal(detail.interviews[0].evaluation.comments,content.comments);assert.equal(detail.applications[0].stage,'interviewed');assert.equal(detail.history.filter(log=>log.action==='interview.evaluated').length,1);
  const list=(await request('/interviews')).body.find(row=>row.id===i.id);assert.equal(list.evaluation.result,'pass');assert.equal(list.evaluation.reviewer_name,users.interviewer.name);
});
test('HR, Admin and other staff can read; only the assigned interviewer can create or edit',async()=>{
  const i=await fixture();assert.equal((await save(i)).status,200);
  for(const role of ['admin','hr','boss','other']){
    const read=await request(`/interviews/${i.id}/evaluation`,{session:sessions[role]});assert.equal(read.status,200);assert.equal(read.body.canEvaluate,false);assert.equal(read.body.evaluation.score,8.5);
    assert.equal((await save(i,{...content,score:9,expectedRevision:1},{session:sessions[role]})).status,403);
  }
  assert.equal((await save(i,content,{session:''})).status,401);assert.equal((await request(`/interviews/${i.id}/evaluation`,{session:''})).status,401);
  const own=await fixture('completed',users.hr.id);assert.equal((await save(own,content,{session:sessions.hr})).status,200);
});
test('unfinished, cancelled and future interviews cannot receive evaluations; old completed interviews start empty',async()=>{
  for(const status of ['scheduled','cancelled']){const i=await fixture(status);assert.equal((await save(i)).status,409);assert.equal((await request(`/interviews/${i.id}/evaluation`,{session:sessions.interviewer})).body.canEvaluate,false);}
  const i=await fixture();db.prepare('UPDATE interviews SET starts_at=? WHERE id=?').run(new Date(Date.now()+86400000).toISOString(),i.id);assert.equal((await save(i)).status,409);
  const legacy=await fixture();const empty=await request(`/interviews/${legacy.id}/evaluation`,{session:sessions.interviewer});assert.equal(empty.body.evaluation,null);assert.equal(empty.body.canEvaluate,true);
  assert.equal((await request('/interviews/unknown/evaluation')).status,404);
});
test('score boundaries, decimals, result and substantive comments are validated atomically',async()=>{
  const i=await fixture();
  for(const extra of [{score:-1},{score:10.1},{score:10.01},{score:'8.5'},{score:null},{result:'hired'},{comments:'short'},{comments:' '.repeat(20)},{comments:'x'.repeat(5001)},{expectedRevision:-1}])assert.equal((await save(i,{...content,...extra})).status,400,JSON.stringify(extra).slice(0,100));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM interview_evaluations WHERE interview_id=?').get(i.id).n,0);
  for(const score of [0,0.1,7.5,10]){const current=(await request(`/interviews/${i.id}/evaluation`)).body.evaluation;assert.equal((await save(i,{...content,score,result:score===0?'fail':'follow_up',expectedRevision:current?.revision||0})).status,200);assert.equal((await request(`/interviews/${i.id}/evaluation`)).body.evaluation.score,score);}
});
test('idempotency prevents duplicate submissions and audit events while optimistic revisions prevent lost updates',async()=>{
  const i=await fixture(),idem=randomUUID();const first=await save(i,content,{idem}),retry=await save(i,content,{idem});assert.equal(first.status,200);assert.deepEqual(retry.body,first.body);
  assert.equal((await save(i,{...content,score:9},{idem})).status,409);
  assert.equal((await save(i,{...content,score:9,expectedRevision:1})).status,200);assert.equal((await save(i,{...content,score:7,expectedRevision:1})).status,409);
  const r=(await request(`/interviews/${i.id}/evaluation`)).body.evaluation;assert.equal(r.score,9);assert.equal(r.revision,2);
  const logs=(await request(`/candidates/${i.candidate.id}`)).body.history.filter(row=>row.action.startsWith('interview.evaluat'));assert.equal(logs.length,2);assert.equal(logs.find(row=>row.action==='interview.evaluation_updated').details.before.score,8.5);
});
test('concurrent saves accept one revision and reject the other without losing either history or identity',async()=>{
  const i=await fixture();await save(i);const results=await Promise.all([save(i,{...content,score:9,expectedRevision:1}),save(i,{...content,score:7,expectedRevision:1})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal((await request(`/interviews/${i.id}/evaluation`)).body.evaluation.revision,2);
});
test('unsafe origins and audit failures cannot write partial evaluations or overwrite saved feedback',async()=>{
  const i=await fixture();assert.equal((await save(i,content,{headers:{Origin:'https://attacker.example'}})).status,403);
  db.exec("CREATE TRIGGER evaluation_audit_failure BEFORE INSERT ON audit_logs WHEN NEW.action IN ('interview.evaluated','interview.evaluation_updated') BEGIN SELECT RAISE(ABORT,'evaluation audit rollback'); END");
  try{assert.equal((await save(i)).status,500);assert.equal((await request(`/interviews/${i.id}/evaluation`)).body.evaluation,null);}finally{db.exec('DROP TRIGGER evaluation_audit_failure');}
  await save(i);db.exec("CREATE TRIGGER evaluation_update_failure BEFORE INSERT ON audit_logs WHEN NEW.action='interview.evaluation_updated' BEGIN SELECT RAISE(ABORT,'evaluation update rollback'); END");
  try{assert.equal((await save(i,{...content,score:4,expectedRevision:1})).status,500);assert.equal((await request(`/interviews/${i.id}/evaluation`)).body.evaluation.score,8.5);}finally{db.exec('DROP TRIGGER evaluation_update_failure');}
});
test('additive initialization and reopening preserve existing interviews, evaluations and foreign keys',()=>{
  const dir=mkdtempSync(join(tmpdir(),'supernet-evaluation-migration-'));try{
    let database=openDatabase(dir,false);database.exec('DROP TABLE interview_evaluations');database.close();database=openDatabase(dir,false);assert.ok(database.prepare("SELECT name FROM sqlite_master WHERE name='interview_evaluations'").get());assert.equal(database.prepare('SELECT COUNT(*) AS n FROM interview_evaluations').get().n,0);database.close();
    const snapshot=db.prepare('SELECT * FROM interview_evaluations ORDER BY interview_id').all(),reopened=openDatabase(directory,false);assert.deepEqual(reopened.prepare('SELECT * FROM interview_evaluations ORDER BY interview_id').all(),snapshot);assert.deepEqual(reopened.prepare('PRAGMA foreign_key_check').all(),[]);reopened.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});
