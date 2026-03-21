# Testing Strategy

## Frontend Canvas (PixiJS / WebGL)

### Why pixel-diff snapshot testing doesn't work well here

`toMatchSnapshot()` in Playwright does pixel-exact comparison by default. That's too strict for an animated WebGL canvas:

- Stat bars lerp every frame — screenshot timing changes pixel values
- Anti-aliasing differs across GPU drivers / OS / headless vs real browser
- Font rendering varies by platform

A loose threshold (`maxDiffPixelRatio: 0.2`) catches blank/crashed screens but not much else, and it's high maintenance for low signal.

### Recommended automated test approach (future)

**1. Structural / state assertions (most reliable)**

Expose a debug handle in `src/main.ts` for test environments:

```ts
if (import.meta.env.DEV) {
  (window as Window & { __xpet?: unknown }).__xpet = { room, mockEvents };
}
```

Then in Playwright:

```ts
// Stop mock events so state settles
await page.evaluate(() => (window as any).__xpet.mockEvents.stop());
await page.waitForTimeout(500);

// Assert bar values are in range
const bars = await page.evaluate(() =>
  (window as any).__xpet.room.bars.map((b: any) => b.current)
);
expect(bars[0]).toBeGreaterThan(0);  // hunger
expect(bars[1]).toBeGreaterThan(0);  // mood
expect(bars[2]).toBeGreaterThan(0);  // affection
```

**2. Smoke test (cheapest, catches crashes)**

```ts
await page.goto('http://localhost:5173');
await expect(page.locator('canvas')).toBeVisible();
// No uncaught JS errors (Playwright captures these automatically)
```

**3. WebGL pixel sampling (for visual regression)**

Requires `preserveDrawingBuffer: true` in PixiJS `app.init()`. Then:

```ts
const nonBlack = await page.evaluate(() => {
  const canvas = document.querySelector('canvas') as HTMLCanvasElement;
  const gl = canvas.getContext('webgl2') as WebGL2RenderingContext;
  const pixel = new Uint8Array(4);
  gl.readPixels(canvas.width / 2, canvas.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  return pixel[0] > 0 || pixel[1] > 0 || pixel[2] > 0; // not black
});
expect(nonBlack).toBe(true);
```

Note: `getContext('2d')` returns null on a WebGL canvas — always use `getContext('webgl2')` with `readPixels`.

**4. EventBus unit tests (no browser needed)**

`eventBus` is pure TypeScript — testable with Vitest:

```ts
import { eventBus } from '../src/ws/eventBus';

test('pet.state event reaches subscriber', () => {
  const received: number[] = [];
  eventBus.on('pet.state', (e) => received.push(e.data.hunger));
  eventBus.emit({ type: 'pet.state', data: { hunger: 75, mood: 60, affection: 40 } });
  expect(received).toEqual([75]);
});
```

### Tooling to add when automated tests are needed

| Tool | Purpose |
|------|---------|
| Playwright | Browser smoke + structural tests |
| Vitest | Unit tests for eventBus, MockEvents, pure logic |
| `preserveDrawingBuffer: true` | Enables `gl.readPixels` for WebGL pixel sampling |
| `window.__xpet` debug handle | Exposes runtime state to Playwright `evaluate()` |

---

## Backend

Standard Fastify + Drizzle patterns — unit test route handlers with mock DB, integration test against a real local Postgres. Document here when backend tests are added.
