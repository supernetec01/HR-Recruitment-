const DAY = 86400000;
const invalidRange = () => Object.assign(new Error('Chọn ngày bắt đầu và ngày kết thúc hợp lệ; ngày bắt đầu không được sau ngày kết thúc.'), { status: 400 });

function parseDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalidRange();
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) throw invalidRange();
  return timestamp;
}

export function registerRecruitmentReports(app, { db, staff }) {
  app.get('/api/v1/reports/recruitment', staff, (req, res) => {
    const { from, to } = req.query;
    const all = from === undefined && to === undefined;
    // Inclusive local calendar days, with an exclusive upper bound in UTC+7.
    const start = all ? null : parseDay(from) - 7 * 3600000;
    const end = all ? null : parseDay(to) + DAY - 7 * 3600000;
    if (!all && start >= end) throw invalidRange();
    const bounds = all ? [] : [new Date(start).toISOString(), new Date(end).toISOString()];
    const during = column => all ? '1=1' : `julianday(${column}) >= julianday(?) AND julianday(${column}) < julianday(?)`;

    const received = db.prepare(`SELECT COUNT(*) AS count FROM candidates WHERE ${during('received_at')}`).get(...bounds).count;
    const scheduled = db.prepare(`SELECT COUNT(DISTINCT a.candidate_id) AS count FROM interviews i
      JOIN applications a ON a.id=i.application_id
      WHERE i.status!='cancelled' AND ${during('i.created_at')}`).get(...bounds).count;
    // Each person contributes once. For multiple rounds in this period, use the
    // latest completed round and its current evaluation, including "not evaluated".
    const outcomes = db.prepare(`WITH completed AS (
      SELECT a.candidate_id,e.result,ROW_NUMBER() OVER (
        PARTITION BY a.candidate_id ORDER BY julianday(i.starts_at) DESC,julianday(i.created_at) DESC,i.id DESC
      ) AS position FROM interviews i JOIN applications a ON a.id=i.application_id
      LEFT JOIN interview_evaluations e ON e.interview_id=i.id
      WHERE i.status='completed' AND ${during('i.starts_at')}
    ) SELECT COALESCE(result,'pending') AS result,COUNT(*) AS count FROM completed WHERE position=1 GROUP BY result`).all(...bounds);
    const results = { pass: 0, fail: 0, follow_up: 0, pending: 0 };
    for (const row of outcomes) results[row.result] = row.count;
    const sources = db.prepare(`SELECT source AS name,COUNT(*) AS value FROM candidates
      WHERE ${during('received_at')} GROUP BY source ORDER BY value DESC,source`).all(...bounds);
    const jobs = db.prepare(`SELECT j.id,j.title,COUNT(a.id) AS value FROM jobs j
      LEFT JOIN applications a ON a.job_id=j.id AND ${during('a.received_at')}
      GROUP BY j.id ORDER BY value DESC,j.title`).all(...bounds);
    const stages = db.prepare(`SELECT stage,COUNT(*) AS value FROM applications
      WHERE ${during('received_at')} GROUP BY stage`).all(...bounds);
    res.json({ range: { from: from ?? null, to: to ?? null, timeZone: 'Asia/Bangkok' },
      summary: { received, scheduled, interviewed: Object.values(results).reduce((sum, count) => sum + count, 0), ...results },
      sources, jobs, stages, applicationCount: stages.reduce((sum, row) => sum + row.value, 0) });
  });
}
