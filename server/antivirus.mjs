import { createConnection } from 'node:net';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { defenderStatus, scanWithDefender } from './defender.mjs';

const problem = (status, message) => Object.assign(new Error(message), { status });
const unavailable = () => problem(503, 'Bộ quét mã độc chưa sẵn sàng. Tệp chưa được lưu; vui lòng thử lại sau hoặc liên hệ quản trị viên.');
function useDefender(options) {
  const engine = process.env.CV_SCANNER || 'auto';
  if (!['auto', 'defender', 'clamav'].includes(engine)) throw unavailable();
  return !options.host && (engine === 'defender' || (engine === 'auto' && process.platform === 'win32' && !process.env.CLAMAV_HOST));
}
function settings(options) {
  const host = options.host || process.env.CLAMAV_HOST || '127.0.0.1';
  const port = Number(options.port ?? process.env.CLAMAV_PORT ?? 3310);
  const timeout = Number(options.timeout ?? 30000);
  const maxAgeDays = Number(options.maxAgeDays ?? process.env.CLAMAV_MAX_SIGNATURE_AGE_DAYS ?? 7);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isFinite(maxAgeDays) || maxAgeDays < 1 || maxAgeDays > 30) throw unavailable();
  return { host, port, timeout, maxAgeDays };
}
function command(config, name, bytes) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: config.host, port: config.port });
    let output = '', settled = false;
    const timer = setTimeout(() => finish(unavailable()), config.timeout);
    function finish(error, value) {
      if (settled) return; settled = true; clearTimeout(timer); socket.destroy();
      if (error) reject(error); else resolve(value);
    }
    socket.on('error', () => finish(unavailable()));
    socket.on('end', () => finish(unavailable()));
    socket.on('data', chunk => {
      output += chunk.toString('utf8');
      if (output.length > 4096) return finish(unavailable());
      if (output.includes('\0')) finish(null, output.slice(0, output.indexOf('\0')));
    });
    socket.on('connect', async () => {
      try {
        socket.write(`z${name}\0`);
        if (!bytes) return;
        for (let offset = 0; offset < bytes.length; offset += 65536) {
          const chunk = bytes.subarray(offset, offset + 65536), size = Buffer.alloc(4);
          size.writeUInt32BE(chunk.length);
          if (!socket.write(Buffer.concat([size, chunk]))) await once(socket, 'drain');
          if (settled) return;
        }
        socket.write(Buffer.alloc(4));
      } catch { finish(unavailable()); }
    });
  });
}
export async function scannerStatus(options = {}) {
  const config = settings(options);
  if (useDefender(options)) {
    try { return await defenderStatus(config.maxAgeDays); }
    catch (error) { if (process.env.CV_SCANNER === 'defender' || error.status !== 503) throw error; }
  }
  const reply = await command(config, 'VERSION');
  const match = /^ClamAV ([^/]+)\/(\d+)\/(.+)$/.exec(reply);
  const signatureDate = match && new Date(/(?:GMT|UTC|[+-]\d{4})$/.test(match[3]) ? match[3] : `${match[3]} GMT`);
  const age = signatureDate && Date.now() - +signatureDate;
  if (!match || !Number.isFinite(age) || age < -86400000 || age > config.maxAgeDays * 86400000) throw unavailable();
  return { engine: 'ClamAV', version: match[1], signatureVersion: match[2], signatureDate: signatureDate.toISOString() };
}
let active = 0;
export async function scanBuffer(bytes, options = {}) {
  if (active >= 4) throw problem(503, 'Bộ quét đang bận. Tệp chưa được lưu; vui lòng thử lại sau.');
  active++;
  try {
    const config = settings(options);
    if (useDefender(options)) {
      try { return await scanWithDefender(bytes, { ...options, maxAgeDays: config.maxAgeDays }); }
      catch (error) { if (process.env.CV_SCANNER === 'defender' || error.status !== 503) throw error; }
    }
    const engine = await scannerStatus({ ...options, host: config.host });
    const reply = await command(config, 'INSTREAM', bytes);
    if (reply === 'stream: OK') return { ...engine, status: 'clean', scannedAt: new Date().toISOString(), checksum: createHash('sha256').update(bytes).digest('hex') };
    if (reply.endsWith(' FOUND')) {
      if (/Heuristics\.(Encrypted|Limits\.Exceeded)/.test(reply)) throw problem(422, 'Không thể quét đầy đủ tệp này (có thể được mã hóa hoặc vượt giới hạn giải nén). Hãy gửi bản không đặt mật khẩu hoặc xuất thành PDF.');
      throw problem(422, 'Bộ quét phát hiện mã độc hoặc nội dung nguy hiểm trong tệp. Tệp đã bị từ chối và không được lưu.');
    }
    throw unavailable();
  } finally { active--; }
}
