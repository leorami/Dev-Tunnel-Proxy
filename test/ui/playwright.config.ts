import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const ARTIFACTS = path.resolve(__dirname, '../../.artifacts/ui');

export default defineConfig({
  testDir: './tests',
  outputDir: ARTIFACTS,
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: process.env.UI_BASE_URL || 'http://localhost:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 800 }
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ]
});


