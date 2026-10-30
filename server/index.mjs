import { resolve } from 'node:path';
import { createApp } from './app.mjs';
import { ensureAdministrator } from './admin-startup.mjs';
const demo = process.env.DEMO_MODE === '1';
if (demo && process.env.NODE_ENV === 'production') throw new Error('DEMO_MODE must be disabled in production.');
const { app, db } = createApp({ dataDir: resolve(process.env.DATA_DIR || (demo ? '.data' : '.data/internal')), demo });
if (!demo) {
  try { await ensureAdministrator(db); }
  catch (error) { db.close(); console.error(error.message); process.exit(1); }
}
const server = app.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => {
  console.log(`Super Net API listening on port ${server.address().port}${demo ? ' — DEMO: synthetic data only' : ''}`);
});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
