import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork, type ChildProcess } from 'node:child_process';

const secret = process.env.SUPERNET_E2E_PASSWORD!;
const pdf = readFileSync('tests/fixtures/cv.pdf'), docx = readFileSync('tests/fixtures/cv.docx');
const pdfName = 'CV-Nguyễn-Thị-Ánh.pdf', docxName = 'CV-Nguyễn-Thị-Ánh.docx';
let admin: APIRequestContext, candidateId: string, pdfId: string;
let baseURL: string, worker: ChildProcess, directory: string;
const email = `cv-immediate-${crypto.randomUUID()}@example.com`;
async function login(page: Page) {
  // Reuse the real authenticated setup session; login UI has its own regression suite.
  await page.context().addCookies((await admin.storageState()).cookies);
}
test.beforeAll(async ({ playwright }) => {
  // Keep database, ports and rate limits independent of the unrelated login/JD suites.
  directory = mkdtempSync(join(tmpdir(), 'supernet-document-browser-'));
  worker = fork('tests/browser-internal/documents-server.mjs', [], { env: { ...process.env, DATA_DIR: directory }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  const ready = await new Promise<{ baseURL: string; apiURL: string }>((resolve, reject) => {
    worker.once('message', message => resolve(message as { baseURL: string; apiURL: string }));
    worker.once('error', reject); worker.once('exit', code => reject(new Error(`Document test server exited: ${code}`)));
  });
  baseURL = ready.baseURL;
  admin = await playwright.request.newContext({ baseURL: ready.apiURL, extraHTTPHeaders: { 'X-Requested-With': 'SuperNet' } });
  expect((await admin.post('/api/v1/login', { data: { login: 'admin', password: secret } })).status()).toBe(200);
  const result = await admin.post('/api/v1/candidates', { headers: { 'Idempotency-Key': crypto.randomUUID() }, multipart: {
    fullName: 'Ứng viên đọc CV ngay', email, source: 'Email', file: { name: pdfName, mimeType: 'application/pdf', buffer: pdf },
  } });
  expect(result.status()).toBe(200);
  const candidate = (await result.json()).candidate; candidateId = candidate.id; pdfId = candidate.documents[0].id;
  expect(candidate.documents[0].review_status).toBe('quarantined');
  expect((await admin.post(`/api/v1/candidates/${candidateId}/documents`, { headers: { 'Idempotency-Key': crypto.randomUUID() }, multipart: {
    file: { name: docxName, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: docx },
  } })).status()).toBe(200);
});
test.afterAll(async () => {
  await admin?.dispose();
  if (worker && worker.exitCode === null) { const exited = new Promise(resolve => worker.once('exit', resolve)); worker.kill('SIGTERM'); await exited; }
  if (directory) rmSync(directory, { recursive: true, force: true });
});

test('new PDF can be repeatedly viewed and downloaded through the real Vite proxy without approval', async ({ page }) => {
  await login(page);
  await page.goto(`${baseURL}/?page=candidates&candidate=${candidateId}`);
  await page.getByRole('button', { name: 'CV & tài liệu (2)', exact: true }).click();
  const card = page.locator('.document-card').filter({ hasText: pdfName });
  for (let i = 0; i < 2; i++) {
    const response = page.waitForResponse(r => r.url().endsWith(`/documents/${pdfId}/preview`));
    await card.getByRole('button', { name: 'Xem CV', exact: true }).click();
    expect((await response).status()).toBe(200);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('cv-canvas')).toBeVisible();
    await expect.poll(() => dialog.getByTestId('cv-canvas').evaluate(element => { const canvas = element as HTMLCanvasElement; return canvas.width > 0 && canvas.height > 0; })).toBe(true);
    await expect(dialog.locator('iframe,object,embed')).toHaveCount(0);
    const downloaded = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Tải CV', exact: true }).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toBe(pdfName);
    expect(readFileSync((await download.path())!)).toEqual(pdf);
    await dialog.getByLabel('Đóng', { exact: true }).click();
  }
  const directDownload = page.waitForEvent('download');
  await card.getByRole('button', { name: `Tải ${pdfName}`, exact: true }).click();
  expect(readFileSync((await (await directDownload).path())!)).toEqual(pdf);
  expect((await (await admin.get(`/api/v1/candidates/${candidateId}`)).json()).documents.every((d: { review_status: string }) => d.review_status === 'quarantined')).toBe(true);
});

test('DOCX is readable as local text on a phone and original download preserves bytes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto(`${baseURL}/?page=candidates&candidate=${candidateId}`);
  await page.getByRole('button', { name: 'CV & tài liệu (2)', exact: true }).click();
  const card = page.locator('.document-card').filter({ hasText: docxName });
  await card.getByRole('button', { name: 'Xem CV', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.cv-text p')).toContainText('CV Nguyễn Thị Ánh — Kiểm thử DOCX');
  await expect(dialog.locator('.cv-text p')).toContainText('<script>window.cvScriptExecuted = true</script>');
  expect(await page.evaluate(() => 'cvScriptExecuted' in window)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(await page.locator('.modal-backdrop').boundingBox()).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath('cv-docx-mobile.png'), fullPage: true });
  const downloaded = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Tải CV', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe(docxName);
  expect(readFileSync((await download.path())!)).toEqual(docx);
});

test('failed downloads stay on the candidate page and display the server error', async ({ page }) => {
  await login(page);
  await page.goto(`${baseURL}/?page=candidates&candidate=${candidateId}`);
  await page.getByRole('button', { name: 'CV & tài liệu (2)', exact: true }).click();
  await page.route(`**/documents/${pdfId}/download`, route => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Không tìm thấy tệp CV trên máy chủ.' }) }));
  await page.locator('.document-card').filter({ hasText: pdfName }).getByRole('button', { name: `Tải ${pdfName}`, exact: true }).click();
  await expect(page.locator('.document-actions').getByRole('alert')).toContainText('Không tìm thấy tệp CV trên máy chủ.');
  expect(page.url()).toContain(`candidate=${candidateId}`);
});

test('expired sessions show a login message inside the viewer instead of a broken browser page', async ({ page }) => {
  await login(page);
  await page.goto(`${baseURL}/?page=candidates&candidate=${candidateId}`);
  await page.getByRole('button', { name: 'CV & tài liệu (2)', exact: true }).click();
  await page.route(`**/documents/${pdfId}/preview`, route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Vui lòng đăng nhập.' }) }));
  await page.locator('.document-card').filter({ hasText: pdfName }).getByRole('button', { name: 'Xem CV', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Vui lòng đăng nhập.');
  expect(page.url()).toContain(`candidate=${candidateId}`);
});

test('staff can view and download a public duplicate CV from the pending list before resolving it', async ({ page }) => {
  const job = await admin.post('/api/v1/jobs',{headers:{'Idempotency-Key':crypto.randomUUID()}, data: { title: 'CV đang xác minh', department: 'QA', location: 'HCM', description: 'Công việc kiểm thử tiếp nhận CV từ ứng viên.', openings: 1 } });
  expect(job.status()).toBe(201);
  const pendingName = 'Ứng viên CV đang xác minh';
  const accepted = await admin.post('/api/v1/public/applications', { headers: { 'Idempotency-Key': crypto.randomUUID() }, multipart: {
    fullName: pendingName, email, jobId: (await job.json()).id, consent: 'true', file: { name: 'CV-chờ-xác-minh.pdf', mimeType: 'application/pdf', buffer: pdf },
  } });
  expect(accepted.status()).toBe(200);
  await login(page);
  await page.goto(`${baseURL}/?page=candidates&tab=pending`);
  const row = page.locator('.submission-row').filter({ hasText: pendingName });
  await row.getByRole('button', { name: 'Xem CV', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('cv-canvas')).toBeVisible();
    await expect.poll(() => dialog.getByTestId('cv-canvas').evaluate(element => { const canvas = element as HTMLCanvasElement; return canvas.width > 0 && canvas.height > 0; })).toBe(true);
  const downloaded = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Tải CV', exact: true }).click();
  expect(readFileSync((await (await downloaded).path())!)).toEqual(pdf);
  await dialog.getByLabel('Đóng', { exact: true }).click();
  await expect(row.getByRole('button', { name: 'Kiểm tra & xác nhận' })).toBeVisible();
});

test('an applicant can upload a bilingual PDF with embedded Content Credentials after antivirus scanning', async ({ page }) => {
  const job = await admin.post('/api/v1/jobs',{headers:{'Idempotency-Key':crypto.randomUUID()}, data: { title: 'CV song ngữ', department: 'QA', location: 'HCM', description: 'Kiểm thử CV có metadata Content Credentials.', openings: 1 } });
  expect(job.status()).toBe(201);
  const jobId = (await job.json()).id, applicantEmail = `c2pa-${crypto.randomUUID()}@example.com`;
  const filename = '01_會計履歷_中越雙語_CV_kiểm_thử.pdf';
  await page.goto(`${baseURL}/ung-tuyen/${jobId}`);
  await page.locator('.public-form').getByLabel(/^Họ và tên/).fill('Ứng viên CV song ngữ');
  await page.getByLabel('Email', { exact: true }).fill(applicantEmail);
  await page.getByLabel('Tải CV', { exact: true }).setInputFiles({ name: filename, mimeType: 'application/pdf', buffer: readFileSync('tests/fixtures/cv-content-credentials.pdf') });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Gửi hồ sơ ứng tuyển' }).click();
  await expect(page.getByRole('heading', { name: 'Đã nhận hồ sơ' })).toBeVisible();
  const received = (await (await admin.get('/api/v1/candidates')).json()).find((c: { email: string }) => c.email === applicantEmail);
  expect(received.documents[0].original_name).toBe(filename);
  expect(received.documents[0].scan.status).toBe('clean');
});

test('arbitrary CV formats can upload, show a preview explanation, and download their original bytes', async ({ page }) => {
  const filename = 'CV-ứng-viên.rtf', bytes = Buffer.from('{\\rtf1\\ansi Synthetic CV document}');
  const created = await admin.post('/api/v1/candidates', { headers: { 'Idempotency-Key': crypto.randomUUID() }, multipart: { fullName: 'CV định dạng khác', source: 'Email', file: { name: filename, mimeType: 'application/rtf', buffer: bytes } } });
  expect(created.status()).toBe(200);
  const candidate = (await created.json()).candidate;
  await login(page); await page.goto(`${baseURL}/?page=candidates&candidate=${candidate.id}`);
  await page.getByRole('button', { name: 'CV & tài liệu (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Xem CV', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Định dạng này chưa hỗ trợ xem trực tiếp');
  const downloaded = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Tải CV', exact: true }).click();
  const result = await downloaded; expect(result.suggestedFilename()).toBe(filename);
  expect(readFileSync((await result.path())!)).toEqual(bytes);
});
