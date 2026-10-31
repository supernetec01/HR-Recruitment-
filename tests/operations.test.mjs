import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { bootstrapAdmin, createAccount } from '../server/accounts.mjs';
import { openDatabase, hash } from '../server/db.mjs';

const password = 'Operations-fixture-839!';
const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
let db, server, base, directory, admin, hr, interviewer, other, jobId;
let interviewerUser, otherUser, hrUser;
async function request(path, { session = admin, method = 'GET', data, form, idem } = {}) {
  const headers = {'X-Requested-With':'SuperNet'};
  if (session) headers.Cookie = session;
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  if (idem) headers['Idempotency-Key'] = idem;
  // Existing fixtures read the current revision; concurrency regressions use explicit snapshots.
  if (method === 'POST' && path === '/jobs' && !headers['Idempotency-Key']) headers['Idempotency-Key'] = crypto.randomUUID();
  if (method === 'PATCH' && /^\/candidates\/[^/]+$/.test(path) && data && data.expectedRevision === undefined) {
    const latest = await fetch(`${base}/api/v1${path}`,{headers});
    if (latest.ok) data = {...data,expectedRevision:(await latest.json()).revision};
  }
  const response = await fetch(`${base}/api/v1${path}`,{method,headers,body:form || (data !== undefined ? JSON.stringify(data) : undefined)});
  return {status:response.status,body:await response.json(),headers:response.headers};
}
async function login(username) {
  const response = await request('/login',{session:'',method:'POST',data:{login:username,password}});
  assert.equal(response.status,200); return response.headers.get('set-cookie').split(';')[0];
}
async function candidate({ consent = 'pending', contact = true, file = pdf } = {}) {
  const form = new FormData();
  Object.entries({fullName:'Ứng viên kiểm thử vận hành',email:contact ? `${randomUUID()}@example.com` : '',source:'Email',jobId,consentStatus:consent,consentEvidence:consent === 'granted' ? 'Xác nhận do ứng viên cung cấp trong kiểm thử.' : ''}).forEach(([key,value]) => form.set(key,value));
  if (file) form.set('file',new Blob([file],{type:'application/pdf'}),'CV-kiểm-thử.pdf');
  const result = await request('/candidates',{session:hr,method:'POST',form,idem:randomUUID()});
  assert.equal(result.status,200); return result.body.candidate;
}
function booking(profile, days = 12) {
  const start = new Date(Date.now() + days * 86400000); start.setUTCHours(3,0,0,0);
  return {applicationId:profile.applications[0].id,interviewerId:otherUser.id,startsAt:start.toISOString(),durationMinutes:45,mode:'Online',location:'Phòng kiểm thử'};
}
before(async () => {
  directory = mkdtempSync(join(tmpdir(),'supernet-operations-'));
  const instance = createApp({dataDir:directory}); db = instance.db;
  bootstrapAdmin(db,{username:'admin',password});
  server = instance.app.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening',resolve)); base = `http://127.0.0.1:${server.address().port}`;
  admin = await login('admin');
  for (const [username,role] of [['hr-operations','hr'],['interviewer-one','interviewer'],['interviewer-two','interviewer']]) {
    const created = await request('/admin/users',{method:'POST',data:{username,name:username,role,password}});
    assert.equal(created.status,201);
    if (role === 'hr') hrUser = created.body.user;
    else if (username === 'interviewer-one') interviewerUser = created.body.user;
    else otherUser = created.body.user;
  }
  hr = await login('hr-operations'); interviewer = await login('interviewer-one'); other = await login('interviewer-two');
  jobId = (await request('/jobs',{session:hr,method:'POST',data:{title:'Content Marketing vận hành',department:'Marketing',location:'Super Net',openings:2,description:'Công việc kiểm thử quy trình tiếp nhận và phỏng vấn.'}})).body.id;
});
after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(directory,{recursive:true,force:true}); });

