import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

async function start(directory, password) {
  const child = spawn(process.execPath,['server/index.mjs'],{env:{...process.env,NODE_ENV:'development',DEMO_MODE:'0',DATA_DIR:directory,PORT:'0',HOST:'127.0.0.1',USER_LOGIN:'admin',USER_PASSWORD:password},stdio:['ignore','pipe','pipe']});
  let output = '';
  const base = await new Promise((resolve,reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Startup did not complete')); },10000);
    child.stdout.on('data',chunk => { output += chunk; const match = output.match(/listening on port (\d+)/); if(match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); } });
    child.once('error',error => {clearTimeout(timer);reject(error);});
    child.once('exit',code => {clearTimeout(timer); if(code)reject(new Error('Startup failed'));});
  });
  return { base, output: () => output, stop: async () => { if(child.exitCode===null) { const ended=once(child,'exit');child.kill('SIGTERM');await ended; } } };
}
test('first startup provisions a supplied password once, preserves it on restart, and does not echo it', async t => {
  const directory=mkdtempSync(join(tmpdir(),'supernet-first-start-')), password=randomBytes(24).toString('hex'), nextPassword=randomBytes(24).toString('hex');
  let server=await start(directory,password);
  t.after(async()=>{await server.stop();rmSync(directory,{recursive:true,force:true});});
  const login = async value => fetch(`${server.base}/api/v1/login`,{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'SuperNet'},body:JSON.stringify({login:'admin',password:value})});
  assert.equal((await fetch(`${server.base}/api/v1/config`).then(r=>r.json())).needsSetup,false);
  assert.equal((await login(password)).status,200); assert.ok(!server.output().includes(password));
  await server.stop();server=await start(directory,nextPassword);
  assert.equal((await login(password)).status,200); assert.equal((await login(nextPassword)).status,401);
  assert.ok(!server.output().includes(password)); assert.ok(!server.output().includes(nextPassword));
});
