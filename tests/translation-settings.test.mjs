import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { bootstrapAdmin } from '../server/accounts.mjs';
import { createTranslationSettingsStore } from '../server/translation-settings.mjs';

const fakeKey = () => `sk-test-${randomBytes(24).toString('hex')}`;
const providerResponse = () => new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({text:'你好，连接正常。'})}]}]}),{headers:{'Content-Type':'application/json'}});

async function fixture(t,{fetchImpl,environment = {},demo = false} = {}) {
  const dir = mkdtempSync(join(tmpdir(),'supernet-api-settings-'));
  let clock = new Date('2026-10-30T03:00:00.000Z');
  const store = createTranslationSettingsStore({dataDir:dir,clock:()=>clock,environment,legacyFile:join(dir,'no-env-file')});
  const calls = [];
  const translationFetch = async (url,options) => {calls.push({url,authorization:options.headers.Authorization,body:JSON.parse(options.body)});return fetchImpl ? fetchImpl(url,options) : providerResponse();};
  const {app,db} = createApp({dataDir:dir,translationSettingsStore:store,translationFetch,demo});
  const password = randomBytes(24).toString('hex');
  if(!demo) bootstrapAdmin(db,{username:'admin',password});
  const server = app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true,force:true});});
  async function request(path,{session,method='GET',data,origin} = {}) {
    const headers = {'X-Requested-With':'SuperNet'};
    if(session)headers.Cookie=session;if(data !== undefined)headers['Content-Type']='application/json';if(origin)headers.Origin=origin;
    const response=await fetch(`${base}/api/v1${path}`,{method,headers,body:data === undefined ? undefined : JSON.stringify(data)});
    return {status:response.status,body:await response.json(),headers:response.headers};
  }
  const signIn = async(username,role) => {
    const result = await request(demo?'/demo-session':'/login',{method:'POST',data:demo?{role}: {login:username,password}});
    assert.equal(result.status,200);return result.headers.get('set-cookie').split(';')[0];
  };
  const admin = await signIn('admin','admin');
  if(!demo)for(const role of ['hr','boss','interviewer'])assert.equal((await request('/admin/users',{session:admin,method:'POST',data:{username:`settings-${role}`,name:role,role,password}})).status,201);
  return {dir,db,store,calls,request,admin,signIn,setClock:value=>{clock=new Date(value);}};
}

test('Only Admin can read, replace or test translation credentials and cross-site saves are rejected',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('/admin/translation-settings')).status,401);
  for(const role of ['hr','boss','interviewer']){
    const session=await f.signIn(`settings-${role}`);
    for(const [path,method,data] of [['/admin/translation-settings','GET',undefined],['/admin/translation-settings','PUT',{apiKey:fakeKey(),model:'gpt-4.1-mini',expectedRevision:0}],['/admin/translation-settings/test','POST',{}]])assert.equal((await f.request(path,{session,method,data})).status,403);
  }
  assert.equal((await f.request('/admin/translation-settings',{session:f.admin,method:'PUT',origin:'https://attacker.example',data:{apiKey:fakeKey(),model:'gpt-4.1-mini',expectedRevision:0}})).status,403);
  assert.equal(f.calls.length,0);
});

test('Saving a key encrypts it, keeps credentials out of every API/audit response and survives reopening',async t=>{
  const f=await fixture(t), key=fakeKey();
  const saved=await f.request('/admin/translation-settings',{session:f.admin,method:'PUT',data:{apiKey:key,model:'gpt-4.1-mini',reminderDays:30,expectedRevision:0}});
  assert.equal(saved.status,200);assert.equal(saved.body.settings.configured,true);
  assert.equal(saved.body.settings.nextReminderAt,'2026-11-29T03:00:00.000Z');assert.equal(saved.body.settings.reminderDue,false);
  const file=readFileSync(join(f.dir,'translation-settings.json'),'utf8');assert.ok(!file.includes(key));assert.ok(!file.includes('sk-test-'));
  for(const path of ['/admin/translation-settings','/translation/status'])assert.ok(!JSON.stringify((await f.request(path,{session:f.admin})).body).includes(key));
  assert.ok(!JSON.stringify(f.db.prepare('SELECT details FROM audit_logs').all()).includes(key));
  if(process.platform !== 'win32')for(const name of ['translation-settings.json','.translation-master-key'])assert.equal(statSync(join(f.dir,name)).mode & 0o777,0o600);
  const reopened=createTranslationSettingsStore({dataDir:f.dir,environment:{},legacyFile:join(f.dir,'no-env-file')});
  assert.equal(reopened.active().apiKey,key);assert.equal(reopened.status().revision,1);
});

test('Rotating keys changes the next request immediately and the 30-day reminder does not expire a working key',async t=>{
  const f=await fixture(t), first=fakeKey(), second=fakeKey();
  const save=(apiKey,expectedRevision)=>f.request('/admin/translation-settings',{session:f.admin,method:'PUT',data:{apiKey,model:'gpt-4.1-mini',expectedRevision}});
  assert.equal((await save(first,0)).status,200);
  assert.equal((await f.request('/admin/translation-settings/test',{session:f.admin,method:'POST',data:{}})).status,200);
  assert.equal(f.calls[0].authorization,`Bearer ${first}`);assert.equal(f.calls[0].body.store,false);
  f.setClock('2026-10-31T03:00:00.000Z');assert.equal((await save(second,1)).status,200);
  const changed=(await f.request('/admin/translation-settings',{session:f.admin})).body.settings;
  assert.equal(changed.lastTestResult,'untested');assert.equal(changed.nextReminderAt,'2026-11-30T03:00:00.000Z');
  assert.equal((await f.request('/admin/translation-settings/test',{session:f.admin,method:'POST',data:{}})).status,200);
  assert.equal(f.calls[1].authorization,`Bearer ${second}`);
  f.setClock('2026-12-01T03:00:00.000Z');
  assert.equal((await f.request('/admin/translation-settings',{session:f.admin})).body.settings.reminderDue,true);
  assert.equal((await f.request('/admin/translation-settings/test',{session:f.admin,method:'POST',data:{}})).status,200);
});

