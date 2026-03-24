import { AnimatedSprite, Container, Rectangle, Texture, Ticker } from 'pixi.js';

const FRAME_W = 48;
const FRAME_H = 48;
const SCALE = 2.5;
const SPEED_PX_PER_S = 80;

interface Waypoint {
  x: number;
  y: number;
  row: number;           // spritesheet row: 0=down 1=left 2=right 3=up
  onArrive?: () => void; // called when waypoint is reached
  pauseMs?: number;      // hide sprite for this many ms before next waypoint
}

type State = 'hidden' | 'walking' | 'paused';

/**
 * A visiting pet sprite that walks in from the right edge of screen,
 * enters the house door (walk-up), waits inside while dialogue plays,
 * then exits the door (walk-down) and walks off-screen to the right.
 *
 * Uses a waypoint queue at constant speed (~80 px/s, no easing).
 * Spritesheet rows: row0=walk-down, row1=walk-left, row2=walk-right, row3=walk-up.
 */
export class VisitorSprite extends Container {
  private readonly rows: AnimatedSprite[];
  private activeRow = 1;
  private state: State = 'hidden';
  private queue: Waypoint[] = [];
  private pauseRemaining = 0;

  constructor(spritesheetTexture: Texture) {
    super();

    this.rows = Array.from({ length: 4 }, (_, r) => {
      const frames = Array.from({ length: 4 }, (_, col) =>
        new Texture({
          source: spritesheetTexture.source,
          frame: new Rectangle(col * FRAME_W, r * FRAME_H, FRAME_W, FRAME_H),
        }),
      );
      const spr = new AnimatedSprite(frames);
      spr.animationSpeed = 0.1;
      spr.anchor.set(0.5, 1);
      spr.scale.set(SCALE);
      spr.visible = false;
      spr.play();
      this.addChild(spr);
      return spr;
    });

    this.visible = false;
  }

  private setRow(row: number): void {
    if (this.activeRow === row) return;
    this.rows[this.activeRow].visible = false;
    this.activeRow = row;
    this.rows[row].visible = true;
  }

  /**
   * Begin the full walk sequence from (startX, startY) through all waypoints.
   * A waypoint with pauseMs hides the sprite there before continuing.
   * No-ops if already walking.
   */
  walkThrough(startX: number, startY: number, waypoints: Waypoint[]): void {
    if (waypoints.length === 0 || this.state !== 'hidden') return;
    this.x = startX;
    this.y = startY;
    this.queue = [...waypoints];
    this.state = 'walking';
    this.visible = true;

    const first = this.queue[0];
    this.rows[this.activeRow].visible = false;
    this.activeRow = first.row;
    this.rows[first.row].visible = true;
  }

  update(ticker: Ticker): void {
    if (this.state === 'hidden') return;

    if (this.state === 'paused') {
      this.pauseRemaining -= ticker.deltaMS;
      if (this.pauseRemaining <= 0) {
        if (this.queue.length === 0) {
          this.state = 'hidden';
          return;
        }
        // Reappear at current position and resume walking
        this.visible = true;
        const next = this.queue[0];
        this.setRow(next.row);
        this.rows[next.row].visible = true;
        this.state = 'walking';
      }
      return;
    }

    // state === 'walking'
    if (this.queue.length === 0) {
      this.visible = false;
      this.state = 'hidden';
      return;
    }

    const wp = this.queue[0];
    const dx = wp.x - this.x;
    const dy = wp.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const step = (SPEED_PX_PER_S * ticker.deltaMS) / 1000;

    if (dist <= step) {
      // Arrived at waypoint
      this.x = wp.x;
      this.y = wp.y;
      this.queue.shift();
      wp.onArrive?.();

      if (wp.pauseMs != null && wp.pauseMs > 0) {
        this.visible = false;
        this.rows[this.activeRow].visible = false;
        this.state = 'paused';
        this.pauseRemaining = wp.pauseMs;
      }
      // else: continue to next waypoint next frame
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }
}
