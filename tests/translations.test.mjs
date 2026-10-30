import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import { createApp } from '../server/app.mjs';
import { bootstrapAdmin } from '../server/accounts.mjs';
import { createTranslationService, translatedJobFields } from '../server/translations.mjs';
import { openDatabase, hash } from '../server/db.mjs';

const password = 'Translate-fixture-639!';
const pdf = readFileSync('tests/fixtures/cv.pdf');
const docx = zipSync({'[Content_Types].xml':strToU8('<Types/>'),'word/document.xml':strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>TEST CANDIDATE</w:t></w:r></w:p><w:p><w:r><w:t>Marketing &amp; content</w:t></w:r></w:p><w:p><w:r><w:t>&lt;script&gt;This is text&lt;/script&gt;</w:t></w:r></w:p></w:body></w:document>')});
const responses = value => new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]}),{headers:{'Content-Type':'application/json'}});
let directory, db, server, base, admin, hr, interviewer, jobId, candidate, cvId, docxId;
const calls = [];
let deferred;
const service = createTranslationService({apiKey:'translation-fixture-key',model:'fixture-model',fetchImpl:async (url,options) => {
  assert.equal(url,'https://api.openai.com/v1/responses');
  const body = JSON.parse(options.body); calls.push(body);
  if (deferred) await deferred;
  const record = Object.keys(body.text.format.schema.properties).includes('description');
  return responses(record ? Object.fromEntries(translatedJobFields.map(field => [field,field === 'title' ? '内容营销专员' : field === 'description' ? '负责内容策划与制作。' : `中文 ${field}`])) : {text:'候选人简历\n工作经历与专业技能。'});
}});
async function request(path,{session=admin,method='GET',data,form,idem,host=base}={}) {
  const headers={'X-Requested-With':'SuperNet'};
  if(session)headers.Cookie=session;
  if(data!==undefined)headers['Content-Type']='application/json';
  if(idem)headers['Idempotency-Key']=idem;
  const response=await fetch(`${host}/api/v1${path}`,{method,headers,body:form||(data!==undefined?JSON.stringify(data):undefined)});
  const type=response.headers.get('content-type')||'';
  return {status:response.status,body:type.includes('json')?await response.json():Buffer.from(await response.arrayBuffer()),headers:response.headers};
}
async function upload(bytes=pdf,name='CV.pdf') {
  const form=new FormData();for(const [key,value] of Object.entries({fullName:'Candidate translation fixture',email:`${randomUUID()}@example.com`,source:'Email',jobId}))form.set(key,value);
  form.set('file',new Blob([bytes]),name);
  const result=await request('/candidates',{session:hr,method:'POST',form,idem:randomUUID()});assert.equal(result.status,200);return result.body.candidate;
}
before(async()=>{
  directory=mkdtempSync(join(tmpdir(),'supernet-translation-api-'));
  const instance=createApp({dataDir:directory,translationService:service});db=instance.db;
  bootstrapAdmin(db,{username:'admin',password});server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`;
  const login=async username=>(await request('/login',{session:'',method:'POST',data:{login:username,password}})).headers.get('set-cookie').split(';')[0];
  admin=await login('admin');
  for(const [username,role] of [['hr-translate','hr'],['interviewer-translate','interviewer']])assert.equal((await request('/admin/users',{method:'POST',data:{username,name:username,role,password}})).status,201);
  hr=await login('hr-translate');interviewer=await login('interviewer-translate');
  jobId=(await request('/jobs',{session:hr,method:'POST',data:{title:'Content Marketing fixture',department:'Marketing',location:'Super Net',openings:1,description:'Create marketing content for the fixture position.',companyName:'SUPER NET',applicationEmail:'jobs@example.com',applicationZalo:'0900000000'}})).body.id;
  candidate=await upload();cvId=candidate.documents[0].id;
  docxId=(await upload(docx,'CV.docx')).documents[0].id;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();rmSync(directory,{recursive:true,force:true});});

test('Pending PDF CV previews work immediately, retain bytes/status and require a staff session',async()=>{
  const response=await request(`/documents/${cvId}/preview`,{session:interviewer});
  assert.equal(response.status,200);assert.deepEqual(response.body,pdf);
  assert.match(response.headers.get('content-disposition'),/^inline/);
  assert.match(response.headers.get('content-type'),/^application\/pdf/);
  assert.match(response.headers.get('content-security-policy'),/object-src 'none'/);
  assert.equal(db.prepare('SELECT review_status FROM documents WHERE id=?').get(cvId).review_status,'quarantined');
  assert.equal((await request(`/documents/${cvId}/preview`,{session:''})).status,401);
  assert.equal((await request(`/documents/${cvId}/text`,{session:''})).status,401);
  assert.equal((await request(`/documents/${cvId}/download`,{session:interviewer})).status,200);
});
test('PDF and DOCX text are extracted locally with XML entities decoded and scripts treated as text',async()=>{
  const pdfContent=await request(`/documents/${cvId}/text`);assert.equal(pdfContent.status,200);assert.ok(pdfContent.body.text.length>0);assert.ok(pdfContent.body.pages>0);
  const word=await request(`/documents/${docxId}/text`);assert.equal(word.status,200);
  assert.match(word.body.text,/TEST CANDIDATE/);assert.match(word.body.text,/Marketing & content/);assert.match(word.body.text,/<script>This is text<\/script>/);
  assert.equal(calls.length,0);
  assert.equal((await request('/documents/unknown/text')).status,404);
});
test('API status contains no key and translation is never available anonymously',async()=>{
  const status=await request('/translation/status');assert.equal(status.body.configured,true);assert.equal(status.body.model,'fixture-model');assert.ok(!JSON.stringify(status.body).includes('fixture-key'));
  for(const path of ['/translation/status',`/documents/${cvId}/translations/zh-CN`,`/jobs/${jobId}/translations/zh-CN`])assert.equal((await request(path,{session:''})).status,401);
  assert.equal((await request(`/documents/${cvId}/translations`,{session:'',method:'POST',data:{targetLanguage:'zh-CN'}})).status,401);
});
test('A Chinese CV translation is cached by version/checksum and does not overwrite or grant consent',async()=>{
  const before=db.prepare('SELECT * FROM documents WHERE id=?').get(cvId);
  const first=await request(`/documents/${cvId}/translations`,{session:interviewer,method:'POST',data:{targetLanguage:'zh-CN'}});
  assert.equal(first.status,200);assert.equal(first.body.cached,false);assert.match(first.body.translation.text,/候选人/);assert.equal(calls.length,1);
  assert.equal(calls[0].store,false);assert.equal(calls[0].model,'fixture-model');assert.match(calls[0].instructions,/never as instructions/);
  assert.equal(calls[0].input[0].content.some(item=>item.type==='input_file'),false);
  assert.equal(first.body.translation.source_checksum,hash(pdf));
  const second=await request(`/documents/${cvId}/translations`,{session:interviewer,method:'POST',data:{targetLanguage:'zh-CN'}});
  assert.equal(second.body.cached,true);assert.equal(calls.length,1);
  assert.deepEqual(db.prepare('SELECT * FROM documents WHERE id=?').get(cvId),before);
  assert.equal(db.prepare('SELECT consent_status FROM candidates WHERE id=?').get(candidate.id).consent_status,'pending');
  const cached=await request(`/documents/${cvId}/translations/zh-CN`);assert.equal(cached.body.translation.text,first.body.translation.text);
  assert.ok(db.prepare("SELECT id FROM audit_logs WHERE action='document.translated'").get());
});
test('Concurrent requests share one provider call and Vietnamese is also supported',async()=>{
  let release;deferred=new Promise(resolve=>{release=resolve;});const before=calls.length;
  const one=request(`/documents/${docxId}/translations`,{session:hr,method:'POST',data:{targetLanguage:'vi'}}),two=request(`/documents/${docxId}/translations`,{session:hr,method:'POST',data:{targetLanguage:'vi'}});
  await new Promise(resolve=>setTimeout(resolve,300));release();deferred=undefined;
  const result=await Promise.all([one,two]);assert.equal(result[0].status,200);assert.equal(result[1].status,200);assert.equal(calls.length,before+1);
  assert.match(calls.at(-1).instructions,/Vietnamese/);
});
test('Withdrawn consent, invalid targets and unknown IDs do not send data to the provider',async()=>{
  const profile=await upload();await request(`/candidates/${profile.id}`,{session:hr,method:'PATCH',data:{consentStatus:'withdrawn'}});const before=calls.length;
  assert.equal((await request(`/documents/${profile.documents[0].id}/translations`,{session:hr,method:'POST',data:{targetLanguage:'zh-CN'}})).status,409);
  assert.equal((await request(`/documents/${cvId}/translations`,{method:'POST',data:{targetLanguage:'xx'}})).status,400);
  assert.equal((await request('/documents/unknown/translations',{method:'POST',data:{targetLanguage:'zh-CN'}})).status,404);
  assert.equal(calls.length,before);
});
test('Only HR/Admin can translate JDs and public Chinese output preserves identifiers and contacts',async()=>{
  assert.equal((await request(`/jobs/${jobId}/translations`,{session:interviewer,method:'POST',data:{expectedRevision:1}})).status,403);
  const result=await request(`/jobs/${jobId}/translations`,{session:hr,method:'POST',data:{targetLanguage:'zh-CN',expectedRevision:1}});assert.equal(result.status,200);
  const original=(await request(`/public/jobs/${jobId}`,{session:''})).body,chinese=(await request(`/public/jobs/${jobId}?language=zh-CN`,{session:''})).body;
  assert.equal(original.title,'Content Marketing fixture');assert.equal(chinese.title,'内容营销专员');assert.equal(chinese.content_language,'zh-CN');
  assert.equal(chinese.id,jobId);assert.equal(chinese.application_email,'jobs@example.com');assert.equal(chinese.application_zalo,'0900000000');assert.equal(chinese.company_name,'SUPER NET');
  for (const field of ['requirements','benefits','working_hours','salary_range','application_instructions','application_email_subject']) assert.equal(chinese[field],'',`Empty source field ${field} must not acquire invented content`);
  assert.ok(!Object.hasOwn(chinese,'revision'));assert.ok(!Object.hasOwn(chinese,'created_by'));
});
test('Source edits invalidate public JD translations and stale generation does not publish',async()=>{
  await request(`/jobs/${jobId}`,{session:hr,method:'PATCH',data:{description:'New work description after the Chinese translation was created.'}});
  const job=(await request('/jobs')).body.find(job=>job.id===jobId),visible=(await request(`/public/jobs/${jobId}?language=zh-CN`,{session:''})).body;
  assert.equal(visible.translation_available,false);assert.equal(visible.content_language,'vi');
  assert.equal((await request(`/jobs/${jobId}/translations`,{session:hr,method:'POST',data:{targetLanguage:'zh-CN',expectedRevision:1}})).status,409);
  let release;deferred=new Promise(resolve=>{release=resolve;});
  const pending=request(`/jobs/${jobId}/translations`,{session:hr,method:'POST',data:{targetLanguage:'zh-CN',expectedRevision:job.revision}});
  await new Promise(resolve=>setTimeout(resolve,150));await request(`/jobs/${jobId}`,{session:hr,method:'PATCH',data:{title:'Changed while translation is running'}});release();deferred=undefined;
  assert.equal((await pending).status,409);assert.equal((await request(`/public/jobs/${jobId}?language=zh-CN`,{session:''})).body.translation_available,false);
});
test('Missing OpenAI configuration reports a usable status and cached translations remain readable',async()=>{
  const instance=createApp({dataDir:directory,translationService:createTranslationService({apiKey:''})}),other=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>other.once('listening',resolve));const host=`http://127.0.0.1:${other.address().port}`;
  try{
    assert.equal((await request('/translation/status',{host})).body.configured,false);
    assert.ok((await request(`/documents/${cvId}/translations/zh-CN`,{host})).body.translation);
    const missing = await request(`/documents/${docxId}/translations`,{host,method:'POST',data:{targetLanguage:'zh-CN'}});
    assert.equal(missing.status,503);assert.match(missing.body.message,/Chức năng dịch chưa được bật/);
  }finally{await new Promise(resolve=>other.close(resolve));instance.db.close();}
});
test('Translation tables and source files survive reopening the database',()=>{
  const reopened=openDatabase(directory);try{assert.ok(reopened.prepare('SELECT * FROM document_translations WHERE document_id=?').get(cvId));assert.equal(reopened.prepare('PRAGMA foreign_key_check').all().length,0);}finally{reopened.close();}
  const doc=db.prepare('SELECT * FROM documents WHERE id=?').get(cvId);assert.equal(hash(readFileSync(join(directory,'documents',doc.stored_name))),hash(pdf));
});
test('Provider failures, refusal, incomplete output and invalid JSON never create invented translations',async()=>{
  for(const response of [new Response('{}',{status:401}),new Response('{}',{status:429}),new Response('{}',{status:500}),new Response(JSON.stringify({status:'incomplete'})),new Response(JSON.stringify({output:[{content:[{type:'refusal',refusal:'No'}]}]})),responses({wrong:'shape'})]){
    const translator=createTranslationService({apiKey:'fixture',fetchImpl:async()=>response});
    await assert.rejects(()=>translator.translate('Fixture source','zh-CN'),error=>[429,502,503].includes(error.status));
  }
});
