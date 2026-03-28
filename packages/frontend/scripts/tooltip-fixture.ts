/**
 * Renders a minimal HUD fixture (no auth needed) to screenshot the stat tooltip.
 * Run: tsx packages/frontend/scripts/tooltip-fixture.ts
 */

import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dir, '../src/ui/styles.css');
const css = readFileSync(cssPath, 'utf8')
  // strip @import (Google Fonts) so it renders offline
  .replace(/^@import .+$/gm, '');

const output = process.env.SCREENSHOT_OUTPUT ?? '/tmp/tooltip-test.png';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #2a2a2a; width: 900px; height: 400px; position: relative; overflow: hidden;
       font-family: Inter, system-ui, sans-serif; }
${css}
</style>
</head>
<body>
<div id="ui-overlay">
  <!-- minimal HUD bar fixture -->
  <div id="hud-bar" class="ui-panel">
    <div class="hud-stats">
      <!-- title row with help button + tooltip -->
      <div class="stat-title-row" style="position:relative">
        <span class="stat-title">Stats</span>
        <button class="stat-help-btn" id="help-btn" aria-label="Stat explanations">
          <!-- inline helpCircle SVG -->
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ui-icon">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <path d="M12 17h.01"/>
          </svg>
        </button>
        <!-- tooltip (forced visible for screenshot) -->
        <div class="stat-tooltip" id="tooltip">
          <p>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ui-icon">
              <path d="M15.45 15.4c-2.13 2.13-4.72 3.12-5.8 2.04l-5.09-5.09c-1.08-1.08-.09-3.67 2.04-5.8 2.13-2.13 4.72-3.12 5.8-2.04l5.09 5.09c1.08 1.08.09 3.67-2.04 5.8z"/>
              <path d="m11 11 5 5"/>
              <circle cx="19.5" cy="19.5" r="2.5"/>
            </svg>
            Hunger — how hungry your pet is. Increases over time as credits are spent. Feed by topping up USDC to your pet's wallet.
          </p>
          <p>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ui-icon">
              <circle cx="12" cy="12" r="10"/>
              <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
              <line x1="9" x2="9.01" y1="9" y2="9"/>
              <line x1="15" x2="15.01" y1="9" y2="9"/>
            </svg>
            Mood — your pet's current mood. Improves through social interactions and rest.
          </p>
          <p>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ui-icon">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
            </svg>
            Love — affection score. Grows with positive social events.
          </p>
        </div>
      </div>
      <!-- stat items -->
      <div class="hud-stat-item">
        <span class="hud-stat-label">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ui-icon">
            <path d="M15.45 15.4c-2.13 2.13-4.72 3.12-5.8 2.04l-5.09-5.09c-1.08-1.08-.09-3.67 2.04-5.8 2.13-2.13 4.72-3.12 5.8-2.04l5.09 5.09c1.08 1.08.09 3.67-2.04 5.8z"/>
            <path d="m11 11 5 5"/><circle cx="19.5" cy="19.5" r="2.5"/>
          </svg>
        </span>
        <div class="stat-track"><div class="stat-fill hunger" style="width:70%"></div></div>
        <span class="stat-value">70</span>
      </div>
      <div class="hud-stat-item">
        <span class="hud-stat-label">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ui-icon">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
            <line x1="9" x2="9.01" y1="9" y2="9"/>
            <line x1="15" x2="15.01" y1="9" y2="9"/>
          </svg>
        </span>
        <div class="stat-track"><div class="stat-fill mood" style="width:85%"></div></div>
        <span class="stat-value">85</span>
      </div>
      <div class="hud-stat-item">
        <span class="hud-stat-label">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ui-icon">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
          </svg>
        </span>
        <div class="stat-track"><div class="stat-fill affection" style="width:45%"></div></div>
        <span class="stat-value">45</span>
      </div>
    </div>
  </div>
</div>
<script>
  // Force tooltip visible for screenshot
  document.getElementById('tooltip').style.display = 'block';
</script>
</body>
</html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 900, height: 400 });
await page.setContent(html, { waitUntil: 'load' });
await page.waitForTimeout(200);

await page.screenshot({ path: output });

await browser.close();
console.log(`Fixture screenshot saved to ${output}`);
