import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { openDatabase, id } from '../server/db.mjs';
import { scheduleInterviewExpiration } from '../server/interview-expiration.mjs';
import { seedRecruitmentFixture } from './helpers/recruitment-fixture.mjs';

async function start(directory, password) {
  const child = spawn(process.execPath,['server/index.mjs'],{env:{...process.env,NODE_ENV:'development',DEMO_MODE:'0',DATA_DIR:directory,PORT:'0',HOST:'127.0.0.1',USER_LOGIN:'admin',USER_PASSWORD:password},stdio:['ignore','pipe','pipe']});
  let output = '';
  const base = await new Promise((resolve,reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Startup did not complete')); },10000);
    child.stdout.on('data',chunk => { output += chunk; const match = output.match(/listening on port (\d+)/); if(match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); } });
    child.once('error',error => {clearTimeout(timer);reject(error);});
    child.once('exit',code => {clearTimeout(timer); if(code)reject(new Error('Startup failed'));});
  });
  return { base, output: () => output, stop: async () => { if(child.exitCode===null) { const ended=once(child,'exit');child.kill('SIGTERM');await ended; } } };
}
test('first startup provisions a supplied password once, preserves it on restart, and does not echo it', async t => {
  const directory=mkdtempSync(join(tmpdir(),'supernet-first-start-')), password=randomBytes(24).toString('hex'), nextPassword=randomBytes(24).toString('hex');
  let server=await start(directory,password);
  t.after(async()=>{await server.stop();rmSync(directory,{recursive:true,force:true});});
  const login = async value => fetch(`${server.base}/api/v1/login`,{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'SuperNet'},body:JSON.stringify({login:'admin',password:value})});
  assert.equal((await fetch(`${server.base}/api/v1/config`).then(r=>r.json())).needsSetup,false);
  assert.equal((await login(password)).status,200); assert.ok(!server.output().includes(password));
  await server.stop();server=await start(directory,nextPassword);
  assert.equal((await login(password)).status,200); assert.equal((await login(nextPassword)).status,401);
  assert.ok(!server.output().includes(password)); assert.ok(!server.output().includes(nextPassword));
});

test('scheduled interviews expire at midnight in Vietnam and preserve other rounds', ({ mock }) => {
  const directory = mkdtempSync(join(tmpdir(), 'supernet-interview-midnight-'));
  const db = openDatabase(directory);
  const midnight = Date.parse('2026-11-26T00:00:00+07:00');
  const previousEvening = midnight - 2 * 60 * 60 * 1000;
  const { candidate, interview, iso } = seedRecruitmentFixture(db, 'public', '2026-11-26');
  const absent = candidate('Ứng viên vắng mặt', previousEvening, 'scheduled');
  const absentInterview = interview(absent, { startsAt: previousEvening, status: 'scheduled' });
  const laterRound = candidate('Ứng viên có lịch khác', previousEvening, 'scheduled');
  const oldRound = interview(laterRound, { startsAt: previousEvening, status: 'scheduled' });
  const newRound = interview(laterRound, { startsAt: midnight + 3600000, status: 'scheduled' });
  const finished = candidate('Ứng viên đã hoàn thành', previousEvening, 'interviewed');
  const completedInterview = interview(finished, { startsAt: previousEvening, status: 'completed', result: 'pass' });
  const manuallyCancelled = interview(absent, { startsAt: previousEvening, status: 'cancelled' });

  const documentId = id(), requestId = id();
  db.prepare(`INSERT INTO documents(id,candidate_id,original_name,stored_name,mime_type,size,checksum,version,created_at,created_by)
    VALUES(?,?,?,?,'text/plain',1,'fixture',1,?,'public')`).run(documentId, absent.candidateId, 'cv.txt', 'unused.txt', iso(previousEvening));
  db.prepare(`INSERT INTO interview_requests(id,application_id,document_id,requested_by,previous_stage,status,created_at,updated_at)
    VALUES(?,?,?,'public','contacted','scheduled',?,?)`).run(requestId, absent.applicationId, documentId, iso(previousEvening), iso(previousEvening));
  db.prepare('UPDATE interviews SET request_id=? WHERE id=?').run(requestId, absentInterview);
  const status = interviewId => db.prepare('SELECT status,cancellation_reason FROM interviews WHERE id=?').get(interviewId);
  const stage = applicationId => db.prepare('SELECT stage FROM applications WHERE id=?').get(applicationId).stage;
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: midnight - 1000 });
  const stop = scheduleInterviewExpiration(db);
  try {
    mock.timers.tick(999);
    assert.equal(status(absentInterview).status, 'scheduled');
    mock.timers.tick(1);
    assert.equal(status(absentInterview).status, 'cancelled');
    assert.equal(status(absentInterview).cancellation_reason, 'no_show');
    assert.equal(stage(absent.applicationId), 'no_show');
    assert.equal(status(oldRound).status, 'cancelled');
    assert.equal(status(newRound).status, 'scheduled');
    assert.equal(stage(laterRound.applicationId), 'scheduled');
    assert.equal(status(completedInterview).status, 'completed');
    assert.equal(stage(finished.applicationId), 'interviewed');
    assert.equal(status(manuallyCancelled).cancellation_reason, null);
    const request = db.prepare('SELECT status,updated_at FROM interview_requests WHERE id=?').get(requestId);
    assert.equal(request.status, 'cancelled');
    assert.equal(request.updated_at, iso(midnight));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE candidate_id=? AND action='interview.no_show'").get(absent.candidateId).n, 1);
  } finally {
    stop();
    mock.timers.reset();
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('server startup catches up on missed interviews and a restart does not duplicate the history', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'supernet-interview-catch-up-'));
  let server;
  t.after(async () => { await server?.stop(); rmSync(directory, { recursive: true, force: true }); });
  const password = randomBytes(24).toString('hex');
  const db = openDatabase(directory);
  const { candidate, interview } = seedRecruitmentFixture(db, 'public');
  const yesterday = Date.now() - 2 * 86400000;
  const absent = candidate('Hồ sơ lỡ lịch khi máy chủ tắt', yesterday, 'scheduled');
  const interviewId = interview(absent, { startsAt: yesterday, status: 'scheduled' });
  db.close();
  const request = async (path, cookie) => fetch(`${server.base}/api/v1${path}`, { headers: { Cookie: cookie } });
  async function verify() {
    const login = await fetch(`${server.base}/api/v1/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'SuperNet' },
      body: JSON.stringify({ login: 'admin', password }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const interviews = await (await request('/interviews', cookie)).json();
    const missed = interviews.find(row => row.id === interviewId);
    assert.equal(missed.status, 'cancelled');
    assert.equal(missed.cancellation_reason, 'no_show');
    assert.equal(missed.evaluation_reminder_due, false);
    const profile = await (await request(`/candidates/${absent.candidateId}`, cookie)).json();
    assert.equal(profile.applications[0].stage, 'no_show');
    assert.equal(profile.interviews[0].cancellation_reason, 'no_show');
    assert.deepEqual(profile.history.filter(log => log.action === 'interview.no_show').map(log => log.actor_name), ['Hệ thống']);
  }
  server = await start(directory, password);
  await verify();
  await server.stop();
  server = await start(directory, password);
  await verify();
});
