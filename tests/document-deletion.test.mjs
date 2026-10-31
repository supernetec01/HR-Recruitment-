import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { bootstrapAdmin, createAccount } from '../server/accounts.mjs';
import { hash, now, openDatabase } from '../server/db.mjs';
import { purgeDeletedDocumentFiles } from '../server/document-deletion.mjs';

const pdf=readFileSync('tests/fixtures/cv.pdf'), password='Delete-document-fixture-853!';
let directory,db,server,base,admin,jobId,adminId;
const sessions={};let translationStarted,releaseTranslation;
// Only this known local fixture is accepted. Production antivirus remains unchanged.
const fixtureScan = async buffer => {
  assert.deepEqual(buffer,pdf);
  return {status:'clean',engine:'isolated test fixture',checksum:hash(buffer)};
};
const translationService={configured:true,model:'fixture',provider:'fixture',translate:async()=>{
  translationStarted?.();await new Promise(resolve=>{releaseTranslation=resolve;});return {text:'本地测试翻译'};
}};
async function request(path,{session=admin,method='GET',data,form,idem,headers={}}={}) {
  const h={'X-Requested-With':'SuperNet',...headers};if(session)h.Cookie=session;if(data)h['Content-Type']='application/json';if(idem)h['Idempotency-Key']=idem;
  const response=await fetch(`${base}/api/v1${path}`,{method,headers:h,body:form||(data?JSON.stringify(data):undefined)});
  return {status:response.status,body:response.headers.get('content-type')?.includes('json')?await response.json():await response.arrayBuffer(),headers:response.headers};
}
async function start() {
  const instance=createApp({dataDir:directory,scanFile:fixtureScan,translationService});db=instance.db;
  server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`;
}
async function stop() {await new Promise(resolve=>server.close(resolve));db.close();}
async function candidate() {
  const form=new FormData();for(const[k,v]of Object.entries({fullName:'Ứng viên kiểm thử xóa CV',email:`${randomUUID()}@example.com`,source:'Email',jobId,consentStatus:'granted',consentEvidence:'Đồng ý trong dữ liệu kiểm thử cục bộ.'}))form.set(k,v);
  form.set('file',new Blob([pdf],{type:'application/pdf'}),'CV.pdf');
  const result=await request('/candidates',{method:'POST',form,idem:randomUUID()});assert.equal(result.status,200,JSON.stringify(result.body));return result.body.candidate;
}
async function upload(c,name='CV-mới.pdf') {
  const form=new FormData();form.set('file',new Blob([pdf],{type:'application/pdf'}),name);
  assert.equal((await request(`/candidates/${c.id}/documents`,{method:'POST',form,idem:randomUUID()})).status,200);
  return (await request(`/candidates/${c.id}`)).body;
}
const remove=(c,doc=c.documents[0],options={})=>request(`/candidates/${c.id}/documents/${doc.id}`,{method:'DELETE',data:{expectedRevision:c.revision},...options});
const pathFor=doc=>join(directory,'documents',db.prepare('SELECT stored_name FROM documents WHERE id=?').get(doc.id).stored_name);
function cacheTranslation(doc) {db.prepare('INSERT INTO document_translations VALUES(?,?,?,?,?,?,?)').run(doc.id,'zh-CN',hash(pdf),'Bản dịch kiểm thử','fixture',now(),adminId);}
before(async()=>{
  directory=mkdtempSync(join(tmpdir(),'supernet-document-delete-'));await start();
  adminId=bootstrapAdmin(db,{username:'admin',password}).id;
  for(const role of ['hr','boss','interviewer'])createAccount(db,{username:`delete.${role}`,name:role,password,role},adminId);
  for(const username of ['admin','delete.hr','delete.boss','delete.interviewer']){
    const result=await request('/login',{session:'',method:'POST',data:{login:username,password}});assert.equal(result.status,200);sessions[username]=result.headers.get('set-cookie').split(';')[0];
  }admin=sessions.admin;
  const job=await request('/jobs',{method:'POST',idem:randomUUID(),data:{title:'JD kiểm thử xóa CV',department:'Marketing',location:'TP. Hồ Chí Minh',description:'Mô tả công việc dùng riêng cho kiểm thử xóa tài liệu.',openings:1}});assert.equal(job.status,201);jobId=job.body.id;
});
after(async()=>{await stop();rmSync(directory,{recursive:true,force:true});});

test('additive migration preserves old document metadata and reserves versions',()=>{
  const dir=mkdtempSync(join(tmpdir(),'supernet-delete-migration-'));
  try {
    let database=openDatabase(dir,false);
    for(const column of ['deleted_at','deleted_by','purged_at'])database.exec(`ALTER TABLE documents DROP COLUMN ${column}`);
    database.prepare('INSERT INTO documents(id,original_name,stored_name,mime_type,size,checksum,version,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?)').run('legacy','CV cũ.pdf','legacy.bin','application/pdf',12,'legacy-hash',7,now(),'public');database.close();
    database=openDatabase(dir,false);const row=database.prepare('SELECT * FROM documents WHERE id=?').get('legacy');assert.equal(row.version,7);assert.equal(row.original_name,'CV cũ.pdf');assert.equal(row.deleted_at,null);database.close();
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('Admin deletes one file and its translation while preserving candidate, other files, applications and audit',async()=>{
  let c=await candidate();c=await upload(c);const doc=c.documents.find(d=>d.version===2),other=c.documents.find(d=>d.version===1),path=pathFor(doc);cacheTranslation(doc);
  assert.equal((await remove(c,doc)).status,200);assert.equal(existsSync(path),false);assert.ok(existsSync(pathFor(other)));
  const latest=(await request(`/candidates/${c.id}`)).body;assert.equal(latest.full_name,c.full_name);assert.equal(latest.applications[0].id,c.applications[0].id);assert.equal(latest.revision,c.revision+1);assert.deepEqual(latest.documents.map(d=>d.id),[other.id]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM document_translations WHERE document_id=?').get(doc.id).n,0);
  const tombstone=db.prepare('SELECT * FROM documents WHERE id=?').get(doc.id);assert.ok(tombstone.deleted_at);assert.ok(tombstone.purged_at);assert.equal(tombstone.deleted_by,adminId);
  assert.equal(latest.history.filter(log=>log.action==='document.deleted').length,1);
  for(const suffix of ['preview','download','text','translations/zh-CN'])assert.equal((await request(`/documents/${doc.id}/${suffix}`)).status,404,suffix);
  assert.equal((await request(`/documents/${doc.id}/review`,{method:'POST',data:{confirmed:true,evidence:'Đã kiểm tra bằng dữ liệu mẫu.'}})).status,404);
  assert.equal((await request(`/documents/${doc.id}/translations`,{method:'POST',data:{targetLanguage:'zh-CN'}})).status,404);
  assert.equal((await remove(c,doc)).status,200);assert.equal((await request(`/candidates/${c.id}`)).body.revision,latest.revision);
  const added=await upload(latest,'CV phiên bản 3.pdf');assert.deepEqual(added.documents.map(d=>d.version).sort(),[1,3]);
});
test('HR can remove the last CV and completeness updates without deleting the candidate',async()=>{
  const c=await candidate();assert.equal(c.complete,true);
  assert.equal((await remove(c,c.documents[0],{session:sessions['delete.hr']})).status,200);
  const latest=(await request(`/candidates/${c.id}`)).body;assert.equal(latest.documents.length,0);assert.equal(latest.complete,false);assert.ok(latest.missing.includes('CV'));
  const listed=(await request('/candidates')).body.find(row=>row.id===c.id);assert.ok(listed);assert.equal(listed.documents.length,0);assert.ok(listed.missing.includes('CV'));
});
test('anonymous, Boss, Interviewer, foreign candidate IDs and hostile origins cannot delete files',async()=>{
  const c=await candidate(),other=await candidate(),doc=c.documents[0],path=pathFor(doc);
  for(const [session,status]of[['',401],[sessions['delete.boss'],403],[sessions['delete.interviewer'],403]])assert.equal((await remove(c,doc,{session})).status,status);
  assert.equal((await remove(other,doc)).status,404);
  assert.equal((await remove(c,doc,{headers:{Origin:'https://attacker.example'}})).status,403);
  assert.equal((await remove(c,doc,{data:{}})).status,400);
  assert.ok(existsSync(path));assert.equal((await request(`/candidates/${c.id}`)).body.documents.length,1);
});
test('stale confirmations fail without changing the file or a newer candidate edit',async()=>{
  const c=await candidate(),doc=c.documents[0];
  assert.equal((await request(`/candidates/${c.id}`,{method:'PATCH',data:{notes:'Nhân sự khác vừa cập nhật hồ sơ.',expectedRevision:c.revision}})).status,200);
  assert.equal((await remove(c,doc)).status,409);assert.ok(existsSync(pathFor(doc)));
  assert.equal((await request(`/candidates/${c.id}`)).body.notes,'Nhân sự khác vừa cập nhật hồ sơ.');
});
test('active interview requests and schedules protect their CV; historical references remain readable after deletion',async()=>{
  const c=await candidate(),doc=c.documents[0],applicationId=c.applications[0].id;
  const requested=await request(`/applications/${applicationId}/interview-requests`,{method:'POST',data:{documentId:doc.id},idem:randomUUID()});assert.equal(requested.status,200);const rid=requested.body.request.id;
  assert.equal((await remove(c,doc)).status,409);assert.ok(existsSync(pathFor(doc)));
  const startsAt=new Date(Date.now()+86400000);startsAt.setUTCHours(3,0,0,0);
  const booked=await request('/interviews',{method:'POST',data:{applicationId,interviewerId:adminId,startsAt:startsAt.toISOString(),durationMinutes:30,mode:'Online',location:'Phòng họp kiểm thử',requestId:rid,contactConfirmed:true,contactEvidence:'Đã thống nhất lịch trên dữ liệu mẫu.'}});assert.equal(booked.status,201);
  assert.equal((await remove(c,doc)).status,409);
  assert.equal((await request(`/interviews/${booked.body.id}`,{method:'PATCH',data:{status:'cancelled',reason:'Hủy lịch kiểm thử để sửa tài liệu.'}})).status,200);
  assert.equal((await request(`/interview-requests/${rid}`,{method:'PATCH',data:{reason:'Hủy yêu cầu kiểm thử để sửa tài liệu.'}})).status,200);
  assert.equal((await remove(c,doc)).status,200);
  const history=(await request('/interview-requests')).body.find(row=>row.id===rid);assert.equal(history.document_name,doc.original_name);assert.ok(history.document_deleted_at);
  assert.equal((await request(`/applications/${applicationId}/interview-requests`,{method:'POST',data:{documentId:doc.id},idem:randomUUID()})).status,409);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('audit failures roll back deletion, translations and candidate revisions before touching the file',async()=>{
  const c=await candidate(),doc=c.documents[0];cacheTranslation(doc);
  db.exec("CREATE TRIGGER reject_document_delete_audit BEFORE INSERT ON audit_logs WHEN NEW.action='document.deleted' BEGIN SELECT RAISE(ABORT,'test deletion rollback'); END");
  try {
    assert.equal((await remove(c,doc)).status,500);assert.ok(existsSync(pathFor(doc)));
    assert.equal(db.prepare('SELECT deleted_at FROM documents WHERE id=?').get(doc.id).deleted_at,null);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM document_translations WHERE document_id=?').get(doc.id).n,1);
    assert.equal((await request(`/candidates/${c.id}`)).body.revision,c.revision);
  } finally {db.exec('DROP TRIGGER reject_document_delete_audit');}
});
test('deleting a document during translation prevents saving or returning a stale translated CV',async()=>{
  const c=await candidate(),doc=c.documents[0];
  const started=new Promise(resolve=>{translationStarted=resolve;});
  const translating=request(`/documents/${doc.id}/translations`,{method:'POST',data:{targetLanguage:'zh-CN'}});
  await started;
  try {assert.equal((await remove(c,doc)).status,200);} finally {releaseTranslation();translationStarted=null;}
  assert.equal((await translating).status,404);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM document_translations WHERE document_id=?').get(doc.id).n,0);
});
test('already missing files can be removed; failed storage cleanup remains queued and retries on restart',async()=>{
  const missing=await candidate(),doc=missing.documents[0];unlinkSync(pathFor(doc));assert.equal((await remove(missing,doc)).status,200);
  const c=await candidate(),queued=c.documents[0],path=pathFor(queued);
  db.prepare('UPDATE documents SET deleted_at=?,deleted_by=? WHERE id=?').run(now(),adminId,queued.id);
  assert.equal(purgeDeletedDocumentFiles(db,directory,()=>{throw new Error('Fixture unavailable storage');}),1);assert.ok(existsSync(path));assert.equal(db.prepare('SELECT purged_at FROM documents WHERE id=?').get(queued.id).purged_at,null);
  assert.equal((await request(`/documents/${queued.id}/download`)).status,404);
  await stop();await start();assert.equal(existsSync(path),false);assert.ok(db.prepare('SELECT purged_at FROM documents WHERE id=?').get(queued.id).purged_at);
});
