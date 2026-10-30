import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDatabase, id, now, hash, transaction, audit, duplicateMatches, completeness, normalizeEmail, normalizePhone, verifyPassword, STAGES, SOURCES } from './db.mjs';
import { publicUser, normalizeUsername } from './accounts.mjs';
import { registerInternalRoutes } from './internal.mjs';
import { protectOrigins } from './origin.mjs';
import { hasAdministrator } from './accounts.mjs';
import { registerJobRoutes, openJobCondition, todayInVietnam } from './jobs.mjs';
import { scanBuffer, scannerStatus } from './antivirus.mjs';
import { registerDocumentPreview } from './documents.mjs';
import { registerTranslations } from './translations.mjs';

const text = (max = 200) => z.string().trim().max(max).default('');
const emailValue = z.string().trim().max(254).pipe(z.union([z.literal(''), z.email()]));
const phoneValue = z.string().trim().max(30).refine(v => !v || (/^\+?[\d\s().-]{8,25}$/.test(v) && normalizePhone(v).length >= 8 && normalizePhone(v).length <= 15), 'Số điện thoại không hợp lệ');
const email = emailValue.default('');
const phone = phoneValue.default('');
const url = z.union([z.literal(''), z.url().max(1000).refine(v => /^https?:\/\//i.test(v), 'Chỉ hỗ trợ liên kết HTTP/HTTPS')]).default('');
const candidateSchema = z.object({
  fullName: text(120), email, phone, location: text(200), jobId: text(100),
  source: z.enum(SOURCES).default('Khác'), ownerId: text(100), notes: text(5000), portfolio: url,
  receivedAt: text(50).refine(v => !v || (Number.isFinite(Date.parse(v)) && Date.parse(v) <= Date.now() + 86400000), 'Ngày nhận hồ sơ không hợp lệ'),
  consentStatus: z.enum(['pending','granted','withdrawn']).default('pending'), consentEvidence: text(1000),
  resolution: z.enum(['link','separate']).optional(), targetId: text(100), reason: text(1000),
});
const publicSchema = z.object({
  fullName: z.string().trim().min(2).max(120), email, phone, jobId: z.string().min(1).max(100), portfolio: url,
  consent: z.enum(['true']),
}).refine(d => d.email || d.phone, 'Cần ít nhất một thông tin liên hệ');
const supplementSchema = z.object({ fullName: text(120), email, phone, portfolio: url, notes: text(3000), consent: z.enum(['true']) });
const patchSchema = z.object({
  fullName: z.string().trim().max(120).optional(),
  email: emailValue.optional(), phone: phoneValue.optional(),
  location: z.string().trim().max(200).optional(), ownerId: z.string().trim().max(100).optional(), notes: z.string().trim().max(5000).optional(),
  portfolio: z.union([z.literal(''), z.url().max(1000).refine(v => /^https?:\/\//i.test(v))]).optional(),
  consentStatus: z.enum(['pending','granted','withdrawn']).optional(), consentEvidence: z.string().trim().max(1000).optional(),
});
const fail = (status, message, extra = {}) => { const error = new Error(message); error.status = status; Object.assign(error, extra); throw error; };

export function createApp({ demo = false, dataDir = resolve(demo ? '.data' : '.data/internal'), appOrigin = process.env.APP_ORIGIN, trustProxy = process.env.TRUST_PROXY || 'loopback', production = process.env.NODE_ENV === 'production', scanFile = scanBuffer, translationService, translationSettingsStore, translationFetch, loginLimit = 30 } = {}) {
  const db = openDatabase(dataDir, demo);
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'", "'wasm-unsafe-eval'"], workerSrc: ["'self'",'blob:'], styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:'], fontSrc: ["'self'"], connectSrc: ["'self'"], frameSrc: ["'self'", 'blob:'], objectSrc: ["'none'"], upgradeInsecureRequests: null,
  } }, crossOriginEmbedderPolicy: false, strictTransportSecurity: production ? undefined : false }));
  app.use(express.json({ limit: '128kb' }));
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  protectOrigins(app, { appOrigin, trustProxy, production });
  const limiter = rateLimit({ windowMs: 15 * 60000, limit: demo ? 300 : 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.' } });
  const publicReadLimiter = rateLimit({windowMs:15 * 60000,limit:600,standardHeaders:'draft-8',legacyHeaders:false,message:{message:'Bạn thao tác quá nhanh. Vui lòng thử lại sau.'}});
  app.use('/api/v1/public',(req,res,next) => req.method === 'GET' ? publicReadLimiter(req,res,next) : limiter(req,res,next));
  app.use('/api/v1/login',rateLimit({windowMs:15 * 60000,limit:demo ? 300 : loginLimit,standardHeaders:'draft-8',legacyHeaders:false,message:{message:'Bạn thao tác quá nhanh. Vui lòng thử lại sau.'}}));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 24, fieldSize: 10000 } }).single('file');
  const stagedFiles = (req, res, next) => upload(req, res, async error => {
    if (error) return next(error);
    try {
      if (req.file) {
        validateFile(req.file);
        req.file.scanResult = await scanFile(req.file.buffer, { filename: req.file.originalname });
        if (req.file.scanResult?.status !== 'clean' || req.file.scanResult.checksum !== hash(req.file.buffer)) fail(503, 'Tệp chưa có kết quả quét hợp lệ. Vui lòng thử lại.');
      }
      next();
    } catch (error) { next(error); }
  });

  function getCandidate(cid) {
    const c = db.prepare(`SELECT c.*, u.name AS owner_name, creator.name AS creator_name FROM candidates c
      LEFT JOIN users u ON u.id=c.owner_id JOIN users creator ON creator.id=c.created_by WHERE c.id=?`).get(cid);
    if (!c) fail(404, 'Không tìm thấy hồ sơ.');
    const applications = db.prepare(`SELECT a.*, j.title AS job_title, j.department FROM applications a JOIN jobs j ON j.id=a.job_id WHERE a.candidate_id=? ORDER BY a.created_at DESC`).all(cid);
    const documents = db.prepare('SELECT id,original_name,mime_type,size,version,kind,review_status,scan_result,created_at,created_by FROM documents WHERE candidate_id=? ORDER BY created_at DESC,version DESC').all(cid).map(d => ({ ...d, scan: d.scan_result ? JSON.parse(d.scan_result) : null, scan_result: undefined }));
    return { ...c, tags: JSON.parse(c.tags), applications, documents, ...completeness(c, applications, documents) };
  }
  function staff(req, res, next) {
    const cookie = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('sn_session='))?.slice(11);
    const user = cookie && db.prepare(`SELECT u.id,u.name,u.email,u.username,u.role,u.active,u.is_demo FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1 AND u.id!='public' AND u.is_demo=?`).get(hash(cookie), now(), demo ? 1 : 0);
    if (!user) return res.status(401).json({ message: 'Vui lòng đăng nhập.' });
    req.user = publicUser(user);
    next();
  }
  function editor(req, res, next) { if (!['hr','admin'].includes(req.user.role)) return res.status(403).json({ message: 'Chỉ HR hoặc Admin được cập nhật hồ sơ.' }); next(); }
  function session(res, user) {
    const token = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now());
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token), user.id, new Date(Date.now() + 8 * 3600000).toISOString());
    res.cookie('sn_session', token, { httpOnly: true, sameSite: 'lax', secure: production, maxAge: 8 * 3600000, path: '/' });
    return publicUser(user);
  }
  function validateFile(file) {
    if (!file) return;
    // Browser multipart filenames use UTF-8; Busboy's legacy parameter decoding is latin1.
    if (!file.nameDecoded) {
      const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      if (!decodedName.includes('\uFFFD')) file.originalname = decodedName.normalize('NFC');
      file.nameDecoded = true;
    }
    if (!file.size) fail(400, 'Tệp đang trống. Vui lòng chọn lại CV.');
    file.originalname = Array.from(file.originalname.replace(/[\r\n/\\\x00-\x1f\x7f]/g, '_')).slice(0, 200).join('') || 'CV';
    const ext = file.originalname.toLowerCase().split('.').pop();
    const headerOffset = file.buffer.subarray(0, 1024).indexOf(Buffer.from('%PDF-'));
    // Some PDF exporters prepend whitespace or a UTF-8 BOM. Preserve the original bytes/xref offsets.
    const pdf = headerOffset >= 0 && /^(?:\uFEFF)?[\t\n\f\r ]*$/.test(file.buffer.subarray(0, headerOffset).toString('utf8'));
    const docx = ext === 'docx' && file.buffer.subarray(0, 4).equals(Buffer.from([0x50,0x4b,0x03,0x04])) && file.buffer.includes(Buffer.from('[Content_Types].xml')) && file.buffer.includes(Buffer.from('word/document.xml'));
    const hex = file.buffer.subarray(0, 12).toString('hex');
    const image = hex.startsWith('89504e470d0a1a0a') ? 'image/png' : hex.startsWith('ffd8ff') ? 'image/jpeg' : /^474946383[79]61/.test(hex) ? 'image/gif' : file.buffer.subarray(0, 4).toString() === 'RIFF' && file.buffer.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : '';
    file.safeMime = pdf ? 'application/pdf' : docx ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : image || (ext === 'txt' && !file.buffer.includes(0) ? 'text/plain' : 'application/octet-stream');
  }
  function saveFile(file, candidateId, submissionId, actorId) {
    if (!file) return;
    validateFile(file);
    if (file.scanResult?.status !== 'clean' || file.scanResult.checksum !== hash(file.buffer)) fail(503, 'Tệp chưa vượt qua kiểm tra mã độc. Tệp chưa được lưu.');
    const docId = id(), stored = `${docId}.bin`;
    const version = candidateId ? db.prepare('SELECT COALESCE(MAX(version),0)+1 AS n FROM documents WHERE candidate_id=?').get(candidateId).n : 1;
    writeFileSync(resolve(dataDir, 'documents', stored), file.buffer, { mode: 0o600, flag: 'wx' });
    try {
      db.prepare(`INSERT INTO documents(id,candidate_id,submission_id,original_name,stored_name,mime_type,size,checksum,version,created_at,created_by,scan_result) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(docId, candidateId, submissionId, file.originalname, stored, file.safeMime, file.size, hash(file.buffer), version, now(), actorId, JSON.stringify(file.scanResult));
    } catch (error) { unlinkSync(resolve(dataDir, 'documents', stored)); throw error; }
    if (candidateId) audit(db, candidateId, actorId, 'document.uploaded', { documentId: docId, name: file.originalname, version, scan: file.scanResult });
  }
  function assertJob(jobId) { if (jobId && !db.prepare(`SELECT id FROM jobs WHERE id=? AND ${openJobCondition}`).get(jobId, todayInVietnam())) fail(400, 'Vị trí không tồn tại, đã ngừng tuyển hoặc đã hết hạn nhận hồ sơ.'); }
  function assertOwner(ownerId) { if (ownerId && !db.prepare("SELECT id FROM users WHERE id=? AND role IN ('hr','admin') AND id!='public' AND active=1 AND is_demo=?").get(ownerId, demo ? 1 : 0)) fail(400, 'Người phụ trách không hợp lệ hoặc đã bị khóa.'); }
  function addApplication(cid, data, actorId) {
    if (!data.jobId) return;
    assertJob(data.jobId);
    const previous = db.prepare("SELECT id FROM applications WHERE candidate_id=? AND job_id=? AND stage NOT IN ('hired','rejected') ORDER BY created_at DESC LIMIT 1").get(cid, data.jobId);
    if (previous) { audit(db, cid, actorId, 'application.updated_submission', { applicationId: previous.id, source: data.source, receivedAt: data.receivedAt }); return previous.id; }
    const aid = id();
    db.prepare('INSERT INTO applications(id,candidate_id,job_id,source,received_at,created_at,created_by) VALUES(?,?,?,?,?,?,?)').run(aid, cid, data.jobId, data.source, data.receivedAt || now(), now(), actorId);
    audit(db, cid, actorId, 'application.created', { applicationId: aid, jobId: data.jobId, source: data.source });
    return aid;
  }
  function insertCandidate(data, actorId) {
    const cid = id(), time = now();
    assertOwner(data.ownerId);
    db.prepare(`INSERT INTO candidates(id,full_name,email,phone,location,source,created_by,received_at,created_at,updated_at,owner_id,notes,consent_status,consent_at,consent_version,portfolio)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(cid, data.fullName || '', normalizeEmail(data.email), normalizePhone(data.phone), data.location || '', data.source,
      actorId, data.receivedAt || time, time, time, data.ownerId || null, data.notes || '', data.consentStatus || 'pending', data.consentStatus === 'granted' ? time : null,
      data.consentStatus === 'granted' ? 'recruitment-v2' : null, data.portfolio || '');
    audit(db, cid, actorId, 'candidate.created', { source: data.source, receivedAt: data.receivedAt || time });
    if (data.consentStatus === 'granted') audit(db, cid, actorId, 'consent.granted', { version: 'recruitment-v2', evidence: data.consentEvidence || 'Ứng viên xác nhận trên biểu mẫu công khai.' });
    addApplication(cid, data, actorId);
    return cid;
  }
  function idempotent(req, res, scope, fn) {
    const key = req.get('Idempotency-Key');
    if (!key || !/^[a-zA-Z0-9_-]{16,100}$/.test(key)) fail(400, 'Thiếu mã yêu cầu hợp lệ. Vui lòng thử gửi lại.');
    const fingerprint = hash(JSON.stringify(req.body) + (req.file ? hash(req.file.buffer) : ''));
    const scopedKey = `${scope}:${key}`;
    const previous = db.prepare('SELECT * FROM idempotency_keys WHERE key=?').get(scopedKey);
    if (previous) {
      if (previous.request_hash !== fingerprint) fail(409, 'Mã yêu cầu đã được sử dụng với nội dung khác.');
      return res.json(JSON.parse(previous.response));
    }
    const result = transaction(db, () => {
      const response = fn();
      db.prepare('INSERT INTO idempotency_keys VALUES(?,?,?,?,?)').run(scopedKey, scope, fingerprint, JSON.stringify(response), now());
      return response;
    });
    res.json(result);
  }
  function validToken(token) {
    const record = db.prepare('SELECT * FROM update_tokens WHERE token_hash=?').get(hash(token));
    if (!record || record.used_at || record.revoked_at || record.expires_at <= now()) fail(410, 'Liên kết đã hết hạn, đã được sử dụng hoặc đã thu hồi. Vui lòng liên hệ HR để nhận liên kết mới.');
    return record;
  }

  app.get('/api/v1/health', (req, res) => { db.prepare('SELECT 1').get(); res.json({ status: 'ok', demo }); });
  app.get('/api/v1/scanner-status', staff, async (req, res) => res.json(await scannerStatus()));
  app.get('/api/v1/config', (req, res) => res.json({ demo, needsSetup: !demo && !hasAdministrator(db), policyVersion: 'recruitment-v2' }));
  app.post('/api/v1/demo-session', (req, res) => {
    if (!demo) return res.sendStatus(404);
    const role = z.enum(['hr','admin','boss']).parse(req.body.role || 'hr');
    const user = db.prepare('SELECT * FROM users WHERE id=? AND is_demo=1').get(`demo-${role}`);
    res.json({ user: session(res, user) });
  });
  app.post('/api/v1/login', (req, res) => {
    if (!hasAdministrator(db)) return res.status(503).json({ code: 'ADMIN_SETUP_REQUIRED', message: 'Máy chủ này chưa có tài khoản quản trị. Hãy hoàn tất bước khởi tạo Admin trong Terminal của máy chủ rồi đăng nhập.' });
    const input = z.object({ login: z.string().trim().min(1).max(254), password: z.string().min(1).max(128) }).parse({ ...req.body, login: req.body.login || req.body.email });
    const login = normalizeUsername(input.login);
    const user = db.prepare("SELECT * FROM users WHERE (username=? COLLATE NOCASE OR email=? COLLATE NOCASE) AND is_demo=0 AND active=1 AND id!='public'").get(login, login);
    if (!user || !verifyPassword(input.password, user.password_hash)) fail(401, 'Tài khoản hoặc mật khẩu không đúng.');
    res.json({ user: session(res, user) });
  });
  app.get('/api/v1/me', staff, (req, res) => res.json({ user: req.user }));
  app.post('/api/v1/logout', staff, (req, res) => {
    const cookie = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('sn_session='))?.slice(11);
    if (cookie) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(cookie));
    res.clearCookie('sn_session', { path: '/' }); res.json({ ok: true });
  });
  registerInternalRoutes(app, { db, staff, editor, demo, getCandidate, idempotent });
  registerJobRoutes(app, { db, staff, editor });
  registerDocumentPreview(app, { db, staff, dataDir });
  registerTranslations(app, { db, staff, editor, dataDir, service:translationService, settingsStore:translationSettingsStore, fetchImpl:translationFetch, demo });
  app.get('/api/v1/candidates', staff, (req, res) => {
    const candidates = db.prepare('SELECT id FROM candidates ORDER BY received_at DESC,created_at DESC').all().map(c => getCandidate(c.id));
    res.json(candidates);
  });
  app.post('/api/v1/candidates', staff, editor, stagedFiles, (req, res) => {
    const data = candidateSchema.parse(req.body);
    validateFile(req.file);
    if (!data.fullName && !data.email && !data.phone && !req.file) fail(400, 'Hãy nhập ít nhất một thông tin hoặc tải CV lên.');
    if (data.consentStatus === 'granted' && !data.consentEvidence) fail(400, 'Hãy ghi lại căn cứ xác nhận sự đồng ý của ứng viên.');
    assertJob(data.jobId); assertOwner(data.ownerId);
    idempotent(req, res, `candidate:${req.user.id}`, () => {
      const matches = duplicateMatches(db, data);
      if (matches.length && !data.resolution) fail(409, 'Phát hiện hồ sơ có thể trùng. HR cần xác nhận trước khi tiếp tục.', { code: 'POSSIBLE_DUPLICATE', matches });
      let cid;
      if (data.resolution === 'link') {
        if (!matches.some(m => m.id === data.targetId)) fail(400, 'Hãy chọn một hồ sơ trong danh sách trùng.');
        cid = data.targetId;
        getCandidate(cid);
        addApplication(cid, data, req.user.id);
        audit(db, cid, req.user.id, 'candidate.linked', { received: data, reason: data.reason || 'HR xác nhận cùng ứng viên. Không ghi đè thông tin cũ.' });
        db.prepare('UPDATE candidates SET updated_at=? WHERE id=?').run(now(), cid);
      } else {
        if (matches.length && data.resolution === 'separate' && data.reason.length < 5) fail(400, 'Cần ghi rõ lý do đây là một ứng viên khác.');
        cid = insertCandidate(data, req.user.id);
        if (matches.length) audit(db, cid, req.user.id, 'duplicate.separate_confirmed', { reason: data.reason, matchedIds: matches.map(m => m.id) });
      }
      saveFile(req.file, cid, null, req.user.id);
      return { candidate: getCandidate(cid) };
    });
  });
  app.get('/api/v1/candidates/:id', staff, (req, res) => {
    const candidate = getCandidate(req.params.id);
    audit(db, candidate.id, req.user.id, 'candidate.viewed');
    const history = db.prepare(`SELECT l.*,u.name AS actor_name FROM audit_logs l JOIN users u ON u.id=l.actor_id WHERE candidate_id=? ORDER BY l.created_at DESC,l.rowid DESC`).all(candidate.id).map(l => ({ ...l, details: JSON.parse(l.details) }));
    const links = db.prepare('SELECT token_hash,created_at,expires_at,used_at,revoked_at FROM update_tokens WHERE candidate_id=? ORDER BY created_at DESC').all(candidate.id);
    const interviews = db.prepare(`SELECT i.*,u.name AS interviewer_name,j.title AS job_title FROM interviews i JOIN users u ON u.id=i.interviewer_id
      JOIN applications a ON a.id=i.application_id JOIN jobs j ON j.id=a.job_id WHERE a.candidate_id=? ORDER BY i.starts_at DESC`).all(candidate.id);
    res.json({ ...candidate, history, links, interviews });
  });
  app.patch('/api/v1/candidates/:id', staff, editor, (req, res) => {
    const data = patchSchema.parse(req.body), previous = getCandidate(req.params.id);
    if (data.ownerId) assertOwner(data.ownerId);
    if (data.consentStatus === 'granted' && previous.consent_status !== 'granted' && !data.consentEvidence) fail(400, 'Cần ghi lại căn cứ đồng ý của ứng viên.');
    const matches = duplicateMatches(db, { email: data.email || previous.email, phone: data.phone || previous.phone }, previous.id);
    if (matches.length && (data.email !== undefined || data.phone !== undefined)) fail(409, 'Thông tin liên hệ trùng một hồ sơ khác. Hãy xác minh trước khi cập nhật.', { matches });
    transaction(db, () => {
      const mapping = { fullName: 'full_name', email: 'email', phone: 'phone', location: 'location', ownerId: 'owner_id', notes: 'notes', portfolio: 'portfolio', consentStatus: 'consent_status' };
      const changes = {};
      for (const [key, column] of Object.entries(mapping)) if (data[key] !== undefined) {
        let value = key === 'email' ? normalizeEmail(data[key]) : key === 'phone' ? normalizePhone(data[key]) : data[key];
        if (key === 'ownerId' && !value) value = null;
        if (previous[column] !== value) { changes[column] = { before: previous[column], after: value }; db.prepare(`UPDATE candidates SET ${column}=? WHERE id=?`).run(value, previous.id); }
      }
      if (data.consentStatus && data.consentStatus !== previous.consent_status) {
        db.prepare('UPDATE candidates SET consent_at=?,consent_version=? WHERE id=?').run(now(), 'recruitment-v2', previous.id);
        audit(db, previous.id, req.user.id, `consent.${data.consentStatus}`, { evidence: data.consentEvidence || '', version: 'recruitment-v2' });
        if (data.consentStatus === 'withdrawn') db.prepare('UPDATE update_tokens SET revoked_at=? WHERE candidate_id=? AND used_at IS NULL').run(now(), previous.id);
      }
      db.prepare('UPDATE candidates SET updated_at=? WHERE id=?').run(now(), previous.id);
      audit(db, previous.id, req.user.id, 'candidate.updated', changes);
    });
    res.json({ candidate: getCandidate(previous.id) });
  });
  app.post('/api/v1/candidates/:id/documents', staff, editor, stagedFiles, (req, res) => {
    getCandidate(req.params.id); if (!req.file) fail(400, 'Hãy chọn một tài liệu.'); validateFile(req.file);
    idempotent(req, res, `document:${req.user.id}:${req.params.id}`, () => { saveFile(req.file, req.params.id, null, req.user.id); db.prepare('UPDATE candidates SET updated_at=? WHERE id=?').run(now(), req.params.id); return { ok: true }; });
  });
  app.post('/api/v1/documents/:id/review', staff, editor, (req, res) => {
    const doc = db.prepare('SELECT * FROM documents WHERE id=? AND candidate_id IS NOT NULL').get(req.params.id);
    if (!doc) fail(404, 'Không tìm thấy tài liệu.');
    const { confirmed, evidence } = z.object({ confirmed: z.literal(true), evidence: z.string().trim().min(10).max(1000) }).parse(req.body);
    transaction(db, () => { db.prepare("UPDATE documents SET review_status='reviewed' WHERE id=?").run(doc.id); audit(db, doc.candidate_id, req.user.id, 'document.reviewed_manually', { documentId: doc.id, evidence, confirmed }); });
    res.json({ ok: true });
  });
  function sendDocument(req, res, next, preview) {
    const doc = db.prepare('SELECT * FROM documents WHERE id=?').get(req.params.id);
    if (!doc) fail(404, 'Không tìm thấy tài liệu.');
    // Use an ASCII fallback plus the UTF-8 name so proxies/browsers handle Vietnamese filenames.
    const inline = preview && ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/plain'].includes(doc.mime_type);
    const disposition = `${inline ? 'inline' : 'attachment'}; filename="CV"; filename*=UTF-8''${encodeURIComponent(doc.original_name).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`;
    res.type(doc.mime_type).set('Content-Disposition', disposition);
    // Resolve only the generated storage name under documents. Absolute paths through .data
    // are otherwise treated as dotfiles by sendFile and incorrectly return 404.
    res.sendFile(doc.stored_name, { root: resolve(dataDir, 'documents'), dotfiles: 'deny', cacheControl: false }, error => {
      if (error) {
        if (!res.headersSent) { res.removeHeader('Content-Disposition'); res.removeHeader('Content-Type'); }
        if (error.status === 404 || error.code === 'ENOENT') return next(Object.assign(new Error('Không tìm thấy tệp CV trên máy chủ. Hãy kiểm tra bản sao lưu hoặc tải lại tài liệu.'), { status: 404 }));
        return next(error);
      }
      audit(db, doc.candidate_id, req.user.id, preview ? 'document.viewed' : 'document.downloaded', { documentId: doc.id, version: doc.version, submissionId: doc.submission_id });
    });
  }
  app.get('/api/v1/documents/:id/download', staff, (req, res, next) => {
    sendDocument(req, res, next, false);
  });
  app.get('/api/v1/documents/:id/preview', staff, (req, res, next) => {
    sendDocument(req, res, next, true);
  });
  app.post('/api/v1/candidates/:id/applications', staff, editor, (req, res) => {
    const candidate = getCandidate(req.params.id);
    const data = z.object({ jobId: z.string().min(1), source: z.enum(SOURCES) }).parse(req.body);
    const aid = transaction(db, () => addApplication(candidate.id, { ...data, receivedAt: now() }, req.user.id));
    res.json({ id: aid });
  });
  app.patch('/api/v1/applications/:id', staff, editor, (req, res) => {
    const { stage, reason } = z.object({ stage: z.enum(STAGES), reason: text(1000) }).parse(req.body);
    const application = db.prepare('SELECT * FROM applications WHERE id=?').get(req.params.id);
    if (!application) fail(404, 'Không tìm thấy lượt ứng tuyển.');
    if (['hired','offered'].includes(stage)) fail(403, 'Quyết định tuyển dụng cần quy trình phê duyệt của Boss; chưa mở trong phiên bản tiếp nhận hồ sơ.');
    if (['interview_requested','scheduled'].includes(stage)) fail(403, 'Hãy dùng chức năng Hẹn phỏng vấn của Sếp hoặc Xếp lịch của HR.');
    if (application.stage === 'interview_requested' && stage !== 'rejected') fail(409, 'Yêu cầu của Sếp đang chờ HR xếp lịch; không chuyển giai đoạn bằng thao tác thủ công.');
    if (db.prepare("SELECT id FROM interviews WHERE application_id=? AND status='scheduled'").get(application.id)) fail(409, 'Hãy hoàn thành hoặc hủy lịch phỏng vấn trước khi chuyển giai đoạn.');
    if (stage === 'rejected' && reason.length < 5) fail(400, 'Cần ghi lý do kết thúc hồ sơ.');
    if (['hired','offered'].includes(application.stage)) fail(403, 'Không được sửa lượt ứng tuyển đã có quyết định trong phiên bản này.');
    if (!['hired','rejected'].includes(stage) && db.prepare("SELECT id FROM applications WHERE candidate_id=? AND job_id=? AND id!=? AND stage NOT IN ('hired','rejected')").get(application.candidate_id, application.job_id, application.id)) fail(409, 'Đã có một lượt ứng tuyển đang xử lý cho vị trí này. Không thể mở lại lượt cũ.');
    transaction(db, () => {
      db.prepare('UPDATE applications SET stage=? WHERE id=?').run(stage, application.id);
      if (stage === 'rejected') db.prepare("UPDATE interview_requests SET status='cancelled',updated_at=? WHERE application_id=? AND status='pending'").run(now(), application.id);
      audit(db, application.candidate_id, req.user.id, 'application.stage_changed', { applicationId: application.id, before: application.stage, after: stage, reason });
    });
    res.json({ ok: true });
  });
  app.post('/api/v1/candidates/:id/update-links', staff, editor, (req, res) => {
    const candidate = getCandidate(req.params.id);
    if (candidate.consent_status === 'withdrawn') fail(409, 'Ứng viên đã rút lại sự đồng ý. Không thể tạo liên kết mới.');
    const { hours } = z.object({ hours: z.coerce.number().int().min(1).max(168).default(72) }).parse(req.body);
    const token = randomBytes(32).toString('base64url'), expires = new Date(Date.now() + hours * 3600000).toISOString();
    transaction(db, () => { db.prepare('INSERT INTO update_tokens(token_hash,candidate_id,created_by,created_at,expires_at) VALUES(?,?,?,?,?)').run(hash(token), candidate.id, req.user.id, now(), expires); audit(db, candidate.id, req.user.id, 'update_link.created', { expiresAt: expires }); });
    res.json({ path: `/bo-sung/${token}`, expiresAt: expires });
  });
  app.delete('/api/v1/candidates/:id/update-links/:hash', staff, editor, (req, res) => {
    const result = db.prepare('UPDATE update_tokens SET revoked_at=? WHERE candidate_id=? AND token_hash=? AND used_at IS NULL').run(now(), req.params.id, req.params.hash);
    if (!result.changes) fail(404, 'Không tìm thấy liên kết đang hoạt động.');
    audit(db, req.params.id, req.user.id, 'update_link.revoked'); res.json({ ok: true });
  });
  app.get('/api/v1/submissions', staff, (req, res) => {
    res.json(db.prepare("SELECT * FROM submissions WHERE status='pending' ORDER BY created_at DESC").all().map(s => {
      const payload = JSON.parse(s.payload);
      return { ...s, payload, matches: duplicateMatches(db, payload), documents: db.prepare('SELECT id,original_name,size,mime_type,version,review_status,scan_result,created_at,kind FROM documents WHERE submission_id=?').all(s.id).map(d => ({ ...d, scan: d.scan_result ? JSON.parse(d.scan_result) : null, scan_result: undefined })) };
    }));
  });
  app.post('/api/v1/submissions/:id/resolve', staff, editor, (req, res) => {
    const data = z.object({ resolution: z.enum(['link','separate']), targetId: text(100), reason: z.string().trim().min(5).max(1000) }).parse(req.body);
    idempotent(req, res, `resolve:${req.user.id}:${req.params.id}`, () => {
      const submission = db.prepare("SELECT * FROM submissions WHERE id=? AND status='pending'").get(req.params.id);
      if (!submission) fail(409, 'Hồ sơ đã được xử lý hoặc không còn tồn tại.');
      const payload = JSON.parse(submission.payload), matches = duplicateMatches(db, payload);
      let cid;
      if (data.resolution === 'link') {
        if (!matches.some(m => m.id === data.targetId)) fail(400, 'Hồ sơ liên kết không nằm trong danh sách gợi ý trùng.');
        cid = data.targetId; addApplication(cid, payload, req.user.id);
        // Existing identity, consent, and CVs are deliberately preserved; supplied values remain in the audit trail.
        audit(db, cid, req.user.id, 'candidate.linked', { submissionId: submission.id, received: payload, reason: data.reason });
      } else cid = insertCandidate({ ...payload, ownerId: req.user.id }, req.user.id);
      const docs = db.prepare('SELECT id FROM documents WHERE submission_id=? AND candidate_id IS NULL ORDER BY created_at').all(submission.id);
      for (const doc of docs) {
        const version = db.prepare('SELECT COALESCE(MAX(version),0)+1 AS n FROM documents WHERE candidate_id=?').get(cid).n;
        db.prepare('UPDATE documents SET candidate_id=?,version=? WHERE id=?').run(cid, version, doc.id);
        audit(db, cid, req.user.id, 'document.linked', { documentId: doc.id, version });
      }
      db.prepare('UPDATE candidates SET updated_at=? WHERE id=?').run(now(), cid);
      db.prepare('UPDATE submissions SET status=?,candidate_id=?,resolved_at=?,resolved_by=? WHERE id=?').run(data.resolution === 'link' ? 'linked' : 'separate', cid, now(), req.user.id, submission.id);
      audit(db, cid, req.user.id, 'duplicate.resolved', { submissionId: submission.id, resolution: data.resolution, reason: data.reason });
      return { candidate: getCandidate(cid) };
    });
  });
  app.post('/api/v1/public/applications', stagedFiles, (req, res) => {
    const parsed = publicSchema.parse(req.body);
    if (!req.file) fail(400, 'Vui lòng đính kèm CV.'); validateFile(req.file); assertJob(parsed.jobId);
    idempotent(req, res, 'public-application', () => {
      const data = { ...parsed, email: normalizeEmail(parsed.email), phone: normalizePhone(parsed.phone), source: 'Website', receivedAt: now(), consentStatus: 'granted', consentEvidence: 'Ứng viên xác nhận chính sách recruitment-v2 trên website.' };
      const matches = duplicateMatches(db, data);
      if (matches.length) {
        const sid = id();
        db.prepare('INSERT INTO submissions(id,payload,matches,created_at) VALUES(?,?,?,?)').run(sid, JSON.stringify(data), JSON.stringify(matches.map(m => m.id)), now());
        saveFile(req.file, null, sid, 'public');
        audit(db, null, 'public', 'submission.received_for_review', { submissionId: sid });
      } else { const cid = insertCandidate(data, 'public'); saveFile(req.file, cid, null, 'public'); }
      // Same response for new and matched identities: do not expose existing personal data to applicants.
      return { received: true, message: 'Super Net đã nhận được hồ sơ. Đội ngũ HR sẽ kiểm tra và liên hệ với bạn.' };
    });
  });
  app.get('/api/v1/public/update-links/:token', (req, res) => { const record = validToken(req.params.token); res.json({ valid: true, expiresAt: record.expires_at }); });
  app.post('/api/v1/public/update-links/:token', stagedFiles, (req, res) => {
    const data = supplementSchema.parse(req.body); validateFile(req.file);
    if (!req.file && !data.fullName && !data.email && !data.phone && !data.portfolio && !data.notes) fail(400, 'Hãy bổ sung thông tin hoặc một tài liệu.');
    idempotent(req, res, `supplement:${hash(req.params.token)}`, () => {
      const record = validToken(req.params.token), candidate = getCandidate(record.candidate_id);
      const provided = { full_name: data.fullName, email: normalizeEmail(data.email), phone: normalizePhone(data.phone), portfolio: data.portfolio };
      // A bearer link may append documents or fill gaps, but cannot silently overwrite an existing identity.
      const conflicts = duplicateMatches(db, data, candidate.id);
      for (const [column, value] of Object.entries(provided)) if (!candidate[column] && value && (!['email','phone'].includes(column) || !conflicts.length)) db.prepare(`UPDATE candidates SET ${column}=? WHERE id=?`).run(value, candidate.id);
      db.prepare("UPDATE candidates SET consent_status='granted',consent_at=?,consent_version='recruitment-v2',updated_at=? WHERE id=?").run(now(), now(), candidate.id);
      audit(db, candidate.id, 'public', 'candidate.supplemented', { provided, notes: data.notes, contactNeedsReview: conflicts.length > 0, existingValuesPreserved: true });
      audit(db, candidate.id, 'public', 'consent.granted', { version: 'recruitment-v2', evidence: 'Ứng viên xác nhận khi bổ sung hồ sơ.' });
      saveFile(req.file, candidate.id, null, 'public');
      db.prepare('UPDATE update_tokens SET used_at=? WHERE token_hash=?').run(now(), record.token_hash);
      return { received: true, message: 'Thông tin bổ sung đã được gắn vào hồ sơ của bạn. Cảm ơn bạn!' };
    });
  });
  app.use('/api', (req, res) => res.status(404).json({ message: 'Không tìm thấy chức năng.' }));
  const dist = resolve('dist');
  if (existsSync(resolve(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('/{*path}', (req, res) => { res.set('Cache-Control', 'no-cache'); res.sendFile(resolve(dist, 'index.html')); });
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof z.ZodError) return res.status(400).json({ message: error.issues.map(x => x.message).join(' · ') });
    if (error instanceof multer.MulterError) return res.status(400).json({ message: error.code === 'LIMIT_FILE_SIZE' ? 'Dung lượng tối đa là 10 MB.' : 'Tệp hoặc biểu mẫu vượt quá giới hạn cho phép.' });
    const status = error.status || 500;
    if (status >= 500) console.error('Request failed:', error.message);
    res.status(status).json({ message: error.publicMessage || (status >= 500 ? 'Hệ thống chưa xử lý được yêu cầu. Vui lòng thử lại.' : error.message), ...(error.code === 'POSSIBLE_DUPLICATE' ? { code: error.code, matches: error.matches } : {}) });
  });
  return { app, db };
}
