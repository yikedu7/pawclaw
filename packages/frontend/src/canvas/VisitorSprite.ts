import { AnimatedSprite, Container, Rectangle, Texture, Ticker } from 'pixi.js';

const FRAME_W = 48;
const FRAME_H = 48;
const SCALE = 2.5;
const SPEED_PX_PER_S = 160;

interface Waypoint {
  x: number;
  y: number;
  row: number;            // spritesheet row while moving: 0=down 1=up 2=left 3=right
  stopRow?: number;       // row to switch to when stopped here (waitMs); defaults to row
  onArrive?: () => void;  // called when waypoint is reached
  pauseMs?: number;       // hide sprite for this many ms before next waypoint
  waitMs?: number;        // stay visible for this many ms before next waypoint
}

type State = 'hidden' | 'walking' | 'paused' | 'waiting';

/**
 * A visiting pet sprite that walks in from the right, stops at the door,
 * then walks back off-screen to the right.
 *
 * Spritesheet rows: row0=down(face cam), row1=up(back to cam), row2=left, row3=right.
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
      spr.tint = 0xaa88ff; // purple tint to distinguish visitor from host pet
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

    if (this.state === 'paused' || this.state === 'waiting') {
      this.pauseRemaining -= ticker.deltaMS;
      if (this.pauseRemaining <= 0) {
        if (this.queue.length === 0) {
          this.visible = false;
          this.state = 'hidden';
          return;
        }
        const next = this.queue[0];
        if (this.state === 'paused') {
          // Reappear then walk
          this.visible = true;
          this.rows[this.activeRow].visible = false;
          this.activeRow = next.row;
        }
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
      } else if (wp.waitMs != null && wp.waitMs > 0) {
        // Stay visible, stop moving; optionally switch to a standing direction
        if (wp.stopRow != null) this.setRow(wp.stopRow);
        this.state = 'waiting';
        this.pauseRemaining = wp.waitMs;
      }
      // else: continue to next waypoint next frame
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }
}
