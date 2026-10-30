import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.mjs';

let server, db, base, cookie, directory, candidateId, jobId;
const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
async function request(path, { method = 'GET', data, form, publicRequest = false, session = cookie, idem } = {}) {
  const headers = { 'X-Requested-With': 'SuperNet' };
  if (!publicRequest && session) headers.Cookie = session;
  if (idem) headers['Idempotency-Key'] = idem;
  if (data) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${base}/api/v1${path}`, { method, headers, body: form || (data ? JSON.stringify(data) : undefined) });
  const body = await response.json().catch(() => null);
  return { response, body, status: response.status };
}
function form(fields, name = 'CV.pdf', bytes = pdf) {
  const result = new FormData();
  Object.entries(fields).forEach(([key,value]) => result.set(key,String(value)));
  if (bytes) result.set('file', new Blob([bytes], { type: 'application/pdf' }), name);
  return result;
}
before(async () => {
  directory = mkdtempSync(join(tmpdir(),'supernet-test-'));
  const instance = createApp({ dataDir: directory, demo: true }); db = instance.db;
  await new Promise(resolve => { server = instance.app.listen(0,'127.0.0.1',resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  const login = await request('/demo-session',{method:'POST',data:{role:'hr'}});
  cookie = login.response.headers.get('set-cookie').split(';')[0];
  jobId = (await request('/jobs')).body[0].id;
});
after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(directory,{recursive:true,force:true}); });

test('internal records require authentication and cross-site writes are rejected', async () => {
  assert.equal((await request('/candidates',{publicRequest:true})).status,401);
  const result = await fetch(`${base}/api/v1/candidates`,{method:'POST',headers:{Cookie:cookie,Origin:'https://untrusted.example','X-Requested-With':'SuperNet','Content-Type':'application/json'},body:'{}'});
  assert.equal(result.status,403);
});
test('HR saves an incomplete candidate; received date differs from entry date', async () => {
  const result = await request('/candidates',{method:'POST',idem:randomUUID(),form:form({fullName:'Test Nguyễn An',phone:'0908765432',source:'Facebook',receivedAt:'2026-01-02'},'',null)});
  assert.equal(result.status,200); candidateId = result.body.candidate.id;
  assert.equal(result.body.candidate.complete,false);
  assert.ok(result.body.candidate.missing.includes('CV'));
  assert.equal(result.body.candidate.source,'Facebook');
  assert.equal(result.body.candidate.received_at,'2026-01-02');
  assert.notEqual(result.body.candidate.created_at,result.body.candidate.received_at);
  assert.equal(result.body.candidate.creator_name,'Linh Nguyễn');
});
test('a file-only intake can be saved and is quarantined', async () => {
  const result = await request('/candidates',{method:'POST',idem:randomUUID(),form:form({source:'Email'})});
  assert.equal(result.status,200); assert.equal(result.body.candidate.full_name,'');
  assert.equal(result.body.candidate.documents[0].review_status,'quarantined');
  const docId = result.body.candidate.documents[0].id;
  assert.equal((await request(`/documents/${docId}/download`)).status,423);
  assert.equal((await request(`/documents/${docId}/download`,{publicRequest:true})).status,401);
});
test('normalized +84 phone and email trigger HR confirmation; no silent merge or duplicate', async () => {
  const beforeCount = db.prepare('SELECT COUNT(*) AS n FROM candidates').get().n;
  const result = await request('/candidates',{method:'POST',idem:randomUUID(),form:form({fullName:'Same person',phone:'+84 908 765 432',source:'Zalo',jobId},'',null)});
  assert.equal(result.status,409); assert.equal(result.body.code,'POSSIBLE_DUPLICATE');
  assert.equal(result.body.matches[0].id,candidateId);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM candidates').get().n,beforeCount);
});
test('HR explicitly links new CV and an application, preserving identity and old documents', async () => {
  const result = await request('/candidates',{method:'POST',idem:randomUUID(),form:form({fullName:'Do not overwrite',phone:'0908765432',jobId,source:'Email',resolution:'link',targetId:candidateId})});
  assert.equal(result.status,200);
  assert.equal(result.body.candidate.id,candidateId);
  assert.equal(result.body.candidate.full_name,'Test Nguyễn An');
  assert.equal(result.body.candidate.source,'Facebook');
  assert.equal(result.body.candidate.applications.length,1);
  assert.equal(result.body.candidate.applications[0].source,'Email');
  assert.equal(result.body.candidate.documents.length,1);
});
test('idempotent HR upload replays once; changing the payload with the same key is rejected', async () => {
  const idem = randomUUID();
  const send = () => request(`/candidates/${candidateId}/documents`,{method:'POST',idem,form:form({})});
  assert.equal((await send()).status,200); assert.equal((await send()).status,200);
  const candidate = (await request(`/candidates/${candidateId}`)).body;
  assert.deepEqual(candidate.documents.map(d => d.version).sort(),[1,2]);
  const changed = await request(`/candidates/${candidateId}/documents`,{method:'POST',idem,form:form({},'CV-new.pdf',Buffer.concat([pdf,Buffer.from('\nchanged')]))});
  assert.equal(changed.status,409);
});
test('invalid, active-content, and oversized files are rejected before persistence', async () => {
  const count = db.prepare('SELECT COUNT(*) AS n FROM candidates').get().n;
  for (const [name,bytes] of [['CV.exe',pdf],['CV.pdf',Buffer.from('not a pdf')],['CV.pdf',Buffer.from('%PDF-1.4 /JavaScript (test)')],['CV.docx',Buffer.from('PK-not-a-document')],['large.pdf',Buffer.alloc(10 * 1024 * 1024 + 1)]]) {
    const result = await request('/candidates',{method:'POST',idem:randomUUID(),form:form({fullName:'Bad upload',source:'Email'},name,bytes)});
    assert.equal(result.status,400,`${name} must be rejected`);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM candidates').get().n,count);
});
test('public duplicate submissions have generic responses, are idempotent, and enter HR review', async () => {
  const count = db.prepare('SELECT COUNT(*) AS n FROM candidates').get().n, idem = randomUUID();
  const send = () => request('/public/applications',{publicRequest:true,method:'POST',idem,form:form({fullName:'Website update',phone:'0908765432',jobId,consent:'true'})});
  const first = await send(), second = await send();
  assert.equal(first.status,200); assert.deepEqual(first.body,second.body);
  assert.deepEqual(Object.keys(first.body).sort(),['message','received']);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM candidates').get().n,count);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE status='pending'").get().n,1);
  const queue = await request('/submissions');
  const pending = queue.body[0];
  assert.equal(pending.matches[0].id,candidateId);
  const resolveKey = randomUUID();
  const resolved = await request(`/submissions/${pending.id}/resolve`,{method:'POST',idem:resolveKey,data:{resolution:'link',targetId:candidateId,reason:'Đã xác nhận cùng ứng viên qua điện thoại'}});
  assert.equal(resolved.status,200); assert.equal(resolved.body.candidate.documents.length,3);
  assert.equal(resolved.body.candidate.applications.length,1);
  assert.equal(resolved.body.candidate.full_name,'Test Nguyễn An');
  const again = await request(`/submissions/${pending.id}/resolve`,{method:'POST',idem:randomUUID(),data:{resolution:'link',targetId:candidateId,reason:'Resolve again'}});
  assert.equal(again.status,409);
});
test('public new applications require consent and CV; same-person reapplications use a new application', async () => {
  const count = db.prepare('SELECT COUNT(*) AS n FROM candidates').get().n;
  const missingConsent = await request('/public/applications',{publicRequest:true,method:'POST',idem:randomUUID(),form:form({fullName:'New applicant',email:'new@example.com',jobId})});
  assert.equal(missingConsent.status,400);
  const invalidJob = await request('/public/applications',{publicRequest:true,method:'POST',idem:randomUUID(),form:form({fullName:'New applicant',email:'new@example.com',jobId:'invalid',consent:'true'})});
  assert.equal(invalidJob.status,400);
  const valid = await request('/public/applications',{publicRequest:true,method:'POST',idem:randomUUID(),form:form({fullName:'New applicant',email:'new@example.com',jobId,consent:'true'})});
  assert.equal(valid.status,200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM candidates').get().n,count + 1);
  const otherJob = (await request('/jobs')).body.find(j => j.id !== jobId);
  const additional = await request(`/candidates/${candidateId}/applications`,{method:'POST',data:{jobId:otherJob.id,source:'Zalo'}});
  assert.equal(additional.status,200);
  const c = (await request(`/candidates/${candidateId}`)).body;
  assert.equal(c.applications.length,2); assert.equal(c.documents.length,3);
});
test('expiring bearer link supplements the exact candidate once; no existing identity is exposed or overwritten', async () => {
  const issued = await request(`/candidates/${candidateId}/update-links`,{method:'POST',data:{hours:1}});
  assert.equal(issued.status,200); const token = issued.body.path.split('/').pop();
  const stored = db.prepare('SELECT * FROM update_tokens WHERE candidate_id=?').get(candidateId);
  assert.ok(!JSON.stringify(stored).includes(token));
  const info = await request(`/public/update-links/${token}`,{publicRequest:true});
  assert.deepEqual(Object.keys(info.body).sort(),['expiresAt','valid']);
  const idem = randomUUID(), send = () => request(`/public/update-links/${token}`,{publicRequest:true,method:'POST',idem,form:form({fullName:'Never overwrite',notes:'CV cập nhật',consent:'true'})});
  assert.equal((await send()).status,200); assert.equal((await send()).status,200);
  assert.equal((await request(`/public/update-links/${token}`,{publicRequest:true})).status,410);
  const reused = await request(`/public/update-links/${token}`,{publicRequest:true,method:'POST',idem:randomUUID(),form:form({notes:'reuse',consent:'true'})});
  assert.equal(reused.status,410);
  const c = (await request(`/candidates/${candidateId}`)).body;
  assert.equal(c.full_name,'Test Nguyễn An'); assert.equal(c.documents.length,4); assert.equal(c.consent_status,'granted');
  assert.ok(c.history.some(h => h.action === 'candidate.supplemented' && h.actor_name === 'Ứng viên'));
});
test('expired and revoked links cannot be used; withdrawn consent revokes active links', async () => {
  const expired = await request(`/candidates/${candidateId}/update-links`,{method:'POST',data:{hours:1}}), token = expired.body.path.split('/').pop();
  db.prepare("UPDATE update_tokens SET expires_at='2000-01-01T00:00:00.000Z' WHERE used_at IS NULL").run();
  assert.equal((await request(`/public/update-links/${token}`,{publicRequest:true})).status,410);
  const issued = await request(`/candidates/${candidateId}/update-links`,{method:'POST',data:{hours:1}}), liveToken = issued.body.path.split('/').pop();
  await request(`/candidates/${candidateId}`,{method:'PATCH',data:{consentStatus:'withdrawn'}});
  assert.equal((await request(`/public/update-links/${liveToken}`,{publicRequest:true})).status,410);
  assert.equal((await request(`/candidates/${candidateId}/update-links`,{method:'POST',data:{hours:1}})).status,409);
  await request(`/candidates/${candidateId}`,{method:'PATCH',data:{consentStatus:'granted',consentEvidence:'Ứng viên xác nhận qua email ngày hôm nay'}});
});
test('document approval requires evidence and is recorded before authenticated download', async () => {
  const doc = (await request(`/candidates/${candidateId}`)).body.documents[0];
  assert.equal((await request(`/documents/${doc.id}/review`,{method:'POST',data:{confirmed:true,evidence:'short'}})).status,400);
  assert.equal((await request(`/documents/${doc.id}/review`,{method:'POST',data:{confirmed:true,evidence:'Đã kiểm tra tài liệu bởi HR bằng công cụ an toàn nội bộ.'}})).status,200);
  const response = await fetch(`${base}/api/v1/documents/${doc.id}/download`,{headers:{Cookie:cookie}});
  assert.equal(response.status,200); assert.equal(response.headers.get('content-type'),'application/pdf');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),pdf);
  const history = (await request(`/candidates/${candidateId}`)).body.history;
  assert.ok(history.some(h => h.action === 'document.reviewed_manually'));
  assert.ok(history.some(h => h.action === 'document.downloaded'));
});
test('partial edits preserve all omitted fields, contact information, ownership, notes, and consent', async () => {
  const before = (await request(`/candidates/${candidateId}`)).body;
  assert.equal((await request(`/candidates/${candidateId}`,{method:'PATCH',data:{notes:'Updated note only'}})).status,200);
  const after = (await request(`/candidates/${candidateId}`)).body;
  for (const column of ['full_name','phone','email','location','source','owner_id','portfolio','consent_status']) assert.equal(after[column],before[column],column);
  assert.equal(after.notes,'Updated note only');
  assert.equal(after.phone,'0908765432'); assert.equal(after.consent_status,'granted');
});
test('Boss is read-only at backend; offer and hire cannot bypass the future approval flow', async () => {
  const login = await request('/demo-session',{method:'POST',data:{role:'boss'}}), bossCookie = login.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/candidates',{session:bossCookie})).status,200);
  for (const [path,method,data] of [[`/candidates/${candidateId}`,'PATCH',{fullName:'Unauthorized'}],[`/candidates/${candidateId}/update-links`,'POST',{hours:1}],['/jobs','POST',{}],['/interviews','POST',{}]]) {
    assert.equal((await request(path,{session:bossCookie,method,data})).status,403);
  }
  const application = (await request(`/candidates/${candidateId}`)).body.applications[0];
  assert.equal((await request(`/applications/${application.id}`,{method:'PATCH',data:{stage:'hired'}})).status,403);
  assert.equal((await request(`/candidates/${candidateId}`)).body.full_name,'Test Nguyễn An');
});
test('interview scheduling blocks overlapping interviewer times and incomplete consent', async () => {
  const application = (await request(`/candidates/${candidateId}`)).body.applications[0];
  const start = new Date(Date.now() + 10 * 86400000); start.setUTCMinutes(0,0,0);
  const payload = {applicationId:application.id,interviewerId:'demo-boss',startsAt:start.toISOString(),endsAt:new Date(+start + 3600000).toISOString(),mode:'Online',location:'Phòng họp thử nghiệm'};
  assert.equal((await request('/interviews',{method:'POST',data:payload})).status,201);
  assert.equal((await request('/interviews',{method:'POST',data:{...payload,startsAt:new Date(+start + 30 * 60000).toISOString(),endsAt:new Date(+start + 90 * 60000).toISOString()}})).status,409);
  const c = (await request(`/candidates/${candidateId}`)).body; assert.equal(c.applications.find(a => a.id === application.id).stage,'scheduled');
  await request(`/candidates/${candidateId}`,{method:'PATCH',data:{consentStatus:'pending'}});
  assert.equal((await request('/interviews',{method:'POST',data:{...payload,startsAt:new Date(+start + 7200000).toISOString(),endsAt:new Date(+start + 10800000).toISOString()}})).status,409);
});
test('a later reapplication to the same job creates a new application on the same candidate', async () => {
  const before = (await request(`/candidates/${candidateId}`)).body;
  const application = before.applications[0];
  const scheduled = (await request('/interviews')).body.filter(i => i.application_id === application.id && i.status === 'scheduled');
  for (const interview of scheduled) assert.equal((await request(`/interviews/${interview.id}`,{method:'PATCH',data:{status:'cancelled'}})).status,200);
  const rejected = await request(`/applications/${application.id}`,{method:'PATCH',data:{stage:'rejected',reason:'Không phù hợp với đợt tuyển trước.'}});
  assert.equal(rejected.status,200);
  const next = await request(`/candidates/${candidateId}/applications`,{method:'POST',data:{jobId:application.job_id,source:'Email'}});
  assert.equal(next.status,200); assert.notEqual(next.body.id,application.id);
  const after = (await request(`/candidates/${candidateId}`)).body;
  assert.equal(after.applications.length,before.applications.length + 1);
  assert.equal(after.id,before.id); assert.equal(after.documents.length,before.documents.length);
  assert.equal(after.applications.find(a => a.id === application.id).stage,'rejected');
  assert.equal((await request(`/applications/${application.id}`,{method:'PATCH',data:{stage:'new'}})).status,409);
});
test('punctuation-only phones are rejected; Vietnamese filenames are preserved', async () => {
  const bad = await request('/public/applications',{publicRequest:true,method:'POST',idem:randomUUID(),form:form({fullName:'Invalid contact',phone:'...........',jobId,consent:'true'})});
  assert.equal(bad.status,400);
  const good = await request('/candidates',{method:'POST',idem:randomUUID(),form:form({fullName:'Tên tệp tiếng Việt',source:'Email'},'CV-Nguyễn-Văn-An.pdf')});
  assert.equal(good.status,200); assert.equal(good.body.candidate.documents[0].original_name,'CV-Nguyễn-Văn-An.pdf');
});
test('production rejects an existing demo session, including with a retained demo database', async () => {
  const production = createApp({dataDir:directory,demo:false});
  const srv = await new Promise(resolve => { const s = production.app.listen(0,'127.0.0.1',() => resolve(s)); });
  try { const response = await fetch(`http://127.0.0.1:${srv.address().port}/api/v1/candidates`,{headers:{Cookie:cookie}}); assert.equal(response.status,401); }
  finally { await new Promise(resolve => srv.close(resolve)); production.db.close(); }
});
test('production mode provides no demo-session or synthetic seed', async () => {
  const dir = mkdtempSync(join(tmpdir(),'supernet-prod-test-')), production = createApp({dataDir:dir,demo:false});
  const srv = await new Promise(resolve => { const s = production.app.listen(0,'127.0.0.1',() => resolve(s)); });
  try {
    const response = await fetch(`http://127.0.0.1:${srv.address().port}/api/v1/demo-session`,{method:'POST',headers:{'X-Requested-With':'SuperNet','Content-Type':'application/json'},body:'{}'});
    assert.equal(response.status,404);
    assert.equal(production.db.prepare('SELECT COUNT(*) AS n FROM candidates').get().n,0);
    assert.equal(production.db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_demo=1').get().n,0);
  } finally { await new Promise(resolve => srv.close(resolve)); production.db.close(); rmSync(dir,{recursive:true,force:true}); }
});
