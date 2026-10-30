import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { openDatabase } from '../server/db.mjs';
import { ensureAdministrator } from '../server/admin-startup.mjs';
const demo = process.env.DEMO_MODE === '1';
const developmentEnv = { ...process.env, NODE_ENV: 'development', DEMO_MODE: demo ? '1' : '0' };
// Prompt in the terminal before Node watch starts; existing accounts are never reset.
if (!demo && (process.stdin.isTTY || process.env.USER_PASSWORD)) {
  const db = openDatabase(resolve(process.env.DATA_DIR || '.data/internal'));
  try { await ensureAdministrator(db); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { db.close(); }
  if (process.exitCode) process.exit(process.exitCode);
}
const children = [
  spawn(process.execPath, ['--watch', 'server/index.mjs'], { stdio: 'inherit', env: developmentEnv }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit', env: developmentEnv }),
];
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; children.forEach(child => child.kill('SIGTERM')); process.exitCode = code; }
children.forEach(child => child.on('exit', code => stop(code ?? 0)));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
