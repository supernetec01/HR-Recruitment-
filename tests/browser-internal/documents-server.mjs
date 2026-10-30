import { resolve } from 'node:path';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import { createApp } from '../../server/app.mjs';
import { bootstrapAdmin } from '../../server/accounts.mjs';

if (!process.send || !process.env.DATA_DIR || !process.env.SUPERNET_E2E_PASSWORD) throw new Error('Start only from the isolated document browser tests.');
const directory = resolve(process.env.DATA_DIR);
const { app, db } = createApp({ dataDir: resolve(directory, '.data/internal') });
bootstrapAdmin(db, { username: 'admin', password: process.env.SUPERNET_E2E_PASSWORD });
const api = app.listen(0, '127.0.0.1');
await new Promise(resolve => api.once('listening', resolve));
const apiURL = `http://127.0.0.1:${api.address().port}`;
const vite = await createServer({
  configFile: 'vite.config.ts', cacheDir: resolve(directory, 'vite-cache'),
  server: { middlewareMode: true, hmr: false, proxy: { '/api': { target: apiURL } } },
});
const frontend = createHttpServer(vite.middlewares);
frontend.listen(0, '127.0.0.1');
await new Promise(resolve => frontend.once('listening', resolve));
process.send({ baseURL: `http://127.0.0.1:${frontend.address().port}`, apiURL });
let stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  await new Promise(resolve => frontend.close(resolve)); await vite.close();
  await new Promise(resolve => api.close(resolve)); db.close(); process.exit(0);
}
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
process.on('disconnect', () => void stop());