test('Interviewer can read a newly received CV and nominate another interviewer without changing review metadata', async () => {
  const profile = await candidate();
  const idem = randomUUID(), send = () => request(`/applications/${profile.applications[0].id}/interview-requests`,{session:interviewer,method:'POST',idem,data:{documentId:profile.documents[0].id,interviewerId:otherUser.id,notes:'CV phù hợp để trao đổi vòng đầu.'}});
  const first = await send(); assert.equal(first.status,200); assert.deepEqual((await send()).body,first.body);
  assert.equal(first.body.request.document_review_status,'quarantined');
  assert.equal(first.body.request.preferred_interviewer_id,otherUser.id);
  const queue = (await request('/interview-requests',{session:hr})).body.find(row => row.id === first.body.request.id);
  assert.equal(queue.preferred_interviewer_name,otherUser.name);
  assert.equal(db.prepare('SELECT review_status FROM documents WHERE id=?').get(profile.documents[0].id).review_status,'quarantined');
  const preview = await fetch(`${base}/api/v1/documents/${profile.documents[0].id}/preview`, { headers: { Cookie: interviewer } });
  assert.equal(preview.status,200);
  assert.deepEqual(Buffer.from(await preview.arrayBuffer()), pdf);
  assert.equal((await request(`/interview-requests/${first.body.request.id}`,{session:other,method:'PATCH',data:{reason:'Không phải yêu cầu do tôi tạo.'}})).status,403);
});
test('Interviewer can review profiles but cannot change accounts, candidate data, JDs, file approval or schedules', async () => {
  const profile = await candidate();
  assert.equal((await request(`/candidates/${profile.id}`,{session:interviewer})).status,200);
  for (const [path,method,data] of [
    ['/admin/users','POST',{username:'bad-user',name:'Bad',role:'admin',password}],
    [`/admin/users/${interviewerUser.id}`,'PATCH',{role:'admin'}],
    [`/candidates/${profile.id}`,'PATCH',{fullName:'Bad edit'}],
    ['/jobs','POST',{}],[`/jobs/${jobId}`,'PATCH',{status:'closed'}],
    [`/documents/${profile.documents[0].id}/review`,'POST',{confirmed:true,evidence:'Unauthorized approval'}],
    ['/interviews','POST',booking(profile)],
  ]) assert.equal((await request(path,{session:interviewer,method,data})).status,403,path);
});
test('Interview requests reject another candidate CV, missing CV and invalid or locked interviewers', async () => {
  const one = await candidate(), two = await candidate(), noCV = await candidate({file:null});
  const path = `/applications/${one.applications[0].id}/interview-requests`;
  assert.equal((await request(path,{session:interviewer,method:'POST',idem:randomUUID(),data:{documentId:two.documents[0].id}})).status,409);
  assert.equal((await request(`/applications/${noCV.applications[0].id}/interview-requests`,{session:interviewer,method:'POST',idem:randomUUID(),data:{}})).status,409);
  for (const interviewerId of ['public','missing',hrUser.id]) assert.equal((await request(path,{session:interviewer,method:'POST',idem:randomUUID(),data:{interviewerId}})).status,400);
  await request(`/admin/users/${otherUser.id}`,{method:'PATCH',data:{active:false}});
  assert.equal((await request(path,{session:interviewer,method:'POST',idem:randomUUID(),data:{interviewerId:otherUser.id}})).status,400);
  await request(`/admin/users/${otherUser.id}`,{method:'PATCH',data:{active:true}}); other = await login('interviewer-two');
});
test('HR schedules a pending-consent candidate after recording contact, preserving the actual consent state', async () => {
  const profile = await candidate(), data = booking(profile);
  assert.equal((await request('/interviews',{session:hr,method:'POST',data})).status,409);
  assert.equal((await request('/interviews',{session:hr,method:'POST',data:{...data,contactConfirmed:true,contactEvidence:'short'}})).status,400);
  assert.equal((await request('/interviews',{session:hr,method:'POST',data:{...data,contactConfirmed:false,contactEvidence:'Đã liên hệ ứng viên trong kiểm thử.'}})).status,409);
  const contactEvidence = 'Đã gọi điện cho ứng viên và thống nhất lịch phỏng vấn vòng đầu.';
  const scheduled = await request('/interviews',{session:hr,method:'POST',data:{...data,contactConfirmed:true,contactEvidence}});
  assert.equal(scheduled.status,201);
  const stored = db.prepare('SELECT * FROM interviews WHERE id=?').get(scheduled.body.id);
  assert.equal(stored.contact_evidence,contactEvidence); assert.equal(stored.contacted_by,hrUser.id); assert.ok(stored.contacted_at);
  const updated = (await request(`/candidates/${profile.id}`)).body;
  assert.equal(updated.consent_status,'pending'); assert.equal(updated.consent_at,null);
  const moved = new Date(+new Date(data.startsAt) + 2 * 3600000).toISOString();
  assert.equal((await request(`/interviews/${stored.id}`,{session:hr,method:'PATCH',data:{...data,startsAt:moved,reason:'Ứng viên xác nhận đổi thời gian.'}})).status,200);
  assert.equal(db.prepare('SELECT contact_evidence FROM interviews WHERE id=?').get(stored.id).contact_evidence,contactEvidence);
});
test('Recording a phone call does not override withdrawn consent or missing contact information', async () => {
  const withdrawn = await candidate(), noContact = await candidate({contact:false});
  await request(`/candidates/${withdrawn.id}`,{session:hr,method:'PATCH',data:{consentStatus:'withdrawn'}});
  for (const profile of [withdrawn,noContact]) {
    assert.equal((await request('/interviews',{session:hr,method:'POST',data:{...booking(profile,14),contactConfirmed:true,contactEvidence:'Đã trao đổi thông tin lịch phỏng vấn trong kiểm thử.'}})).status,409);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM interviews WHERE application_id=?').get(profile.applications[0].id).n,0);
  }
});
test('PDFs preserve their original bytes; other content is scanned and stored as a download-only file', async () => {
  for (const prefix of [Buffer.from('\n'),Buffer.from('\r\n  \t'),Buffer.from([0xef,0xbb,0xbf,0x0a])]) {
    const buffer = Buffer.concat([prefix,pdf]), profile = await candidate({file:buffer});
    const document = db.prepare('SELECT * FROM documents WHERE id=?').get(profile.documents[0].id);
    assert.equal(document.checksum,hash(buffer));
    assert.deepEqual(readFileSync(join(directory,'documents',document.stored_name)),buffer);
    assert.equal(document.review_status,'quarantined'); assert.equal(document.mime_type,'application/pdf');
  }
  for (const buffer of [Buffer.concat([Buffer.from('<html>'),pdf]),Buffer.from('\n%PDF-1.4\n/JavaScript (bad)\n%%EOF'),Buffer.concat([Buffer.alloc(1024,32),pdf])]) {
    const form = new FormData();form.set('fullName','Scanned file');form.set('source','Email');form.set('file',new Blob([buffer],{type:'application/pdf'}),'CV.pdf');
    const result = await request('/candidates',{session:hr,method:'POST',form,idem:randomUUID()});
    assert.equal(result.status,200);
    assert.equal(result.body.candidate.documents[0].scan.status,'clean');
  }
});
test('Full JD employer and application contacts persist, are public, and survive partial editing', async () => {
  const details = {companyName:'CÔNG TY KIỂM THỬ SUPER NET',applicationInstructions:'Gửi CV theo hướng dẫn của bộ phận tuyển dụng.',applicationEmail:'recruitment@example.com',applicationEmailSubject:'[CONTENT MARKETING] – [HỌ VÀ TÊN]',applicationZalo:'0946 000 000'};
  const updated = await request(`/jobs/${jobId}`,{session:hr,method:'PATCH',data:details}); assert.equal(updated.status,200);
  assert.equal((await request(`/jobs/${jobId}`,{session:hr,method:'PATCH',data:{title:'JD kiểm thử cập nhật'}})).status,200);
  const visible = (await request(`/public/jobs/${jobId}`,{session:''})).body;
  for (const [column,key] of Object.entries({company_name:'companyName',application_instructions:'applicationInstructions',application_email:'applicationEmail',application_email_subject:'applicationEmailSubject',application_zalo:'applicationZalo'})) assert.equal(visible[column],details[key]);
  const before = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
  for (const data of [{applicationEmail:'bad-email'},{applicationZalo:'https://evil.test'},{companyName:'x'.repeat(201)},{applicationEmailSubject:'x'.repeat(201)}]) assert.equal((await request(`/jobs/${jobId}`,{method:'PATCH',data})).status,400);
  assert.deepEqual(db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId),before);
});
test('Upgrading the legacy role constraint preserves user IDs, hashes, sessions and candidate ownership', () => {
  const dir = mkdtempSync(join(tmpdir(),'supernet-legacy-roles-'));
  let legacy = openDatabase(dir);
  try {
    const account = bootstrapAdmin(legacy,{username:'legacy-admin',password});
    const oldHash = legacy.prepare('SELECT password_hash FROM users WHERE id=?').get(account.id).password_hash;
    legacy.prepare('INSERT INTO sessions VALUES(?,?,?)').run('fixture-session',account.id,'2099-01-01T00:00:00Z');
    legacy.prepare('INSERT INTO candidates(id,source,created_by,owner_id,received_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('legacy-candidate','Email',account.id,account.id,'2026-10-30','2026-10-30','2026-10-30');
    legacy.exec(`PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;
      CREATE TABLE users_old(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,role TEXT NOT NULL CHECK(role IN ('admin','boss','hr')),password_hash TEXT,is_demo INTEGER NOT NULL DEFAULT 0,username TEXT,active INTEGER NOT NULL DEFAULT 1);
      INSERT INTO users_old SELECT id,name,email,role,password_hash,is_demo,username,active FROM users;
      DROP TABLE users; ALTER TABLE users_old RENAME TO users; COMMIT;`);
    legacy.close(); legacy = openDatabase(dir);
    assert.equal(legacy.prepare('SELECT password_hash FROM users WHERE id=?').get(account.id).password_hash,oldHash);
    assert.equal(legacy.prepare('SELECT user_id FROM sessions WHERE token_hash=?').get('fixture-session').user_id,account.id);
    assert.equal(legacy.prepare('SELECT owner_id FROM candidates WHERE id=?').get('legacy-candidate').owner_id,account.id);
    assert.equal(createAccount(legacy,{username:'legacy-interviewer',name:'Người phỏng vấn',role:'interviewer',password},account.id).role,'interviewer');
    assert.equal(legacy.prepare('PRAGMA foreign_key_check').all().length,0);
    assert.equal(legacy.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
  } finally { legacy.close(); rmSync(dir,{recursive:true,force:true}); }
});
