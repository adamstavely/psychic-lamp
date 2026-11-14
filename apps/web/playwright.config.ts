import { defineConfig, devices } from '@playwright/test';

const port = 4620;
const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } };

// Runs against the real stack: the API (built) on 3870 and Keycloak, Postgres and Elasticsearch from docker compose.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'light', use: { ...desktop, colorScheme: 'light' } },
    { name: 'dark', use: { ...desktop, colorScheme: 'dark' } },
  ],
  webServer: [
    {
      command: 'npm run start:built -w api',
      cwd: '../..',
      url: 'http://localhost:3870/api/health',
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
    },
    {
      command: `npx ng serve --port ${port}`,
      url: `http://localhost:${port}`,
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
  ],
});
