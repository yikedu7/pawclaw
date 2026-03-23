import { test, expect } from '@playwright/test';

test.describe('create.html — DOM smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/create.html');
  });

  test('renders auth form with email, password and Sign In button', async ({ page }) => {
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#auth-btn')).toHaveText('Sign In');
    await expect(page.locator('#pet-section')).toBeHidden();
  });

  test('toggle switches to sign-up mode and back', async ({ page }) => {
    await page.locator('#toggle-btn').click();
    await expect(page.locator('#auth-btn')).toHaveText('Sign Up');
    await expect(page.locator('#toggle-btn')).toHaveText('Sign In');

    await page.locator('#toggle-btn').click();
    await expect(page.locator('#auth-btn')).toHaveText('Sign In');
    await expect(page.locator('#toggle-btn')).toHaveText('Sign Up');
  });

  test('shows validation error when submitting empty email/password', async ({ page }) => {
    await page.locator('#auth-btn').click();
    await expect(page.locator('#error-msg')).toHaveText('Email and password required.');
  });

  test('pet section is hidden until auth succeeds', async ({ page }) => {
    // Without real Supabase auth we can only verify the initial hidden state
    await expect(page.locator('#pet-section')).toBeHidden();
  });
});

test.describe('create.html — full flow (requires local Supabase + backend)', () => {
  test.skip(
    !process.env.RUN_E2E,
    'Set RUN_E2E=1 (with supabase + backend running) to run full auth flow tests',
  );

  test('sign up → pet form appears → create pet → redirect to canvas', async ({ page }) => {
    const email = `e2e-${Date.now()}@test.local`;

    await page.goto('/create.html');

    // Switch to sign-up
    await page.locator('#toggle-btn').click();
    await page.locator('#email').fill(email);
    await page.locator('#password').fill('password123');
    await page.locator('#auth-btn').click();

    // Pet form should appear after successful sign-up
    await expect(page.locator('#pet-section')).toBeVisible({ timeout: 10_000 });

    await page.locator('#pet-name').fill('E2EPet');
    await page.locator('#soul-prompt').fill('A test pet created by Playwright.');
    await page.locator('#create-btn').click();

    // Should redirect to canvas with token in URL
    await page.waitForURL(/\/\?token=/, { timeout: 15_000 });
    expect(page.url()).toContain('token=');
  });
});
