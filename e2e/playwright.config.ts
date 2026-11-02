import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the Docker Compose stack (`make e2e` starts it
// with VIDEO_SOURCE=sample, so no test depends on YouTube). Each test creates
// its own channel with a unique handle, so the suite can run on a database
// that already holds data.
export default defineConfig({
  testDir: './tests',
  // The suite must pass on a large, already-populated database, where /videos renders every stored video.
  timeout: 120_000,
  expect: { timeout: 8_000 },
  // One worker: the dashboard test compares totals across the whole database.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8100',
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
