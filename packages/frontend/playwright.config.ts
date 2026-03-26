import { defineConfig, devices } from '@playwright/test';

// Local Supabase defaults (from `supabase start`)
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9' +
  '.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// Use port 5174 so this worktree's dev server does not collide with other
// worktrees that may already be running on 5173.
const DEV_PORT = 5174;

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: `http://localhost:${DEV_PORT}`,
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: `pnpm dev --port ${DEV_PORT}`,
    url: `http://localhost:${DEV_PORT}`,
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? LOCAL_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? LOCAL_ANON_KEY,
      VITE_BACKEND_URL: process.env.VITE_BACKEND_URL ?? 'http://localhost:3001',
    },
  },
});
