import { Application, Container, Graphics, Text, Ticker } from 'pixi.js';

const PADDING = 12;
const RADIUS = 8;
const MAX_WRAP = 200;
const FADE_IN_MS = 180;
const HOLD_MS = 3000;
const FADE_OUT_MS = 400;
const DOT_RADIUS = 4;
const DOT_SPACING = 14;
const DOT_PHASES = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];

type Phase = 'idle' | 'fadein' | 'holding' | 'fadeout' | 'thinking' | 'streaming';

/**
 * Queued speech bubble that appears above the pet.
 * Messages enqueue; each shows for HOLD_MS then fades, dequeuing the next.
 *
 * Streaming support:
 *   startThinking()  — show animated dot indicator (iMessage-style)
 *   stopThinking()   — exit thinking, enter streaming display mode
 *   updateCurrent()  — replace text of current bubble in real-time (no re-queue)
 *   enqueue()        — commit a complete sentence to the display queue
 */
export class DialogueBubble extends Container {
  private readonly bg = new Graphics();
  private readonly display: Text;
  private readonly dots: Graphics[] = [];
  private readonly queue: string[] = [];
  private phase: Phase = 'idle';
  private streamingMode = false;
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

    for (let i = 0; i < 3; i++) {
      const dot = new Graphics();
      dot.circle(0, 0, DOT_RADIUS).fill(0x888888);
      dot.visible = false;
      this.dots.push(dot);
    }

    this.addChild(this.bg, this.display, ...this.dots);
    app.ticker.add(this.onTick, this);
  }

  setPetPosition(x: number, topY: number): void {
    this.petX = x;
    this.petTopY = topY;
    if (this.phase !== 'idle') this.reposition();
  }

  // ── Streaming API ──────────────────────────────────────────────────────────

  /** Enter thinking phase: show bouncing dot indicator, clear text. */
  startThinking(): void {
    this.queue.length = 0;
    this.streamingMode = false;
    this.display.visible = false;
    this.display.text = '';
    this.drawThinkingBubble();
    this.reposition();
    this.elapsed = 0;
    this.alpha = 1;
    this.visible = true;
    this.phase = 'thinking';
    this.dots.forEach((d) => { d.visible = true; });
  }

  /** Exit thinking phase; begin streaming display mode. */
  stopThinking(): void {
    if (this.phase !== 'thinking') return;
    this.dots.forEach((d) => { d.visible = false; });
    this.display.visible = true;
    this.streamingMode = true;
    this.phase = 'streaming';
    // Alpha stays at 1 (was already faded in during thinking)
  }

  /**
   * Replace the text of the currently-visible bubble in real-time.
   * Only acts during streaming mode (before first enqueue).
   */
  updateCurrent(text: string): void {
    if (!this.streamingMode) return;
    this.display.text = text;
    if (this.phase === 'streaming' || this.phase === 'idle' || this.phase === 'thinking') {
      this.drawBubble();
      this.reposition();
      if (this.phase === 'idle' || this.phase === 'thinking') {
        this.alpha = 1;
        this.visible = true;
        this.phase = 'streaming';
        this.dots.forEach((d) => { d.visible = false; });
        this.display.visible = true;
      }
    }
  }

  // ── Queue API ──────────────────────────────────────────────────────────────

  enqueue(message: string): void {
    this.streamingMode = false;
    this.queue.push(message);
    if (this.phase === 'idle') {
      this.showNext();
    } else if (this.phase === 'streaming') {
      // Commit current streaming text → start hold countdown
      this.phase = 'holding';
      this.elapsed = 0;
    }
    // Other phases: queue drains naturally after current message
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private showNext(): void {
    const message = this.queue.shift();
    if (message === undefined) {
      this.phase = 'idle';
      this.visible = false;
      return;
    }
    this.display.text = message;
    this.display.visible = true;
    this.dots.forEach((d) => { d.visible = false; });
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
    this.dots.forEach((d) => { d.visible = false; });
  }

  private drawThinkingBubble(): void {
    // Small bubble just large enough for 3 dots
    const w = DOT_SPACING * 2 + DOT_RADIUS * 4 + PADDING * 2;
    const h = DOT_RADIUS * 2 + PADDING * 2;
    this.bg.clear();
    this.bg.roundRect(0, 0, w, h, RADIUS).fill(0xffffff).stroke({ color: 0xcccccc, width: 1 });

    const baseX = PADDING + DOT_RADIUS;
    const baseY = h / 2;
    this.dots.forEach((dot, i) => {
      dot.x = baseX + i * DOT_SPACING;
      dot.y = baseY;
    });
  }

  private reposition(): void {
    this.x = this.petX - this.bg.width / 2;
    this.y = this.petTopY - this.bg.height - 14;
  }

  private readonly onTick = (ticker: Ticker): void => {
    if (this.phase === 'idle') return;
    this.elapsed += ticker.deltaMS;

    if (this.phase === 'thinking') {
      const baseY = this.bg.height / 2;
      this.dots.forEach((dot, i) => {
        dot.y = baseY - Math.sin(this.elapsed * 0.004 + DOT_PHASES[i]) * 4;
      });
    } else if (this.phase === 'fadein') {
      this.alpha = Math.min(1, this.elapsed / FADE_IN_MS);
      if (this.elapsed >= FADE_IN_MS) {
        this.alpha = 1;
        this.phase = this.streamingMode ? 'streaming' : 'holding';
        this.elapsed = 0;
      }
    } else if (this.phase === 'holding') {
      if (this.elapsed >= HOLD_MS) { this.phase = 'fadeout'; this.elapsed = 0; }
    } else if (this.phase === 'fadeout') {
      this.alpha = Math.max(0, 1 - this.elapsed / FADE_OUT_MS);
      if (this.elapsed >= FADE_OUT_MS) {
        this.visible = false;
        this.showNext();
      }
    }
    // 'streaming' phase: no countdown — text updates via updateCurrent / enqueue
  };

  destroy(options?: Parameters<Container['destroy']>[0]): void {
    super.destroy(options);
  }
}
