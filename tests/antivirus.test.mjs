import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { scannerStatus, scanBuffer } from '../server/antivirus.mjs';
import { createApp } from '../server/app.mjs';
import { bootstrapAdmin } from '../server/accounts.mjs';
import { hash } from '../server/db.mjs';

const eicar = Buffer.from(['X5O!P%@AP[4', '\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join(''));
test('real antivirus accepts a PDF carrying Content Credentials and rejects the harmless EICAR test signature', async () => {
  const bytes = readFileSync(new URL('./fixtures/cv-content-credentials.pdf', import.meta.url));
  const result = await scanBuffer(bytes);
  assert.equal(result.status, 'clean'); assert.equal(result.checksum, hash(bytes));
  assert.ok(['ClamAV', 'Microsoft Defender'].includes(result.engine)); assert.ok(result.signatureVersion);
  await assert.rejects(scanBuffer(eicar), error => error.status === 422);
});

async function withDaemon(handler, run) {
  const sockets = new Set();
  const daemon = createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.once('data', bytes => handler(socket, bytes.toString())); });
  daemon.listen(0, '127.0.0.1'); await new Promise(resolve => daemon.once('listening', resolve));
  try { await run({ host: '127.0.0.1', port: daemon.address().port, timeout: 100 }); }
  finally { for (const socket of sockets) socket.destroy(); await new Promise(resolve => daemon.close(resolve)); }
}
test('outdated or malformed signatures, timeouts, and incomplete scans fail closed', async () => {
  for (const version of ['ClamAV 1.5.4/1/Mon Jan 01 00:00:00 2001', 'unexpected response']) {
    await withDaemon(socket => socket.end(`${version}\0`), options => assert.rejects(scannerStatus(options), error => error.status === 503));
  }
  await withDaemon(() => {}, options => assert.rejects(scanBuffer(Buffer.from('CV'), options), error => error.status === 503));
  for (const response of ['stream: Heuristics.Encrypted.Zip FOUND', 'stream: Heuristics.Limits.Exceeded.MaxFileSize FOUND', 'stream: scan error ERROR']) {
    await withDaemon((socket, command) => {
      if (command.startsWith('zVERSION')) socket.end(`ClamAV 1.5.4/123/${new Date().toUTCString()}\0`);
      else socket.end(`${response}\0`);
    }, options => assert.rejects(scanBuffer(Buffer.from('CV'), options), error => error.status === (response.endsWith(' FOUND') ? 422 : 503)));
  }
});

test('no candidate, document, submission, or stored bytes are created when the scanner is unavailable', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'supernet-scan-failure-'));
  const instance = createApp({ dataDir: directory, scanFile: async () => { throw Object.assign(new Error('Scanner unavailable'), { status: 503 }); } });
  const password = randomBytes(24).toString('hex'); bootstrapAdmin(instance.db, { username: 'admin', password });
  const server = instance.app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    const login = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'SuperNet' }, body: JSON.stringify({ login: 'admin', password }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const form = new FormData(); form.set('fullName', 'CV scan failure'); form.set('source', 'Email'); form.set('file', new Blob(['CV text']), 'CV.txt');
    const response = await fetch(`${base}/candidates`, { method: 'POST', headers: { Cookie: cookie, 'X-Requested-With': 'SuperNet', 'Idempotency-Key': randomUUID() }, body: form });
    assert.equal(response.status, 503);
    for (const table of ['candidates', 'documents', 'submissions', 'idempotency_keys']) assert.equal(instance.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0);
    assert.deepEqual(readdirSync(join(directory, 'documents')), []);
  } finally { await new Promise(resolve => server.close(resolve)); instance.db.close(); rmSync(directory, { recursive: true, force: true }); }
});
