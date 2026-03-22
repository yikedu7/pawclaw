import { Container, Rectangle, Sprite, Texture } from 'pixi.js';

const SRC = 16; // source tile size in Grass.png

/**
 * Pick the correct Grass.png tile based on 4 cardinal + 4 diagonal neighbours.
 *
 * Group A (cols 0–2, rows 0–2) — outer edges and corners:
 *   (0,0)=TL  (1,0)=T   (2,0)=TR
 *   (0,1)=L   (1,1)=F   (2,1)=R
 *   (0,2)=BL  (1,2)=B   (2,2)=BR
 *
 * Group C (cols 4–10, rows 0–4) — inner concave corners (all cardinals grass,
 * one diagonal is water):
 *   (5,1)=inner concave NE missing
 *   (6,1)=inner concave NW missing
 *   (7,1)=inner concave SE missing
 *   (8,1)=inner concave SW missing
 */
function tileCoord(
  N: number, E: number, S: number, W: number,
  NE = 1, NW = 1, SE = 1, SW = 1,
): [number, number] {
  // Outer edges and corners (Group A)
  if (!N && !W) return [0, 0]; // top-left corner
  if (!N && !E) return [2, 0]; // top-right corner
  if (!S && !W) return [0, 2]; // bottom-left corner
  if (!S && !E) return [2, 2]; // bottom-right corner
  if (!N)        return [1, 0]; // top edge
  if (!S)        return [1, 2]; // bottom edge
  if (!W)        return [0, 1]; // left edge
  if (!E)        return [2, 1]; // right edge
  // Inner concave corners — all 4 cardinals grass, one diagonal is water (Group C)
  if (!NW)       return [6, 2]; // concave NW notch
  if (!NE)       return [5, 2]; // concave NE notch
  if (!SW)       return [6, 1]; // concave SW notch
  if (!SE)       return [5, 1]; // concave SE notch
  return          [1, 1];       // fully interior
}

/**
 * Renders a 2-D tile grid using Grass.png sub-textures.
 * 0 = water (no sprite), 1 = grass (auto-selects edge variant).
 */
export class TileMap extends Container {
  readonly cols: number;
  readonly rows: number;

  constructor(
    grassTex: Texture,
    readonly grid: number[][],
    readonly tileDisplay = 48, // display px per tile (source 16 × 3 = 48)
  ) {
    super();
    this.rows = grid.length;
    this.cols = grid[0].length;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (!grid[r][c]) continue;

        const N  = r > 0                             ? grid[r - 1][c]     : 0;
        const S  = r < this.rows - 1                ? grid[r + 1][c]     : 0;
        const W  = c > 0                             ? grid[r][c - 1]     : 0;
        const E  = c < this.cols - 1                ? grid[r][c + 1]     : 0;
        const NW = r > 0 && c > 0                   ? grid[r - 1][c - 1] : 0;
        const NE = r > 0 && c < this.cols - 1       ? grid[r - 1][c + 1] : 0;
        const SW = r < this.rows - 1 && c > 0       ? grid[r + 1][c - 1] : 0;
        const SE = r < this.rows - 1 && c < this.cols - 1 ? grid[r + 1][c + 1] : 0;

        const [tc, tr] = tileCoord(N, E, S, W, NE, NW, SE, SW);

        const frame = new Texture({
          source: grassTex.source,
          frame: new Rectangle(tc * SRC, tr * SRC, SRC, SRC),
        });

        const sprite = new Sprite(frame);
        sprite.scale.set(tileDisplay / SRC);
        sprite.x = c * tileDisplay;
        sprite.y = r * tileDisplay;
        this.addChild(sprite);
      }
    }
  }

  /** Screen position of the centre-bottom of tile (col, row), in world space. */
  tileCenterBottom(col: number, row: number): { x: number; y: number } {
    return {
      x: this.x + col * this.tileDisplay + this.tileDisplay / 2,
      y: this.y + (row + 1) * this.tileDisplay,
    };
  }
}
