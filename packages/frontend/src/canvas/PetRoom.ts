import { Application, Container, Graphics, Text, Ticker } from 'pixi.js';
import type { PetStateData } from '../ws/types';
import { DialogueBubble } from './DialogueBubble';
import { GiftAnimation } from './GiftAnimation';

const BAR_W = 150;
const BAR_H = 9;
const BAR_ROW = 26;
const STAT_BOTTOM_PAD = 72;
const PET_W = 64;
const PET_H = 64;

const C = {
  bg: 0x1a1a2e,
  floor: 0x16213e,
  pet: 0x7c3aed,
  petEdge: 0xa78bfa,
  hunger: 0xf59e0b,
  mood: 0x10b981,
  affection: 0xec4899,
  track: 0x2a2a4a,
  label: 0x8888aa,
};

interface StatBar { fg: Graphics; current: number; target: number; color: number }

/** Main PixiJS scene: background, pet placeholder, animated stat bars. */
export class PetRoom extends Container {
  readonly overlays: Container;
  private readonly bg = new Graphics();
  private readonly pet = new Graphics();
  private readonly statRoot = new Container();
  private readonly bars: [StatBar, StatBar, StatBar];
  private readonly bubble: DialogueBubble;
  private readonly gift: GiftAnimation;

  constructor(private readonly app: Application) {
    super();
    this.overlays = new Container();

    this.addChild(this.bg, this.pet, this.statRoot);

    this.buildPet();

    const hungerBar = this.makeBar(C.hunger);
    const moodBar = this.makeBar(C.mood);
    const affectionBar = this.makeBar(C.affection);
    this.bars = [hungerBar, moodBar, affectionBar];
    this.buildStatRows(['Hunger', 'Mood', 'Affection'], [hungerBar, moodBar, affectionBar]);

    this.bubble = new DialogueBubble(app);
    this.gift = new GiftAnimation(app);
    this.overlays.addChild(this.bubble, this.gift);

    this.layout(app.screen.width, app.screen.height);
    app.ticker.add(this.onTick, this);
  }

  private makeBar(color: number): StatBar {
    return { fg: new Graphics(), current: 70, target: 70, color };
  }

  private buildPet(): void {
    const g = this.pet;
    // Ears
    g.roundRect(-PET_W / 2 - 4, -PET_H / 2, 10, 14, 3).fill(C.petEdge);
    g.roundRect(PET_W / 2 - 6, -PET_H / 2, 10, 14, 3).fill(C.petEdge);
    // Body
    g.roundRect(-PET_W / 2, -PET_H / 2, PET_W, PET_H, 12).fill(C.pet);
    g.roundRect(-PET_W / 2, -PET_H / 2, PET_W, PET_H, 12).stroke({ color: C.petEdge, width: 2 });
    // Eyes
    g.circle(-11, -8, 5).fill(0xffffff);
    g.circle(11, -8, 5).fill(0xffffff);
    g.circle(-10, -7, 3).fill(0x1a1a2e);
    g.circle(12, -7, 3).fill(0x1a1a2e);
  }

  private buildStatRows(labels: string[], statBars: StatBar[]): void {
    labels.forEach((label, i) => {
      const row = new Container();
      row.y = i * BAR_ROW;

      const lbl = new Text({ text: label, style: { fill: C.label, fontSize: 11, fontFamily: 'system-ui' } });
      const track = new Graphics();
      track.roundRect(0, 14, BAR_W, BAR_H, 4).fill(C.track);
      statBars[i].fg.roundRect(0, 14, BAR_W, BAR_H, 4).fill(statBars[i].color);

      row.addChild(lbl, track, statBars[i].fg);
      this.statRoot.addChild(row);
    });
  }

  layout(w: number, h: number): void {
    this.bg.clear();
    this.bg.rect(0, 0, w, h).fill(C.bg);
    this.bg.rect(0, h * 0.62, w, h * 0.38).fill(C.floor);

    this.pet.x = w / 2;
    this.pet.y = h * 0.42;

    this.bubble.setPetPosition(w / 2, h * 0.42 - PET_H / 2);
    this.gift.setOrigin(w / 2, h * 0.42);

    this.statRoot.x = (w - BAR_W) / 2;
    this.statRoot.y = h - STAT_BOTTOM_PAD;
  }

  private readonly onTick = (ticker: Ticker): void => {
    const speed = 1 - Math.exp(-5 * (ticker.deltaMS / 1000));
    for (const bar of this.bars) {
      bar.current += (bar.target - bar.current) * speed;
      const w = Math.max(2, BAR_W * (bar.current / 100));
      bar.fg.clear();
      bar.fg.roundRect(0, 14, w, BAR_H, Math.min(4, w / 2)).fill(bar.color);
    }
  };

  updateStats(data: PetStateData): void {
    this.bars[0].target = data.hunger;
    this.bars[1].target = data.mood;
    this.bars[2].target = data.affection;
  }

  showDialogue(message: string): void { this.bubble.enqueue(message); }

  showGift(from: string): void { this.gift.spawn(from); }

  destroy(options?: Parameters<Container['destroy']>[0]): void {
    super.destroy(options);
  }
}
