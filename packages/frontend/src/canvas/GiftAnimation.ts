import { Application, Container, Graphics, Ticker } from 'pixi.js';

const COIN_R = 14;
const FLOAT_DURATION_MS = 1100;
const FLOAT_HEIGHT = 90;
const SPAWN_SPREAD = 36;

interface ActiveGift {
  container: Container;
  elapsed: number;
  startY: number;
}

/** Spawns floating OKB token icons that drift upward and fade out. */
export class GiftAnimation extends Container {
  private readonly active = new Set<ActiveGift>();
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
    const container = new Container();

    const coin = new Graphics();
    coin.circle(0, 0, COIN_R).fill(0xf59e0b);
    coin.circle(0, 0, COIN_R - 3).stroke({ color: 0xd97706, width: 2 });
    // Inner gem mark
    coin.circle(0, 0, 5).fill(0xfef3c7);

    container.addChild(coin);
    container.x = this.originX + (Math.random() - 0.5) * SPAWN_SPREAD;
    container.y = this.originY;

    this.addChild(container);
    this.active.add({ container, elapsed: 0, startY: container.y });
  }

  private readonly onTick = (ticker: Ticker): void => {
    const done: ActiveGift[] = [];

    for (const gift of this.active) {
      gift.elapsed += ticker.deltaMS;
      const t = Math.min(1, gift.elapsed / FLOAT_DURATION_MS);
      const eased = 1 - (1 - t) ** 2; // ease-out quad

      gift.container.y = gift.startY - FLOAT_HEIGHT * eased;
      gift.container.alpha = 1 - t;

      if (t >= 1) done.push(gift);
    }

    for (const gift of done) {
      this.active.delete(gift);
      this.removeChild(gift.container);
      gift.container.destroy({ children: true });
    }
  };
}
