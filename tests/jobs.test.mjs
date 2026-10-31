import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.mjs';
import { bootstrapAdmin } from '../server/accounts.mjs';
import { openDatabase } from '../server/db.mjs';
import { todayInVietnam } from '../server/jobs.mjs';

const password = 'JD-fixture-only-853!';
const content = {
  title: 'Content Marketing Safestraps', department: 'Marketing', location: 'Văn phòng kiểm thử Super Net', openings: 2,
  description: 'Lập kế hoạch nội dung cho sản phẩm phụ kiện xe.\nPhối hợp với đội ngũ để thực hiện chiến dịch.',
  requirements: 'Có kinh nghiệm biên tập nội dung.\nLàm việc chủ động và có trách nhiệm.',
  benefits: 'Được hướng dẫn về sản phẩm.\nCơ hội phát triển kỹ năng chuyên môn.',
  salaryRange: 'Mức lương minh họa trong kiểm thử', workingHours: 'Giờ làm việc minh họa', employmentType: 'Toàn thời gian', businessLine: 'safestraps', applicationDeadline: '2099-12-31',
};
let directory, db, server, base, admin, hr, boss, jobId, applicationId, candidateId;
async function request(path, { session = admin, method = 'GET', data, form, idem } = {}) {
  const headers = { 'X-Requested-With': 'SuperNet' };
  if (session) headers.Cookie = session;
  if (data) headers['Content-Type'] = 'application/json';
  if (idem) headers['Idempotency-Key'] = idem;
  // Existing fixtures read the current revision; concurrency regressions use explicit snapshots.
  if (method === 'POST' && path === '/jobs' && !headers['Idempotency-Key']) headers['Idempotency-Key'] = crypto.randomUUID();
  if (method === 'PATCH' && /^\/candidates\/[^/]+$/.test(path) && data && data.expectedRevision === undefined) {
    const latest = await fetch(`${base}/api/v1${path}`,{headers});
    if (latest.ok) data = {...data,expectedRevision:(await latest.json()).revision};
  }
  const response = await fetch(`${base}/api/v1${path}`,{method,headers,body:form || (data ? JSON.stringify(data) : undefined)});
  return { status: response.status, body: await response.json(), headers: response.headers };
}
async function login(username) {
  const response = await request('/login',{session:'',method:'POST',data:{login:username,password}});
  assert.equal(response.status,200); return response.headers.get('set-cookie').split(';')[0];
}
before(async () => {
  directory = mkdtempSync(join(tmpdir(),'supernet-jd-api-'));
  const instance = createApp({dataDir:directory}); db = instance.db;
  bootstrapAdmin(db,{username:'admin',password});
  server = instance.app.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening',resolve)); base = `http://127.0.0.1:${server.address().port}`;
  admin = await login('admin');
  for (const [username,role] of [['hr.jd','hr'],['boss.jd','boss']]) assert.equal((await request('/admin/users',{method:'POST',data:{username,name:username,role,password}})).status,201);
  hr = await login('hr.jd'); boss = await login('boss.jd');
});
after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(directory,{recursive:true,force:true}); });

