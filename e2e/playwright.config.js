const { defineConfig, devices } = require('@playwright/test');

const port = process.env.E2E_PORT || '5051';

module.exports = defineConfig({
  testDir: './tests',
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false, // the tests share one seeded database
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure', screenshot: 'only-on-failure', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'node start-server.js',
    url: `http://localhost:${port}/readyz`,
    timeout: 120000,
    reuseExistingServer: false,
  },
});
