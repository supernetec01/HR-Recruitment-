import { initializeBrands } from './brand-data.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID, scryptSync, timingSafeEqual, randomBytes, createHash } from 'node:crypto';

export const now = () => new Date().toISOString();
export const id = () => randomUUID();
export const hash = value => createHash('sha256').update(value).digest('hex');
export const normalizeEmail = value => (value || '').trim().toLowerCase();
export const normalizePhone = value => {
  const digits = (value || '').replace(/\D/g, '');
  return digits.startsWith('84') ? `0${digits.slice(2)}` : digits;
};
export function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, key] = stored.split(':');
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(key, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export const STAGES = ['new', 'screening', 'contacted', 'interview_requested', 'scheduled', 'interviewed', 'review', 'offered', 'hired', 'rejected'];
export const SOURCES = ['Website', 'Facebook', 'Zalo', 'Email', 'TopCV', 'Giới thiệu', 'Hồ sơ giấy', 'Khác'];

export function openDatabase(directory, demo = false) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  mkdirSync(resolve(directory, 'documents'), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(resolve(directory, 'recruitment.sqlite'));
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK(role IN ('admin','boss','hr','interviewer')), password_hash TEXT, is_demo INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, department TEXT NOT NULL, location TEXT NOT NULL,
      employment_type TEXT NOT NULL DEFAULT 'Toàn thời gian', description TEXT NOT NULL,
      openings INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')), created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS candidates (
      id TEXT PRIMARY KEY, full_name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '', source TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id),
      received_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      owner_id TEXT REFERENCES users(id), notes TEXT NOT NULL DEFAULT '', consent_status TEXT NOT NULL DEFAULT 'pending'
        CHECK(consent_status IN ('pending','granted','withdrawn')), consent_at TEXT, consent_version TEXT,
      tags TEXT NOT NULL DEFAULT '[]', portfolio TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS candidate_email ON candidates(email);
    CREATE INDEX IF NOT EXISTS candidate_phone ON candidates(phone);
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL REFERENCES candidates(id), job_id TEXT NOT NULL REFERENCES jobs(id),
      source TEXT NOT NULL, received_at TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id),
      stage TEXT NOT NULL DEFAULT 'new'
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY, candidate_id TEXT REFERENCES candidates(id), submission_id TEXT,
      original_name TEXT NOT NULL, stored_name TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL, size INTEGER NOT NULL,
      checksum TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, kind TEXT NOT NULL DEFAULT 'cv',
      review_status TEXT NOT NULL DEFAULT 'quarantined' CHECK(review_status IN ('quarantined','reviewed')),
      created_at TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY, payload TEXT NOT NULL, matches TEXT NOT NULL, created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','linked','separate')), candidate_id TEXT REFERENCES candidates(id),
      resolved_at TEXT, resolved_by TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY, candidate_id TEXT REFERENCES candidates(id), actor_id TEXT NOT NULL REFERENCES users(id),
      action TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS update_tokens (
      token_hash TEXT PRIMARY KEY, candidate_id TEXT NOT NULL REFERENCES candidates(id), created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, revoked_at TEXT
    );
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY, scope TEXT NOT NULL, request_hash TEXT NOT NULL, response TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS interviews (
      id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id), interviewer_id TEXT NOT NULL REFERENCES users(id),
      starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, mode TEXT NOT NULL, location TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled')),
      created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS interview_evaluations (
      interview_id TEXT PRIMARY KEY REFERENCES interviews(id), reviewer_id TEXT NOT NULL REFERENCES users(id),
      score REAL NOT NULL CHECK(score>=0 AND score<=10), result TEXT NOT NULL CHECK(result IN ('pass','follow_up','fail')),
      comments TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS document_translations (
      document_id TEXT NOT NULL REFERENCES documents(id), target_language TEXT NOT NULL,
      source_checksum TEXT NOT NULL, text TEXT NOT NULL, model TEXT NOT NULL,
      created_at TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id),
      PRIMARY KEY(document_id,target_language,source_checksum)
    );
    CREATE TABLE IF NOT EXISTS job_translations (
      job_id TEXT NOT NULL REFERENCES jobs(id), target_language TEXT NOT NULL, source_revision INTEGER NOT NULL,
      content TEXT NOT NULL, model TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id),
      PRIMARY KEY(job_id,target_language,source_revision)
    );
  `);
  // Additive migrations preserve existing applicants, documents and staff accounts.
  if (!db.prepare('PRAGMA table_info(candidates)').all().some(column => column.name === 'revision')) db.exec('ALTER TABLE candidates ADD COLUMN revision INTEGER NOT NULL DEFAULT 1');
  if (!db.prepare('PRAGMA table_info(documents)').all().some(column => column.name === 'scan_result')) db.exec("ALTER TABLE documents ADD COLUMN scan_result TEXT NOT NULL DEFAULT ''");
  const documentColumns = new Set(db.prepare('PRAGMA table_info(documents)').all().map(c => c.name));
  for (const column of ['deleted_at','deleted_by','purged_at']) if (!documentColumns.has(column)) db.exec(`ALTER TABLE documents ADD COLUMN ${column} TEXT`);
  const jobColumns = new Set(db.prepare('PRAGMA table_info(jobs)').all().map(c => c.name));
  for (const column of ['requirements','benefits','working_hours','salary_range','business_line','application_deadline','updated_at','company_name','application_instructions','application_email','application_email_subject','application_zalo']) {
    if (!jobColumns.has(column)) db.exec(`ALTER TABLE jobs ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
  }
  if (!jobColumns.has('revision')) db.exec('ALTER TABLE jobs ADD COLUMN revision INTEGER NOT NULL DEFAULT 1');
  db.exec("UPDATE jobs SET updated_at=created_at WHERE updated_at=''");
  const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map(c => c.name));
  if (!userColumns.has('username')) db.exec('ALTER TABLE users ADD COLUMN username TEXT');
  if (!userColumns.has('active')) db.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
  // SQLite CHECK constraints require rebuilding the table; preserve IDs, hashes and all references.
  if (!db.prepare("SELECT sql FROM sqlite_master WHERE name='users'").get().sql.includes("'interviewer'")) {
    db.exec('PRAGMA foreign_keys=OFF');
    try { transaction(db, () => {
      db.exec(`CREATE TABLE users_with_interviewer (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL CHECK(role IN ('admin','boss','hr','interviewer')), password_hash TEXT,
        is_demo INTEGER NOT NULL DEFAULT 0, username TEXT, active INTEGER NOT NULL DEFAULT 1
      );
      INSERT INTO users_with_interviewer(id,name,email,role,password_hash,is_demo,username,active)
        SELECT id,name,email,role,password_hash,is_demo,username,active FROM users;
      DROP TABLE users;
      ALTER TABLE users_with_interviewer RENAME TO users;`);
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('User role migration failed referential integrity check.');
    }); } finally { db.exec('PRAGMA foreign_keys=ON'); }
  }
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS users_username ON users(username COLLATE NOCASE) WHERE username IS NOT NULL;
    CREATE TABLE IF NOT EXISTS interview_requests (
      id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id),
      document_id TEXT NOT NULL REFERENCES documents(id), requested_by TEXT NOT NULL REFERENCES users(id),
      notes TEXT NOT NULL DEFAULT '', previous_stage TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','scheduled','cancelled')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_pending_interview_request ON interview_requests(application_id) WHERE status='pending';
  `);
  const interviewColumns = new Set(db.prepare('PRAGMA table_info(interviews)').all().map(c => c.name));
  if (!interviewColumns.has('contact_evidence')) db.exec("ALTER TABLE interviews ADD COLUMN contact_evidence TEXT NOT NULL DEFAULT ''");
  if (!interviewColumns.has('contacted_at')) db.exec('ALTER TABLE interviews ADD COLUMN contacted_at TEXT');
  if (!interviewColumns.has('contacted_by')) db.exec('ALTER TABLE interviews ADD COLUMN contacted_by TEXT REFERENCES users(id)');
  const requestColumns = new Set(db.prepare('PRAGMA table_info(interview_requests)').all().map(c => c.name));
  if (!requestColumns.has('preferred_interviewer_id')) db.exec('ALTER TABLE interview_requests ADD COLUMN preferred_interviewer_id TEXT REFERENCES users(id)');
  if (!interviewColumns.has('request_id')) db.exec('ALTER TABLE interviews ADD COLUMN request_id TEXT REFERENCES interview_requests(id)');
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS one_booking_per_request ON interviews(request_id) WHERE status='scheduled' AND request_id IS NOT NULL");
  // Preserve early development databases while allowing a new application after a completed/rejected one.
  const applicationSql = db.prepare("SELECT sql FROM sqlite_master WHERE name='applications'").get().sql;
  if (applicationSql.includes('UNIQUE(candidate_id, job_id)')) {
    db.exec('PRAGMA foreign_keys=OFF');
    try { transaction(db, () => db.exec(`
      CREATE TABLE applications_new (
        id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL REFERENCES candidates(id), job_id TEXT NOT NULL REFERENCES jobs(id),
        source TEXT NOT NULL, received_at TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), stage TEXT NOT NULL DEFAULT 'new'
      );
      INSERT INTO applications_new SELECT * FROM applications;
      DROP TABLE applications;
      ALTER TABLE applications_new RENAME TO applications;
    `)); } finally { db.exec('PRAGMA foreign_keys=ON'); }
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Application migration failed referential integrity check.');
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS one_active_application_per_job ON applications(candidate_id,job_id) WHERE stage NOT IN ('hired','rejected')");
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get('public')) {
    db.prepare('INSERT INTO users(id,name,email,role) VALUES (?,?,?,?)').run('public', 'Ứng viên', 'public@system.invalid', 'hr');
  }
  if (demo && !db.prepare('SELECT id FROM users WHERE is_demo=1 LIMIT 1').get()) seedDemo(db, directory);
  initializeBrands(db);
  return db;
}

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function audit(db, candidateId, actorId, action, details = {}) {
  db.prepare('INSERT INTO audit_logs(id,candidate_id,actor_id,action,details,created_at) VALUES(?,?,?,?,?,?)')
    .run(id(), candidateId, actorId, action, JSON.stringify(details), now());
}
export function duplicateMatches(db, data, excludeId = '') {
  const email = normalizeEmail(data.email), phone = normalizePhone(data.phone);
  if (!email && !phone) return [];
  return db.prepare(`SELECT id,full_name,email,phone,source FROM candidates WHERE id != ? AND
    ((? != '' AND email = ?) OR (? != '' AND phone = ?))`).all(excludeId, email, email, phone, phone);
}
export function completeness(candidate, applications, documents) {
  const missing = [];
  if (!candidate.full_name) missing.push('Họ và tên');
  if (!candidate.phone && !candidate.email) missing.push('Thông tin liên hệ');
  if (!applications.length) missing.push('Vị trí ứng tuyển');
  if (!documents.some(d => d.kind === 'cv')) missing.push('CV');
  if (candidate.consent_status !== 'granted') missing.push('Đồng ý xử lý dữ liệu');
  return { complete: missing.length === 0, missing };
}

function seedDemo(db, directory) {
  transaction(db, () => {
    for (const [uid, name, email, role] of [
      ['demo-hr', 'Linh Nguyễn', 'linh@supernet.demo', 'hr'],
      ['demo-hr-2', 'Minh Anh', 'minhanh@supernet.demo', 'hr'],
      ['demo-boss', 'Alex Chen', 'alex@supernet.demo', 'boss'],
      ['demo-admin', 'Quản trị viên', 'admin@supernet.demo', 'admin'],
    ]) db.prepare('INSERT INTO users(id,name,email,role,is_demo) VALUES(?,?,?,?,1)').run(uid, name, email, role);
    const jobs = [
      ['job-content', 'Content Marketing', 'Marketing', 3, 'Sáng tạo nội dung cho TikTok, Facebook và các chiến dịch thương mại điện tử. Phối hợp cùng đội ngũ để xây dựng nội dung có giá trị. Yêu cầu: tư duy nội dung tốt, chủ động và có portfolio.'],
      ['job-video', 'Video Editor', 'Creative', 2, 'Dựng video ngắn, phát triển câu chuyện hình ảnh và phối hợp với đội nội dung. Yêu cầu sử dụng thành thạo Premiere hoặc CapCut và có sản phẩm đã thực hiện.'],
      ['job-ecommerce', 'Vận hành sàn TMĐT', 'E-commerce', 2, 'Quản lý gian hàng Shopee, TikTok Shop; theo dõi chỉ số và phối hợp triển khai chương trình bán hàng. Yêu cầu cẩn thận, yêu thích dữ liệu và có kinh nghiệm vận hành.'],
      ['job-koc', 'Booking KOL / KOC', 'Partnership', 2, 'Tìm kiếm, kết nối và chăm sóc mạng lưới nhà sáng tạo. Quản lý chiến dịch hợp tác và theo dõi hiệu quả. Ưu tiên kỹ năng giao tiếp, đàm phán.'],
      ['job-design', 'Graphic Designer', 'Creative', 1, 'Thiết kế ấn phẩm thương hiệu, hình ảnh sản phẩm và nội dung số. Thành thạo công cụ thiết kế, có tư duy thẩm mỹ và portfolio.'],
    ];
    jobs.forEach(([jid, title, dept, openings, description]) => db.prepare('INSERT INTO jobs(id,title,department,location,description,openings,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(jid, title, dept, 'TP. Hồ Chí Minh', description, openings, now(), now()));
    const people = [
      ['Nguyễn Minh Anh','minhanh.nguyen@example.com','0901112201','Website','job-content','new',['Có portfolio'],'demo-hr'],
      ['Trần Hoàng Nam','hoangnam.tran@example.com','0901112202','Facebook','job-video','screening',['Tiềm năng'],'demo-hr'],
      ['Lê Thảo Nhi','thaonhi.le@example.com','0901112203','TopCV','job-ecommerce','scheduled',[],'demo-hr-2'],
      ['Phạm Gia Hân','giahan.pham@example.com','0901112204','Website','job-koc','review',['Có portfolio'],'demo-hr'],
      ['Vũ Đức Anh','ducanh.vu@example.com','0901112205','Email','job-design','contacted',[],'demo-hr-2'],
      ['Đặng Ngọc Linh','','0901112206','Zalo','job-content','new',['Cần bổ sung'],'demo-hr'],
      ['Bùi Quang Huy','quanghuy.bui@example.com','0901112207','Giới thiệu','job-video','offered',['Tiềm năng'],'demo-hr'],
      ['Hoàng Mai Chi','maichi.hoang@example.com','0901112208','Website','job-content','screening',['Có portfolio'],'demo-hr-2'],
      ['Ngô Tuấn Kiệt','tuankiet.ngo@example.com','0901112209','Facebook','job-ecommerce','interviewed',[],'demo-hr'],
      ['Đỗ Khánh Vy','khanhvy.do@example.com','0901112210','TopCV','job-koc','hired',[],'demo-hr-2'],
      ['Phan Hải Yến','haiyen.phan@example.com','0901112211','Website','job-design','new',['Có portfolio'],'demo-hr'],
      ['Lý Bảo Ngọc','','0901112212','Hồ sơ giấy','job-content','new',['Cần bổ sung'],'demo-hr-2'],
    ];
    people.forEach(([name, email, phone, source, job, stage, tags, owner], i) => {
      const cid = `demo-candidate-${i + 1}`;
      const received = new Date(Date.now() - i * 21 * 3600000).toISOString();
      db.prepare(`INSERT INTO candidates(id,full_name,email,phone,location,source,created_by,received_at,created_at,updated_at,owner_id,notes,consent_status,consent_at,consent_version,tags)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(cid, name, email, phone, 'TP. Hồ Chí Minh', source, source === 'Website' ? 'public' : owner,
        received, received, received, owner, i === 0 ? 'Có kinh nghiệm xây dựng nội dung thương hiệu. Cần bổ sung CV để sàng lọc.' : '',
        i === 5 || i === 11 ? 'pending' : 'granted', i === 5 || i === 11 ? null : received, 'recruitment-v1', JSON.stringify(tags));
      const aid = `demo-application-${i + 1}`;
      db.prepare('INSERT INTO applications(id,candidate_id,job_id,source,received_at,created_at,created_by,stage) VALUES(?,?,?,?,?,?,?,?)').run(aid, cid, job, source, received, received, owner, stage);
      audit(db, cid, owner, 'candidate.created', { source, demo: true });
      if (![5,10,11].includes(i)) {
        const docId = id(), filename = `${docId}.bin`;
        const content = `BT /F1 18 Tf 50 760 Td (SUPER NET - DEMONSTRATION CV) Tj 0 -30 Td /F1 12 Tf (Synthetic document - not a real applicant.) Tj 0 -22 Td (Candidate reference: ${i + 1}) Tj ET`;
        const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
        let pdf = '%PDF-1.4\n', offsets = [0];
        objects.forEach((obj,n) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${n + 1} 0 obj\n${obj}\nendobj\n`; });
        const xref = Buffer.byteLength(pdf);
        pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
        const buffer = Buffer.from(pdf);
        writeFileSync(resolve(directory, 'documents', filename), buffer, { mode: 0o600 });
        db.prepare(`INSERT INTO documents(id,candidate_id,original_name,stored_name,mime_type,size,checksum,version,review_status,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
          .run(docId, cid, `CV-demo-${i + 1}.pdf`, filename, 'application/pdf', buffer.length, hash(buffer), 1, 'reviewed', received, owner);
        audit(db, cid, owner, 'document.reviewed_manually', { documentId: docId, evidence: 'Tài liệu minh họa được tạo cục bộ từ văn bản cố định, không phải file tải lên từ bên ngoài.' });
      }
      if (['scheduled','interviewed','review'].includes(stage)) {
        const date = new Date(); date.setDate(date.getDate() + (stage === 'scheduled' ? 1 : 0)); date.setUTCHours(3 + i, 0, 0, 0);
        db.prepare('INSERT INTO interviews(id,application_id,interviewer_id,starts_at,ends_at,mode,location,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
          .run(id(), aid, 'demo-boss', date.toISOString(), new Date(+date + 45 * 60000).toISOString(), 'Online', 'Liên kết sẽ được HR bổ sung', stage === 'scheduled' ? 'scheduled' : 'completed', owner, now());
      }
    });
  });
}
