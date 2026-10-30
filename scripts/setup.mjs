import { createInterface, emitKeypressEvents } from 'node:readline';
import { resolve } from 'node:path';
import { openDatabase } from '../server/db.mjs';
import { bootstrapAdmin } from '../server/accounts.mjs';

async function hiddenPassword() {
  if (!process.stdin.isTTY) throw new Error('Cần terminal tương tác hoặc biến môi trường USER_PASSWORD để thiết lập.');
  process.stdout.write('Mật khẩu quản trị (tối thiểu 12 ký tự, không hiển thị khi gõ): ');
  emitKeypressEvents(process.stdin); process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolvePassword, reject) => {
    let value = '';
    function onKey(character, key = {}) {
      if (key.ctrl && key.name === 'c') return finish(new Error('Đã hủy thiết lập.'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') value = value.slice(0, -1);
      else if (character && !key.ctrl && !key.meta && character >= ' ') value += character;
    }
    function finish(error) { process.stdin.removeListener('keypress', onKey); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); if (error) reject(error); else resolvePassword(value); }
    process.stdin.on('keypress', onKey);
  });
}
const directory = resolve(process.env.DATA_DIR || '.data/internal');
const db = openDatabase(directory);
try {
  let password = process.env.USER_PASSWORD;
  if (!password) {
    if (!process.stdin.isTTY) throw new Error('Chạy npm run setup trong terminal tương tác hoặc cấp USER_PASSWORD qua biến môi trường bảo mật.');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await new Promise(resolveReady => rl.question('Tên đăng nhập quản trị (mặc định admin): ', answer => { process.env.USER_LOGIN = answer.trim() || 'admin'; rl.close(); resolveReady(); }));
    password = await hiddenPassword();
  }
  const user = bootstrapAdmin(db, { username: process.env.USER_LOGIN || 'admin', name: process.env.USER_NAME || 'Quản trị viên Super Net', email: process.env.USER_EMAIL || '', password });
  console.log(`Đã tạo tài khoản ${user.username}. Chạy npm run dev để đăng nhập. Mật khẩu chỉ được lưu dạng băm trong database.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { db.close(); }
