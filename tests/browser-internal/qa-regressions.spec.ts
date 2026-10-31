import {expect,test,type APIRequestContext,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';

const secret=process.env.SUPERNET_E2E_PASSWORD!;
let admin:APIRequestContext,hrA:APIRequestContext,hrB:APIRequestContext;
test.beforeAll(async({playwright})=>{
  const context=()=>playwright.request.newContext({baseURL:'http://127.0.0.1:3110',extraHTTPHeaders:{'X-Requested-With':'SuperNet'}});
  admin=await context();
  expect((await admin.post('/api/v1/login',{data:{login:'admin',password:secret}})).status()).toBe(200);
  const users=await (await admin.get('/api/v1/users')).json();
  for(const username of ['qa-hr-a','qa-hr-b'])if(!users.some((user:{username:string})=>user.username===username))expect((await admin.post('/api/v1/admin/users',{data:{username,name:username,role:'hr',password:secret}})).status()).toBe(201);
  hrA=await context();hrB=await context();
  expect((await hrA.post('/api/v1/login',{data:{login:'qa-hr-a',password:secret}})).status()).toBe(200);
  expect((await hrB.post('/api/v1/login',{data:{login:'qa-hr-b',password:secret}})).status()).toBe(200);
});
test.afterAll(async()=>{await Promise.all([admin?.dispose(),hrA?.dispose(),hrB?.dispose()]);});
async function authenticate(page:Page,account:APIRequestContext=admin){await page.context().addCookies((await account.storageState()).cookies);}

test('Two HR editors keep the first saved note and preserve the second draft on conflict',async({browser})=>{
  const created=await admin.post('/api/v1/candidates',{headers:{'Idempotency-Key':crypto.randomUUID()},multipart:{fullName:'Candidate for concurrent HR editing',source:'Email',notes:'Original note'}});
  expect(created.status()).toBe(200);const id=(await created.json()).candidate.id;
  const a=await browser.newContext(),b=await browser.newContext();
  try{
    const first=await a.newPage(),second=await b.newPage();
    await authenticate(first,hrA);await authenticate(second,hrB);
    for(const page of [first,second]){
      await page.goto(`http://127.0.0.1:3110/?page=candidates&candidate=${id}`);
      await page.getByRole('button',{name:'Chỉnh sửa',exact:true}).click();
    }
    await first.getByLabel('Ghi chú nội bộ',{exact:true}).fill('Saved by HR A');
    await second.getByLabel('Ghi chú nội bộ',{exact:true}).fill('Unsaved draft from HR B');
    const saved=first.waitForResponse(r=>r.url().endsWith(`/candidates/${id}`)&&r.request().method()==='PATCH');
    await first.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();expect((await saved).status()).toBe(200);
    const rejected=second.waitForResponse(r=>r.url().endsWith(`/candidates/${id}`)&&r.request().method()==='PATCH');
    await second.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();expect((await rejected).status()).toBe(409);
    await expect(second.getByRole('alert')).toContainText('Hồ sơ đã được người khác cập nhật');
    await expect(second.getByLabel('Ghi chú nội bộ',{exact:true})).toHaveValue('Unsaved draft from HR B');
    expect((await (await admin.get(`/api/v1/candidates/${id}`)).json()).notes).toBe('Saved by HR A');
    const opened=b.waitForEvent('page');
    await second.getByRole('link',{name:'Xem hồ sơ mới trong tab khác để đối chiếu'}).click();
    const current=await opened;await expect(current.locator('.note-section .preserve-lines')).toContainText('Saved by HR A');
    await expect(second.getByLabel('Ghi chú nội bộ',{exact:true})).toHaveValue('Unsaved draft from HR B');
  }finally{await a.close();await b.close();}
});

test('A lost JD creation response can be retried from the form without publishing a duplicate',async({page})=>{
  await authenticate(page);await page.goto('/?page=jobs');
  await page.getByRole('button',{name:'Tạo JD tuyển dụng',exact:true}).click();
  const dialog=page.getByRole('dialog'),title=`Retry JD ${crypto.randomUUID()}`;
  await dialog.getByLabel(/^Tên vị trí/).fill(title);await dialog.getByLabel(/^Bộ phận/).fill('QA');
  await dialog.getByLabel(/^Địa điểm làm việc/).fill('Super Net test office');
  await dialog.getByLabel(/^Mô tả công việc/).fill('A synthetic JD used to test safe retries after a lost response.');
  const keys:string[]=[];let originalId='';
  await page.route('**/api/v1/jobs',async route=>{
    if(route.request().method()!=='POST'){await route.continue();return;}
    keys.push(route.request().headers()['idempotency-key']);
    if(keys.length===1){const saved=await route.fetch();expect(saved.status()).toBe(201);originalId=(await saved.json()).id;await route.abort('failed');}
    else await route.continue();
  });
  await dialog.getByRole('button',{name:'Lưu & đăng JD',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Không thể kết nối');
  await expect(dialog.getByLabel(/^Tên vị trí/)).toHaveValue(title);
  const retry=page.waitForResponse(r=>r.url().endsWith('/jobs')&&r.request().method()==='POST');
  await dialog.getByRole('button',{name:'Lưu & đăng JD',exact:true}).click();
  const result=await retry;expect(result.status()).toBe(201);expect((await result.json()).id).toBe(originalId);
  expect(keys).toHaveLength(2);expect(keys[0]).toBeTruthy();expect(keys[1]).toBe(keys[0]);
  const jobs=await (await admin.get('/api/v1/jobs')).json();expect(jobs.filter((job:{title:string})=>job.title===title)).toHaveLength(1);
  await expect(dialog).not.toBeVisible();
});

test('An invalid replacement CV blocks submission and helper text remains readable on a phone',async({page})=>{
  await page.setViewportSize({width:390,height:844});await authenticate(page);await page.goto('/?page=candidates');
  await page.getByRole('button',{name:'Thêm ứng viên',exact:true}).click();const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Họ và tên',{exact:true}).fill('CV replacement QA');
  await expect(dialog.getByLabel(/^Ngày nhận hồ sơ/)).toHaveAccessibleDescription('Ngày công ty thực tế nhận CV');
  const hint=dialog.getByText('Ngày công ty thực tế nhận CV',{exact:true});
  const metrics=await hint.evaluate(element=>{
    const style=getComputedStyle(element);let current:Element|null=element,background='';
    while(current){const value=getComputedStyle(current).backgroundColor;if(value!=='rgba(0, 0, 0, 0)'&&value!=='transparent'){background=value;break;}current=current.parentElement;}
    const luminance=(color:string)=>{const values=(color.match(/[\d.]+/g)||[]).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722;};
    const foreground=luminance(style.color),back=luminance(background||'rgb(255,255,255)');
    return {font:parseFloat(style.fontSize),contrast:(Math.max(foreground,back)+.05)/(Math.min(foreground,back)+.05)};
  });
  expect(metrics.font).toBeGreaterThanOrEqual(12);expect(metrics.contrast).toBeGreaterThanOrEqual(4.5);
  const input=dialog.getByLabel('Tải CV',{exact:true}),pdf=readFileSync('tests/fixtures/cv.pdf');
  await input.setInputFiles({name:'ORIGINAL-CV.pdf',mimeType:'application/pdf',buffer:pdf});
  await input.setInputFiles({name:'EMPTY-CV.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(0)});
  await expect(dialog.getByText('ORIGINAL-CV.pdf',{exact:true})).toHaveCount(0);
  await expect(input).toHaveAccessibleDescription('Chọn tệp không rỗng, tối đa 10 MB.');
  expect(await input.evaluate(element=>(element as HTMLInputElement).checkValidity())).toBe(false);
  let submits=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/candidates'))submits++;});
  await dialog.getByRole('button',{name:'Lưu hồ sơ',exact:true}).click();expect(submits).toBe(0);
  await input.setInputFiles({name:'NEW-CV.pdf',mimeType:'application/pdf',buffer:pdf});
  const response=page.waitForResponse(r=>r.url().endsWith('/candidates')&&r.request().method()==='POST');
  await dialog.getByRole('button',{name:'Lưu hồ sơ',exact:true}).click();const saved=await response;
  expect(saved.status()).toBe(200);expect((await saved.json()).candidate.documents[0].original_name).toBe('NEW-CV.pdf');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
