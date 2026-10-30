import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const secret = process.env.SUPERNET_E2E_PASSWORD!;
let admin: APIRequestContext;
const description = 'Lên kế hoạch nội dung cho ngành hàng phụ kiện xe Safestraps.\nPhối hợp với đội ngũ thiết kế và vận hành để thực hiện nội dung trên các kênh thương mại điện tử.';
const requirements = 'Có kinh nghiệm viết nội dung và tinh thần chủ động.\nBiết sắp xếp công việc và phối hợp trong đội nhóm.';
const benefits = 'Thu nhập trao đổi theo kinh nghiệm.\nĐược hướng dẫn về sản phẩm và làm việc cùng đội ngũ Super Net.';

async function login(page: Page, username: string) {
  await page.goto('/');
  await page.getByLabel('Tài khoản hoặc email').fill(username);
  await page.getByLabel(/^Mật khẩu(?: \*)?$/).fill(secret);
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await expect(page.locator('.sidebar-user')).toBeVisible();
  if ((page.viewportSize()?.width || 1440) < 780) await page.getByRole('button',{name:'Mở menu',exact:true}).click();
  await page.locator('.main-nav').getByRole('button',{name:'Vị trí tuyển dụng',exact:true}).click();
}

async function createJob(title: string, status = 'open') {
  const response = await admin.post('/api/v1/jobs',{data:{title,department:'Marketing',location:'Văn phòng Super Net',openings:2,description,requirements,benefits,businessLine:'safestraps',salaryRange:'Thỏa thuận',workingHours:'Theo lịch làm việc của bộ phận',status}});
  expect(response.status()).toBe(201);
  return (await response.json()).job;
}

test.beforeAll(async ({ playwright }) => {
  admin = await playwright.request.newContext({baseURL:'http://127.0.0.1:3110',extraHTTPHeaders:{'X-Requested-With':'SuperNet'}});
  expect((await admin.post('/api/v1/login',{data:{login:'admin',password:secret}})).ok()).toBeTruthy();
  const users = await (await admin.get('/api/v1/users')).json();
  for (const [username,name,role] of [['hr-jd','HR tuyển dụng','hr'],['boss-jd','Sếp xem JD','boss']]) {
    if (!users.some((user: {username: string}) => user.username === username)) expect((await admin.post('/api/v1/admin/users',{data:{username,name,role,password:secret}})).status()).toBe(201);
  }
});
test.afterAll(async () => { await admin?.dispose(); });

test('HR publishes a structured JD; an anonymous applicant reads it and submits a CV', async ({ page, browser }) => {
  const errors: string[] = []; page.on('pageerror',error => errors.push(error.message));
  await login(page,'hr-jd');
  await page.getByRole('button',{name:'Tạo JD tuyển dụng',exact:true}).click();
  const form = page.getByRole('dialog');
  await form.getByLabel(/^Tên vị trí/).fill('Content Marketing · Safestraps');
  await form.getByLabel(/^Bộ phận/).fill('Marketing');
  await form.getByLabel('Ngành hàng',{exact:true}).selectOption('safestraps');
  await form.getByLabel(/^Số lượng cần tuyển/).fill('2');
  await form.getByLabel(/^Địa điểm làm việc/).fill('Văn phòng Super Net');
  await form.getByLabel('Mức lương',{exact:true}).fill('Thỏa thuận theo kinh nghiệm');
  await form.getByLabel('Thời gian làm việc',{exact:true}).fill('Theo lịch làm việc của bộ phận');
  await form.getByLabel(/^Mô tả công việc/).fill(description);
  await form.getByLabel('Yêu cầu ứng viên',{exact:true}).fill(requirements);
  await form.getByLabel('Quyền lợi',{exact:true}).fill(benefits);
  await form.getByLabel('Hạn nhận hồ sơ',{exact:true}).fill('2099-12-31');
  await page.screenshot({path:test.info().outputPath('jd-editor.png'),fullPage:true,animations:'disabled'});
  const response = page.waitForResponse(response => response.url().endsWith('/api/v1/jobs') && response.request().method() === 'POST');
  await form.getByRole('button',{name:'Lưu & đăng JD',exact:true}).click();
  const {id} = await (await response).json();
  await expect(form).toHaveCount(0);
  const card = page.locator('.job-card').filter({has:page.getByRole('heading',{name:'Content Marketing · Safestraps',exact:true})});
  await expect(card).toContainText('Đang tuyển');
  await card.getByRole('button',{name:'Chia sẻ JD Content Marketing · Safestraps',exact:true}).click();
  await expect(form.getByLabel('Liên kết JD dành cho ứng viên')).toHaveValue(`http://127.0.0.1:3110/tuyen-dung/${id}`);
  await form.getByRole('button',{name:'Đóng',exact:true}).click();

  const applicantContext = await browser.newContext({baseURL:'http://127.0.0.1:3110',viewport:{width:1440,height:1000},timezoneId:'Asia/Bangkok'});
  const applicant = await applicantContext.newPage();
  await applicant.goto('/tuyen-dung');
  for (const brand of ['Safestraps','JieLien','Baby tatto']) await expect(applicant.locator('.business-grid').getByRole('heading',{name:brand,exact:true})).toBeVisible();
  await applicant.screenshot({path:test.info().outputPath('careers.png'),fullPage:true,animations:'disabled'});
  await applicant.getByLabel('Lọc ngành hàng tuyển dụng').selectOption('safestraps');
  await applicant.locator('.career-job').filter({hasText:'Content Marketing · Safestraps'}).click();
  await expect(applicant).toHaveURL(`/tuyen-dung/${id}`);
  await expect(applicant.getByRole('heading',{name:'Content Marketing · Safestraps',exact:true})).toBeVisible();
  await expect(applicant.locator('.jd-content')).toContainText(description);
  await expect(applicant.locator('.jd-content')).toContainText(requirements);
  await expect(applicant.locator('.jd-content')).toContainText(benefits);
  await expect(applicant.locator('.jd-sidebar')).toContainText('Thỏa thuận theo kinh nghiệm');
  await applicant.screenshot({path:test.info().outputPath('job-description.png'),fullPage:true,animations:'disabled'});
  await applicant.locator('.public-jd-heading').getByRole('link',{name:'Ứng tuyển ngay',exact:true}).click();
  await applicant.getByLabel(/^Họ và tên/).fill('Ứng viên từ JD công khai');
  await applicant.getByLabel('Email',{exact:true}).fill('jd-applicant@example.com');
  await applicant.getByLabel('Tải CV').setInputFiles({name:'CV-JD.pdf',mimeType:'application/pdf',buffer:readFileSync('tests/fixtures/cv.pdf')});
  await applicant.getByRole('checkbox').check();
  await applicant.getByRole('button',{name:'Gửi hồ sơ ứng tuyển'}).click();
  await expect(applicant.getByRole('heading',{name:'Cảm ơn bạn đã kết nối!'})).toBeVisible();
  const candidates = await (await admin.get('/api/v1/candidates')).json();
  expect(candidates.some((candidate: {email: string; applications: {job_id: string}[]}) => candidate.email === 'jd-applicant@example.com' && candidate.applications.some(application => application.job_id === id))).toBeTruthy();
  expect(errors).toEqual([]);
  await applicantContext.close();
});

