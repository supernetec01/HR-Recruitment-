import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const secret = process.env.SUPERNET_E2E_PASSWORD!;
let candidateId: string;
const future = new Date(Date.now() + 7 * 86400000); future.setUTCHours(3,0,0,0);
const day = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(future);

async function login(page: Page, login = 'admin') {
  await page.goto('/');
  await page.getByLabel('Tài khoản hoặc email').fill(login);
  await page.getByLabel(/^Mật khẩu(?: \*)?$/).fill(secret);
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await expect(page.locator('.sidebar-user')).toBeVisible();
}
test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({baseURL:'http://127.0.0.1:3110',extraHTTPHeaders:{'X-Requested-With':'SuperNet'}});
  expect((await api.post('/api/v1/login',{data:{login:'admin',password:secret}})).ok()).toBeTruthy();
  const users = await (await api.get('/api/v1/users')).json();
  for (const [username,name,role] of [['boss-flow','Sếp Nội Bộ','boss'],['hr-flow','HR Nội Bộ','hr']]) {
    if (!users.some((user: { username: string }) => user.username === username)) expect((await api.post('/api/v1/admin/users',{data:{username,name,role,password:secret}})).status()).toBe(201);
  }
  const job = await (await api.post('/api/v1/jobs',{headers:{'Idempotency-Key':crypto.randomUUID()},data:{title:'Marketing Nội Bộ',department:'Marketing',location:'Super Net',openings:1,description:'Sáng tạo nội dung thương mại điện tử tại Super Net.'}})).json();
  const candidates = await (await api.get('/api/v1/candidates')).json();
  const current = candidates.find((candidate: { phone: string }) => candidate.phone === '0908887766');
  if (current) { candidateId = current.id; await api.dispose(); return; }
  const result = await api.post('/api/v1/candidates',{headers:{'Idempotency-Key':crypto.randomUUID()},multipart:{fullName:'Ứng Viên Quy Trình',phone:'0908887766',source:'Email',jobId:job.id,consentStatus:'granted',consentEvidence:'Ứng viên xác nhận trong kiểm thử.',file:{name:'CV-internal.pdf',mimeType:'application/pdf',buffer:readFileSync('tests/fixtures/cv.pdf')}}});
  expect(result.ok()).toBeTruthy(); const {candidate} = await result.json(); candidateId = candidate.id;
  expect((await api.post(`/api/v1/documents/${candidate.documents[0].id}/review`,{data:{confirmed:true,evidence:'Đã kiểm tra an toàn bằng quy trình kiểm thử tài liệu.'}})).ok()).toBeTruthy();
  await api.dispose();
});

