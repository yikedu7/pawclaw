import { AnimatedSprite, Container, Rectangle, Texture } from 'pixi.js';

const FRAME_W = 48;
const FRAME_H = 48;
const SCALE = 3;
const IDLE_SPEED = 0.06;
const HAPPY_SPEED = 0.18;
const HAPPY_DURATION_MS = 2500;

function makeRow(source: Texture['source'], row: number): Texture[] {
  return Array.from({ length: 4 }, (_, col) =>
    new Texture({
      source,
      frame: new Rectangle(col * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H),
    }),
  );
}

/**
 * Pixel-art pet sprite from Basic Charakter Spritesheet.png (192×192, 4×4 grid of 48×48).
 * Row 0 = walk-down (idle loop).
 * Row 3 = walk-right (happy flash on positive events).
 * Anchor is bottom-centre so `.y` marks the pet's feet on the floor line.
 */
export class PetSprite extends Container {
  private readonly sprite: AnimatedSprite;
  private readonly idleFrames: Texture[];
  private readonly happyFrames: Texture[];
  private happyTimer = -1;

  constructor(spritesheetTexture: Texture) {
    super();
    const src = spritesheetTexture.source;
    this.idleFrames = makeRow(src, 0);
    this.happyFrames = makeRow(src, 3);

    this.sprite = new AnimatedSprite(this.idleFrames);
    this.sprite.animationSpeed = IDLE_SPEED;
    this.sprite.anchor.set(0.5, 1);
    this.sprite.scale.set(SCALE);
    this.sprite.play();
    this.addChild(this.sprite);
  }

  /** Switch to happy walk animation, then revert to idle after HAPPY_DURATION_MS. */
  flashHappy(): void {
    this.sprite.textures = this.happyFrames;
    this.sprite.animationSpeed = HAPPY_SPEED;
    this.sprite.play();
    this.happyTimer = HAPPY_DURATION_MS;
  }

  /** Call each tick with deltaMS to drive the happy-revert timer. */
  update(deltaMS: number): void {
    if (this.happyTimer < 0) return;
    this.happyTimer -= deltaMS;
    if (this.happyTimer < 0) {
      this.sprite.textures = this.idleFrames;
      this.sprite.animationSpeed = IDLE_SPEED;
      this.sprite.play();
    }
  }
}
