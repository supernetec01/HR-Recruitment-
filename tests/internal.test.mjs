import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { bootstrapAdmin } from '../server/accounts.mjs';
import { openDatabase } from '../server/db.mjs';

const testPassword = 'Test-internal-only-394!';
let db, server, base, directory, admin, hr, boss, hrUser, bossUser, candidate, appId, jobId, document, requestId, interviewId;
const start = new Date(Date.now() + 5 * 86400000); start.setUTCHours(3,0,0,0);
async function request(path, { session = admin, method = 'GET', data, form, idem } = {}) {
  const headers = { 'X-Requested-With': 'SuperNet' };
  if (session) headers.Cookie = session;
  if (data) headers['Content-Type'] = 'application/json';
  if (idem) headers['Idempotency-Key'] = idem;
  const response = await fetch(`${base}/api/v1${path}`, { method, headers, body: form || (data ? JSON.stringify(data) : undefined) });
  return { status: response.status, body: await response.json().catch(() => null), response };
}
async function login(name, password = testPassword) {
  const result = await request('/login', { session: '', method: 'POST', data: { login: name, password } });
  assert.equal(result.status,200); return result.response.headers.get('set-cookie').split(';')[0];
}
before(async () => {
  directory = mkdtempSync(join(tmpdir(),'supernet-internal-api-'));
  const created = createApp({ dataDir: directory }); db = created.db;
  bootstrapAdmin(db, { username: 'admin', password: testPassword });
  await new Promise(resolve => { server = created.app.listen(0,'127.0.0.1',resolve); }); base = `http://127.0.0.1:${server.address().port}`;
  admin = await login('ADMIN');
});
after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(directory,{recursive:true,force:true}); });

