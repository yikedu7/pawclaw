/**
 * Canvas visual verification screenshot tool.
 *
 * Usage:
 *   # Terminal 1 — start dev server
 *   pnpm --filter @x-pet/frontend dev
 *
 *   # Terminal 2 — capture screenshot
 *   pnpm --filter @x-pet/frontend screenshot
 *   # → /tmp/x-pet-render.png ready for Read tool multimodal review
 *
 * Env vars:
 *   SCREENSHOT_DELAY_MS  — ms to wait for PixiJS to initialize (default: 2000)
 *   SCREENSHOT_URL       — URL to navigate to (default: http://localhost:5173)
 *   SCREENSHOT_OUTPUT    — output path (default: /tmp/x-pet-render.png)
 */

import { chromium } from "playwright";

const url = process.env.SCREENSHOT_URL ?? "http://localhost:5173";
const output = process.env.SCREENSHOT_OUTPUT ?? "/tmp/x-pet-render.png";
const delay = Number(process.env.SCREENSHOT_DELAY_MS ?? 2000);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(delay);
await page.screenshot({ path: output, fullPage: true });

await browser.close();

console.log(`Screenshot saved to ${output}`);
