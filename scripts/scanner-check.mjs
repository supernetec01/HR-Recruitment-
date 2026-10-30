import { scannerStatus } from '../server/antivirus.mjs';
try { const status = await scannerStatus(process.argv.includes('--clamav') ? { host: process.env.CLAMAV_HOST || '127.0.0.1' } : {}); console.log(`Bộ quét sẵn sàng: ${status.engine} ${status.version}; chữ ký ${status.signatureVersion}, ${status.signatureDate}.`); }
catch (error) { console.error(error.message); console.error('Windows: bật/cập nhật Microsoft Defender và kiểm tra quyền chạy. Có thể thay bằng Docker Desktop/Engine + npm run scanner:up.'); process.exitCode = 1; }
