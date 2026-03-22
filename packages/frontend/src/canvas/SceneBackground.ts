import { Container, Graphics, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';

const T = 16;          // source tile size
const TILE_SCALE = 3;  // 16px → 48px on screen
const HOUSE_SCALE = 4; // 112×80 → 448×320 on screen

function pickTile(tex: Texture, col: number, row: number): Texture {
  return new Texture({ source: tex.source, frame: new Rectangle(col * T, row * T, T, T) });
}

/**
 * Composed seaside-cottage scene:
 *   - Sky blue background
 *   - Ground (lower 40% of scene): water tiles on the left, grass tiles on the right
 *   - Wooden house sprite centred on the water/land boundary
 *
 * Accepts the full scene height (h × 0.72) via layout().
 */
export class SceneBackground extends Container {
  private readonly sky: Graphics;
  private readonly water: TilingSprite;
  private readonly grass: TilingSprite;
  private readonly house: Sprite;

  constructor(grassTex: Texture, waterTex: Texture, houseTex: Texture) {
    super();

    this.sky = new Graphics();

    // Water.png is 64×16 = 4 animation frames of 16×16; use frame 1 (calm inner water)
    const waterTile = pickTile(waterTex, 1, 0);
    this.water = new TilingSprite({ texture: waterTile, width: 1, height: 1 });
    this.water.tileScale.set(TILE_SCALE);

    // Grass.png 176×112 = 11×7 grid; col 1 row 1 = solid inner grass tile
    const grassTile = pickTile(grassTex, 1, 1);
    this.grass = new TilingSprite({ texture: grassTile, width: 1, height: 1 });
    this.grass.tileScale.set(TILE_SCALE);

    // Wooden House.png (112×80) used as a single building sprite, RGBA so transparent bg shows through
    this.house = new Sprite(houseTex);
    this.house.anchor.set(0.5, 1); // anchor at bottom-centre
    this.house.scale.set(HOUSE_SCALE);

    this.addChild(this.sky, this.water, this.grass, this.house);
  }

  layout(w: number, sceneH: number): void {
    // Sky fills the whole scene area
    this.sky.clear().rect(0, 0, w, sceneH).fill(0x87ceeb);

    // Ground occupies the lower 40% of the scene area
    const groundY = Math.floor(sceneH * 0.60);
    const groundH = sceneH - groundY;

    // Water on the left half, grass on the right half
    const midX = Math.floor(w / 2);

    this.water.x = 0;
    this.water.y = groundY;
    this.water.width = midX;
    this.water.height = groundH;

    this.grass.x = midX;
    this.grass.y = groundY;
    this.grass.width = w - midX;
    this.grass.height = groundH;

    // House: bottom aligned with scene bottom, centred horizontally
    this.house.x = w / 2;
    this.house.y = sceneH;
  }
}