test('Blank key updates preserve the key/date; stale or invalid saves cannot replace current configuration',async t=>{
  const f=await fixture(t), key=fakeKey();
  await f.request('/admin/translation-settings',{session:f.admin,method:'PUT',data:{apiKey:key,model:'gpt-4.1-mini',expectedRevision:0}});
  f.setClock('2026-11-02T03:00:00.000Z');
  const changed=await f.request('/admin/translation-settings',{session:f.admin,method:'PUT',data:{apiKey:'',model:'gpt-4.1',reminderDays:45,expectedRevision:1}});
  assert.equal(changed.status,200);assert.equal(f.store.active().apiKey,key);assert.equal(changed.body.settings.keyUpdatedAt,'2026-10-30T03:00:00.000Z');
  const before=readFileSync(join(f.dir,'translation-settings.json'),'utf8');
  assert.equal((await f.request('/admin/translation-settings',{session:f.admin,method:'PUT',data:{apiKey:fakeKey(),model:'gpt-4.1-mini',expectedRevision:1}})).status,409);
  for(const data of [{apiKey:'bad-key',model:'gpt-4.1'},{apiKey:'',model:'invalid model'},{apiKey:'',model:'gpt-4.1',reminderDays:0}])assert.equal((await f.request('/admin/translation-settings',{session:f.admin,method:'PUT',data:{...data,expectedRevision:2}})).status,400);
  assert.equal(readFileSync(join(f.dir,'translation-settings.json'),'utf8'),before);
});

test('Failed API tests show a controlled error, keep the saved key and recover after rotation',async t=>{
  const replacement=fakeKey();
  const f=await fixture(t,{fetchImpl:async(_url,options)=>options.headers.Authorization===`Bearer ${replacement}`?providerResponse():new Response(JSON.stringify({error:'provider-private-data'}),{status:401})});
  const old=fakeKey();
  await f.request('/admin/translation-settings',{session:f.admin,method:'PUT',data:{apiKey:old,model:'gpt-4.1-mini',expectedRevision:0}});
  const failed=await f.request('/admin/translation-settings/test',{session:f.admin,method:'POST',data:{}});
  assert.equal(failed.status,503);assert.match(failed.body.message,/Khóa API dịch chưa hợp lệ/);
  assert.ok(!JSON.stringify(failed.body).includes(old));assert.ok(!JSON.stringify(failed.body).includes('provider-private-data'));
  assert.equal(f.store.status().lastTestResult,'error');assert.equal(f.store.active().apiKey,old);
  await f.request('/admin/translation-settings',{session:f.admin,method:'PUT',data:{apiKey:replacement,model:'gpt-4.1-mini',expectedRevision:1}});
  assert.equal((await f.request('/admin/translation-settings/test',{session:f.admin,method:'POST',data:{}})).status,200);
  assert.equal(f.store.status().lastTestResult,'connected');
});

test('Proxy/environment credentials remain inherited instead of being copied into the settings file',async t=>{
  const environment={SUPERNET_TRANSLATION_API_KEY:'proxy-placeholder-fixture-only'};
  const f=await fixture(t,{environment});
  const saved=await f.request('/admin/translation-settings',{session:f.admin,method:'PUT',data:{apiKey:'',model:'gpt-4.1',expectedRevision:0}});
  assert.equal(saved.status,200);assert.equal(saved.body.settings.source,'environment');
  assert.ok(!readFileSync(join(f.dir,'translation-settings.json'),'utf8').includes(environment.SUPERNET_TRANSLATION_API_KEY));
  assert.equal((await f.request('/admin/translation-settings/test',{session:f.admin,method:'POST',data:{}})).status,200);
  assert.equal(f.calls[0].authorization,`Bearer ${environment.SUPERNET_TRANSLATION_API_KEY}`);
});

test('Corrupted encrypted configuration fails safely and demo sessions cannot configure a real API key',async t=>{
  const f=await fixture(t), key=fakeKey();
  await f.request('/admin/translation-settings',{session:f.admin,method:'PUT',data:{apiKey:key,model:'gpt-4.1-mini',expectedRevision:0}});
  const path=join(f.dir,'translation-settings.json'),record=JSON.parse(readFileSync(path,'utf8'));
  record.encryptedKey.tag=Buffer.alloc(16).toString('base64');writeFileSync(path,JSON.stringify(record));
  const response=await f.request('/admin/translation-settings',{session:f.admin});assert.equal(response.status,503);assert.ok(!JSON.stringify(response.body).includes(key));
  const demo=await fixture(t,{demo:true,environment:{OPENAI_API_KEY:fakeKey()}});
  assert.equal((await demo.request('/translation/status',{session:demo.admin})).body.configured,false);
  assert.equal((await demo.request('/admin/translation-settings',{session:demo.admin})).status,409);assert.equal(demo.calls.length,0);
});
