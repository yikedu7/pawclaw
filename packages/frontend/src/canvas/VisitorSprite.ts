import { AnimatedSprite, Container, Rectangle, Texture, Ticker } from 'pixi.js';

const FRAME_W = 48;
const FRAME_H = 48;
const SCALE = 2.5;
const SLIDE_MS = 500;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) ** 2;
}

type State = 'hidden' | 'sliding-in' | 'visible' | 'sliding-out';

/**
 * A visiting pet sprite that slides in from the right on social.visit,
 * lingers while dialogue plays, then slides back out.
 * Uses walk-left frames (row 2) from Basic Charakter Spritesheet.png.
 */
export class VisitorSprite extends Container {
  private readonly sprite: AnimatedSprite;
  private state: State = 'hidden';
  private elapsed = 0;
  private fromX = 0;
  private toX = 0;
  private onDone: (() => void) | null = null;

  constructor(spritesheetTexture: Texture) {
    super();
    const frames = Array.from({ length: 4 }, (_, col) =>
      new Texture({
        source: spritesheetTexture.source,
        frame: new Rectangle(col * FRAME_W, 2 * FRAME_H, FRAME_W, FRAME_H), // row 2 = walk-left
      }),
    );
    this.sprite = new AnimatedSprite(frames);
    this.sprite.animationSpeed = 0.1;
    this.sprite.anchor.set(0.5, 1);
    this.sprite.scale.set(SCALE);
    this.sprite.play();
    this.addChild(this.sprite);
    this.visible = false;
  }

  slideIn(fromX: number, toX: number, y: number, onDone: () => void): void {
    if (this.state !== 'hidden') return;
    this.x = fromX;
    this.y = y;
    this.fromX = fromX;
    this.toX = toX;
    this.visible = true;
    this.state = 'sliding-in';
    this.elapsed = 0;
    this.onDone = onDone;
  }

  slideOut(toX: number, onDone?: () => void): void {
    if (this.state !== 'visible') return;
    this.fromX = this.x;
    this.toX = toX;
    this.state = 'sliding-out';
    this.elapsed = 0;
    this.onDone = onDone ?? null;
  }

  update(ticker: Ticker): void {
    if (this.state === 'hidden' || this.state === 'visible') return;
    this.elapsed += ticker.deltaMS;
    const t = Math.min(1, this.elapsed / SLIDE_MS);
    this.x = this.fromX + (this.toX - this.fromX) * easeInOut(t);
    if (t >= 1) {
      const wasSlidingIn = this.state === 'sliding-in';
      if (wasSlidingIn) {
        this.x = this.toX;
        this.state = 'visible';
      } else {
        this.state = 'hidden';
        this.visible = false;
      }
      const cb = this.onDone;
      this.onDone = null;
      cb?.();
    }
  }
}
