import { Container, Rectangle, Texture, TilingSprite } from 'pixi.js';

const T = 16;           // source tile size (16×16 px in the tileset)
const DISPLAY_SCALE = 3; // pixel-art upscale → 48×48 px per tile on screen

/**
 * Pick a single 16×16 tile out of a larger tileset texture.
 * col/row are zero-based tile coordinates inside that tileset.
 */
function pickTile(tex: Texture, col: number, row: number): Texture {
  return new Texture({ source: tex.source, frame: new Rectangle(col * T, row * T, T, T) });
}

/**
 * Tiled room background.
 * Wall (top 72%): col 2, row 1 of Wooden_House_Walls_Tilset.png — plain interior plank wall.
 * Floor (bottom 28%): col 1, row 1 of Grass.png — solid green grass tile.
 */
export class RoomBackground extends Container {
  private readonly wall: TilingSprite;
  private readonly floor: TilingSprite;

  constructor(wallTileset: Texture, floorTileset: Texture) {
    super();

    const wallTile = pickTile(wallTileset, 2, 1);
    const floorTile = pickTile(floorTileset, 1, 1);

    this.wall = new TilingSprite({ texture: wallTile, width: 1, height: 1 });
    this.wall.tileScale.set(DISPLAY_SCALE);

    this.floor = new TilingSprite({ texture: floorTile, width: 1, height: 1 });
    this.floor.tileScale.set(DISPLAY_SCALE);

    this.addChild(this.wall, this.floor);
  }

  layout(w: number, h: number): void {
    const floorY = Math.floor(h * 0.72);

    this.wall.x = 0;
    this.wall.y = 0;
    this.wall.width = w;
    this.wall.height = floorY;

    this.floor.x = 0;
    this.floor.y = floorY;
    this.floor.width = w;
    this.floor.height = h - floorY;
  }
}
