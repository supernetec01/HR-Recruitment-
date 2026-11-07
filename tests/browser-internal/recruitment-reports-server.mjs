import { resolve } from 'node:path';
import { createApp } from '../../server/app.mjs';
import { bootstrapAdmin } from '../../server/accounts.mjs';
import { seedRecruitmentFixture } from '../helpers/recruitment-fixture.mjs';

if (!process.send || !process.env.DATA_DIR || !process.env.SUPERNET_E2E_PASSWORD) throw new Error('Only run through isolated recruitment report tests.');
const { app, db } = createApp({ dataDir: resolve(process.env.DATA_DIR) });
const user = bootstrapAdmin(db, { username: 'admin', password: process.env.SUPERNET_E2E_PASSWORD });
const fixture = seedRecruitmentFixture(db, user.id);
const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
process.send({ baseURL: `http://127.0.0.1:${server.address().port}`, fresh: fixture.fresh });
let stopping = false;
function stop() { if (stopping) return; stopping = true; server.close(() => { db.close(); process.exit(0); }); }
process.on('SIGTERM', stop); process.on('SIGINT', stop); process.on('disconnect', stop);
