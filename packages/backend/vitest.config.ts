import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.smoke.test.ts'],
    pool: 'forks',
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres',
      SUPABASE_URL: process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321',
    },
  },
});
