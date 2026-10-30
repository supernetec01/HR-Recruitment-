import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';
import { bootstrapAdmin } from '../server/accounts.mjs';

const testPassword = 'Origin-test-only-295!';
async function workspace(t, options = {}, initialize = true) {
  const directory = mkdtempSync(join(tmpdir(),'supernet-origin-'));
  const instance = createApp({ dataDir: directory, appOrigin: undefined, trustProxy: 'loopback', production: false, ...options });
  if (initialize) bootstrapAdmin(instance.db, { username: 'admin', password: testPassword });
  const server = instance.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); instance.db.close(); rmSync(directory,{recursive:true,force:true}); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = (headers = {}) => fetch(`${base}/api/v1/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'SuperNet', ...headers }, body: JSON.stringify({ login: 'admin', password: testPassword }) });
  return { ...instance, base, login };
}

test('LAN login via trusted frontend proxy succeeds and keeps the authenticated session', async t => {
  const { base, login } = await workspace(t);
  const response = await login({ Origin: 'http://192.168.1.5:5173', 'X-Forwarded-Host': '192.168.1.5:5173', 'X-Forwarded-Proto': 'http' });
  assert.equal(response.status,200);
  assert.equal((await response.json()).user.username,'admin');
  const cookie = response.headers.get('set-cookie'); assert.match(cookie,/HttpOnly/i); assert.doesNotMatch(cookie,/;\s*Secure/i);
  const me = await fetch(`${base}/api/v1/me`,{headers:{Cookie:cookie.split(';')[0]}});
  assert.equal(me.status,200); assert.equal((await me.json()).user.role,'admin');
});
test('normal development accepts local Vite without enabling demo or allowing arbitrary LAN origins', async t => {
  const { login } = await workspace(t);
  assert.equal((await login({Origin:'http://localhost:5173'})).status,200);
  assert.equal((await login({Origin:'http://127.0.0.1:5173'})).status,200);
  assert.equal((await login({Origin:'http://192.168.1.99:5173'})).status,403);
});
test('explicit APP_ORIGIN accepts the normalized company address even when Host is rewritten', async t => {
  const { login } = await workspace(t,{appOrigin:'http://192.168.1.5:5173/'});
  assert.equal((await login({Origin:'http://192.168.1.5:5173'})).status,200);
  assert.equal((await login({Origin:'http://192.168.1.5:9999'})).status,403);
});
test('production HTTPS reverse proxy keeps Secure cookies and does not enable development exceptions', async t => {
  const { login } = await workspace(t,{production:true});
  const response = await login({Origin:'https://recruitment.supernet.test','X-Forwarded-Host':'recruitment.supernet.test','X-Forwarded-Proto':'https'});
  assert.equal(response.status,200); assert.match(response.headers.get('set-cookie'),/;\s*Secure/i);
  assert.equal((await login({Origin:'http://localhost:5173'})).status,403);
});
test('forwarded headers from an untrusted peer cannot authorize another origin', async t => {
  const { login } = await workspace(t,{trustProxy:'10.42.0.0/16'});
  assert.equal((await login({Origin:'http://192.168.1.5:5173','X-Forwarded-Host':'192.168.1.5:5173','X-Forwarded-Proto':'http'})).status,403);
});
test('cross-site, null, malformed and ambiguous forwarded origins are rejected', async t => {
  const { login } = await workspace(t);
  for (const origin of ['https://attacker.example','null','file://local','https://company.test/path','http://192.168.1.5:5173.attacker.example']) {
    const response = await login({Origin:origin,'X-Forwarded-Host':'192.168.1.5:5173','X-Forwarded-Proto':'http'});
    assert.equal(response.status,403); assert.equal((await response.json()).code,'ORIGIN_NOT_ALLOWED');
  }
  assert.equal((await login({Origin:'http://192.168.1.5:5173','X-Forwarded-Host':'192.168.1.5:5173, attacker.example','X-Forwarded-Proto':'http'})).status,403);
});
test('missing Admin is reported as setup required and becomes ready without resetting the server', async t => {
  const { db, base, login } = await workspace(t,{},false);
  assert.equal((await fetch(`${base}/api/v1/config`).then(r=>r.json())).needsSetup,true);
  const missing = await login(); assert.equal(missing.status,503); assert.equal((await missing.json()).code,'ADMIN_SETUP_REQUIRED');
  bootstrapAdmin(db,{username:'admin',password:testPassword});
  assert.equal((await fetch(`${base}/api/v1/config`).then(r=>r.json())).needsSetup,false);
  assert.equal((await login()).status,200);
});
