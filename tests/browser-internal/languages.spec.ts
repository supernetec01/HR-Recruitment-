import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
const secret = process.env.SUPERNET_E2E_PASSWORD!;
let admin: APIRequestContext, candidateId: string, wordCandidateId: string, jobId: string;
async function login(page: Page, chinese = false) {
  await page.goto('/');
  if (chinese) await page.getByLabel('Ngôn ngữ / 语言').selectOption('zh-CN');
  await page.getByLabel(chinese ? '账号或电子邮箱' : 'Tài khoản hoặc email').fill('admin');
  await page.getByLabel(chinese ? /^密码(?: \*)?$/ : /^Mật khẩu(?: \*)?$/).fill(secret);
  await page.getByRole('button',{name:chinese ? '登录' : 'Đăng nhập',exact:true}).click();
  await expect(page.locator('.sidebar-user')).toBeVisible();
}
test.beforeAll(async ({playwright}) => {
  admin = await playwright.request.newContext({baseURL:'http://127.0.0.1:3110',extraHTTPHeaders:{'X-Requested-With':'SuperNet'}});
  expect((await admin.post('/api/v1/login',{data:{login:'admin',password:secret}})).ok()).toBeTruthy();
  const job = await admin.post('/api/v1/jobs',{data:{title:'Job for Chinese translation',department:'Marketing',location:'Super Net fixture',description:'Create marketing content and work with the marketing team.',openings:1,applicationEmail:'jobs@example.com'}});
  jobId = (await job.json()).id;
  const word = zipSync({'[Content_Types].xml':strToU8('<Types/>'),'word/document.xml':strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX VIEWER FIXTURE</w:t></w:r></w:p><w:p><w:r><w:t>Experience: Marketing &amp; Content</w:t></w:r></w:p><w:p><w:r><w:t>&lt;script&gt;window.cvInjected=true&lt;/script&gt;</w:t></w:r></w:p></w:body></w:document>')});
  for (const [name,bytes,filename] of [['Canvas CV fixture',readFileSync('tests/fixtures/cv.pdf'),'CV.pdf'],['Word CV fixture',word,'CV.docx']] as const) {
    const result = await admin.post('/api/v1/candidates',{headers:{'Idempotency-Key':crypto.randomUUID()},multipart:{fullName:name,email:`${crypto.randomUUID()}@example.com`,source:'Email',jobId,file:{name:filename,mimeType:filename.endsWith('pdf')?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from(bytes)}}});
    expect(result.status()).toBe(200);
    if (filename.endsWith('pdf')) candidateId = (await result.json()).candidate.id;
    else wordCandidateId = (await result.json()).candidate.id;
  }
});
test.afterAll(async () => {await admin?.dispose();});

test('Chinese interface persists across login/reload and keeps original form values when creating a JD',async ({page}) => {
  await login(page,true);
  await expect(page.locator('.main-nav').getByRole('button',{name:/候选人管理/})).toBeVisible();
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
  await page.locator('.main-nav').getByRole('button',{name:'招聘岗位',exact:true}).click();
  await page.getByRole('button',{name:'新建招聘岗位说明',exact:true}).click();
  const form = page.getByRole('dialog');
  await form.getByLabel(/^岗位名称/).fill('Original English JD title');
  await form.getByLabel(/^部门/).fill('Marketing');
  await form.getByLabel(/^工作地点/).fill('Original address');
  await form.getByLabel('工作形式',{exact:true}).selectOption('Toàn thời gian');
  await form.getByLabel(/^工作职责/).fill('Original work description with enough detail for the test.');
  const response = page.waitForResponse(response=>response.url().endsWith('/api/v1/jobs')&&response.request().method()==='POST');
  await form.getByRole('button',{name:'保存并发布岗位说明',exact:true}).click();
  const saved = await response; expect(saved.status()).toBe(201);
  const {job} = await saved.json(); expect(job.title).toBe('Original English JD title'); expect(job.employment_type).toBe('Toàn thời gian');
  await page.getByLabel('Ngôn ngữ / 语言').selectOption('vi');
  await expect(page.getByRole('heading',{name:'Vị trí tuyển dụng & JD',exact:true})).toBeVisible();
});

test('A newly uploaded PDF is rendered on canvas without manual review or the browser PDF plugin',async ({page}) => {
  const errors: string[] = [];page.on('pageerror',error=>errors.push(error.message));
  await login(page);
  await page.goto(`/?page=candidates&candidate=${candidateId}`);
  await page.getByRole('button',{name:'CV & tài liệu (1)',exact:true}).click();
  await page.getByRole('button',{name:'Xem CV',exact:true}).click();
  const canvas = page.getByTestId('cv-canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(()=>canvas.evaluate(element=>{
    const node=element as HTMLCanvasElement, data=node.getContext('2d')!.getImageData(0,0,node.width,node.height).data;
    let dark=0;for(let index=0;index<data.length;index+=4)if(data[index+3]>200&&data[index]<150&&data[index+1]<150&&data[index+2]<150)dark++;return dark;
  })).toBeGreaterThan(20);
  await expect(page.getByRole('dialog').locator('iframe,object,embed')).toHaveCount(0);
  await page.screenshot({path:test.info().outputPath('cv-viewer.png'),animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button',{name:'Phóng to CV',exact:true}).click();
  await expect(page.locator('.cv-toolbar')).toContainText('120%');
  const profile=await (await admin.get(`/api/v1/candidates/${candidateId}`)).json();expect(profile.documents[0].review_status).toBe('quarantined');
  expect(errors).toEqual([]);
});

test('DOCX opens as readable content, preserves literal markup and does not execute it',async ({page}) => {
  await login(page);
  await page.goto(`/?page=candidates&candidate=${wordCandidateId}`);
  await page.getByRole('button',{name:'CV & tài liệu (1)',exact:true}).click();
  await page.getByRole('button',{name:'Xem CV',exact:true}).click();
  await expect(page.locator('.cv-text')).toContainText('DOCX VIEWER FIXTURE');
  await expect(page.locator('.cv-text')).toContainText('Marketing & Content');
  await expect(page.locator('.cv-text')).toContainText('<script>window.cvInjected=true</script>');
  expect(await page.evaluate(()=>('cvInjected' in window))).toBe(false);
});

test('CV translation uses the API on request, displays Chinese separately and reuses the saved copy',async ({page}) => {
  await login(page);
  await page.goto(`/?page=candidates&candidate=${candidateId}`);
  await page.getByRole('button',{name:'CV & tài liệu (1)',exact:true}).click();
  let generated=0;page.on('request',request=>{if(request.url().endsWith('/translations')&&request.method()==='POST')generated++;});
  await page.getByRole('button',{name:'Dịch CV 中文',exact:true}).click();
  const form=page.getByRole('dialog');
  await form.getByRole('button',{name:'Dịch CV',exact:true}).click();
  await expect(form.locator('.translated-document')).toContainText('候选人简历');expect(generated).toBe(1);
  await form.getByRole('tab',{name:'CV gốc',exact:true}).click();
  await expect(form.getByTestId('cv-canvas')).toBeVisible();
  await page.getByLabel('Đóng',{exact:true}).click();
  await page.getByRole('button',{name:'Dịch CV 中文',exact:true}).click();
  await expect(page.locator('.translated-document')).toContainText('候选人简历');expect(generated).toBe(1);
});

test('HR/Admin publish a Chinese JD and anonymous visitors can read it with translated page controls',async ({page,browser}) => {
  await login(page);
  await page.locator('.main-nav').getByRole('button',{name:'Vị trí tuyển dụng',exact:true}).click();
  const card=page.locator('.job-card').filter({has:page.locator(`a[href="/tuyen-dung/${jobId}"]`)});
  await card.getByRole('button',{name:'Dịch JD 中文',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Dịch & lưu bản tiếng Trung',exact:true}).click();
  await expect(page.getByRole('dialog').locator('.translated-document')).toContainText('内容营销专员（测试）');
  const context=await browser.newContext({baseURL:'http://127.0.0.1:3110',viewport:{width:390,height:844}}),applicant=await context.newPage();
  await applicant.goto(`/tuyen-dung/${jobId}?lang=zh-CN`);
  await expect(applicant.getByRole('heading',{name:'内容营销专员（测试）',exact:true})).toBeVisible();
  await expect(applicant.getByRole('heading',{name:'工作职责',exact:true})).toBeVisible();
  await expect(applicant.locator('.jd-content')).toContainText('负责内容策划和制作。');
  await expect(applicant.locator('.public-jd-heading').getByRole('link',{name:'立即申请',exact:true})).toBeVisible();
  expect(await applicant.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await applicant.screenshot({path:test.info().outputPath('chinese-jd-mobile.png'),fullPage:true,animations:'disabled'});
  await context.close();
});

test('An unconfigured translation service shows a clear message while original CV viewing remains available',async ({page}) => {
  await login(page);
  await page.route('**/api/v1/translation/status',route=>route.fulfill({json:{configured:false,provider:'OpenAI',model:'gpt-4.1-mini'}}));
  await page.goto(`/?page=candidates&candidate=${wordCandidateId}`);
  await page.getByRole('button',{name:'CV & tài liệu (1)',exact:true}).click();
  await page.getByRole('button',{name:'Dịch CV 中文',exact:true}).click();
  const form=page.getByRole('dialog');
  await expect(form.getByRole('status')).toContainText('Chức năng dịch chưa được bật');
  await expect(form.getByRole('button',{name:'Dịch CV',exact:true})).toBeDisabled();
  await form.getByRole('tab',{name:'CV gốc',exact:true}).click();
  await expect(form.locator('.cv-text')).toContainText('DOCX VIEWER FIXTURE');
});

test('Admin saves and replaces an API key without revealing it, tests the connection and sees a 30-day reminder',async ({page})=>{
  await login(page);
  await page.locator('.main-nav').getByRole('button',{name:'Thành viên & phân quyền',exact:true}).click();
  const section=page.locator('.translation-settings'),field=section.getByLabel('Khóa API OpenAI mới');
  await expect(field).toHaveValue('');
  await expect(section.getByLabel('Nhắc cập nhật sau (ngày)')).toHaveValue('30');
  for(let attempt=0;attempt<2;attempt++){
    const key=`sk-test-${crypto.randomUUID()}${crypto.randomUUID()}`;
    await field.fill(key);
    const response=page.waitForResponse(response=>response.url().endsWith('/api/v1/admin/translation-settings')&&response.request().method()==='PUT');
    await section.getByRole('button',{name:'Lưu cấu hình API',exact:true}).click();
    const saved=await response;expect(saved.status()).toBe(200);
    const body=await saved.json();expect(JSON.stringify(body)).not.toContain(key);
    expect(+new Date(body.settings.nextReminderAt)-+new Date(body.settings.keyUpdatedAt)).toBe(30*86400000);
    await expect(field).toHaveValue('');
    await section.getByRole('button',{name:'Kiểm tra kết nối API',exact:true}).click();
    await expect(section).toContainText('Kết nối API thành công.');
    await expect(section).toContainText('Lần kiểm tra gần nhất: Thành công');
  }
  await page.reload();
  await expect(field).toHaveValue('');
  await expect(section).toContainText('Đã lưu khóa API');
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({path:test.info().outputPath('admin-api-settings.png'),fullPage:true,animations:'disabled'});
  await page.getByLabel('Ngôn ngữ / 语言').selectOption('zh-CN');
  await expect(section.getByLabel('新的 OpenAI API 密钥')).toHaveValue('');
  await expect(section.getByRole('button',{name:'检查 API 连接',exact:true})).toBeVisible();
});

test('The Vite frontend cannot expose private API settings or encryption keys as static files',async({request})=>{
  const dataRoot=resolve('.data');mkdirSync(dataRoot,{recursive:true});
  const directory=mkdtempSync(join(dataRoot,'e2e-private-'));
  const marker=`PRIVATE-FIXTURE-${crypto.randomUUID()}`;
  try{
    for(const name of ['translation-settings.json','.translation-master-key']){
      writeFileSync(join(directory,name),marker,{mode:0o600});
      for(const path of [`/.data/${basename(directory)}/${name}`,`/@fs/${join(directory,name).replace(/\\/g,'/')}`]){
        const response=await request.get(`http://127.0.0.1:3120${path}`);
        expect(response.status()).toBe(403);expect(await response.text()).not.toContain(marker);
      }
    }
  }finally{rmSync(directory,{recursive:true,force:true});}
});
