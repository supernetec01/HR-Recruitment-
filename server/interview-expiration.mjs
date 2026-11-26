import { audit, transaction } from './db.mjs';

const vietnamDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' });
const DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 30 * 1000;

function startOfVietnamDay(date) {
  return Date.parse(`${vietnamDay.format(date)}T00:00:00+07:00`);
}

function cancelMissedInterviews(db, date) {
  const cutoff = new Date(startOfVietnamDay(date)).toISOString();
  transaction(db, () => {
    const expired = db.prepare(`
      UPDATE interviews SET status='cancelled', cancellation_reason='no_show'
      WHERE status='scheduled' AND julianday(ends_at) < julianday(?)
      RETURNING id, application_id, request_id
    `).all(cutoff);
    const markNoShow = db.prepare(`
      UPDATE applications SET stage='no_show'
      WHERE id=? AND stage='scheduled'
        AND NOT EXISTS (SELECT 1 FROM interviews WHERE application_id=applications.id AND status='scheduled')
      RETURNING candidate_id
    `);
    const closeRequest = db.prepare(`
      UPDATE interview_requests SET status='cancelled', updated_at=?
      WHERE id=? AND application_id=? AND status='scheduled'
        AND NOT EXISTS (SELECT 1 FROM interviews WHERE request_id=interview_requests.id AND status='scheduled')
    `);
    const candidateForApplication = db.prepare('SELECT candidate_id FROM applications WHERE id=?');
    for (const interview of expired) {
      const application = markNoShow.get(interview.application_id);
      if (interview.request_id) closeRequest.run(date.toISOString(), interview.request_id, interview.application_id);
      const { candidate_id } = application || candidateForApplication.get(interview.application_id);
      audit(db, candidate_id, 'public', 'interview.no_show', {
        interviewId: interview.id, applicationId: interview.application_id, requestId: interview.request_id,
        ...(application && { before: 'scheduled', after: 'no_show' }),
      });
    }
  });
}

export function scheduleInterviewExpiration(db) {
  let timer;
  function run() {
    const date = new Date();
    const nextMidnight = startOfVietnamDay(date) + DAY_MS;
    let delay;
    try {
      cancelMissedInterviews(db, date);
      delay = Math.max(1, nextMidnight - Date.now());
    } catch (error) {
      console.error('Không thể tự động hủy lịch phỏng vấn quá ngày:', error.message);
      delay = RETRY_MS;
    }
    timer = setTimeout(run, delay);
    timer.unref();
  }
  run();
  return () => clearTimeout(timer);
}
