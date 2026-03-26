import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: {
    ...devices['Desktop Chrome'],
  },
});
