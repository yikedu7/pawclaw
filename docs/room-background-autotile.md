# Room Background — Autotile Implementation

Captures the technical approach for composing the pet room background from Sprout Lands
tileset assets without a GUI editor (Tiled or similar). Relevant to issue #48.

---

## Problem

`Grass.png` is a bitmask autotile sheet — 77 frames across an 11×7 grid of 16×16 tiles,
each frame representing a different combination of grass neighbors (center fill, edges,
corners, etc.). Picking the wrong frame produces visible border artifacts. We need to
select the correct variant per grid cell based on its neighbors, programmatically.

---

## Approach: Math + Vision LLM + `@pixi/tilemap`

### Why not Tiled?

Tiled is a GUI map editor. It requires a human to open it, draw a map, and export JSON.
That is incompatible with a hackathon where the map layout can be code-defined.

### Why not AI image generation?

The Sprout Lands `read_me.txt` explicitly **prohibits use of assets for AI training or
generation pipelines**. Style-matching via Retro Diffusion, PixelLab, or Stable Diffusion
would violate the license. The correct approach is to compose the background from the
existing tiles programmatically.

---

## Step 1 — Frame Coordinates (pure math, no AI)

Grass.png: 176px wide, 112px tall → 11 cols × 7 rows.

```typescript
const COLS = 11;
const ROWS = 7;
const TILE = 16;

// Frame at index i:
const frameX = (i % COLS) * TILE;   // col * 16
const frameY = Math.floor(i / COLS) * TILE; // row * 16
```

No AI needed here — uniform grids are pure arithmetic.

---

## Step 2 — Semantic Labeling (one-time vision LLM call)

The atlas in `docs/assets-spritesheet-map.md` was produced by sending `Grass.png` plus
the two bitmask reference sheets to a vision LLM:

- `tilesets/Bitmask references 1.png` (480×256)
- `tilesets/Bitmask references 2.png` (480×256)

Prompt template used:

> "This is a 16×16 pixel art tileset, 11 columns by 7 rows. Using the attached bitmask
> reference images as context, label each cell [col, row] with one of: center-fill,
> edge-top, edge-bottom, edge-left, edge-right, corner-TL, corner-TR, corner-BL,
> corner-BR, inner-corner-TL, inner-corner-TR, inner-corner-BL, inner-corner-BR,
> isolated, or other. Return as a JSON array."

The result is committed as static data in `assets-spritesheet-map.md`. No runtime LLM
calls are needed during gameplay.

**Vision LLM capability note:** Models (Claude, GPT-4o) can classify cells in a known
grid reliably. They cannot regress raw pixel coordinates — hence the math in Step 1
handles coordinates, and the LLM only assigns labels.

---

## Step 3 — 4-Bit Cardinal Bitmask Lookup

For each grass cell in the room grid, check its 4 cardinal neighbors:

```typescript
const N = 8;  // north neighbor is grass
const E = 4;  // east neighbor is grass
const S = 2;  // south neighbor is grass
const W = 1;  // west neighbor is grass

function getBitmask(grid: boolean[][], col: number, row: number): number {
  let mask = 0;
  if (grid[row - 1]?.[col])  mask |= N;
  if (grid[row]?.[col + 1])  mask |= E;
  if (grid[row + 1]?.[col])  mask |= S;
  if (grid[row]?.[col - 1])  mask |= W;
  return mask; // 0–15
}
```

Map bitmask value → frame index from the semantic atlas:

```typescript
// Derived from assets-spritesheet-map.md
const GRASS_BITMASK_TO_FRAME: Record<number, number> = {
  15: 12,  // center-fill (all 4 neighbors present)
  14: 1,   // edge-west missing  (N+E+S)
  13: 3,   // edge-east missing  (N+S+W)
  11: 2,   // edge-south missing (N+E+W)
   7: 0,   // edge-north missing (E+S+W)
  // ... corners and isolated cases from atlas doc
   0: 40,  // isolated
};
```

The full mapping is derived from `docs/assets-spritesheet-map.md`. If a bitmask value is
missing from the lookup, fall back to the center-fill frame (15 → col 1, row 3 per the
atlas).

---

## Step 4 — Rendering with `@pixi/tilemap`

`@pixi/tilemap` v5.x targets PixiJS v8.5.0+ with WebGL and WebGPU. It is 100%
programmatic — no Tiled file format required.

```bash
npm install @pixi/tilemap
```

```typescript
import { CompositeTilemap } from '@pixi/tilemap';
import { Assets } from 'pixi.js';

const texture = await Assets.load('/assets/tilesets/Grass.png');
const tilemap  = new CompositeTilemap();

for (let row = 0; row < ROOM_ROWS; row++) {
  for (let col = 0; col < ROOM_COLS; col++) {
    const mask  = getBitmask(grassGrid, col, row);
    const frame = GRASS_BITMASK_TO_FRAME[mask] ?? GRASS_BITMASK_TO_FRAME[15];
    const u     = (frame % COLS) * TILE;
    const v     = Math.floor(frame / COLS) * TILE;

    tilemap.tile(texture, col * TILE * SCALE, row * TILE * SCALE, {
      u,
      v,
      tileWidth:  TILE,
      tileHeight: TILE,
      scaleX: SCALE,
      scaleY: SCALE,
    });
  }
}

app.stage.addChild(tilemap);
```

`SCALE = 3` matches the rest of the project (16px tiles rendered at 48px).

`CompositeTilemap` handles the WebGL texture-unit limit transparently by compositing
multiple internal `Tilemap` instances.

---

## Constraints and Notes

| Constraint | Detail |
|---|---|
| License | Sprout Lands assets cannot be used for AI training or AI generation |
| Tile size | Always 16×16 px native; render at 3× = 48×48 px |
| Bitmask refs | `Bitmask references 1.png` / `2.png` are the authoritative variant map |
| Fallback | If bitmask value has no mapping, use center-fill frame |
| No Tiled | Do not add Tiled as a dependency; layout is code-defined |

---

## References

- `docs/assets-spritesheet-map.md` — full per-frame semantic atlas
- [pixijs-userland/tilemap — GitHub](https://github.com/pixijs-userland/tilemap)
- [Autotiling Technique — Excalibur.js blog](https://excaliburjs.com/blog/Autotiling%20Technique/)
- [Tile Bitmasking — Envato Tuts+](https://code.tutsplus.com/how-to-use-tile-bitmasking-to-auto-tile-your-level-layouts--cms-25673t)
