import { Container, TilingSprite, Texture } from 'pixi.js';

const TILE_SCALE = 3; // pixel-art upscale factor

/**
 * Tiled room background.
 * Top section: Wooden House tileset tiles as room walls.
 * Bottom section: Grass tileset tiles as floor.
 */
export class RoomBackground extends Container {
  private readonly wall: TilingSprite;
  private readonly floor: TilingSprite;

  constructor(wallTexture: Texture, floorTexture: Texture) {
    super();
    this.wall = new TilingSprite({ texture: wallTexture, width: 1, height: 1 });
    this.wall.tileScale.set(TILE_SCALE);

    this.floor = new TilingSprite({ texture: floorTexture, width: 1, height: 1 });
    this.floor.tileScale.set(TILE_SCALE);

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
