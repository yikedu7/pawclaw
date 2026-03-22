import { Container, Graphics, Text } from 'pixi.js';

const BAR_W = 220;
const BAR_H = 8;

/** Full-screen overlay shown while Assets.load() initialises. */
export class LoadingScreen extends Container {
  private readonly bar: Graphics;
  private readonly barX: number;
  private readonly barY: number;

  constructor(w: number, h: number) {
    super();
    const bg = new Graphics().rect(0, 0, w, h).fill(0x1a1a2e);

    const label = new Text({
      text: 'Loading...',
      style: { fill: 0x8888aa, fontSize: 16, fontFamily: 'system-ui' },
    });
    label.anchor.set(0.5);
    label.x = w / 2;
    label.y = h / 2 - 20;

    this.barX = (w - BAR_W) / 2;
    this.barY = h / 2 + 4;
    const track = new Graphics()
      .roundRect(this.barX, this.barY, BAR_W, BAR_H, 4)
      .fill(0x2a2a4a);

    this.bar = new Graphics();
    this.addChild(bg, label, track, this.bar);
    this.setProgress(0);
  }

  setProgress(p: number): void {
    const w = Math.max(4, BAR_W * Math.max(0, Math.min(1, p)));
    this.bar
      .clear()
      .roundRect(this.barX, this.barY, w, BAR_H, Math.min(4, w / 2))
      .fill(0x7c3aed);
  }
}
