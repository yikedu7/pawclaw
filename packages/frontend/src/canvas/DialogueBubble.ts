import { Application, Container, Graphics, Text, Ticker } from 'pixi.js';

const PADDING = 12;
const RADIUS = 8;
const MAX_WRAP = 200;
const FADE_IN_MS = 180;
const HOLD_MS = 3000;
const FADE_OUT_MS = 400;

type Phase = 'idle' | 'fadein' | 'holding' | 'fadeout';

/**
 * Queued speech bubble that appears above the pet.
 * Messages enqueue; each shows for HOLD_MS then fades, dequeuing the next.
 */
export class DialogueBubble extends Container {
  private readonly bg = new Graphics();
  private readonly display: Text;
  private readonly queue: string[] = [];
  private phase: Phase = 'idle';
  private elapsed = 0;
  private petX = 0;
  private petTopY = 0;

  constructor(app: Application) {
    super();
    this.alpha = 0;
    this.visible = false;

    this.display = new Text({
      text: '',
      style: {
        fill: 0x1a1a2e,
        fontSize: 13,
        fontFamily: 'system-ui, sans-serif',
        wordWrap: true,
        wordWrapWidth: MAX_WRAP,
      },
    });

    this.addChild(this.bg, this.display);
    app.ticker.add(this.onTick, this);
  }

  setPetPosition(x: number, topY: number): void {
    this.petX = x;
    this.petTopY = topY;
    if (this.phase !== 'idle') this.reposition();
  }

  enqueue(message: string): void {
    this.queue.push(message);
    if (this.phase === 'idle') this.showNext();
  }

  private showNext(): void {
    const message = this.queue.shift();
    if (message === undefined) {
      this.phase = 'idle';
      return;
    }
    this.display.text = message;
    this.drawBubble();
    this.reposition();
    this.alpha = 0;
    this.visible = true;
    this.phase = 'fadein';
    this.elapsed = 0;
  }

  private drawBubble(): void {
    const w = this.display.width + PADDING * 2;
    const h = this.display.height + PADDING * 2;
    this.bg.clear();
    this.bg.roundRect(0, 0, w, h, RADIUS).fill(0xffffff).stroke({ color: 0xcccccc, width: 1 });
    this.display.x = PADDING;
    this.display.y = PADDING;
  }

  private reposition(): void {
    this.x = this.petX - this.bg.width / 2;
    this.y = this.petTopY - this.bg.height - 14;
  }

  private readonly onTick = (ticker: Ticker): void => {
    if (this.phase === 'idle') return;
    this.elapsed += ticker.deltaMS;

    if (this.phase === 'fadein') {
      this.alpha = Math.min(1, this.elapsed / FADE_IN_MS);
      if (this.elapsed >= FADE_IN_MS) { this.phase = 'holding'; this.elapsed = 0; }
    } else if (this.phase === 'holding') {
      if (this.elapsed >= HOLD_MS) { this.phase = 'fadeout'; this.elapsed = 0; }
    } else if (this.phase === 'fadeout') {
      this.alpha = Math.max(0, 1 - this.elapsed / FADE_OUT_MS);
      if (this.elapsed >= FADE_OUT_MS) {
        this.visible = false;
        this.showNext();
      }
    }
  };

  destroy(options?: Parameters<Container['destroy']>[0]): void {
    // Ticker is cleaned up by the Application when it destroys.
    super.destroy(options);
  }
}
