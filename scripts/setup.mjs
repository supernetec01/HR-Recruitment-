import { resolve } from 'node:path';
import { openDatabase } from '../server/db.mjs';
import { hasAdministrator } from '../server/accounts.mjs';
import { ensureAdministrator } from '../server/admin-startup.mjs';
const db = openDatabase(resolve(process.env.DATA_DIR || '.data/internal'));
try {
  if (hasAdministrator(db)) console.log('Đã có quản trị viên. Dùng tài khoản hiện tại; setup không thay đổi mật khẩu đã có.');
  else if (!await ensureAdministrator(db)) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { db.close(); }
