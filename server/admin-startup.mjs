import { createInterface, emitKeypressEvents } from 'node:readline';
import { bootstrapAdmin, hasAdministrator } from './accounts.mjs';

async function readPassword(input, output) {
  emitKeypressEvents(input); input.setRawMode(true); input.resume();
  return new Promise((resolvePassword, reject) => {
    let value = '';
    const finish = error => {
      input.removeListener('keypress', onKey); input.setRawMode(false); input.pause(); output.write('\n');
      if (error) reject(error); else resolvePassword(value);
    };
    const onKey = (character, key = {}) => {
      if (key.ctrl && key.name === 'c') return finish(new Error('Đã hủy khởi tạo Admin.'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') value = value.slice(0, -1);
      else if (character && !key.ctrl && !key.meta && character >= ' ') value += character;
    };
    input.on('keypress', onKey);
    // Enable hidden input and its listener before displaying a prompt that can trigger an immediate paste.
    output.write('Mật khẩu quản trị (tối thiểu 12 ký tự, không hiển thị khi gõ): ');
  });
}

export async function ensureAdministrator(db, { env = process.env, input = process.stdin, output = process.stdout } = {}) {
  if (hasAdministrator(db)) return false;
  let username = env.USER_LOGIN || 'admin', password = env.USER_PASSWORD;
  if (!password) {
    if (!input.isTTY) {
      output.write('Chưa có Admin trong thư mục dữ liệu này. Chạy npm run setup trong Terminal máy chủ để khởi tạo; tài khoản không tự đồng bộ từ GitHub.\n');
      return false;
    }
    output.write('Khởi động lần đầu: tạo quản trị viên trước khi mở website.\n');
    const rl = createInterface({ input, output });
    username = await new Promise(resolveAnswer => rl.question(`Tên đăng nhập quản trị (mặc định ${username}): `, answer => { rl.close(); resolveAnswer(answer.trim() || username); }));
    password = await readPassword(input, output);
  }
  const user = bootstrapAdmin(db, { username, password, name: env.USER_NAME || 'Quản trị viên Super Net', email: env.USER_EMAIL || '' });
  output.write(`Đã khởi tạo tài khoản ${user.username}. Dữ liệu và mật khẩu băm được giữ riêng trên máy chủ.\n`);
  return true;
}
