import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';

config({ path: 'server/.env', quiet: true });
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5174', trace: 'off', screenshot: 'off' },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'laptop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'tablet-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 } },
    },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'node scripts/e2e-server.mjs api',
      url: 'http://localhost:4001/api/health',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'node scripts/e2e-server.mjs web',
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
