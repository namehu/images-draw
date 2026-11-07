import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e', timeout: 30_000, fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5173', headless: true, screenshot: 'only-on-failure', launchOptions: process.env.DRAW_CHROMIUM_PATH ? { executablePath: process.env.DRAW_CHROMIUM_PATH } : {} },
  webServer: { command: 'pnpm dev', url: 'http://127.0.0.1:5173/draw/', reuseExistingServer: !process.env.CI },
})