test('normal workspace has real authentication, no auto session, and no default plaintext password', async () => {
  const config = (await request('/config',{session:''})).body;
  assert.equal(config.demo,false); assert.equal(config.needsSetup,false);
  assert.equal((await request('/candidates',{session:''})).status,401);
  assert.equal((await request('/demo-session',{session:'',method:'POST',data:{role:'admin'}})).status,404);
  assert.equal((await request('/login',{session:'',method:'POST',data:{login:'admin',password:'wrong'}})).status,401);
  const stored = db.prepare("SELECT * FROM users WHERE username='admin'").get();
  assert.notEqual(stored.password_hash,testPassword); assert.ok(stored.password_hash.includes(':'));
  assert.throws(() => bootstrapAdmin(db,{username:'admin',password:'Overwrite-password-29!'}),/Đã có quản trị viên/);
});
test('Admin creates HR and Boss accounts; API returns no password hashes', async () => {
  const createdHr = await request('/admin/users',{method:'POST',data:{username:'hr.linh',name:'HR Linh',email:'hr@example.com',role:'hr',password:testPassword}});
  const createdBoss = await request('/admin/users',{method:'POST',data:{username:'boss.chen',name:'Sếp Chen',role:'boss',password:testPassword}});
  assert.equal(createdHr.status,201); assert.equal(createdBoss.status,201); hrUser = createdHr.body.user; bossUser = createdBoss.body.user;
  assert.equal(createdHr.body.user.username,'hr.linh');
  for (const path of ['/admin/users','/users','/me']) assert.ok(!JSON.stringify((await request(path)).body).includes('password_hash'));
  hr = await login('HR.LINH'); boss = await login('boss.chen');
  assert.equal((await request('/admin/users',{method:'POST',data:{username:'HR.LINH',name:'Duplicate',role:'hr',password:testPassword}})).status,409);
});
test('HR and Boss cannot create accounts or escalate their own roles', async () => {
  for (const session of [hr,boss]) {
    assert.equal((await request('/admin/users',{session})).status,403);
    assert.equal((await request('/admin/users',{session,method:'POST',data:{username:'escalated',name:'Bad',role:'admin',password:testPassword}})).status,403);
    assert.equal((await request(`/admin/users/${hrUser.id}`,{session,method:'PATCH',data:{role:'admin'}})).status,403);
  }
  const self = (await request('/me')).body.user;
  assert.equal((await request(`/admin/users/${self.id}`,{method:'PATCH',data:{active:false}})).status,409);
  assert.equal((await request(`/admin/users/${self.id}`,{method:'PATCH',data:{role:'hr'}})).status,409);
});
test('disabled accounts lose existing sessions and cannot log in until unlocked', async () => {
  assert.equal((await request(`/admin/users/${hrUser.id}`,{method:'PATCH',data:{active:false}})).status,200);
  assert.equal((await request('/me',{session:hr})).status,401);
  assert.equal((await request('/login',{session:'',method:'POST',data:{login:'hr.linh',password:testPassword}})).status,401);
  assert.ok(!(await request('/users')).body.some(u => u.id === hrUser.id));
  await request(`/admin/users/${hrUser.id}`,{method:'PATCH',data:{active:true}}); hr = await login('hr.linh');
});
test('Admin reset and role changes revoke sessions without recording passwords in audit', async () => {
  const replacement = 'Changed-test-only-410!';
  assert.equal((await request(`/admin/users/${hrUser.id}`,{method:'PATCH',data:{password:replacement}})).status,200);
  assert.equal((await request('/me',{session:hr})).status,401);
  assert.equal((await request('/login',{session:'',method:'POST',data:{login:'hr.linh',password:testPassword}})).status,401);
  hr = await login('hr.linh',replacement);
  assert.equal((await request(`/admin/users/${hrUser.id}`,{method:'PATCH',data:{role:'boss'}})).status,200);
  assert.equal((await request('/me',{session:hr})).status,401);
  await request(`/admin/users/${hrUser.id}`,{method:'PATCH',data:{role:'hr',password:testPassword}}); hr = await login('hr.linh');
  const logs = JSON.stringify(db.prepare('SELECT details FROM audit_logs').all());
  assert.ok(!logs.includes(testPassword)); assert.ok(!logs.includes(replacement));
});
test('HR receives a CV, completes the profile and verifies the document for Boss', async () => {
  const job = await request('/jobs',{session:hr,method:'POST',data:{title:'Content Marketing',department:'Marketing',location:'TP.HCM',openings:1,description:'Sáng tạo nội dung cho các kênh của Super Net.'}});
  assert.equal(job.status,201); jobId = job.body.id;
  const form = new FormData();
  Object.entries({fullName:'Ứng viên Nội Bộ',email:'applicant@example.com',phone:'0908887771',source:'Email',jobId,ownerId:hrUser.id,consentStatus:'granted',consentEvidence:'Ứng viên xác nhận qua email.'}).forEach(([key,value]) => form.set(key,value));
  form.set('file',new Blob([Buffer.from('%PDF-1.4\nCV internal test\n%%EOF')],{type:'application/pdf'}),'CV.pdf');
  const result = await request('/candidates',{session:hr,method:'POST',form,idem:randomUUID()});
  assert.equal(result.status,200); candidate = result.body.candidate; appId = candidate.applications[0].id; document = candidate.documents[0];
  assert.equal((await request(`/documents/${document.id}/preview`,{session:boss})).status,423);
  assert.equal((await request(`/applications/${appId}/interview-requests`,{session:boss,method:'POST',idem:randomUUID(),data:{documentId:'unknown-document'}})).status,409);
  assert.equal((await request(`/documents/${document.id}/review`,{session:hr,method:'POST',data:{confirmed:true,evidence:'Tài liệu đã qua kiểm tra an toàn bởi HR trong kiểm thử.'}})).status,200);
});
test('Boss views the selected PDF and submits an idempotent interview request to HR', async () => {
  const preview = await fetch(`${base}/api/v1/documents/${document.id}/preview`,{headers:{Cookie:boss}});
  assert.equal(preview.status,200); assert.match(preview.headers.get('content-disposition'),/^inline/);
  assert.equal((await request(`/documents/${document.id}/preview`,{session:''})).status,401);
  assert.equal((await request(`/applications/${appId}/interview-requests`,{session:hr,method:'POST',idem:randomUUID(),data:{}})).status,403);
  const idem = randomUUID(), send = () => request(`/applications/${appId}/interview-requests`,{session:boss,method:'POST',idem,data:{documentId:document.id,notes:'CV phù hợp, nhờ HR liên hệ hẹn phỏng vấn.'}});
  const first = await send(), replay = await send();
  assert.equal(first.status,200); assert.deepEqual(replay.body,first.body); requestId = first.body.request.id;
  assert.equal(first.body.request.document_id,document.id); assert.equal(first.body.request.requested_by,bossUser.id);
  assert.equal((await request(`/applications/${appId}/interview-requests`,{session:boss,method:'POST',idem:randomUUID(),data:{}})).status,409);
  const queue = (await request('/interview-requests',{session:hr})).body;
  assert.equal(queue[0].id,requestId); assert.equal(queue[0].status,'pending'); assert.equal(queue[0].document_version,1);
  assert.equal((await request(`/candidates/${candidate.id}`,{session:hr})).body.applications[0].stage,'interview_requested');
});
test('only HR/Admin can schedule; HR chooses duration and resolves the Boss request atomically', async () => {
  const data = {applicationId:appId,requestId,interviewerId:bossUser.id,startsAt:start.toISOString(),durationMinutes:90,mode:'Trực tiếp',location:'Phòng họp Super Net'};
  assert.equal((await request('/interviews',{session:boss,method:'POST',data})).status,403);
  assert.equal((await request(`/applications/${appId}`,{session:hr,method:'PATCH',data:{stage:'scheduled'}})).status,403);
  const scheduled = await request('/interviews',{session:hr,method:'POST',data}); assert.equal(scheduled.status,201); interviewId = scheduled.body.id;
  const interview = (await request('/interviews',{session:boss})).body.find(i => i.id === interviewId);
  assert.equal(interview.duration_minutes,90); assert.equal(+new Date(interview.ends_at) - +new Date(interview.starts_at),90 * 60000);
  assert.equal(interview.request_id,requestId);
  assert.equal((await request('/interview-requests',{session:hr})).body[0].status,'scheduled');
  assert.equal((await request(`/candidates/${candidate.id}`)).body.applications[0].stage,'scheduled');
  assert.equal((await request('/interviews',{session:hr,method:'POST',data})).status,409);
});
test('a candidate cannot be double-booked across different jobs and interviewers', async () => {
  const job = await request('/jobs',{session:hr,method:'POST',data:{title:'Video Editor',department:'Creative',location:'Super Net',openings:1,description:'Biên tập video nội dung cho Super Net.'}});
  const next = await request(`/candidates/${candidate.id}/applications`,{session:hr,method:'POST',data:{jobId:job.body.id,source:'Email'}});
  const booking = await request('/interviews',{session:hr,method:'POST',data:{applicationId:next.body.id,interviewerId:hrUser.id,startsAt:new Date(+start + 15 * 60000).toISOString(),durationMinutes:30,mode:'Online',location:'Phòng họp khác'}});
  assert.equal(booking.status,409); assert.match(booking.body.message,/Ứng viên đã có lịch/);
  const selected = await request(`/applications/${next.body.id}/interview-requests`,{session:boss,method:'POST',idem:randomUUID(),data:{documentId:document.id}});
  assert.equal(selected.status,200);
  assert.equal((await request(`/interview-requests/${selected.body.request.id}`,{session:hr,method:'PATCH',data:{reason:'Hủy theo yêu cầu'}})).status,403);
  assert.equal((await request(`/interview-requests/${selected.body.request.id}`,{session:boss,method:'PATCH',data:{reason:'Đã chọn vị trí phù hợp hơn cho ứng viên.'}})).status,200);
  assert.equal((await request(`/candidates/${candidate.id}`)).body.applications.find(a => a.id === next.body.id).stage,'new');
});
test('rescheduling recalculates duration, rejects invalid limits and preserves a before/after audit', async () => {
  const payload = {interviewerId:bossUser.id,startsAt:new Date(+start + 2 * 3600000).toISOString(),durationMinutes:45,mode:'Online',location:'https://example.com/meeting',reason:'Ứng viên xác nhận đổi lịch sang giờ mới.'};
  assert.equal((await request(`/interviews/${interviewId}`,{session:boss,method:'PATCH',data:payload})).status,403);
  assert.equal((await request(`/interviews/${interviewId}`,{session:hr,method:'PATCH',data:{...payload,durationMinutes:0}})).status,400);
  assert.equal((await request(`/interviews/${interviewId}`,{session:hr,method:'PATCH',data:payload})).status,200);
  const interview = (await request('/interviews')).body.find(i => i.id === interviewId);
  assert.equal(interview.duration_minutes,45); assert.equal(interview.starts_at,payload.startsAt);
  const history = (await request(`/candidates/${candidate.id}`)).body.history;
  const change = history.find(h => h.action === 'interview.rescheduled'); assert.ok(change.details.before); assert.equal(change.details.after.durationMinutes,45);
  assert.equal((await request(`/interviews/${interviewId}`,{session:hr,method:'PATCH',data:{status:'completed'}})).status,409);
});
test('cancellation reopens the same HR request and allows a replacement booking', async () => {
  assert.equal((await request(`/interviews/${interviewId}`,{session:hr,method:'PATCH',data:{status:'cancelled'}})).status,200);
  assert.equal((await request('/interview-requests')).body.find(r => r.id === requestId).status,'pending');
  const again = await request('/interviews',{session:hr,method:'POST',data:{applicationId:appId,requestId,interviewerId:bossUser.id,startsAt:start.toISOString(),durationMinutes:30,mode:'Online',location:'Phòng online'}});
  assert.equal(again.status,201);
  const interviews = (await request('/interviews')).body;
  assert.equal(interviews.filter(i => i.status === 'scheduled').length,1);
  assert.equal(interviews.filter(i => i.status === 'cancelled').length,1);
});
test('self-service password change requires the current password and revokes all sessions', async () => {
  assert.equal((await request('/me/password',{session:hr,method:'POST',data:{currentPassword:'wrong',newPassword:'Next-test-only-503!'}})).status,400);
  assert.equal((await request('/me/password',{session:hr,method:'POST',data:{currentPassword:testPassword,newPassword:'Next-test-only-503!'}})).status,200);
  assert.equal((await request('/me',{session:hr})).status,401);
  hr = await login('hr.linh','Next-test-only-503!'); assert.equal((await request('/me',{session:hr})).status,200);
});
test('accounts, requests, duration and audit records persist after reopening the database', () => {
  const reopened = openDatabase(directory);
  try {
    assert.equal(reopened.prepare("SELECT active FROM users WHERE username='admin'").get().active,1);
    assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM interview_requests').get().n,2);
    assert.equal(reopened.prepare('PRAGMA foreign_key_check').all().length,0);
    assert.ok(reopened.prepare("SELECT id FROM audit_logs WHERE action='interview.requested'").get());
  } finally { reopened.close(); }
});
