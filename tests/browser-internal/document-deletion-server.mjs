import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createApp } from '../../server/app.mjs';
import { bootstrapAdmin } from '../../server/accounts.mjs';
import { hash } from '../../server/db.mjs';

if (!process.send || !process.env.DATA_DIR || !process.env.SUPERNET_E2E_PASSWORD) throw new Error('Start only through isolated document deletion tests.');
const pdf=readFileSync('tests/fixtures/cv.pdf');
// Known synthetic fixture only. This helper never replaces production antivirus.
const scanFile=async buffer=>{
  if (!buffer.equals(pdf)) throw new Error('Only the synthetic PDF fixture is accepted.');
  return {status:'clean',engine:'isolated browser fixture',checksum:hash(buffer)};
};
const {app,db}=createApp({dataDir:resolve(process.env.DATA_DIR),scanFile});
bootstrapAdmin(db,{username:'admin',password:process.env.SUPERNET_E2E_PASSWORD});
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
process.send({baseURL:`http://127.0.0.1:${server.address().port}`});
let stopping=false;
const stop=()=>{if(stopping)return;stopping=true;server.close(()=>{db.close();process.exit(0);});};
process.on('SIGTERM',stop);process.on('SIGINT',stop);process.on('disconnect',stop);
