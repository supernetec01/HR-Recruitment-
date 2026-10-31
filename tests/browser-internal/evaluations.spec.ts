import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork, type ChildProcess } from 'node:child_process';

type Fixture={candidateId:string;interviewId:string;name:string};
let directory:string,worker:ChildProcess,baseURL:string,fixtures:Fixture[],reviewerId:string;const sessions:Record<string,APIRequestContext>={};
const password=process.env.SUPERNET_E2E_PASSWORD!;
const sample={score:8.5,result:'pass',comments:'Có kinh nghiệm xây dựng nội dung và trình bày rõ các công việc đã thực hiện.',expectedRevision:0};
test.beforeAll(async({playwright})=>{
  directory=mkdtempSync(join(tmpdir(),'supernet-evaluation-browser-'));worker=fork('tests/browser-internal/evaluations-server.mjs',[],{env:{...process.env,DATA_DIR:directory},stdio:['ignore','inherit','inherit','ipc']});
  const ready=await new Promise<{baseURL:string;fixtures:Fixture[];reviewerId:string}>((resolve,reject)=>{worker.once('message',message=>resolve(message as {baseURL:string;fixtures:Fixture[];reviewerId:string}));worker.once('error',reject);worker.once('exit',code=>reject(new Error(`Evaluation fixture exited: ${code}`)));});({baseURL,fixtures,reviewerId}=ready);
  for(const[role,username]of[['admin','admin'],['interviewer','evaluation.interviewer'],['other','evaluation.other'],['hr','evaluation.hr'],['boss','evaluation.boss']]){const context=await playwright.request.newContext({baseURL,extraHTTPHeaders:{'X-Requested-With':'SuperNet'}});expect((await context.post('/api/v1/login',{data:{login:username,password}})).status()).toBe(200);sessions[role]=context;}
});
test.afterAll(async()=>{await Promise.all(Object.values(sessions).map(context=>context.dispose()));if(worker?.exitCode===null){const exited=new Promise(resolve=>worker.once('exit',resolve));worker.kill('SIGTERM');await exited;}if(directory)rmSync(directory,{recursive:true,force:true});});
async function open(page:Page,fixture:Fixture,role='interviewer'){
  await page.context().addCookies((await sessions[role].storageState()).cookies);await page.goto(`${baseURL}/?page=candidates&candidate=${fixture.candidateId}`);await page.locator('.detail-tabs').getByRole('button',{name:/^Đánh giá/}).click();
}
const save=(fixture:Fixture,data=sample)=>sessions.interviewer.put(`/api/v1/interviews/${fixture.interviewId}/evaluation`,{headers:{'Idempotency-Key':crypto.randomUUID()},data});
test('assigned interviewer rates a completed interview from the list and can edit the saved outcome',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const f=fixtures[0];await page.context().addCookies((await sessions.interviewer.storageState()).cookies);await page.goto(`${baseURL}/?page=interviews`);await page.locator('.list-tabs').getByRole('button',{name:'Đã hoàn thành',exact:true}).click();
  const row=page.locator('.interview-list-row').filter({hasText:f.name});await row.getByRole('button',{name:`Đánh giá ${f.name}`,exact:true}).click();const dialog=page.getByRole('dialog');
  await dialog.getByLabel(/^Điểm phỏng vấn/).fill('8,5');await dialog.getByLabel(/^Kết quả đề xuất/).selectOption('pass');await dialog.getByLabel(/^Nhận xét phỏng vấn/).fill(sample.comments);await dialog.getByRole('button',{name:'Lưu đánh giá',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(row.locator('.evaluation-badge')).toContainText('8,5/10');await expect(row.locator('.evaluation-result')).toHaveText('Đạt');
  await row.getByRole('button',{name:`Chỉnh sửa đánh giá ${f.name}`,exact:true}).click();await dialog.getByLabel(/^Điểm phỏng vấn/).fill('9');await dialog.getByLabel(/^Kết quả đề xuất/).selectOption('follow_up');await dialog.getByLabel(/^Nhận xét phỏng vấn/).fill('Đề xuất trao đổi thêm về kinh nghiệm vận hành chiến dịch.');await dialog.getByRole('button',{name:'Lưu đánh giá',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(row.locator('.evaluation-badge')).toContainText('9/10');await expect(row.locator('.evaluation-result')).toHaveText('Cần phỏng vấn thêm');
  await page.reload();await page.locator('.list-tabs').getByRole('button',{name:'Đã hoàn thành',exact:true}).click();await expect(row.locator('.evaluation-badge')).toContainText('9/10');expect((await(await sessions.admin.get(`/api/v1/interviews/${f.interviewId}/evaluation`)).json()).evaluation.reviewer_id).toBe(reviewerId);expect(errors).toEqual([]);
});
test('Admin and HR see reviewer, comments, result and score in the candidate profile without editing another person’s evaluation',async({page})=>{
  const f=fixtures[1];expect((await save(f)).status()).toBe(200);
  for(const role of ['admin','hr','other','boss']){
    await page.context().clearCookies();await open(page,f,role);const card=page.locator('.evaluation-card');await expect(card).toContainText('8,5/10');await expect(card).toContainText(sample.comments);await expect(card).toContainText('Người phỏng vấn kiểm thử');await expect(card.getByRole('button',{name:/Chỉnh sửa đánh giá/})).toHaveCount(0);
    await card.getByRole('button',{name:`Xem đánh giá ${f.name}`,exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText(sample.comments);await expect(dialog.getByRole('button',{name:'Lưu đánh giá',exact:true})).toHaveCount(0);await dialog.locator('.modal-foot').getByRole('button',{name:'Đóng',exact:true}).click();
    expect((await sessions[role].put(`/api/v1/interviews/${f.interviewId}/evaluation`,{headers:{'Idempotency-Key':crypto.randomUUID()},data:{...sample,expectedRevision:1}})).status()).toBe(403);
  }
});
test('stale edits show an error and keep the draft instead of replacing newer feedback',async({page})=>{
  const f=fixtures[2];expect((await save(f)).status()).toBe(200);await open(page,f);await page.getByRole('button',{name:`Chỉnh sửa đánh giá ${f.name}`,exact:true}).click();const dialog=page.getByRole('dialog');const draft='Bản nháp đang nhập chưa gửi của người phỏng vấn.';await dialog.getByLabel(/^Nhận xét phỏng vấn/).fill(draft);
  expect((await save(f,{...sample,comments:'Nhận xét mới đã được cập nhật ở cửa sổ khác.',expectedRevision:1})).status()).toBe(200);
  await dialog.getByRole('button',{name:'Lưu đánh giá',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Đánh giá đã được cập nhật');await expect(dialog.getByLabel(/^Nhận xét phỏng vấn/)).toHaveValue(draft);await dialog.getByRole('button',{name:'Hủy',exact:true}).click();
});
test('zero scores display correctly and form and cards fit 320–1440 px in both languages',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const f=fixtures[3];expect((await save(f,{...sample,score:0,result:'fail'})).status()).toBe(200);await open(page,f);await expect(page.locator('.evaluation-badge')).toContainText('0/10');
  for(const language of ['vi','zh-CN']){await page.getByLabel('Ngôn ngữ / 语言').selectOption(language);for(const width of [320,375,768,1440]){
    await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);await page.screenshot({path:test.info().outputPath(`evaluations-${language}-${width}.png`),fullPage:true,animations:'disabled'});await page.locator('.evaluation-card .button').click();const dialog=page.getByRole('dialog');await expect(dialog.locator('input[name=score]')).toHaveValue('0');expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBeTruthy();await expect(dialog.getByRole('button',{name:language==='vi'?'Lưu đánh giá':'保存评价',exact:true})).toBeInViewport();await page.screenshot({path:test.info().outputPath(`evaluation-form-${language}-${width}.png`),fullPage:false,animations:'disabled'});await dialog.locator('.modal-foot .button.secondary').click();
  }}expect(errors).toEqual([]);
});
test('scheduled and cancelled interviews offer no evaluation action',async({page})=>{
  for(const fixture of fixtures.slice(4)){await open(page,fixture);await expect(page.getByRole('heading',{name:'Chưa có buổi phỏng vấn đã hoàn thành',exact:true})).toBeVisible();await expect(page.locator('.evaluation-card')).toHaveCount(0);expect((await save(fixture)).status()).toBe(409);}
});
