import { defineConfig } from '@playwright/test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
const dataDir = mkdtempSync(join(tmpdir(), 'supernet-browser-'));
const internalDataDir = mkdtempSync(join(tmpdir(), 'supernet-browser-internal-'));
const testPassword = process.env.SUPERNET_E2E_PASSWORD ||= randomBytes(24).toString('hex');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
export default defineConfig({
  fullyParallel: false, workers: 1, retries: 0, timeout: 30000,
  reporter: 'list', outputDir: 'test-results',
  use: { baseURL: 'http://127.0.0.1:3100', timezoneId: 'Asia/Bangkok', locale: 'vi-VN', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure', launchOptions: { ...(executablePath ? { executablePath } : {}), ...(process.platform === 'linux' ? { args: ['--no-sandbox'] } : {}) } },
  projects: [
    { name: 'demo-regression', testDir: './tests/browser' },
    { name: 'internal', testDir: './tests/browser-internal', use: { baseURL: 'http://127.0.0.1:3110' } },
  ],
  webServer: [
    { command: 'node server/index.mjs', url: 'http://127.0.0.1:3100/api/v1/health', reuseExistingServer: false, env: { PORT: '3100', DEMO_MODE: '1', DATA_DIR: dataDir } },
    { command: 'node tests/browser-internal/server.mjs', url: 'http://127.0.0.1:3110/api/v1/health', reuseExistingServer: false, env: { DATA_DIR: internalDataDir, SUPERNET_E2E_PASSWORD: testPassword } },
  ],
});
