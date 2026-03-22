/**
 * Usage: node packages/frontend/scripts/screenshot.mjs [port]
 * Defaults to port 5173. Screenshot saved to /tmp/render.png.
 */
import { chromium } from 'playwright';

const port = process.argv[2] ?? '5173';
const url = `http://localhost:${port}`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 720 });
await page.goto(url);
await page.waitForTimeout(3000); // wait for PixiJS init + asset load
await page.screenshot({ path: '/tmp/render.png' });
await browser.close();
console.log(`Screenshot saved to /tmp/render.png (${url})`);
