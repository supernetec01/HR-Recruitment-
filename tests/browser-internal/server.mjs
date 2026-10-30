import { resolve } from 'node:path';
import { createApp } from '../../server/app.mjs';
import { bootstrapAdmin } from '../../server/accounts.mjs';
if (!process.env.SUPERNET_E2E_PASSWORD || !process.env.DATA_DIR) throw new Error('Only start this test helper through Playwright with isolated test data.');
const { app, db } = createApp({ dataDir: resolve(process.env.DATA_DIR), demo: false });
bootstrapAdmin(db, { username: 'admin', name: 'Admin Kiểm Thử', password: process.env.SUPERNET_E2E_PASSWORD });
const server = app.listen(3110, '127.0.0.1');
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
