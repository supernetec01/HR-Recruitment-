import { expect, test, type APIRequestContext } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork, type ChildProcess } from 'node:child_process';

let directory: string, worker: ChildProcess, baseURL: string, admin: APIRequestContext;
let fresh: { candidateId: string; applicationId: string | null; name: string }[];
test.beforeAll(async ({ playwright }) => {
  directory = mkdtempSync(join(tmpdir(), 'supernet-reports-browser-'));
  worker = fork('tests/browser-internal/recruitment-reports-server.mjs', [], { env: { ...process.env, DATA_DIR: directory }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  const ready = await new Promise<{ baseURL: string; fresh: typeof fresh }>((resolve, reject) => {
    worker.once('message', message => resolve(message as { baseURL: string; fresh: typeof fresh }));
    worker.once('error', reject); worker.once('exit', code => reject(new Error(`Report fixture exited: ${code}`)));
  }); ({ baseURL, fresh } = ready);
  admin = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { 'X-Requested-With': 'SuperNet' } });
  expect((await admin.post('/api/v1/login', { data: { login: 'admin', password: process.env.SUPERNET_E2E_PASSWORD } })).status()).toBe(200);
});
test.afterAll(async () => {
  await admin?.dispose();
  if (worker?.exitCode === null) { const exited = new Promise(resolve => worker.once('exit', resolve)); worker.kill('SIGTERM'); await exited; }
  if (directory) rmSync(directory, { recursive: true, force: true });
});
test.beforeEach(async ({ page }) => {
  await page.context().addCookies((await admin.storageState()).cookies);
  await page.clock.setFixedTime(new Date('2026-11-07T12:00:00+07:00'));
});
test('candidate list defaults to new profiles, including profiles without a position; all tab and sorting survive navigation', async ({ page }) => {
  await page.goto(`${baseURL}/?page=candidates`);
  await expect(page.getByRole('tab', { name: /^Mới tiếp nhận/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('tbody tr')).toHaveCount(6);
  await expect(page.locator('tbody')).toContainText('Hồ sơ trong kỳ 6');
  await expect(page.locator('tbody')).not.toContainText('Hồ sơ cũ được phỏng vấn');
  await page.getByRole('button', { name: 'Mở hồ sơ Hồ sơ trong kỳ 6', exact: true }).click();
  await page.getByRole('button', { name: 'Quay lại danh sách ứng viên' }).click();
  await expect(page.getByRole('tab', { name: /^Mới tiếp nhận/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: /^Tất cả ứng viên/ }).click(); await page.reload();
  await expect(page.getByRole('tab', { name: /^Tất cả ứng viên/ })).toHaveAttribute('aria-selected', 'true');
  const rows = page.locator('tbody tr'); await expect(rows).toHaveCount(8);
  for (let index = 0; index < 6; index++) await expect(rows.nth(index).locator('.stage')).toHaveText('Mới tiếp nhận');
  await expect(rows.nth(6).locator('.stage')).not.toHaveText('Mới tiếp nhận');
  await page.getByLabel('Sắp xếp hồ sơ', { exact: true }).selectOption('oldest');
  await expect(rows.first()).toContainText('Hồ sơ cũ được phỏng vấn 5');
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click(); await expect(rows).toHaveCount(5);
  await page.getByLabel('Sắp xếp hồ sơ', { exact: true }).selectOption('newest');
  await expect(page.getByRole('button', { name: 'Trang 1', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(rows.first()).toContainText('Hồ sơ trong kỳ 7');
});
test('seven-day report shows 7 receipts, 5 bookings and 3 interviews with 2 fail and 1 pass; date filtering updates every chart', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseURL}/?page=reports`);
  await expect(page.getByLabel('Khoảng thời gian', { exact: true })).toHaveValue('7');
  await expect(page.locator('.metric-value')).toHaveText(['7', '5', '3', '1']);
  await expect(page.locator('.report-outcome strong')).toHaveText(['1', '2', '0', '0']);
  await page.getByLabel('Khoảng thời gian', { exact: true }).selectOption('30');
  await expect(page.locator('.metric-value')).toHaveText(['13', '5', '3', '1']);
  await page.getByLabel('Khoảng thời gian', { exact: true }).selectOption('month');
  await expect(page.locator('.metric-value')).toHaveText(['7', '5', '3', '1']);
  await page.getByLabel('Khoảng thời gian', { exact: true }).selectOption('custom');
  await page.getByLabel('Từ ngày', { exact: true }).fill('2026-11-07');
  await expect(page.locator('.metric-value')).toHaveText(['1', '0', '0', '0']);
  await expect(page.locator('.dashboard-card').first()).toContainText('100%');
  await expect(page.locator('.dashboard-card').nth(1).locator('.mini-tag')).toHaveText('1 lượt');
  await page.getByLabel('Khoảng thời gian', { exact: true }).selectOption('all');
  await expect(page.locator('.metric-value')).toHaveText(['13', '5', '3', '1']);
  await page.getByLabel('Khoảng thời gian', { exact: true }).selectOption('custom');
  await page.getByLabel('Từ ngày', { exact: true }).fill('2025-01-01'); await page.getByLabel('Đến ngày', { exact: true }).fill('2025-01-07');
  await expect(page.locator('.metric-value')).toHaveText(['0', '0', '0', '0']);
  await page.getByLabel('Từ ngày', { exact: true }).fill('2026-11-07');
  await expect(page.getByRole('alert')).toContainText('ngày bắt đầu không được sau ngày kết thúc');
  await expect(page.locator('.metric-value')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('report errors can be retried and late responses do not replace the selected period', async ({ page }) => {
  let failures = 1;
  await page.route('**/api/v1/reports/recruitment**', async route => {
    if (failures-- > 0) await route.fulfill({ status: 500, json: { message: 'Báo cáo tạm thời không tải được.' } });
    else await route.continue();
  });
  await page.goto(`${baseURL}/?page=reports`); await expect(page.getByRole('alert')).toContainText('Báo cáo tạm thời không tải được.');
  await page.getByRole('button', { name: 'Thử tải lại dữ liệu', exact: true }).click();
  await expect(page.locator('.metric-value')).toHaveText(['7', '5', '3', '1']);
  let release!: () => void, started!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const requested = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/v1/reports/recruitment?from=2026-11-01&to=2026-11-07', async route => { started(); await blocked; await route.continue(); });
  await page.getByLabel('Khoảng thời gian', { exact: true }).selectOption('month');
  await requested;
  await page.getByLabel('Khoảng thời gian', { exact: true }).selectOption('all');
  await expect(page.locator('.metric-value')).toHaveText(['13', '5', '3', '1']);
  const late = page.waitForResponse(response => response.url().endsWith('/reports/recruitment?from=2026-11-01&to=2026-11-07'));
  release(); await (await late).finished();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.locator('.metric-value')).toHaveText(['13', '5', '3', '1']);
});
test('reports and candidate filters fit mobile and desktop in both languages', async ({ page }) => {
  for (const language of ['vi', 'zh-CN']) {
    await page.goto(`${baseURL}/?page=reports`); await page.getByLabel('Ngôn ngữ / 语言').selectOption(language);
    await expect(page.locator('.metric-value')).toHaveCount(4);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await page.screenshot({ path: test.info().outputPath(`reports-${language}-${width}.png`), fullPage: true, animations: 'disabled' });
    }
    await page.goto(`${baseURL}/?page=candidates`);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 }); await expect(page.locator('.candidate-order select')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await page.screenshot({ path: test.info().outputPath(`candidate-priority-${language}-${width}.png`), fullPage: true, animations: 'disabled' });
    }
  }
});
test('processed profiles leave the new queue while remaining in all candidates', async ({ page }) => {
  expect((await admin.patch(`/api/v1/applications/${fresh[0].applicationId}`, { data: { stage: 'screening' } })).status()).toBe(200);
  await page.goto(`${baseURL}/?page=candidates`); await expect(page.locator('tbody tr')).toHaveCount(5);
  await expect(page.locator('tbody')).not.toContainText(fresh[0].name);
  await page.getByRole('tab', { name: /^Tất cả ứng viên/ }).click();
  await page.getByLabel('Tìm kiếm ứng viên').fill(fresh[0].name);
  await expect(page.locator('tbody tr')).toHaveCount(1); await expect(page.locator('tbody .stage')).toHaveText('Đang sàng lọc');
  for (const person of fresh.filter(person => person.applicationId && person !== fresh[0] && person !== fresh[1])) {
    expect((await admin.patch(`/api/v1/applications/${person.applicationId}`, { data: { stage: 'screening' } })).status()).toBe(200);
  }
  // The unassigned profile is still new; moving it to a job and then screening
  // it should empty the queue without hiding processed profiles from All.
  const jobs = await (await admin.get('/api/v1/jobs')).json();
  const added = await admin.post(`/api/v1/candidates/${fresh[5].candidateId}/applications`, { data: { jobId: jobs[0].id, source: 'Email' } });
  expect(added.status()).toBe(200);
  const profile = await (await admin.get(`/api/v1/candidates/${fresh[5].candidateId}`)).json();
  expect((await admin.patch(`/api/v1/applications/${profile.applications[0].id}`, { data: { stage: 'screening' } })).status()).toBe(200);
  await page.goto(`${baseURL}/?page=candidates`);
  await expect(page.getByRole('heading', { name: 'Không có hồ sơ mới tiếp nhận', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Xem tất cả ứng viên', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(8);
});
