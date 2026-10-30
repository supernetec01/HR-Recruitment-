import { id, normalizeEmail, passwordHash, audit, transaction } from './db.mjs';

export const normalizeUsername = value => (value || '').trim().toLowerCase();
export const validUsername = value => /^[a-z0-9][a-z0-9._-]{2,49}$/.test(value);
export const validPassword = value => typeof value === 'string' && value.length >= 12 && value.length <= 128;
export function publicUser(user) {
  return { id: user.id, name: user.name, username: user.username || '', email: user.email.endsWith('.invalid') ? '' : user.email, role: user.role, active: !!user.active, is_demo: user.is_demo };
}
export function createAccount(db, { username, name, email = '', password, role = 'hr' }, actorId) {
  const login = normalizeUsername(username);
  if (!validUsername(login)) throw Object.assign(new Error('Tên đăng nhập cần 3–50 ký tự: chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.'), { status: 400 });
  if (!name?.trim() || !['admin','boss','hr'].includes(role) || !validPassword(password)) throw Object.assign(new Error('Cần họ tên, vai trò hợp lệ và mật khẩu từ 12–128 ký tự.'), { status: 400 });
  const address = normalizeEmail(email) || `${login}@accounts.supernet.invalid`;
  // Do not allow a username to shadow another user's email login, or vice versa.
  if (db.prepare('SELECT id FROM users WHERE username=? COLLATE NOCASE OR email=? COLLATE NOCASE OR email=? COLLATE NOCASE OR username=? COLLATE NOCASE').get(login, login, address, address)) throw Object.assign(new Error('Tên đăng nhập hoặc email đã được sử dụng.'), { status: 409 });
  const userId = id();
  db.prepare('INSERT INTO users(id,name,email,username,role,password_hash) VALUES(?,?,?,?,?,?)').run(userId, name.trim(), address, login, role, passwordHash(password));
  audit(db, null, actorId || userId, 'user.created', { userId, username: login, role });
  return publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(userId));
}
export const hasAdministrator = db => !!db.prepare("SELECT id FROM users WHERE role='admin' AND active=1 AND is_demo=0 AND id!='public'").get();
export function bootstrapAdmin(db, input) {
  return transaction(db, () => {
    if (hasAdministrator(db)) throw new Error('Đã có quản trị viên. Đăng nhập để quản lý tài khoản; không ghi đè mật khẩu đã có.');
    return createAccount(db, { ...input, username: input.username || 'admin', name: input.name || 'Quản trị viên Super Net', role: 'admin' });
  });
}
