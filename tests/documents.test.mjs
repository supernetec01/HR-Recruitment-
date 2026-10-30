import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { bootstrapAdmin, createAccount } from '../server/accounts.mjs';

let instance, server, base, cookie, root, directory;
const pdf = readFileSync(new URL('./fixtures/cv.pdf', import.meta.url));
const password = randomBytes(24).toString('hex');
async function start() {
  instance = createApp({ dataDir: directory });
  server = instance.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}
async function stop() { await new Promise(resolve => server.close(resolve)); instance.db.close(); }
async function upload(name = 'CV-Nguyễn-Thị-Ánh.pdf', bytes = pdf) {
  const form = new FormData(); form.set('fullName', 'Ứng viên CV'); form.set('source', 'Email');
  form.set('file', new Blob([bytes]), name);
  const response = await fetch(`${base}/api/v1/candidates`, { method: 'POST', headers: { Cookie: cookie, 'X-Requested-With': 'SuperNet', 'Idempotency-Key': randomUUID() }, body: form });
  assert.equal(response.status, 200);
  return (await response.json()).candidate.documents[0];
}
async function file(doc, action, session = cookie, extra = {}) {
  return fetch(`${base}/api/v1/documents/${doc.id}/${action}`, { headers: { ...(session ? { Cookie: session } : {}), ...extra } });
}
before(async () => {
  root = mkdtempSync(join(tmpdir(), 'supernet-documents-'));
  directory = join(root, '.data', 'internal'); // Match the default hidden storage directory.
  await start();
  bootstrapAdmin(instance.db, { username: 'admin', password });
  const login = await fetch(`${base}/api/v1/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'SuperNet' }, body: JSON.stringify({ login: 'admin', password }) });
  cookie = login.headers.get('set-cookie').split(';')[0];
});
after(async () => { await stop(); rmSync(root, { recursive: true, force: true }); });

test('new CV is immediately readable and downloadable from hidden .data storage, without manual approval', async () => {
  const doc = await upload();
  assert.equal(doc.review_status, 'quarantined'); // Legacy metadata does not gate access or claim a scan.
  for (const action of ['preview', 'download']) {
    const response = await file(doc, action);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.match(response.headers.get('content-disposition'), new RegExp(`^${action === 'preview' ? 'inline' : 'attachment'};`));
    assert.ok(response.headers.get('content-disposition').includes(encodeURIComponent(doc.original_name)));
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
    assert.equal((await file(doc, action, '')).status, 401);
  }
});

test('previously reviewed CVs also load from .data and support PDF byte ranges', async () => {
  const doc = await upload('CV-reviewed.pdf');
  instance.db.prepare("UPDATE documents SET review_status='reviewed' WHERE id=?").run(doc.id);
  const response = await file(doc, 'preview', cookie, { Range: 'bytes=0-15' });
  assert.equal(response.status, 206);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf.subarray(0, 16));
});

test('all active staff roles can read new CVs; locked sessions and anonymous clients cannot', async () => {
  const doc = await upload();
  for (const role of ['hr', 'boss', 'interviewer']) {
    const user = createAccount(instance.db, { username: `cv-${role}`, name: role, password, role });
    const login = await fetch(`${base}/api/v1/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'SuperNet' }, body: JSON.stringify({ login: user.username, password }) });
    const session = login.headers.get('set-cookie').split(';')[0];
    for (const action of ['preview', 'download']) {
      const response = await file(doc, action, session);
      assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
    }
    instance.db.prepare('UPDATE users SET active=0 WHERE id=?').run(user.id);
    assert.equal((await file(doc, 'download', session)).status, 401);
  }
});

test('CV bytes and login session remain usable after server restart', async () => {
  const doc = await upload();
  await stop(); await start();
  for (const action of ['preview', 'download']) {
    const response = await file(doc, action);
    assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
  }
});

test('DOCX preview and download preserve the original bytes and type', async () => {
  const bytes = readFileSync(new URL('./fixtures/cv.docx', import.meta.url));
  const doc = await upload('CV-Nguyễn-Thị-Ánh.docx', bytes);
  for (const action of ['preview', 'download']) {
    const response = await file(doc, action);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  }
});

test('a duplicate submission CV is available to staff before identity resolution and stays private', async () => {
  const created = await upload();
  const candidateId = instance.db.prepare('SELECT candidate_id FROM documents WHERE id=?').get(created.id).candidate_id;
  const update = await fetch(`${base}/api/v1/candidates/${candidateId}`, { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Requested-With': 'SuperNet' }, body: JSON.stringify({ email: 'cv-duplicate@example.com' }) });
  assert.equal(update.status, 200);
  const job = await fetch(`${base}/api/v1/jobs`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Requested-With': 'SuperNet' }, body: JSON.stringify({ title: 'CV test', department: 'QA', location: 'HCM', openings: 1, description: 'Công việc kiểm thử tài liệu tuyển dụng.' }) });
  const form = new FormData();
  for (const [key, value] of Object.entries({ fullName: 'Ứng viên nộp lại', email: 'cv-duplicate@example.com', jobId: (await job.json()).id, consent: 'true' })) form.set(key, value);
  form.set('file', new Blob([pdf]), 'CV-nộp-lại.pdf');
  assert.equal((await fetch(`${base}/api/v1/public/applications`, { method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body: form })).status, 200);
  const pending = await fetch(`${base}/api/v1/submissions`, { headers: { Cookie: cookie } });
  const submission = (await pending.json())[0], doc = submission.documents[0];
  assert.ok(doc.id); assert.equal(doc.mime_type, 'application/pdf');
  for (const action of ['preview', 'download']) {
    const response = await file(doc, action);
    assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
    assert.equal((await file(doc, action, '')).status, 401);
  }
  assert.equal(instance.db.prepare('SELECT status FROM submissions WHERE id=?').get(submission.id).status, 'pending');
});

test('missing stored file returns a useful JSON 404 without attachment headers', async () => {
  const doc = await upload();
  const stored = instance.db.prepare('SELECT stored_name FROM documents WHERE id=?').get(doc.id);
  unlinkSync(join(directory, 'documents', stored.stored_name));
  for (const action of ['preview', 'download']) {
    const response = await file(doc, action);
    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.equal(response.headers.get('content-disposition'), null);
    assert.match((await response.json()).message, /CV|tài liệu/);
  }
});
