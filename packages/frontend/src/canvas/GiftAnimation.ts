import { Application, Container, Graphics, Ticker } from 'pixi.js';

const FLOAT_DURATION_MS = 1200;
const FLOAT_HEIGHT = 100;
const SPAWN_SPREAD = 50;
const SPARKLE_COUNT = 5;
const SPARKLE_STAGGER_MS = 110;
const SPARKLE_COLORS = [0xfbbf24, 0xf59e0b, 0xfcd34d, 0xec4899, 0xa78bfa];

interface Sparkle {
  container: Container;
  elapsed: number;
  startY: number;
}

/** Spawns sparkle particles that rotate, float upward, and fade on social.gift events. */
export class GiftAnimation extends Container {
  private readonly active = new Set<Sparkle>();
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

  spawn(_from: string): void {
    for (let i = 0; i < SPARKLE_COUNT; i++) {
      setTimeout(() => this.spawnOne(), i * SPARKLE_STAGGER_MS);
    }
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
    const done: Sparkle[] = [];

    for (const s of this.active) {
      s.elapsed += ticker.deltaMS;
      const t = Math.min(1, s.elapsed / FLOAT_DURATION_MS);
      const eased = 1 - (1 - t) ** 2; // ease-out quad

      s.container.y = s.startY - FLOAT_HEIGHT * eased;
      s.container.rotation += ticker.deltaMS * 0.003;
      s.container.alpha = 1 - t;

      if (t >= 1) done.push(s);
    }

    for (const s of done) {
      this.active.delete(s);
      this.removeChild(s.container);
      s.container.destroy({ children: true });
    }
  };
}
