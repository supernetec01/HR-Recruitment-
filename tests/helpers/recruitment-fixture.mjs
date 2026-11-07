import { id } from '../../server/db.mjs';

export function seedRecruitmentFixture(db, userId, today = '2026-11-07') {
  const end = Date.parse(`${today}T00:00:00+07:00`) + 86400000;
  const start = end - 7 * 86400000;
  const iso = milliseconds => new Date(milliseconds).toISOString();
  const jobId = id();
  db.prepare('INSERT INTO jobs(id,title,department,location,description,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run(jobId, 'Vị trí báo cáo kiểm thử', 'Marketing', 'TP. Hồ Chí Minh', 'Dữ liệu kiểm thử báo cáo tuyển dụng.', iso(start), iso(start));
  function candidate(name, receivedAt, stage = 'new', withApplication = true) {
    const candidateId = id(), applicationId = withApplication ? id() : null;
    db.prepare('INSERT INTO candidates(id,full_name,source,created_by,received_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .run(candidateId, name, 'Email', userId, iso(receivedAt), iso(receivedAt), iso(receivedAt));
    if (applicationId) db.prepare('INSERT INTO applications(id,candidate_id,job_id,source,received_at,created_at,created_by,stage) VALUES(?,?,?,?,?,?,?,?)')
      .run(applicationId, candidateId, jobId, 'Email', iso(receivedAt), iso(receivedAt), userId, stage);
    return { candidateId, applicationId, name };
  }
  function interview(person, { createdAt = start + 3600000, startsAt = start + 7200000, status = 'completed', result } = {}) {
    const interviewId = id();
    db.prepare('INSERT INTO interviews(id,application_id,interviewer_id,starts_at,ends_at,mode,location,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(interviewId, person.applicationId, userId, iso(startsAt), iso(startsAt + 1800000), 'Online', 'Kiểm thử', status, userId, iso(createdAt));
    if (result) db.prepare('INSERT INTO interview_evaluations(interview_id,reviewer_id,score,result,comments,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .run(interviewId, userId, result === 'pass' ? 8 : 3, result, 'Nhận xét chỉ dùng trong kiểm thử.', iso(end), iso(end));
    return interviewId;
  }
  const fresh = Array.from({ length: 7 }, (_, index) => candidate(`Hồ sơ trong kỳ ${index + 1}`, index === 6 ? end - 1 : start + index * 86400000, index === 1 ? 'screening' : 'new', index !== 5));
  const older = Array.from({ length: 5 }, (_, index) => candidate(`Hồ sơ cũ được phỏng vấn ${index + 1}`, start - (index + 1) * 86400000, index < 3 ? 'interviewed' : 'scheduled'));
  const interviews = older.map((person, index) => interview(person, { status: index < 3 ? 'completed' : 'scheduled', result: index < 2 ? 'fail' : index === 2 ? 'pass' : undefined, startsAt: index < 3 ? start + (index + 1) * 86400000 : end + (index + 1) * 86400000 }));
  const cancelled = candidate('Lịch đã hủy', start - 86400000, 'contacted');
  interview(cancelled, { status: 'cancelled' });
  return { start, end, jobId, fresh, older, interviews, candidate, interview, iso };
}
