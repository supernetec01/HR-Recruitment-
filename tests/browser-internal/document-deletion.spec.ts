import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork, type ChildProcess } from 'node:child_process';

let admin:APIRequestContext,hr:APIRequestContext,boss:APIRequestContext,baseURL:string,worker:ChildProcess,directory:string;
const password=process.env.SUPERNET_E2E_PASSWORD!,pdf=readFileSync('tests/fixtures/cv.pdf');
test.beforeAll(async({playwright})=>{
  directory=mkdtempSync(join(tmpdir(),'supernet-document-delete-browser-'));
  worker=fork('tests/browser-internal/document-deletion-server.mjs',[],{env:{...process.env,DATA_DIR:directory},stdio:['ignore','inherit','inherit','ipc']});
  const ready=await new Promise<{baseURL:string}>((resolve,reject)=>{worker.once('message',message=>resolve(message as {baseURL:string}));worker.once('error',reject);worker.once('exit',code=>reject(new Error(`Deletion fixture exited: ${code}`)));});baseURL=ready.baseURL;
  const context=()=>playwright.request.newContext({baseURL,extraHTTPHeaders:{'X-Requested-With':'SuperNet'}});
  admin=await context();expect((await admin.post('/api/v1/login',{data:{login:'admin',password}})).status()).toBe(200);
  for(const role of ['hr','boss'])expect((await admin.post('/api/v1/admin/users',{data:{username:`delete.${role}`,name:role,role,password}})).status()).toBe(201);
  hr=await context();boss=await context();
  expect((await hr.post('/api/v1/login',{data:{login:'delete.hr',password}})).status()).toBe(200);expect((await boss.post('/api/v1/login',{data:{login:'delete.boss',password}})).status()).toBe(200);
});
test.afterAll(async()=>{
  await Promise.all([admin?.dispose(),hr?.dispose(),boss?.dispose()]);
  if(worker?.exitCode===null){const exited=new Promise(resolve=>worker.once('exit',resolve));worker.kill('SIGTERM');await exited;}
  if(directory)rmSync(directory,{recursive:true,force:true});
});
async function candidate(two=false) {
  const response=await admin.post('/api/v1/candidates',{headers:{'Idempotency-Key':crypto.randomUUID()},multipart:{fullName:'Ứng viên xóa CV kiểm thử',email:`${crypto.randomUUID()}@example.com`,source:'Email',file:{name:'CV đúng.pdf',mimeType:'application/pdf',buffer:pdf}}});expect(response.status()).toBe(200);let c=(await response.json()).candidate;
  if(two){expect((await admin.post(`/api/v1/candidates/${c.id}/documents`,{headers:{'Idempotency-Key':crypto.randomUUID()},multipart:{file:{name:'CV tải nhầm.pdf',mimeType:'application/pdf',buffer:pdf}}})).status()).toBe(200);c=await(await admin.get(`/api/v1/candidates/${c.id}`)).json();}
  return c;
}
async function open(page:Page,id:string,session=admin) {
  await page.context().addCookies((await session.storageState()).cookies);await page.goto(`${baseURL}/?page=candidates&candidate=${id}`);
  await expect(page.getByRole('heading',{name:'Ứng viên xóa CV kiểm thử',exact:true})).toBeVisible();await page.locator('.detail-tabs button').nth(1).click();
}
test('Admin confirms deleting the wrong file, keeps other files, and sees a history entry',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const c=await candidate(true);await open(page,c.id);
  const wrong=page.locator('.document-card').filter({hasText:'CV tải nhầm.pdf'}),correct=page.locator('.document-card').filter({hasText:'CV đúng.pdf'});
  await wrong.getByRole('button',{name:'Xóa tài liệu CV tải nhầm.pdf',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText('CV tải nhầm.pdf');await expect(dialog).toContainText('không thể hoàn tác');
  await dialog.getByRole('button',{name:'Hủy',exact:true}).click();await expect(wrong).toBeVisible();await expect(page.locator('.document-card')).toHaveCount(2);
  await wrong.getByRole('button',{name:'Xóa tài liệu CV tải nhầm.pdf',exact:true}).click();await page.screenshot({path:test.info().outputPath('delete-confirmation.png'),fullPage:true,animations:'disabled'});
  await dialog.getByRole('button',{name:'Xác nhận xóa',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(wrong).toHaveCount(0);await expect(correct).toBeVisible();await expect(page.locator('.detail-tabs button').nth(1)).toContainText('(1)');
  const removed=c.documents.find((doc:{original_name:string})=>doc.original_name==='CV tải nhầm.pdf');expect((await admin.get(`/api/v1/documents/${removed.id}/download`)).status()).toBe(404);
  await page.locator('.detail-tabs button').nth(3).click();await expect(page.locator('.timeline')).toContainText('Xóa tài liệu');await page.reload();await page.locator('.detail-tabs button').nth(1).click();await expect(page.locator('.document-card')).toHaveCount(1);expect(errors).toEqual([]);
});
test('a stale confirmation stays open with an error; reloading allows HR to delete the last CV',async({page})=>{
  const c=await candidate();await open(page,c.id,hr);await page.getByRole('button',{name:'Xóa tài liệu CV đúng.pdf',exact:true}).click();const dialog=page.getByRole('dialog');
  expect((await admin.patch(`/api/v1/candidates/${c.id}`,{data:{notes:'Thông tin vừa được nhân sự khác cập nhật.',expectedRevision:c.revision}})).status()).toBe(200);
  await dialog.getByRole('button',{name:'Xác nhận xóa',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Hồ sơ đã thay đổi');await expect(page.locator('.document-card')).toHaveCount(1);
  await dialog.getByRole('button',{name:'Tải lại danh sách tài liệu',exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.getByRole('button',{name:'Xóa tài liệu CV đúng.pdf',exact:true}).click();await dialog.getByRole('button',{name:'Xác nhận xóa',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('heading',{name:'Chưa có tài liệu',exact:true})).toBeVisible();await expect(page.locator('.detail-tabs button').nth(1)).toContainText('(0)');
});
test('Boss can read documents and cannot see or call the delete action',async({page})=>{
  const c=await candidate();await open(page,c.id,boss);await expect(page.locator('.document-delete-button')).toHaveCount(0);await expect(page.getByRole('button',{name:'Xem CV',exact:true})).toBeVisible();
  expect((await boss.delete(`/api/v1/candidates/${c.id}/documents/${c.documents[0].id}`,{data:{expectedRevision:c.revision}})).status()).toBe(403);
});
test('document actions and confirmation fit mobile, tablet and desktop in Vietnamese and Chinese',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const c=await candidate(true);await open(page,c.id);
  for(const language of ['vi','zh-CN']){
    await page.getByLabel('Ngôn ngữ / 语言').selectOption(language);
    for(const width of [320,375,768,1440]){
      await page.setViewportSize({width,height:900});await expect(page.locator('.document-card')).toHaveCount(2);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
      await page.screenshot({path:test.info().outputPath(`documents-${language}-${width}.png`),fullPage:true,animations:'disabled'});
      await page.locator('.document-delete-button').first().click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBeTruthy();
      await expect(dialog.locator('.button.danger')).toBeInViewport();await page.screenshot({path:test.info().outputPath(`delete-dialog-${language}-${width}.png`),fullPage:true,animations:'disabled'});await dialog.locator('.button.secondary').click();
    }
  }expect(errors).toEqual([]);
});
