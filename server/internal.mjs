import { z } from 'zod';
import { id, now, transaction, audit, passwordHash, verifyPassword } from './db.mjs';
import { createAccount, normalizeUsername, publicUser, validUsername } from './accounts.mjs';

const problem = (status, message) => { throw Object.assign(new Error(message), { status }); };
const password = z.string().min(12, 'Mật khẩu cần ít nhất 12 ký tự.').max(128);
const email = z.union([z.literal(''), z.email()]);
const adminOnly = (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ message: 'Chỉ quản trị viên được quản lý tài khoản.' });
const reviewerOnly = (req, res, next) => ['boss','admin','interviewer'].includes(req.user.role) ? next() : res.status(403).json({ message: 'Tài khoản chưa có quyền duyệt ứng viên và yêu cầu phỏng vấn.' });
const localDay = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(value));

export function registerInternalRoutes(app, { db, staff, editor, demo, getCandidate, idempotent }) {
  const users = () => db.prepare("SELECT id,name,email,username,role,active,is_demo FROM users WHERE id!='public' AND is_demo=? ORDER BY role,name").all(demo ? 1 : 0).map(publicUser);
  app.get('/api/v1/users', staff, (req, res) => res.json(users().filter(u => u.active)));
  app.get('/api/v1/admin/users', staff, adminOnly, (req, res) => res.json(users()));
  app.post('/api/v1/admin/users', staff, adminOnly, (req, res) => {
    const data = z.object({ username: z.string().trim().min(3).max(50), name: z.string().trim().min(1).max(120), email: email.default(''), role: z.enum(['hr','boss','admin','interviewer']), password }).parse(req.body);
    if (demo) problem(409, 'Hãy sử dụng không gian nội bộ để tạo tài khoản thực.');
    const user = transaction(db, () => createAccount(db, data, req.user.id));
    res.status(201).json({ user });
  });
  app.patch('/api/v1/admin/users/:id', staff, adminOnly, (req, res) => {
    const data = z.object({ name: z.string().trim().min(1).max(120).optional(), email: email.optional(), role: z.enum(['hr','boss','admin','interviewer']).optional(), active: z.boolean().optional(), password: password.optional() }).parse(req.body);
    if (demo) problem(409, 'Tài khoản minh họa không được thay đổi.');
    const updated = transaction(db, () => {
      const previous = db.prepare("SELECT * FROM users WHERE id=? AND id!='public' AND is_demo=0").get(req.params.id);
      if (!previous) problem(404, 'Không tìm thấy tài khoản.');
      if (previous.id === req.user.id && (data.active === false || (data.role && data.role !== 'admin'))) problem(409, 'Không thể tự khóa hoặc hạ quyền quản trị của phiên đang dùng.');
      const nextRole = data.role ?? previous.role, nextActive = data.active ?? !!previous.active;
      if (previous.role === 'admin' && previous.active && (!nextActive || nextRole !== 'admin') && db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND active=1 AND is_demo=0 AND id!='public'").get().n <= 1) problem(409, 'Phải giữ ít nhất một quản trị viên đang hoạt động.');
      if (data.email) {
        if (db.prepare('SELECT id FROM users WHERE id!=? AND (email=? COLLATE NOCASE OR username=? COLLATE NOCASE)').get(previous.id, data.email, data.email)) problem(409, 'Email đã được sử dụng.');
      }
      const changes = {};
      for (const column of ['name','email','role','active']) if (data[column] !== undefined) {
        const value = column === 'active' ? (data.active ? 1 : 0) : column === 'email' ? (data.email.toLowerCase() || `${previous.username}@accounts.supernet.invalid`) : data[column];
        if (value !== previous[column]) { db.prepare(`UPDATE users SET ${column}=? WHERE id=?`).run(value, previous.id); changes[column] = { before: previous[column], after: value }; }
      }
      if (data.password) { db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash(data.password), previous.id); changes.passwordReset = true; }
      if (data.password || data.role || data.active === false) db.prepare('DELETE FROM sessions WHERE user_id=?').run(previous.id);
      audit(db, null, req.user.id, 'user.updated', { userId: previous.id, changes });
      return publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(previous.id));
    });
    res.json({ user: updated });
  });
  app.post('/api/v1/me/password', staff, (req, res) => {
    const data = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }).parse(req.body);
    const user = db.prepare('SELECT * FROM users WHERE id=? AND is_demo=0').get(req.user.id);
    if (!user || !verifyPassword(data.currentPassword, user.password_hash)) problem(400, 'Mật khẩu hiện tại không đúng.');
    transaction(db, () => {
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash(data.newPassword), user.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
      audit(db, null, user.id, 'user.password_changed');
    });
    res.clearCookie('sn_session', { path: '/' }); res.json({ ok: true });
  });

  const requestQuery = `SELECT r.*,c.id AS candidate_id,c.full_name AS candidate_name,c.email,c.phone,c.owner_name,
    a.job_id,a.stage,j.title AS job_title,u.name AS requested_by_name,d.original_name AS document_name,d.version AS document_version,d.review_status AS document_review_status,
    preferred.name AS preferred_interviewer_name,
    (SELECT i.id FROM interviews i WHERE i.request_id=r.id AND i.status!='cancelled' ORDER BY i.created_at DESC LIMIT 1) AS interview_id
    FROM interview_requests r JOIN applications a ON a.id=r.application_id
    JOIN (SELECT candidates.*,owner.name AS owner_name FROM candidates LEFT JOIN users owner ON owner.id=candidates.owner_id) c ON c.id=a.candidate_id
    JOIN jobs j ON j.id=a.job_id JOIN users u ON u.id=r.requested_by JOIN documents d ON d.id=r.document_id
    LEFT JOIN users preferred ON preferred.id=r.preferred_interviewer_id`;
  app.get('/api/v1/interview-requests', staff, (req, res) => res.json(db.prepare(`${requestQuery} ORDER BY r.created_at DESC`).all()));
  app.post('/api/v1/applications/:id/interview-requests', staff, reviewerOnly, (req, res) => {
    const data = z.object({ notes: z.string().trim().max(2000).default(''), documentId: z.string().max(100).default(''), interviewerId: z.string().max(100).default(req.user.id) }).parse(req.body);
    idempotent(req, res, `interview-request:${req.user.id}:${req.params.id}`, () => {
      const application = db.prepare('SELECT * FROM applications WHERE id=?').get(req.params.id);
      if (!application) problem(404, 'Không tìm thấy lượt ứng tuyển.');
      if (['hired','offered','rejected'].includes(application.stage)) problem(409, 'Lượt ứng tuyển đã có quyết định hoặc đã kết thúc.');
      if (db.prepare("SELECT id FROM interview_requests WHERE application_id=? AND status='pending'").get(application.id)) problem(409, 'HR đã có một yêu cầu phỏng vấn đang chờ xử lý cho lượt ứng tuyển này.');
      if (db.prepare("SELECT id FROM interviews WHERE application_id=? AND status='scheduled'").get(application.id)) problem(409, 'Ứng viên đã có lịch phỏng vấn đang chờ.');
      const document = data.documentId ? db.prepare('SELECT * FROM documents WHERE id=? AND candidate_id=?').get(data.documentId, application.candidate_id) : db.prepare('SELECT * FROM documents WHERE candidate_id=? ORDER BY version DESC LIMIT 1').get(application.candidate_id);
      if (!document) problem(409, 'Hồ sơ chưa có CV. Hãy bổ sung CV trước khi gửi yêu cầu.');
      if (!db.prepare("SELECT id FROM users WHERE id=? AND id!='public' AND active=1 AND is_demo=? AND role IN ('interviewer','boss','admin')").get(data.interviewerId, demo ? 1 : 0)) problem(400, 'Người phỏng vấn được đề xuất không hợp lệ hoặc đã bị khóa.');
      const rid = id(), created = now();
      db.prepare('INSERT INTO interview_requests(id,application_id,document_id,requested_by,notes,previous_stage,created_at,updated_at,preferred_interviewer_id) VALUES(?,?,?,?,?,?,?,?,?)').run(rid, application.id, document.id, req.user.id, data.notes, application.stage, created, created, data.interviewerId);
      db.prepare("UPDATE applications SET stage='interview_requested' WHERE id=?").run(application.id);
      audit(db, application.candidate_id, req.user.id, 'interview.requested', { requestId: rid, applicationId: application.id, documentId: document.id, cvVersion: document.version, documentReviewStatus: document.review_status, preferredInterviewerId: data.interviewerId, notes: data.notes });
      return { request: db.prepare(`${requestQuery} WHERE r.id=?`).get(rid) };
    });
  });
  app.patch('/api/v1/interview-requests/:id', staff, reviewerOnly, (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(5).max(1000) }).parse(req.body);
    transaction(db, () => {
      const request = db.prepare("SELECT r.*,a.candidate_id FROM interview_requests r JOIN applications a ON a.id=r.application_id WHERE r.id=? AND r.status='pending'").get(req.params.id);
      if (!request) problem(409, 'Yêu cầu không còn chờ xử lý; nếu đã có lịch hãy liên hệ HR.');
      if (req.user.role === 'interviewer' && request.requested_by !== req.user.id) problem(403, 'Chỉ được hủy yêu cầu do bạn tạo.');
      db.prepare("UPDATE interview_requests SET status='cancelled',updated_at=? WHERE id=?").run(now(), request.id);
      db.prepare("UPDATE applications SET stage=? WHERE id=? AND stage='interview_requested'").run(request.previous_stage, request.application_id);
      audit(db, request.candidate_id, req.user.id, 'interview_request.cancelled', { requestId: request.id, reason });
    });
    res.json({ ok: true });
  });

  const interviewQuery = `SELECT i.*,CAST((julianday(i.ends_at)-julianday(i.starts_at))*1440 + 0.5 AS INTEGER) AS duration_minutes,
    u.name AS interviewer_name,c.full_name AS candidate_name,c.id AS candidate_id,j.title AS job_title
    FROM interviews i JOIN users u ON u.id=i.interviewer_id JOIN applications a ON a.id=i.application_id
    JOIN candidates c ON c.id=a.candidate_id JOIN jobs j ON j.id=a.job_id`;
  app.get('/api/v1/interviews', staff, (req, res) => res.json(db.prepare(`${interviewQuery} ORDER BY starts_at`).all()));
  const bookingSchema = z.object({
    applicationId: z.string().min(1), interviewerId: z.string().min(1), startsAt: z.iso.datetime(),
    durationMinutes: z.coerce.number().int().min(15).max(240).optional(), endsAt: z.iso.datetime().optional(),
    mode: z.enum(['Online','Trực tiếp','Điện thoại']), location: z.string().trim().min(2).max(1000), requestId: z.string().max(100).default(''),
    contactConfirmed: z.boolean().default(false), contactEvidence: z.string().trim().max(1000).default(''),
  }).refine(d => d.durationMinutes || d.endsAt, 'Cần chọn thời lượng phỏng vấn.');
  function bookingValues(data, exceptId = '') {
    const application = db.prepare('SELECT * FROM applications WHERE id=?').get(data.applicationId);
    if (!application) problem(400, 'Lượt ứng tuyển không hợp lệ.');
    if (['hired','offered','rejected'].includes(application.stage)) problem(409, 'Không thể đặt lịch cho lượt ứng tuyển đã kết thúc hoặc có quyết định.');
    const candidate = getCandidate(application.candidate_id);
    if (!candidate.email && !candidate.phone) problem(409, 'Cần bổ sung email hoặc số điện thoại để liên hệ ứng viên.');
    if (candidate.consent_status === 'withdrawn') problem(409, 'Ứng viên đã rút lại sự đồng ý xử lý dữ liệu. Chỉ tiếp tục sau khi ghi nhận sự đồng ý mới của ứng viên.');
    const previousContact = exceptId ? db.prepare('SELECT contact_evidence FROM interviews WHERE id=?').get(exceptId) : null;
    const contactEvidence = data.contactConfirmed ? data.contactEvidence : previousContact?.contact_evidence || '';
    if (data.contactConfirmed && contactEvidence.length < 10) problem(400, 'Ghi nhận nội dung trao đổi với ứng viên cần ít nhất 10 ký tự.');
    if (candidate.consent_status === 'pending' && contactEvidence.length < 10) problem(409, 'Hãy ghi nhận việc đã liên hệ và thống nhất lịch với ứng viên để tiếp tục.');
    const start = new Date(data.startsAt), end = data.durationMinutes ? new Date(+start + data.durationMinutes * 60000) : new Date(data.endsAt);
    const duration = (+end - +start) / 60000;
    if (+start <= Date.now() || !Number.isInteger(duration) || duration < 15 || duration > 240 || localDay(start) !== localDay(end)) problem(400, 'Lịch phải trong tương lai, cùng ngày và có thời lượng từ 15–240 phút.');
    if (!db.prepare("SELECT id FROM users WHERE id=? AND id!='public' AND active=1 AND is_demo=?").get(data.interviewerId, demo ? 1 : 0)) problem(400, 'Người phỏng vấn không hợp lệ hoặc đã bị khóa.');
    const startsAt = start.toISOString(), endsAt = end.toISOString();
    if (db.prepare("SELECT id FROM interviews WHERE interviewer_id=? AND status='scheduled' AND id!=? AND starts_at < ? AND ends_at > ?").get(data.interviewerId, exceptId, endsAt, startsAt)) problem(409, 'Người phỏng vấn đã có lịch trong khoảng thời gian này.');
    if (db.prepare("SELECT i.id FROM interviews i JOIN applications a ON a.id=i.application_id WHERE a.candidate_id=? AND i.status='scheduled' AND i.id!=? AND i.starts_at < ? AND i.ends_at > ?").get(candidate.id, exceptId, endsAt, startsAt)) problem(409, 'Ứng viên đã có lịch phỏng vấn trong khoảng thời gian này.');
    return { application, candidate, startsAt, endsAt, duration, contactEvidence };
  }
  app.post('/api/v1/interviews', staff, editor, (req, res) => {
    const data = bookingSchema.parse(req.body);
    const result = transaction(db, () => {
      const values = bookingValues(data), { application, candidate, startsAt, endsAt, duration, contactEvidence } = values;
      const pending = db.prepare("SELECT * FROM interview_requests WHERE application_id=? AND status='pending'").get(application.id);
      if (data.requestId && (!pending || pending.id !== data.requestId)) problem(409, 'Yêu cầu đã được xử lý hoặc không thuộc lượt ứng tuyển này. Hãy tải lại danh sách.');
      if (db.prepare("SELECT id FROM interviews WHERE application_id=? AND status='scheduled'").get(application.id)) problem(409, 'Lượt ứng tuyển đã có lịch. Hãy dùng chức năng Đổi lịch.');
      const iid = id();
      db.prepare('INSERT INTO interviews(id,application_id,interviewer_id,starts_at,ends_at,mode,location,created_by,created_at,request_id,contact_evidence,contacted_at,contacted_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(iid, application.id, data.interviewerId, startsAt, endsAt, data.mode, data.location, req.user.id, now(), pending?.id || null, contactEvidence, contactEvidence ? now() : null, contactEvidence ? req.user.id : null);
      if (pending) db.prepare("UPDATE interview_requests SET status='scheduled',updated_at=? WHERE id=?").run(now(), pending.id);
      db.prepare("UPDATE applications SET stage='scheduled' WHERE id=?").run(application.id);
      audit(db, candidate.id, req.user.id, 'interview.created', { interviewId: iid, requestId: pending?.id || null, startsAt, endsAt, durationMinutes: duration, interviewerId: data.interviewerId, contactEvidence, consentStatus: candidate.consent_status });
      return { id: iid };
    }); res.status(201).json(result);
  });
  app.patch('/api/v1/interviews/:id', staff, editor, (req, res) => {
    const previous = db.prepare('SELECT i.*,a.candidate_id FROM interviews i JOIN applications a ON a.id=i.application_id WHERE i.id=?').get(req.params.id);
    if (!previous) problem(404, 'Không tìm thấy lịch.');
    if (previous.status !== 'scheduled') problem(409, 'Lịch này đã hoàn thành hoặc đã hủy.');
    transaction(db, () => {
      if (req.body.status) {
        const { status } = z.object({ status: z.enum(['completed','cancelled']) }).parse(req.body);
        if (status === 'completed' && new Date(previous.starts_at) > new Date()) problem(409, 'Chưa đến giờ bắt đầu phỏng vấn.');
        db.prepare('UPDATE interviews SET status=? WHERE id=?').run(status, previous.id);
        if (status === 'cancelled' && previous.request_id) db.prepare("UPDATE interview_requests SET status='pending',updated_at=? WHERE id=?").run(now(), previous.request_id);
        db.prepare('UPDATE applications SET stage=? WHERE id=?').run(status === 'completed' ? 'interviewed' : previous.request_id ? 'interview_requested' : 'contacted', previous.application_id);
        audit(db, previous.candidate_id, req.user.id, `interview.${status}`, { interviewId: previous.id, requestId: previous.request_id });
      } else {
        const { reason } = z.object({ reason: z.string().trim().min(5).max(1000) }).parse(req.body);
        const data = bookingSchema.parse({ ...req.body, applicationId: previous.application_id, requestId: previous.request_id || '' });
        const { startsAt, endsAt, duration, contactEvidence } = bookingValues(data, previous.id);
        db.prepare('UPDATE interviews SET starts_at=?,ends_at=?,interviewer_id=?,mode=?,location=?,contact_evidence=?,contacted_at=?,contacted_by=? WHERE id=?').run(startsAt, endsAt, data.interviewerId, data.mode, data.location, contactEvidence, contactEvidence === previous.contact_evidence ? previous.contacted_at : contactEvidence ? now() : null, contactEvidence === previous.contact_evidence ? previous.contacted_by : contactEvidence ? req.user.id : null, previous.id);
        audit(db, previous.candidate_id, req.user.id, 'interview.rescheduled', { interviewId: previous.id, before: { startsAt: previous.starts_at, endsAt: previous.ends_at, interviewerId: previous.interviewer_id, location: previous.location }, after: { startsAt, endsAt, durationMinutes: duration, interviewerId: data.interviewerId, location: data.location, contactEvidence }, reason });
      }
    });
    res.json({ ok: true });
  });
}