test('Admin logs in normally and creates an HR account through the management screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Đăng nhập',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Vào không gian demo'})).toHaveCount(0);
  await login(page);
  await page.locator('.main-nav').getByRole('button',{name:'Thành viên & phân quyền'}).click();
  await page.getByRole('button',{name:'Tạo tài khoản',exact:true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Họ và tên').fill('Nhân Sự UI');
  await dialog.getByLabel('Tên đăng nhập').fill('hr-ui');
  await dialog.getByLabel('Phân quyền').selectOption('hr');
  await dialog.getByLabel(/^Mật khẩu(?: \*)?$/).fill(secret);
  await dialog.getByRole('button',{name:'Tạo tài khoản',exact:true}).click();
  await expect(page.locator('.members-table').getByText('hr-ui',{exact:true})).toBeVisible();
  await page.screenshot({path:test.info().outputPath('accounts.png'),fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();
  await login(page,'hr-ui');
  await expect(page.locator('.sidebar-user')).toContainText('Nhân Sự UI');
  await page.locator('.main-nav').getByRole('button',{name:'Tài khoản',exact:true}).click();
  await expect(page.getByRole('button',{name:'Tạo tài khoản',exact:true})).toHaveCount(0);
});

test('Boss selects a CV; a separate HR session receives it, picks duration and sees the booking on the dashboard', async ({ page, browser }) => {
  const errors: string[] = []; page.on('pageerror',error => errors.push(error.message));
  await login(page,'boss-flow');
  await page.goto(`/?page=candidates&candidate=${candidateId}`);
  await page.getByRole('button',{name:'CV & tài liệu (1)',exact:true}).click();
  await page.getByRole('button',{name:'Xem CV',exact:true}).click();
  await expect(page.getByRole('dialog').getByTestId('cv-canvas')).toBeVisible();
  await page.getByLabel('Đóng',{exact:true}).click();
  await page.locator('.detail-tabs').getByRole('button',{name:'Tổng quan',exact:true}).click();
  await page.getByRole('button',{name:'Hẹn phỏng vấn',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Thông tin gửi HR').fill('CV phù hợp. Nhờ HR liên hệ hẹn phỏng vấn vòng một.');
  await page.getByRole('button',{name:'Chuyển yêu cầu cho HR'}).click();
  await expect(page.locator('.application-card')).toContainText('Hẹn phỏng vấn');
  await expect(page.getByRole('button',{name:'Chỉnh sửa',exact:true})).toHaveCount(0);
  const hrContext = await browser.newContext({timezoneId:'Asia/Bangkok'}), hr = await hrContext.newPage();
  await login(hr,'hr-flow');
  const request = hr.getByTestId('interview-request').filter({hasText:'Ứng Viên Quy Trình'});
  await expect(request).toContainText('Sếp Nội Bộ');
  await expect(request).toContainText('CV phù hợp.');
  await request.getByRole('button',{name:'Liên hệ & xếp lịch'}).click();
  const dialog = hr.getByRole('dialog');
  await dialog.getByLabel('Ngày phỏng vấn').fill(day);
  await dialog.getByLabel('Giờ bắt đầu (UTC+7)').fill('10:00');
  await dialog.getByLabel('Thời lượng phỏng vấn').selectOption('90');
  await expect(dialog.locator('.end-time-preview')).toContainText('11:30');
  await dialog.getByLabel('Địa điểm / Liên kết họp').fill('Phòng họp Super Net');
  await dialog.getByRole('button',{name:'Lưu lịch phỏng vấn',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await hr.getByLabel('Ngày xem lịch phỏng vấn').fill(day);
  const row = hr.getByTestId('schedule-row').filter({hasText:'Ứng Viên Quy Trình'});
  await expect(row).toContainText('10:00 – 11:30');
  await expect(row).toContainText('90 phút');
  await expect(row).toContainText('Sếp Nội Bộ');
  await row.getByRole('button',{name:'Đổi lịch',exact:true}).click();
  await dialog.getByLabel('Thời lượng phỏng vấn').selectOption('60');
  await dialog.getByLabel('Lý do đổi lịch').fill('Điều chỉnh thời lượng theo xác nhận của ứng viên.');
  await dialog.getByRole('button',{name:'Lưu lịch phỏng vấn',exact:true}).click();
  await expect(row).toContainText('10:00 – 11:00');
  await expect(row).toContainText('60 phút');
  await hr.screenshot({path:test.info().outputPath('hr-dashboard.png'),fullPage:true,animations:'disabled'});
  await page.goto('/?page=overview');
  await page.getByLabel('Ngày xem lịch phỏng vấn').fill(day);
  await expect(page.getByTestId('schedule-row')).toContainText('60 phút');
  await expect(page.getByRole('button',{name:'Đổi lịch',exact:true})).toHaveCount(0);
  expect(errors).toEqual([]);
  await hrContext.close();
});

test('normal mobile login and internal schedule fit the viewport with the Super Net palette', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await login(page,'hr-flow');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button',{name:'Mở menu',exact:true}).click();
  await expect(page.locator('.sidebar .brand-symbol')).toHaveJSProperty('complete',true);
  await page.locator('.main-nav').getByRole('button',{name:'Lịch phỏng vấn',exact:true}).click();
  await page.getByLabel('Ngày xem lịch phỏng vấn').fill(day);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({path:test.info().outputPath('hr-mobile.png'),fullPage:true,animations:'disabled'});
  await expect(page.getByRole('button',{name:'Đặt lịch phỏng vấn',exact:true})).toHaveCSS('background-color','rgb(8, 122, 165)');
});