test('Admin edits an existing JD, preserves fields and pauses its public links', async ({ page, browser }) => {
  const job = await createJob('JD chỉnh sửa từ quản trị');
  await login(page,'admin');
  const card = page.locator('.job-card').filter({hasText:'JD chỉnh sửa từ quản trị'});
  await card.getByRole('button',{name:'Chỉnh sửa JD',exact:true}).click();
  const form = page.getByRole('dialog');
  await expect(form.getByLabel('Yêu cầu ứng viên',{exact:true})).toHaveValue(requirements);
  await expect(form.getByLabel('Quyền lợi',{exact:true})).toHaveValue(benefits);
  await form.getByLabel(/^Tên vị trí/).fill('JD đã cập nhật bởi Admin');
  await form.getByRole('button',{name:'Lưu & đăng JD',exact:true}).click();
  await expect(form).toHaveCount(0);
  const context = await browser.newContext({baseURL:'http://127.0.0.1:3110'}), applicant = await context.newPage();
  await applicant.goto(`/tuyen-dung/${job.id}`);
  await expect(applicant.getByRole('heading',{name:'JD đã cập nhật bởi Admin',exact:true})).toBeVisible();
  await expect(applicant.locator('.jd-content')).toContainText(requirements);
  await page.locator('.job-card').filter({hasText:'JD đã cập nhật bởi Admin'}).getByRole('button',{name:'Tạm dừng',exact:true}).click();
  await expect(page.locator('.job-card').filter({hasText:'JD đã cập nhật bởi Admin'})).toContainText('Tin đang ẩn khỏi trang công khai');
  await applicant.reload();
  await expect(applicant.getByRole('alert')).toContainText('đã tạm dừng');
  await expect(applicant.getByRole('link',{name:'Ứng tuyển ngay',exact:true})).toHaveCount(0);
  await applicant.goto(`/ung-tuyen/${job.id}`);
  await expect(applicant.getByRole('alert')).toContainText('đã tạm dừng');
  await expect(applicant.getByRole('button',{name:'Gửi hồ sơ ứng tuyển'})).toHaveCount(0);
  await context.close();
});

test('Boss can view JD content while creation and editing controls stay restricted', async ({ page }) => {
  const job = await createJob('JD dành cho Sếp xem');
  await login(page,'boss-jd');
  await expect(page.getByRole('button',{name:'Tạo JD tuyển dụng',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Chỉnh sửa JD',exact:true})).toHaveCount(0);
  const card = page.locator('.job-card').filter({hasText:job.title});
  await expect(card.getByRole('link',{name:'Xem JD',exact:true})).toHaveAttribute('href',`/tuyen-dung/${job.id}`);
  await expect(card.getByRole('button',{name:'Tạm dừng',exact:true})).toHaveCount(0);
});

test('public careers, JD and HR editor fit a phone with readable enlarged text', async ({ page }) => {
  const job = await createJob('Chuyên viên nội dung · Bản kiểm thử');
  await page.setViewportSize({width:390,height:844});
  await page.goto('/tuyen-dung');
  await expect(page.locator('.business-grid').getByRole('heading',{name:'Baby tatto',exact:true})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.goto(`/tuyen-dung/${job.id}`);
  await expect(page.getByRole('heading',{name:job.title,exact:true})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(await page.locator('.jd-content p').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeCloseTo(12 * 1.2,1);
  await page.screenshot({path:test.info().outputPath('job-mobile.png'),fullPage:true,animations:'disabled'});
  await login(page,'hr-jd');
  await page.getByRole('button',{name:'Tạo JD tuyển dụng',exact:true}).click();
  await expect(page.getByRole('dialog').getByLabel(/^Tên vị trí/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
