import { resolve } from 'node:path';
import { openDatabase, id, passwordHash, normalizeEmail } from '../server/db.mjs';
const { USER_NAME, USER_EMAIL, USER_PASSWORD, USER_ROLE = 'admin' } = process.env;
if (!USER_NAME || !USER_EMAIL || !USER_PASSWORD || USER_PASSWORD.length < 12 || !['admin','hr','boss'].includes(USER_ROLE) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(USER_EMAIL)) {
  console.error('Set USER_NAME, USER_EMAIL, USER_PASSWORD (at least 12 characters), and optionally USER_ROLE=admin|hr|boss in the process environment. Never commit credentials.');
  process.exit(1);
}
const db = openDatabase(resolve(process.env.DATA_DIR || '.data'));
db.prepare('INSERT INTO users(id,name,email,role,password_hash) VALUES(?,?,?,?,?)').run(id(), USER_NAME, normalizeEmail(USER_EMAIL), USER_ROLE, passwordHash(USER_PASSWORD));
db.close(); console.log('User created.');
