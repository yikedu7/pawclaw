import { AnimatedSprite, Container, Rectangle, Texture } from 'pixi.js';

const FRAME_W = 48;
const FRAME_H = 48;
const SCALE = 3;
const IDLE_SPEED = 0.06;
const HAPPY_SPEED = 0.18;
const HAPPY_DURATION_MS = 2500;
const WALK_SPEED_PX_PER_S = 160;

// Spritesheet row mapping: row0=down(face cam), row1=up(back to cam), row2=left, row3=right
const ROW_DOWN  = 0;
const ROW_LEFT  = 2;
const ROW_RIGHT = 3;
const ROW_HAPPY = 3; // walk-right row reused for happy flash

function makeRow(source: Texture['source'], row: number): Texture[] {
  return Array.from({ length: 4 }, (_, col) =>
    new Texture({
      source,
      frame: new Rectangle(col * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H),
    }),
  );
}

interface PetWaypoint { x: number; y: number; }

type PetState = 'idle' | 'happy' | 'walking';

/**
 * Pixel-art pet sprite (Basic Charakter Spritesheet.png, 4×4 grid of 48×48).
 * Supports idle loop, happy-flash, and waypoint-driven walking at constant speed.
 * Anchor is bottom-centre so `.y` marks the pet's feet on the floor line.
 */
export class PetSprite extends Container {
  private readonly idleSprite:  AnimatedSprite;
  private readonly happySprite: AnimatedSprite;
  private readonly leftSprite:  AnimatedSprite;
  private readonly rightSprite: AnimatedSprite;
  private active: AnimatedSprite;

  private state: PetState = 'idle';
  private happyTimer = -1;
  private walkQueue: PetWaypoint[] = [];
  private onWalkDone: (() => void) | null = null;

  constructor(spritesheetTexture: Texture) {
    super();
    const src = spritesheetTexture.source;

    const make = (row: number): AnimatedSprite => {
      const spr = new AnimatedSprite(makeRow(src, row));
      spr.animationSpeed = IDLE_SPEED;
      spr.anchor.set(0.5, 1);
      spr.scale.set(SCALE);
      spr.visible = false;
      spr.play();
      this.addChild(spr);
      return spr;
    };

    this.idleSprite  = make(ROW_DOWN);
    this.happySprite = make(ROW_HAPPY);
    this.leftSprite  = make(ROW_LEFT);
    this.rightSprite = make(ROW_RIGHT);

    this.idleSprite.visible = true;
    this.active = this.idleSprite;
  }

  private show(spr: AnimatedSprite, speed = IDLE_SPEED): void {
    if (this.active !== spr) {
      this.active.visible = false;
      this.active = spr;
      spr.visible = true;
    }
    spr.animationSpeed = speed;
  }

  private updateWalkDirection(): void {
    if (this.walkQueue.length === 0) return;
    const wp = this.walkQueue[0];
    const dx = wp.x - this.x;
    const dy = wp.y - this.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      this.show(dx >= 0 ? this.rightSprite : this.leftSprite);
    } else {
      // vertical dominant — use down (row 0) going down, happy/up row going up
      this.show(dy >= 0 ? this.idleSprite : this.happySprite);
    }
  }

  /** Switch to happy walk animation; no-ops during walking. */
  flashHappy(): void {
    if (this.state === 'walking') return;
    this.show(this.happySprite, HAPPY_SPEED);
    this.state = 'happy';
    this.happyTimer = HAPPY_DURATION_MS;
  }

  /**
   * Walk through a waypoint sequence at ~80 px/s; call onDone when the last
   * waypoint is reached. No-ops if already walking.
   */
  walkTo(waypoints: PetWaypoint[], onDone: () => void): void {
    if (this.state === 'walking' || waypoints.length === 0) return;
    this.walkQueue = [...waypoints];
    this.onWalkDone = onDone;
    this.state = 'walking';
    this.updateWalkDirection();
  }

  /** Call each tick with deltaMS to drive animations and movement. */
  update(deltaMS: number): void {
    if (this.state === 'happy') {
      this.happyTimer -= deltaMS;
      if (this.happyTimer <= 0) {
        this.show(this.idleSprite, IDLE_SPEED);
        this.state = 'idle';
      }
      return;
    }

    if (this.state !== 'walking') return;

    if (this.walkQueue.length === 0) {
      this.show(this.idleSprite, IDLE_SPEED);
      this.state = 'idle';
      const cb = this.onWalkDone;
      this.onWalkDone = null;
      cb?.();
      return;
    }

    const wp = this.walkQueue[0];
    const dx = wp.x - this.x;
    const dy = wp.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const step = (WALK_SPEED_PX_PER_S * deltaMS) / 1000;

    if (dist <= step) {
      this.x = wp.x;
      this.y = wp.y;
      this.walkQueue.shift();
      if (this.walkQueue.length > 0) this.updateWalkDirection();
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }
}
