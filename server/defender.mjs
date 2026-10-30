import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const execute = promisify(execFile);
const unavailable = () => Object.assign(new Error('Microsoft Defender chưa sẵn sàng để quét. Bật/cập nhật Defender và kiểm tra quyền chạy website, hoặc cấu hình ClamAV. Tệp chưa được lưu.'), { status: 503, publicMessage: 'Microsoft Defender chưa sẵn sàng để quét. Bật/cập nhật Defender và kiểm tra quyền chạy website, hoặc cấu hình ClamAV. Tệp chưa được lưu.' });
async function defender(path = '', maxAgeDays = 7) {
  try {
    const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const script = fileURLToPath(new URL('../scripts/scan-defender.ps1', import.meta.url));
    const { stdout } = await execute(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', script, '-ScanPath', path, '-MaxSignatureAgeDays', String(maxAgeDays)], { windowsHide: true, timeout: 30000, maxBuffer: 65536 });
    const result = JSON.parse(stdout.trim().replace(/^\uFEFF/, ''));
    const age = Date.now() - Date.parse(result.signatureDate);
    if (result.engine !== 'Microsoft Defender' || !result.version || !result.signatureVersion || !Number.isFinite(age) || age < -86400000 || age > maxAgeDays * 86400000) throw unavailable();
    return result;
  } catch { throw unavailable(); }
}
export async function defenderStatus(maxAgeDays) { return defender('', maxAgeDays); }
export async function scanWithDefender(bytes, { maxAgeDays = 7, filename = '' } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'supernet-scan-'));
  try {
    const ext = /\.[a-z0-9]{1,12}$/i.exec(filename)?.[0] || '.bin';
    const path = join(directory, `upload${ext}`);
    await writeFile(path, bytes, { mode: 0o600, flag: 'wx' });
    const result = await defender(path, maxAgeDays);
    if (result.status === 'blocked') throw Object.assign(new Error('Tệp bị Microsoft Defender từ chối sau khi kiểm tra an toàn. Tệp không được lưu vào hồ sơ.'), { status: 422 });
    if (result.status !== 'clean') throw unavailable();
    return { ...result, scannedAt: new Date().toISOString(), checksum: createHash('sha256').update(bytes).digest('hex') };
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
}
