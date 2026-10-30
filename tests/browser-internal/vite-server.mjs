import { createServer } from 'vite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Exercise the actual Vite proxy configuration, with an isolated test API and cache.
const server = await createServer({
  configFile: 'vite.config.ts',
  cacheDir: mkdtempSync(join(tmpdir(), 'supernet-vite-test-')),
  server: { host: '127.0.0.1', port: 3120, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:3110' } } },
});
await server.listen();
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0); });
