import { resolve } from 'node:path';
import { openDatabase, transaction } from '../server/db.mjs';
import { createAccount } from '../server/accounts.mjs';
const { USER_NAME, USER_LOGIN, USER_EMAIL = '', USER_PASSWORD, USER_ROLE = 'hr' } = process.env;
if (!USER_NAME || !USER_LOGIN || !USER_PASSWORD) {
  console.error('Set USER_NAME, USER_LOGIN, USER_PASSWORD (12+ characters), optional USER_EMAIL and USER_ROLE=admin|hr|boss|interviewer. Prefer creating users in the Admin interface. Never commit credentials.');
  process.exit(1);
}
const db = openDatabase(resolve(process.env.DATA_DIR || '.data/internal'));
try {
  transaction(db, () => createAccount(db, { username: USER_LOGIN, name: USER_NAME, email: USER_EMAIL, password: USER_PASSWORD, role: USER_ROLE }));
  console.log('User created.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { db.close(); }
