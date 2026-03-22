import { Container, Graphics, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';
import { TileMap } from './TileMap';

// ─── Water ───────────────────────────────────────────────────────────────────
const WATER_SRC = 16;
const WATER_DISPLAY = 48; // 3×
const TILE_PX = 48;

// ─── Coast grid ─────────────────────────────────────────────────────────────
const SHORE = [
  0,  // row 0:  padding above viewport — all grass
  7,  // row 1
  6,  // row 2
  5,  // row 3
  4,  // row 4
  3,  // row 5
  3,  // row 6
  3,  // row 7
  3,  // row 8
  3,  // row 9
  4,  // row 10
  5,  // row 11
  7,  // row 12
  9,  // row 13
  12, // row 14
  15, // row 15
  19, // row 16
  23, // row 17
];

const COAST_COLS = 42;

function buildCoast(): number[][] {
  return SHORE.map(waterCols => {
    const row = new Array(COAST_COLS).fill(1);
    for (let i = 0; i < waterCols; i++) row[i] = 0;
    return row;
  });
}

const COAST = buildCoast();

// Cat / house position (coast-grid coords)
const CAT_COL = 14;
const CAT_ROW = 7;

// ─── House composition ──────────────────────────────────────────────────────
// Top-down view — no roof. Assembled from Wooden_House_Walls_Tilset.png
// (beams + brick), Wooden House.png (window), and Doors.png.
//
// Layout (10 wide × 6 tall):
//   Row 0:   top beam  (walls tileset plank tile)
//   Row 1:   wall | brick interior + window | wall
//   Row 2-3: wall | brick interior          | wall
//   Row 4:   bottom beam + door

const SRC = 16;
const HOUSE_SCALE = 3;
const HOUSE_TILE = SRC * HOUSE_SCALE;  // 48
const HOUSE_COLS = 10;
const HOUSE_ROWS = 5;
const HOUSE_W = HOUSE_COLS * HOUSE_TILE;                          // 480
const HOUSE_H = HOUSE_ROWS * HOUSE_TILE;                          // 240
const DOOR_CENTER_X = HOUSE_W / 2;                                // 240

// ─── Decorations ─────────────────────────────────────────────────────────────
interface Decor {
  col: number; row: number;
  sx: number; sy: number;
  sw: number; sh: number;
}
const DECORS: Decor[] = [
  { col:  6, row: 3, sx: 16, sy: 0, sw: 32, sh: 32 }, // green tree — upper-left
  { col: 22, row: 3, sx: 48, sy: 0, sw: 32, sh: 32 }, // cherry blossom — upper-right
  { col:  6, row: 8, sx: 16, sy: 0, sw: 32, sh: 32 }, // green tree — lower-left
  { col: 22, row: 8, sx: 48, sy: 0, sw: 32, sh: 32 }, // cherry blossom — lower-right
];

// ─────────────────────────────────────────────────────────────────────────────

export class SceneBackground extends Container {
  private readonly water: TilingSprite;
  private readonly tileMap: TileMap;
  private readonly house: Container;
  private readonly decorSprites: Sprite[] = [];

  petStandX = 0;
  petStandY = 0;

  constructor(
    grassTex: Texture,
    waterTex: Texture,
    biomTex: Texture,
    houseTex: Texture,
    wallsTex: Texture,
    doorTex: Texture,
  ) {
    super();

    // Water — frame 1 of Water.png
    const waterFrame = new Texture({
      source: waterTex.source,
      frame: new Rectangle(WATER_SRC, 0, WATER_SRC, WATER_SRC),
    });
    this.water = new TilingSprite({ texture: waterFrame, width: 1, height: 1 });
    this.water.tileScale.set(WATER_DISPLAY / WATER_SRC);

    // Grass coast
    this.tileMap = new TileMap(grassTex, COAST, TILE_PX);

    // House (top-down, no roof)
    this.house = this.buildHouse(houseTex, wallsTex, doorTex);

    // Decoration sprites
    for (const d of DECORS) {
      const frame = new Texture({
        source: biomTex.source,
        frame: new Rectangle(d.sx, d.sy, d.sw, d.sh),
      });
      const spr = new Sprite(frame);
      spr.anchor.set(0.5, 1);
      spr.scale.set(3);
      this.decorSprites.push(spr);
    }

    this.addChild(this.water, this.tileMap, this.house, ...this.decorSprites);
  }

  /** Cut a single 16×16 tile from a tileset and return a scaled Sprite. */
  private tile(tex: Texture, col: number, row: number): Sprite {
    const frame = new Texture({
      source: tex.source,
      frame: new Rectangle(col * SRC, row * SRC, SRC, SRC),
    });
    const spr = new Sprite(frame);
    spr.scale.set(HOUSE_SCALE);
    return spr;
  }

  private buildHouse(
    houseTex: Texture,
    wallsTex: Texture,
    doorTex: Texture,
  ): Container {
    const house = new Container();
    const T = HOUSE_TILE;
    const INTERIOR_ROWS = 3;

    // Only cols 0-2 from the tilesets. No background fill needed —
    // center fills (col 1) are fully opaque, edge tiles (cols 0,2)
    // are designed to let the grass show through their outer half.
    //
    // houseTex rows 1/2/3 = wallsTex rows 0/1/2 (same tiles).
    // Use houseTex for edges, wallsTex for center fills.

    // ── Row 0: top beam ────────────────────────────────────────────────────
    this.addTile(house, houseTex, 0, 1, 0, 0);
    for (let c = 1; c < HOUSE_COLS - 1; c++)
      this.addTile(house, wallsTex, 1, 0, c * T, 0);
    this.addTile(house, houseTex, 2, 1, (HOUSE_COLS - 1) * T, 0);
    // Window (beam tile with window opening)
    this.addTile(house, houseTex, 1, 1, 4 * T, 0);

    // ── Rows 1-3: interior ─────────────────────────────────────────────────
    for (let r = 0; r < INTERIOR_ROWS; r++) {
      const y = (1 + r) * T;
      this.addTile(house, houseTex, 0, 2, 0, y);
      for (let c = 1; c < HOUSE_COLS - 1; c++)
        this.addTile(house, wallsTex, 1, 1, c * T, y);
      this.addTile(house, houseTex, 2, 2, (HOUSE_COLS - 1) * T, y);
    }

    // ── Row 4: bottom beam ─────────────────────────────────────────────────
    const bottomY = (1 + INTERIOR_ROWS) * T;
    this.addTile(house, houseTex, 0, 3, 0, bottomY);
    for (let c = 1; c < HOUSE_COLS - 1; c++)
      this.addTile(house, wallsTex, 1, 0, c * T, bottomY);
    this.addTile(house, houseTex, 2, 3, (HOUSE_COLS - 1) * T, bottomY);

    // ── Door at bottom-centre ──────────────────────────────────────────────
    // Doors.png rows: 0 = frame posts, 1 = door panel, 2 = mostly transparent, 3 = step.
    // Row 1 alone: top 3px thin frame → fills to fully opaque door panel.
    const doorFrame = new Texture({
      source: doorTex.source,
      frame: new Rectangle(0, SRC, SRC, SRC),
    });
    const doorSpr = new Sprite(doorFrame);
    doorSpr.scale.set(HOUSE_SCALE);
    doorSpr.anchor.set(0.5, 1);
    doorSpr.x = HOUSE_W / 2;
    doorSpr.y = bottomY + T;
    house.addChild(doorSpr);

    return house;
  }

  private addTile(parent: Container, tex: Texture, col: number, row: number, x: number, y: number): void {
    const spr = this.tile(tex, col, row);
    spr.x = x;
    spr.y = y;
    parent.addChild(spr);
  }

  layout(w: number, h: number): void {
    this.water.width = w;
    this.water.height = h;

    const mapX = -TILE_PX;
    const mapY = -TILE_PX;
    this.tileMap.x = mapX;
    this.tileMap.y = mapY;

    // Pet position
    const catPos = this.tileMap.tileCenterBottom(CAT_COL, CAT_ROW);
    this.petStandX = catPos.x;
    this.petStandY = catPos.y;

    // House: centre on cat, bottom at cat feet
    this.house.x = catPos.x - DOOR_CENTER_X;
    this.house.y = catPos.y - HOUSE_H;

    // Decoration positions
    DECORS.forEach((d, i) => {
      const pos = this.tileMap.tileCenterBottom(d.col, d.row);
      this.decorSprites[i].x = pos.x;
      this.decorSprites[i].y = pos.y;
    });
  }
}
