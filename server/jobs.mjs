import { z } from 'zod';
import { id, now, audit, transaction } from './db.mjs';

export const todayInVietnam = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
export const openJobCondition = "status='open' AND (application_deadline='' OR application_deadline>=?)";
const failure = (status, message) => { throw Object.assign(new Error(message), { status }); };
const jobSchema = z.object({
  title: z.string().trim().min(2).max(120),
  department: z.string().trim().min(1).max(120),
  location: z.string().trim().min(1).max(200),
  description: z.string().trim().min(20, 'Mô tả công việc cần ít nhất 20 ký tự.').max(10000),
  openings: z.coerce.number().int().min(1).max(1000),
  employmentType: z.enum(['Toàn thời gian','Bán thời gian','Thực tập','Cộng tác viên','Hợp đồng']).default('Toàn thời gian'),
  requirements: z.string().trim().max(10000).default(''),
  benefits: z.string().trim().max(10000).default(''),
  workingHours: z.string().trim().max(1000).default(''),
  salaryRange: z.string().trim().max(200).default(''),
  businessLine: z.enum(['','safestraps','jielien','baby-tatto']).default(''),
  applicationDeadline: z.union([z.literal(''), z.iso.date()]).default(''),
  status: z.enum(['open','closed']).default('open'),
});
const fields = {
  title:'title', department:'department', location:'location', description:'description', openings:'openings',
  employmentType:'employment_type', requirements:'requirements', benefits:'benefits', workingHours:'working_hours',
  salaryRange:'salary_range', businessLine:'business_line', applicationDeadline:'application_deadline', status:'status',
};
const publicFields = 'id,title,department,location,employment_type,description,openings,requirements,benefits,working_hours,salary_range,business_line,application_deadline,created_at,updated_at';

export function registerJobRoutes(app, { db, staff, editor }) {
  app.get('/api/v1/jobs', staff, (req, res) => res.json(db.prepare(`SELECT j.*, (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id) AS application_count FROM jobs j ORDER BY created_at DESC,j.rowid DESC`).all()));
  app.post('/api/v1/jobs', staff, editor, (req, res) => {
    const data = jobSchema.parse(req.body), jid = id(), createdAt = now();
    transaction(db, () => {
      const columns = Object.values(fields), values = Object.keys(fields).map(key => data[key]);
      db.prepare(`INSERT INTO jobs(id,${columns.join(',')},created_at,updated_at) VALUES(${Array(columns.length + 3).fill('?').join(',')})`).run(jid, ...values, createdAt, createdAt);
      audit(db, null, req.user.id, 'job.created', { jobId: jid, title: data.title, status: data.status, businessLine: data.businessLine });
    });
    res.status(201).json({ id: jid, job: db.prepare('SELECT * FROM jobs WHERE id=?').get(jid) });
  });
  app.patch('/api/v1/jobs/:id', staff, editor, (req, res) => {
    const input = z.record(z.string(), z.unknown()).parse(req.body);
    // Validate the merged JD so omitted fields are preserved rather than replaced by schema defaults.
    const result = transaction(db, () => {
      const current = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
      if (!current) failure(404, 'Không tìm thấy vị trí tuyển dụng.');
      const keys = Object.keys(fields).filter(key => Object.hasOwn(input, key));
      if (!keys.length) failure(400, 'Chưa có nội dung JD cần cập nhật.');
      if (input.expectedRevision !== undefined) {
        const revision = z.coerce.number().int().min(1).parse(input.expectedRevision);
        if (revision !== current.revision) failure(409, 'JD đã được người khác cập nhật. Hãy tải lại trang trước khi chỉnh sửa tiếp.');
      }
      const previous = Object.fromEntries(Object.entries(fields).map(([key,column]) => [key,current[column]]));
      const data = jobSchema.parse({ ...previous, ...Object.fromEntries(keys.map(key => [key,input[key]])) });
      const changes = {};
      for (const key of keys) if (data[key] !== current[fields[key]]) changes[fields[key]] = { before: current[fields[key]], after: data[key] };
      if (Object.keys(changes).length) {
        const columns = Object.keys(changes);
        db.prepare(`UPDATE jobs SET ${columns.map(column => `${column}=?`).join(',')},updated_at=?,revision=revision+1 WHERE id=?`).run(...columns.map(column => changes[column].after), now(), current.id);
        audit(db, null, req.user.id, 'job.updated', { jobId: current.id, changes, revision: current.revision + 1 });
      }
      return db.prepare('SELECT * FROM jobs WHERE id=?').get(current.id);
    });
    res.json({ ok: true, job: result });
  });
  app.get('/api/v1/public/jobs', (req, res) => res.json(db.prepare(`SELECT ${publicFields} FROM jobs WHERE ${openJobCondition} ORDER BY created_at DESC,rowid DESC`).all(todayInVietnam())));
  app.get('/api/v1/public/jobs/:id', (req, res) => {
    const job = db.prepare(`SELECT ${publicFields} FROM jobs WHERE id=? AND ${openJobCondition}`).get(req.params.id, todayInVietnam());
    if (!job) failure(404, 'Tin tuyển dụng không tồn tại, đã tạm dừng hoặc đã hết hạn nhận hồ sơ.');
    res.json(job);
  });
}
