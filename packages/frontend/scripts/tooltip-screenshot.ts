/**
 * Tooltip visual verification screenshot.
 * Navigates to localhost, hovers the ? help button, captures the tooltip.
 *
 * Usage:
 *   # start dev server first: pnpm --filter @pawclaw/frontend dev
 *   tsx packages/frontend/scripts/tooltip-screenshot.ts
 */

import { chromium } from 'playwright';

const url = process.env.SCREENSHOT_URL ?? 'http://localhost:5173';
const output = process.env.SCREENSHOT_OUTPUT ?? '/tmp/tooltip-test.png';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 720 });

// Navigate — if the app redirects to /login, that's fine; we just need the HUD
await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2000);

// Try to hover the stat help button
const helpBtn = page.locator('.stat-help-btn').first();
if (await helpBtn.count() > 0) {
  await helpBtn.hover();
  await page.waitForTimeout(300);
}

await page.screenshot({ path: output, fullPage: true });
await browser.close();

console.log(`Tooltip screenshot saved to ${output}`);
