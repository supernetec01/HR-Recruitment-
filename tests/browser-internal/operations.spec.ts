import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { CONTENT_MARKETING_JD } from '../../src/jd-template';

const secret = process.env.SUPERNET_E2E_PASSWORD!;
let admin: APIRequestContext, candidateId: string, interviewerTwoId: string;
const future = new Date(Date.now() + 9 * 86400000); future.setUTCHours(2,0,0,0);
const day = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(future);
async function login(page: Page, username: string) {
  await page.goto('/');
  await page.getByLabel('Tài khoản hoặc email').fill(username);
  await page.getByLabel(/^Mật khẩu(?: \*)?$/).fill(secret);
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await expect(page.locator('.sidebar-user')).toBeVisible();
}
test.beforeAll(async ({playwright}) => {
  admin = await playwright.request.newContext({baseURL:'http://127.0.0.1:3110',extraHTTPHeaders:{'X-Requested-With':'SuperNet'}});
  expect((await admin.post('/api/v1/login',{data:{login:'admin',password:secret}})).ok()).toBeTruthy();
  const members = await (await admin.get('/api/v1/users')).json();
  for (const [username,name,role] of [['hr-ops','HR vận hành','hr'],['interviewer-ops','Phỏng vấn viên Một','interviewer'],['interviewer-ops-two','Phỏng vấn viên Hai','interviewer']]) {
    let member = members.find((member: {username: string}) => member.username === username);
    if (!member) {
      const result = await admin.post('/api/v1/admin/users',{data:{username,name,role,password:secret}});
      expect(result.status()).toBe(201); member = (await result.json()).user;
    }
    if (username === 'interviewer-ops-two') interviewerTwoId = member.id;
  }
  const job = await (await admin.post('/api/v1/jobs',{headers:{'Idempotency-Key':crypto.randomUUID()},data:{title:'Vị trí vận hành phỏng vấn',department:'Marketing',location:'Super Net',description:'Kiểm thử luồng từ yêu cầu đến lịch phỏng vấn.',openings:1}})).json();
  const result = await admin.post('/api/v1/candidates',{headers:{'Idempotency-Key':crypto.randomUUID()},multipart:{fullName:'Ứng viên đã trao đổi lịch',email:`interview-ops-${crypto.randomUUID()}@example.com`,source:'Zalo',jobId:job.id,file:{name:'CV-vận-hành.pdf',mimeType:'application/pdf',buffer:Buffer.concat([Buffer.from('\n'),readFileSync('tests/fixtures/cv.pdf')])}}});
  expect(result.status()).toBe(200); candidateId = (await result.json()).candidate.id;
});
test.afterAll(async () => { await admin?.dispose(); });

