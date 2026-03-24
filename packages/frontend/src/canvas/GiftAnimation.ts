import { Application, Container, Graphics, Sprite, Texture, Ticker } from 'pixi.js';

const FLOAT_DURATION_MS = 1200;
const FLOAT_HEIGHT = 100;
const SPAWN_SPREAD = 50;
const SPARKLE_COUNT = 5;
const SPARKLE_STAGGER_MS = 110;
const SPARKLE_COLORS = [0xfbbf24, 0xf59e0b, 0xfcd34d, 0xec4899, 0xa78bfa];

const MAX_TROPHIES = 5;
const TROPHY_DROPIN_MS = 300;
const TROPHY_SCALE = 0.15; // gift.png is 688×363 — 0.15 gives ~103×54 px on screen

interface Sparkle {
  container: Container;
  elapsed: number;
  startY: number;
}

interface TrophyAnim {
  spr: Sprite;
  elapsed: number;
}

/** Spawns sparkle particles on social.gift, and manages persistent trophy sprites. */
export class GiftAnimation extends Container {
  /** Insert this container into the main scene (behind pets) for ground-level trophies. */
  readonly trophyLayer = new Container();

  private readonly active = new Set<Sparkle>();
  private readonly trophies: Sprite[] = [];
  private readonly trophyAnims: TrophyAnim[] = [];
  private originX = 0;
  private originY = 0;

  constructor(app: Application) {
    super();
    app.ticker.add(this.onTick, this);
  }

  setOrigin(x: number, y: number): void {
    this.originX = x;
    this.originY = y;
  }

  get trophyCount(): number {
    return this.trophies.length;
  }

  spawn(_from: string): void {
    for (let i = 0; i < SPARKLE_COUNT; i++) {
      setTimeout(() => this.spawnOne(), i * SPARKLE_STAGGER_MS);
    }
  }

  /**
   * Place a persistent trophy sprite at (x, y) with a scale 0→1 drop-in.
   * Oldest trophy is removed once the max of 5 is exceeded.
   */
  placeTrophy(x: number, y: number, texture: Texture): void {
    if (this.trophies.length >= MAX_TROPHIES) {
      const oldest = this.trophies.shift()!;
      this.trophyLayer.removeChild(oldest);
      oldest.destroy();
    }
    const spr = new Sprite(texture);
    spr.anchor.set(0.5, 1);
    spr.scale.set(0);
    spr.x = x;
    spr.y = y;
    this.trophyLayer.addChild(spr);
    this.trophies.push(spr);
    this.trophyAnims.push({ spr, elapsed: 0 });
  }

  private spawnOne(): void {
    const container = new Container();
    const g = new Graphics();
    const size = 6 + Math.random() * 7;
    const color = SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)];

    // 4-point star / diamond shape
    g.moveTo(0, -size)
      .lineTo(size * 0.3, -size * 0.3)
      .lineTo(size, 0)
      .lineTo(size * 0.3, size * 0.3)
      .lineTo(0, size)
      .lineTo(-size * 0.3, size * 0.3)
      .lineTo(-size, 0)
      .lineTo(-size * 0.3, -size * 0.3)
      .closePath()
      .fill(color);

    container.addChild(g);
    container.x = this.originX + (Math.random() - 0.5) * SPAWN_SPREAD;
    container.y = this.originY + (Math.random() - 0.5) * 20;
    container.rotation = Math.random() * Math.PI * 2;

    this.addChild(container);
    this.active.add({ container, elapsed: 0, startY: container.y });
  }

  private readonly onTick = (ticker: Ticker): void => {
    // Sparkles
    const doneSpark: Sparkle[] = [];
    for (const s of this.active) {
      s.elapsed += ticker.deltaMS;
      const t = Math.min(1, s.elapsed / FLOAT_DURATION_MS);
      const eased = 1 - (1 - t) ** 2;
      s.container.y = s.startY - FLOAT_HEIGHT * eased;
      s.container.rotation += ticker.deltaMS * 0.003;
      s.container.alpha = 1 - t;
      if (t >= 1) doneSpark.push(s);
    }
    for (const s of doneSpark) {
      this.active.delete(s);
      this.removeChild(s.container);
      s.container.destroy({ children: true });
    }

    // Trophy drop-in animations
    const doneAnims: TrophyAnim[] = [];
    for (const a of this.trophyAnims) {
      a.elapsed += ticker.deltaMS;
      const t = Math.min(1, a.elapsed / TROPHY_DROPIN_MS);
      const eased = 1 - (1 - t) ** 2; // ease-out quad
      a.spr.scale.set(eased * TROPHY_SCALE);
      if (t >= 1) doneAnims.push(a);
    }
    for (const a of doneAnims) {
      this.trophyAnims.splice(this.trophyAnims.indexOf(a), 1);
    }
  };
}
