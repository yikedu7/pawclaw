import { Container, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';
import { TileMap } from './TileMap';

// ─── Water ───────────────────────────────────────────────────────────────────
// Water.png: 64×16 = 4 animation frames of 16×16. Use frame 1 (calm inner).
const WATER_SRC = 16;
const WATER_DISPLAY = 48; // 3×

// ─── Island grid ─────────────────────────────────────────────────────────────
// 22 cols × 10 rows.  1 = grass, 0 = water.
// Staircase edges so only Group-A 9 tiles are needed (no concave corners).
//
//   col:  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21
const ISLAND: number[][] = [
  [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], // row 0
  [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0], // row 1
  [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0], // row 2
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0], // row 3
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0], // row 4
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0], // row 5
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0], // row 6
  [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0], // row 7
  [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 8
  [0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 9
];

// Cat stands here (in island-grid coords)
const CAT_COL = 9;
const CAT_ROW = 7;

// ─── Decorations ─────────────────────────────────────────────────────────────
// Sprites cut from Basic Grass Biom things 1.png (144×80, 16×16 grid).
// Large objects span 2×2 tiles (32×32 source).  Display at 3× = 96×96.
// Positions are island-grid (col, row) where the sprite's centre-bottom lands.
interface Decor {
  col: number; row: number;           // island tile position
  sx: number; sy: number;             // source x,y in biom sheet
  sw: number; sh: number;             // source w,h
}
const DECORS: Decor[] = [
  { col: 3,  row: 2, sx: 0,  sy: 0,  sw: 32, sh: 32 }, // large green tree — left
  { col: 15, row: 2, sx: 0,  sy: 32, sw: 32, sh: 32 }, // heart tree — right
  { col: 16, row: 5, sx: 32, sy: 32, sw: 32, sh: 32 }, // teal bush — right lower
  { col: 5,  row: 6, sx: 32, sy: 0,  sw: 32, sh: 32 }, // round bush — left lower
];

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seaside island scene:
 *   layer 1 — water TilingSprite (full canvas)
 *   layer 2 — grass TileMap (centred, bitmask edges)
 *   layer 3 — decoration sprites
 *
 * After layout() call, read petStandX / petStandY for the cat's foot position.
 */
export class SceneBackground extends Container {
  private readonly water: TilingSprite;
  private readonly tileMap: TileMap;
  private readonly decorSprites: Sprite[] = [];

  petStandX = 0;
  petStandY = 0;

  constructor(grassTex: Texture, waterTex: Texture, biomTex: Texture) {
    super();

    // Water — frame 1 of Water.png
    const waterFrame = new Texture({
      source: waterTex.source,
      frame: new Rectangle(WATER_SRC, 0, WATER_SRC, WATER_SRC),
    });
    this.water = new TilingSprite({ texture: waterFrame, width: 1, height: 1 });
    this.water.tileScale.set(WATER_DISPLAY / WATER_SRC);

    // Grass island
    this.tileMap = new TileMap(grassTex, ISLAND, 48);

    // Decoration sprites
    for (const d of DECORS) {
      const frame = new Texture({
        source: biomTex.source,
        frame: new Rectangle(d.sx, d.sy, d.sw, d.sh),
      });
      const spr = new Sprite(frame);
      spr.anchor.set(0.5, 1);
      spr.scale.set(3); // 32×32 → 96×96
      this.decorSprites.push(spr);
    }

    this.addChild(this.water, this.tileMap, ...this.decorSprites);
  }

  layout(w: number, h: number): void {
    // Water covers entire canvas
    this.water.width = w;
    this.water.height = h;

    // Centre island horizontally; vertically centre in the top 72% (scene area)
    const mapW = ISLAND[0].length * 48;  // 22 × 48 = 1056
    const mapH = ISLAND.length * 48;     // 10 × 48 = 480
    const sceneH = h * 0.72;

    const mapX = Math.round((w - mapW) / 2);
    const mapY = Math.max(0, Math.round((sceneH - mapH) / 2));

    this.tileMap.x = mapX;
    this.tileMap.y = mapY;

    // Pet position
    const catPos = this.tileMap.tileCenterBottom(CAT_COL, CAT_ROW);
    this.petStandX = catPos.x;
    this.petStandY = catPos.y;

    // Decoration positions
    DECORS.forEach((d, i) => {
      const pos = this.tileMap.tileCenterBottom(d.col, d.row);
      this.decorSprites[i].x = pos.x;
      this.decorSprites[i].y = pos.y;
    });
  }
}