test('Interviewer selects a pending CV and another interviewer; HR records contact and schedules without altering consent', async ({page,browser}) => {
  const errors: string[] = []; page.on('pageerror',error => errors.push(error.message));
  await login(page,'interviewer-ops');
  await page.goto(`/?page=candidates&candidate=${candidateId}`);
  await expect(page.getByRole('button',{name:'Chỉnh sửa',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Hẹn phỏng vấn',exact:true}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('CV ứng viên')).not.toHaveValue('');
  await expect(dialog.getByRole('button',{name:'Chuyển yêu cầu cho HR'})).toBeEnabled();
  await dialog.getByLabel('Người phỏng vấn đề xuất').selectOption(interviewerTwoId);
  await dialog.getByLabel('Thông tin gửi HR').fill('CV phù hợp. Đề xuất trao đổi cùng người phụ trách chuyên môn.');
  await page.screenshot({path:test.info().outputPath('interview-request.png'),fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(dialog.getByRole('button',{name:'Chuyển yêu cầu cho HR'})).toBeVisible();
  await page.setViewportSize({width:1440,height:1000});
  await dialog.getByRole('button',{name:'Chuyển yêu cầu cho HR'}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.application-card')).toContainText('Hẹn phỏng vấn');
  const context = await browser.newContext({baseURL:'http://127.0.0.1:3110',timezoneId:'Asia/Bangkok'}), hr = await context.newPage();
  await login(hr,'hr-ops');
  const request = hr.getByTestId('interview-request').filter({hasText:'Ứng viên đã trao đổi lịch'});
  await expect(request).toContainText('Phỏng vấn viên Hai');
  await request.getByRole('button',{name:'Liên hệ & xếp lịch'}).click();
  const form = hr.getByRole('dialog');
  await expect(form.getByLabel(/^Người phỏng vấn(?: \*)?$/)).toHaveValue(interviewerTwoId);
  await form.getByLabel('Ngày phỏng vấn').fill(day);
  await form.getByLabel('Giờ bắt đầu (UTC+7)').fill('09:00');
  await form.getByLabel('Thời lượng phỏng vấn').selectOption('60');
  await form.getByLabel('Địa điểm / Liên kết họp').fill('Phòng họp kiểm thử');
  await form.getByLabel('Nội dung đã trao đổi').fill('Đã trao đổi qua điện thoại và thống nhất ngày giờ phỏng vấn với ứng viên.');
  await form.getByRole('checkbox',{name:'Đã liên hệ ứng viên và thống nhất việc hẹn phỏng vấn.'}).check();
  await hr.screenshot({path:test.info().outputPath('contact-scheduling.png'),fullPage:true,animations:'disabled'});
  await form.getByRole('button',{name:'Lưu lịch phỏng vấn',exact:true}).click();
  await expect(form).toHaveCount(0);
  await hr.getByLabel('Ngày xem lịch phỏng vấn').fill(day);
  const row = hr.getByTestId('schedule-row').filter({hasText:'Ứng viên đã trao đổi lịch'});
  await expect(row).toContainText('09:00 – 10:00'); await expect(row).toContainText('Phỏng vấn viên Hai');
  const profile = await (await admin.get(`/api/v1/candidates/${candidateId}`)).json();
  expect(profile.consent_status).toBe('pending'); expect(profile.consent_at).toBeNull();
  expect(profile.interviews[0].contact_evidence).toContain('Đã trao đổi qua điện thoại');
  expect(errors).toEqual([]); await context.close();
});

test('Account permission details appear only to Admin, who can create an Interviewer account', async ({page}) => {
  for (const username of ['hr-ops','interviewer-ops']) {
    await login(page,username);
    await page.locator('.main-nav').getByRole('button',{name:'Tài khoản',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Tài khoản cá nhân',exact:true})).toBeVisible();
    await expect(page.locator('.role-matrix')).toHaveCount(0);
    await expect(page.locator('.members-panel')).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Đổi mật khẩu',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();
  }
  await login(page,'admin');
  await page.locator('.main-nav').getByRole('button',{name:'Thành viên & phân quyền'}).click();
  await expect(page.locator('.role-matrix').getByRole('columnheader',{name:'Người phỏng vấn',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Tạo tài khoản',exact:true}).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Họ và tên').fill('Phỏng vấn viên tạo từ giao diện');
  await form.getByLabel('Tên đăng nhập').fill('interviewer-created-ui');
  await form.getByLabel('Phân quyền').selectOption('interviewer');
  await form.getByLabel(/^Mật khẩu(?: \*)?$/).fill(secret);
  await form.getByRole('button',{name:'Tạo tài khoản',exact:true}).click();
  await expect(page.locator('.members-table').getByText('interviewer-created-ui',{exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('The supplied Content Marketing JD can be entered, previewed, saved and read in full publicly', async ({page,browser}) => {
  await login(page,'hr-ops');
  await page.locator('.main-nav').getByRole('button',{name:'Vị trí tuyển dụng',exact:true}).click();
  await page.getByRole('button',{name:'Tạo JD tuyển dụng',exact:true}).click();
  const form = page.getByRole('dialog');
  await form.getByRole('button',{name:'Điền mẫu Content Marketing'}).click();
  await expect(form.getByLabel('Tên công ty',{exact:true})).toHaveValue(CONTENT_MARKETING_JD.companyName);
  await expect(form.getByLabel('Địa điểm làm việc')).toHaveValue(CONTENT_MARKETING_JD.location);
  await expect(form.getByLabel('Thời gian làm việc',{exact:true})).toHaveValue(CONTENT_MARKETING_JD.workingHours);
  await expect(form.getByLabel('Tiêu đề email ứng tuyển')).toHaveValue(CONTENT_MARKETING_JD.applicationEmailSubject);
  await expect(form.getByLabel('Email nhận CV')).toHaveValue(CONTENT_MARKETING_JD.applicationEmail);
  await expect(form.getByLabel('Số Zalo liên hệ')).toHaveValue(CONTENT_MARKETING_JD.applicationZalo);
  await form.getByRole('tab',{name:'Xem trước JD'}).click();
  await expect(form.locator('.jd-editor-preview')).toContainText(CONTENT_MARKETING_JD.salaryRange);
  await expect(form.locator('.jd-bullets').first().getByRole('listitem')).toHaveCount(8);
  await form.getByRole('tab',{name:'Nhập thông tin'}).click();
  await expect(form.getByLabel('Email nhận CV')).toHaveValue(CONTENT_MARKETING_JD.applicationEmail);
  await form.getByLabel('Hướng dẫn ứng tuyển').fill('Vui lòng gửi CV theo tiêu đề email bên dưới hoặc nộp trực tiếp trên website.');
  await expect(form.getByRole('heading',{name:'Tạo JD tuyển dụng',exact:true})).toBeInViewport();
  await expect(form.getByRole('button',{name:'Lưu & đăng JD',exact:true})).toBeInViewport();
  await page.screenshot({path:test.info().outputPath('full-jd-editor.png'),fullPage:true,animations:'disabled'});
  await form.getByRole('tab',{name:'Xem trước JD'}).click();
  const response = page.waitForResponse(response => response.url().endsWith('/api/v1/jobs') && response.request().method() === 'POST');
  await form.getByRole('button',{name:'Lưu & đăng JD',exact:true}).click();
  const {id} = await (await response).json(); await expect(form).toHaveCount(0);
  const context = await browser.newContext({baseURL:'http://127.0.0.1:3110',viewport:{width:1440,height:1000}}), applicant = await context.newPage();
  await applicant.goto(`/tuyen-dung/${id}`);
  await expect(applicant.getByRole('heading',{name:CONTENT_MARKETING_JD.title,exact:true})).toBeVisible();
  for (const text of [CONTENT_MARKETING_JD.companyName,CONTENT_MARKETING_JD.location,CONTENT_MARKETING_JD.workingHours,CONTENT_MARKETING_JD.salaryRange,CONTENT_MARKETING_JD.applicationEmailSubject,'Tham gia đầy đủ BHXH – BHYT – BHTN theo quy định.']) await expect(applicant.locator('.jd-content')).toContainText(text);
  await expect(applicant.locator('.jd-application-contacts').getByRole('link',{name:CONTENT_MARKETING_JD.applicationEmail})).toHaveAttribute('href',`mailto:${CONTENT_MARKETING_JD.applicationEmail}?subject=${encodeURIComponent(CONTENT_MARKETING_JD.applicationEmailSubject)}`);
  await expect(applicant.locator('.jd-application-contacts').getByRole('link',{name:CONTENT_MARKETING_JD.applicationZalo})).toHaveAttribute('href','https://zalo.me/0946741559');
  await applicant.screenshot({path:test.info().outputPath('full-job-description.png'),fullPage:true,animations:'disabled'});
  await applicant.setViewportSize({width:390,height:844});
  expect(await applicant.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(applicant.locator('.public-jd-heading').getByRole('link',{name:'Ứng tuyển ngay',exact:true})).toBeVisible();
  await applicant.screenshot({path:test.info().outputPath('full-job-mobile.png'),fullPage:true,animations:'disabled'});
  await context.close();
});