test('Admin publishes a complete JD and anonymous applicants receive only public job fields', async () => {
  const created = await request('/jobs',{method:'POST',data:content});
  assert.equal(created.status,201); jobId = created.body.id;
  assert.equal(created.body.job.revision,1);
  const result = await request(`/public/jobs/${jobId}`,{session:''}); assert.equal(result.status,200);
  assert.equal(result.body.description,content.description); assert.equal(result.body.requirements,content.requirements); assert.equal(result.body.benefits,content.benefits);
  assert.equal(result.body.business_line,'safestraps'); assert.equal(result.body.salary_range,content.salaryRange); assert.equal(result.body.working_hours,content.workingHours);
  assert.equal(result.body.application_deadline,'2099-12-31'); assert.equal(result.body.employment_type,'Toàn thời gian'); assert.ok(result.body.updated_at);
  for (const key of ['application_count','revision','created_by','owner_id','password_hash']) assert.ok(!Object.hasOwn(result.body,key));
  assert.equal((await request('/jobs',{session:''})).status,401);
});
test('HR can create JDs for each supported product line and Boss cannot create or edit them', async () => {
  for (const businessLine of ['safestraps','jielien','baby-tatto']) {
    const result = await request('/jobs',{session:hr,method:'POST',data:{...content,title:`JD ${businessLine}`,businessLine,status:'closed'}});
    assert.equal(result.status,201); assert.equal(result.body.job.business_line,businessLine);
  }
  assert.equal((await request('/jobs',{session:boss,method:'POST',data:content})).status,403);
  for (const data of [{title:'Unauthorized'}, {description:'Unauthorized change to a published JD.'}, {status:'closed'}]) assert.equal((await request(`/jobs/${jobId}`,{session:boss,method:'PATCH',data})).status,403);
  assert.equal((await request(`/jobs/${jobId}`,{session:'',method:'PATCH',data:{title:'Anonymous edit'}})).status,401);
});
test('HR partial edits preserve every omitted JD field and existing applications', async () => {
  const form = new FormData(); Object.entries({fullName:'Ứng viên JD',phone:'0908456721',source:'Email',jobId}).forEach(([key,value]) => form.set(key,value));
  const candidate = await request('/candidates',{session:hr,method:'POST',form,idem:randomUUID()}); assert.equal(candidate.status,200);
  candidateId = candidate.body.candidate.id; applicationId = candidate.body.candidate.applications[0].id;
  const before = (await request('/jobs')).body.find(j => j.id === jobId);
  const edited = await request(`/jobs/${jobId}`,{session:hr,method:'PATCH',data:{title:'Content Marketing cập nhật',description:'Mô tả công việc mới được HR cập nhật, giữ nguyên các nội dung khác.',expectedRevision:before.revision}});
  assert.equal(edited.status,200); assert.equal(edited.body.job.revision,before.revision+1);
  for (const key of ['department','location','employment_type','requirements','benefits','salary_range','working_hours','business_line','application_deadline','openings']) assert.equal(edited.body.job[key],before[key],key);
  const profile = (await request(`/candidates/${candidateId}`)).body;
  assert.equal(profile.applications[0].id,applicationId); assert.equal(profile.applications[0].job_title,'Content Marketing cập nhật');
  const log = db.prepare("SELECT * FROM audit_logs WHERE action='job.updated' ORDER BY rowid DESC LIMIT 1").get();
  assert.equal(JSON.parse(log.details).changes.title.before,content.title);
  assert.equal(JSON.parse(log.details).changes.title.after,'Content Marketing cập nhật');
});
test('concurrent JD editing detects stale revisions rather than overwriting newer content', async () => {
  const before = (await request('/jobs')).body.find(j => j.id === jobId);
  assert.equal((await request(`/jobs/${jobId}`,{method:'PATCH',data:{benefits:'Quyền lợi mới do Admin cập nhật.',expectedRevision:before.revision}})).status,200);
  const stale = await request(`/jobs/${jobId}`,{session:hr,method:'PATCH',data:{benefits:'Nội dung cũ chưa tải lại.',expectedRevision:before.revision}});
  assert.equal(stale.status,409);
  assert.equal((await request(`/public/jobs/${jobId}`,{session:''})).body.benefits,'Quyền lợi mới do Admin cập nhật.');
});
test('paused JDs disappear from list and direct links without deleting job or applicant data', async () => {
  assert.equal((await request(`/jobs/${jobId}`,{session:hr,method:'PATCH',data:{status:'closed'}})).status,200);
  assert.ok(!(await request('/public/jobs',{session:''})).body.some(j => j.id === jobId));
  assert.equal((await request(`/public/jobs/${jobId}`,{session:''})).status,404);
  assert.ok((await request('/jobs')).body.some(j => j.id === jobId));
  assert.equal((await request(`/candidates/${candidateId}`)).body.applications[0].id,applicationId);
  const form = new FormData(); Object.entries({fullName:'Người gửi hồ sơ',email:'paused@example.com',jobId,consent:'true'}).forEach(([key,value]) => form.set(key,value)); form.set('file',new Blob(['%PDF-1.4\n%%EOF'],{type:'application/pdf'}),'CV.pdf');
  assert.equal((await request('/public/applications',{session:'',method:'POST',form,idem:randomUUID()})).status,400);
  assert.equal((await request(`/jobs/${jobId}`,{method:'PATCH',data:{status:'open'}})).status,200);
  assert.equal((await request(`/public/jobs/${jobId}`,{session:''})).status,200);
});
test('expired jobs are hidden while the deadline day remains open in Vietnam timezone', async () => {
  await request(`/jobs/${jobId}`,{method:'PATCH',data:{applicationDeadline:'2000-01-01'}});
  assert.equal((await request(`/public/jobs/${jobId}`,{session:''})).status,404);
  assert.ok(!(await request('/public/jobs',{session:''})).body.some(j => j.id === jobId));
  await request(`/jobs/${jobId}`,{session:hr,method:'PATCH',data:{applicationDeadline:todayInVietnam()}});
  assert.equal((await request(`/public/jobs/${jobId}`,{session:''})).status,200);
  await request(`/jobs/${jobId}`,{method:'PATCH',data:{applicationDeadline:''}});
  assert.equal((await request(`/public/jobs/${jobId}`,{session:''})).status,200);
});
test('invalid JD fields fail atomically and unknown IDs do not expose private data', async () => {
  const before = (await request('/jobs')).body.find(j => j.id === jobId);
  for (const data of [{description:'short'}, {businessLine:'other'}, {applicationDeadline:'2026-02-30'}, {openings:0}, {requirements:'x'.repeat(10001)}, {employmentType:'invalid'}]) {
    assert.equal((await request(`/jobs/${jobId}`,{method:'PATCH',data})).status,400);
  }
  assert.equal((await request(`/jobs/${jobId}`,{method:'PATCH',data:{}})).status,400);
  assert.equal((await request(`/jobs/${jobId}`,{method:'PATCH'})).status,400);
  assert.equal((await request(`/jobs/${jobId}`,{method:'PATCH',data:[]})).status,400);
  assert.deepEqual((await request('/jobs')).body.find(j => j.id === jobId),before);
  assert.equal((await request('/public/jobs/unknown',{session:''})).status,404);
  assert.equal((await request('/jobs/unknown',{method:'PATCH',data:{title:'Không tồn tại'}})).status,404);
});
test('full-length Vietnamese JD sections fit the JSON limit and persist without truncation', async () => {
  const sections = {description:'ệ'.repeat(10000),requirements:'ậ'.repeat(10000),benefits:'ợ'.repeat(10000)};
  const result = await request('/jobs',{session:hr,method:'POST',data:{...content,...sections,status:'closed'}});
  assert.equal(result.status,201);
  for (const [key,value] of Object.entries(sections)) assert.equal(result.body.job[key],value);
});
test('JD changes persist across database reopening with foreign keys intact', () => {
  const reopened = openDatabase(directory);
  try {
    const job = reopened.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
    assert.equal(job.title,'Content Marketing cập nhật'); assert.equal(job.requirements,content.requirements); assert.equal(job.business_line,'safestraps');
    assert.equal(reopened.prepare('SELECT job_id FROM applications WHERE id=?').get(applicationId).job_id,jobId);
    assert.equal(reopened.prepare('PRAGMA foreign_key_check').all().length,0);
  } finally { reopened.close(); }
});
test('additive migration preserves JDs created before the structured editor existed', () => {
  const dir = mkdtempSync(join(tmpdir(),'supernet-legacy-jd-'));
  const original = new DatabaseSync(join(dir,'recruitment.sqlite'));
  original.exec("CREATE TABLE jobs(id TEXT PRIMARY KEY,title TEXT NOT NULL,department TEXT NOT NULL,location TEXT NOT NULL,employment_type TEXT NOT NULL DEFAULT 'Toàn thời gian',description TEXT NOT NULL,openings INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'open',created_at TEXT NOT NULL)");
  original.prepare('INSERT INTO jobs(id,title,department,location,description,created_at) VALUES(?,?,?,?,?,?)').run('legacy-jd','JD cũ','Marketing','Super Net','Giữ nguyên mô tả JD đã có trước khi nâng cấp.','2026-10-01T00:00:00.000Z'); original.close();
  const migrated = openDatabase(dir);
  try { const job = migrated.prepare('SELECT * FROM jobs WHERE id=?').get('legacy-jd'); assert.equal(job.description,'Giữ nguyên mô tả JD đã có trước khi nâng cấp.'); assert.equal(job.requirements,''); assert.equal(job.revision,1); assert.equal(job.updated_at,job.created_at); }
  finally { migrated.close(); rmSync(dir,{recursive:true,force:true}); }
});
