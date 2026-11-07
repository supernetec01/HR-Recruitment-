import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';
import { bootstrapAdmin, createAccount } from '../server/accounts.mjs';
import { seedRecruitmentFixture } from './helpers/recruitment-fixture.mjs';
import { isNewCandidate, compareCandidates } from '../src/candidate-priority.ts';

let directory, db, server, base, cookie, fixture;
const password = 'Report-fixture-only-539!';
async function request(query = '?from=2026-11-01&to=2026-11-07', session = cookie) {
  const response = await fetch(`${base}/api/v1/reports/recruitment${query}`, { headers: session ? { Cookie: session } : {} });
  return { status: response.status, body: await response.json() };
}
async function login(username) {
  const response = await fetch(`${base}/api/v1/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'SuperNet' }, body: JSON.stringify({ login: username, password }) });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'supernet-reports-'));
  const instance = createApp({ dataDir: directory }); db = instance.db;
  const admin = bootstrapAdmin(db, { username: 'admin', password });
  fixture = seedRecruitmentFixture(db, admin.id);
  server = instance.app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
  cookie = await login('admin');
});
afterEach(async () => { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(directory, { recursive: true, force: true }); });

test('seven-day report separates receipt, booking and attendance dates, reproducing 7 / 5 / 3 with two fail and one pass', async () => {
  const result = await request(); assert.equal(result.status, 200);
  assert.deepEqual(result.body.summary, { received: 7, scheduled: 5, interviewed: 3, pass: 1, fail: 2, follow_up: 0, pending: 0 });
  assert.equal(result.body.applicationCount, 6); // One new profile has no position yet.
  assert.deepEqual(result.body.sources, [{ name: 'Email', value: 7 }]);
  assert.equal(result.body.jobs[0].value, 6);
  assert.equal(result.body.stages.find(row => row.stage === 'screening').value, 1);
});
test('calendar boundaries include both whole UTC+7 days, handle timestamps with offsets and reject invalid ranges', async () => {
  const { candidate, start, end, iso } = fixture;
  candidate('Ngay trước kỳ', start - 1); candidate('Ngay sau kỳ', end);
  const offset = candidate('Ngày nhận có múi giờ', start + 3600000);
  db.prepare('UPDATE candidates SET received_at=? WHERE id=?').run('2026-11-01T01:00:00+07:00', offset.candidateId);
  assert.equal((await request()).body.summary.received, 8);
  assert.equal((await request('?from=2026-11-01&to=2026-11-01')).body.summary.received, 2);
  assert.equal((await request('?from=2026-11-07&to=2026-11-07')).body.summary.received, 1);
  assert.equal(iso(start), '2026-10-31T17:00:00.000Z');
  for (const query of ['?from=2026-11-08&to=2026-11-01', '?from=2026-02-30&to=2026-03-01', '?from=2026-11-01', '?to=2026-11-07', '?from=&to=', '?from=2026-11-01&from=2026-11-02&to=2026-11-07']) assert.equal((await request(query)).status, 400, query);
});
test('multiple rounds and schedules count each person once, using the latest completed interview outcome without inferring screening rejections', async () => {
  const { older, interview, start, fresh } = fixture;
  interview(older[0], { startsAt: start + 5 * 86400000, result: 'pass' });
  interview(older[1], { startsAt: start + 6 * 86400000 }); // Latest round is awaiting feedback.
  db.prepare("UPDATE applications SET stage='rejected' WHERE id=?").run(fresh[0].applicationId);
  let summary = (await request()).body.summary;
  assert.deepEqual(summary, { received: 7, scheduled: 5, interviewed: 3, pass: 2, fail: 0, follow_up: 0, pending: 1 });
  db.prepare("UPDATE interview_evaluations SET result='follow_up' WHERE interview_id=?").run(fixture.interviews[2]);
  summary = (await request()).body.summary;
  assert.equal(summary.follow_up, 1); assert.equal(summary.pass, 1);
});
test('attendance uses the actual interview date, independent of when the booking and evaluation were recorded', async () => {
  const { candidate, interview, start } = fixture;
  const person = candidate('Ứng viên đặt lịch từ trước', start - 20 * 86400000, 'interviewed');
  interview(person, { createdAt: start - 10 * 86400000, startsAt: start + 4 * 86400000, result: 'pass' });
  const summary = (await request()).body.summary;
  assert.equal(summary.received, 7); assert.equal(summary.scheduled, 5); assert.equal(summary.interviewed, 4); assert.equal(summary.pass, 2);
});
test('empty and all-time ranges work, unauthenticated callers are blocked and every staff role can read reports', async () => {
  const empty = await request('?from=2025-01-01&to=2025-01-07');
  assert.ok(Object.values(empty.body.summary).every(value => value === 0)); assert.equal(empty.body.applicationCount, 0); assert.deepEqual(empty.body.sources, []);
  assert.equal((await request('')).body.summary.received, 13);
  assert.equal((await request('', '')).status, 401);
  for (const role of ['hr', 'boss', 'interviewer']) {
    createAccount(db, { username: `reports.${role}`, name: role, role, password });
    assert.equal((await request('', await login(`reports.${role}`))).status, 200);
  }
});
test('new and unassigned profiles are prioritized before processed profiles, with receipt dates and stable ties', async () => {
  const response = await fetch(`${base}/api/v1/candidates`, { headers: { Cookie: cookie } }); const candidates = await response.json();
  const sorted = [...candidates].sort(compareCandidates('priority'));
  const split = sorted.findIndex(candidate => !isNewCandidate(candidate));
  assert.equal(split, 6); assert.ok(sorted.slice(split).every(candidate => !isNewCandidate(candidate)));
  assert.ok(sorted.slice(0, split).every((candidate, index, all) => index === 0 || candidate.received_at <= all[index - 1].received_at));
  const processed = candidates.find(candidate => candidate.id === fixture.fresh[1].candidateId);
  const oldNew = { ...processed, id: 'new-older', received_at: '2026-01-01T00:00:00Z', applications: [] };
  assert.deepEqual([processed, oldNew].sort(compareCandidates('priority')).map(candidate => candidate.id), ['new-older', processed.id]);
  const reapplication = { ...oldNew, applications: [{ stage: 'new', received_at: '2027-01-01T00:00:00Z' }] };
  assert.equal([processed, reapplication].sort(compareCandidates('newest'))[0].id, reapplication.id);
  assert.equal([processed, oldNew].sort(compareCandidates('oldest'))[0].id, oldNew.id);
});
