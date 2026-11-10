import { defineConfig, devices } from '@playwright/test'

const deployedBaseUrl = process.env.E2E_BASE_URL
const localBaseUrl = 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: deployedBaseUrl ?? localBaseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  // Start Vite automatically for local runs. Set E2E_BASE_URL to test a deployed
  // stack (for example the Docker compose frontend on http://localhost:8088).
  webServer: deployedBaseUrl
    ? undefined
    : {
        command: 'npm run dev',
        url: localBaseUrl,
        reuseExistingServer: true,
        timeout: 120_000
      }
})
