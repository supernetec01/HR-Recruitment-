import { expect, test } from '@playwright/test';
const password = process.env.SUPERNET_E2E_PASSWORD!;

test('browser signs in through the real Vite proxy, whose API uses a different Host and port', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3120');
  await page.getByLabel('Tài khoản hoặc email').fill('admin');
  await page.getByLabel(/^Mật khẩu(?: \*)?$/).fill(password);
  await page.getByRole('button', { name: 'Hiện mật khẩu' }).click();
  await expect(page.locator('input[name="password"]')).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Ẩn mật khẩu' }).click();
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.locator('.sidebar-user')).toContainText('Admin Kiểm Thử');
  await page.reload();
  await expect(page.locator('.sidebar-user')).toContainText('Admin Kiểm Thử');
  expect(errors).toEqual([]);
});
test('Vite overwrites spoofed forwarding headers instead of accepting a hostile origin', async ({ request }) => {
  const response = await request.post('http://127.0.0.1:3120/api/v1/login', {
    headers: { Origin: 'http://attacker.example', 'X-Forwarded-Host': 'attacker.example', 'X-Forwarded-Proto': 'http', 'X-Requested-With': 'SuperNet' },
    data: { login: 'admin', password },
  });
  expect(response.status()).toBe(403);
  expect((await response.json()).code).toBe('ORIGIN_NOT_ALLOWED');
});
test('login typography is 20 percent larger and remains within desktop and mobile viewports', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Chào mừng trở lại' })).toBeVisible();
  const pixels = async (selector: string) => page.locator(selector).first().evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  expect(await pixels('.login-form h2')).toBeCloseTo(29 * 1.2, 1);
  expect(await pixels('.login-form .field > label')).toBeCloseTo(10 * 1.2, 1);
  expect(await pixels('.login-form .button.primary')).toBeCloseTo(12 * 1.2, 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await pixels('.login-form h2')).toBeCloseTo(25 * 1.2, 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible();
});
test('first-run instructions replace the login form until the server reports Admin ready', async ({ page }) => {
  // Only the initial config response is a fixture; login and subsequent config use the real API.
  await page.route('**/api/v1/config', route => route.fulfill({ json: { demo: false, needsSetup: true } }), { times: 1 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Khởi tạo tài khoản quản trị' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('npm run setup');
  await page.getByRole('button', { name: 'Kiểm tra lại thiết lập' }).click();
  await page.getByLabel('Tài khoản hoặc email').fill('admin');
  await page.getByLabel(/^Mật khẩu(?: \*)?$/).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.locator('.sidebar-user')).toBeVisible();
});
