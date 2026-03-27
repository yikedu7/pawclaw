import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.smoke.test.ts'],
    pool: 'forks',
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres',
      // Clear SUPABASE_URL so authHook falls back to JWT_SECRET (HS256) in tests.
      // Each test file sets process.env.JWT_SECRET to its own test secret before requests.
      SUPABASE_URL: '',
    },
  },
});
