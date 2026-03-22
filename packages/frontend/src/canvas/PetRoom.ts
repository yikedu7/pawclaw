import { Application, Container, Graphics, Text, Ticker, Texture } from 'pixi.js';
import type { WsEvent } from '@x-pet/shared';
import { DialogueBubble } from './DialogueBubble';
import { GiftAnimation } from './GiftAnimation';
import { SceneBackground } from './SceneBackground';
import { PetSprite } from './PetSprite';
import { VisitorSprite } from './VisitorSprite';

const BAR_W = 150;
const BAR_H = 9;
const BAR_ROW = 26;
const STAT_BOTTOM_PAD = 90;
const PET_SPRITE_H = 144; // 48px frame × 3 scale
const FRIEND_FLASH_MS = 1200;
const VISIT_SLIDE_OUT_DELAY_MS = 4200;

const C = {
  hunger: 0xf59e0b,
  mood: 0x10b981,
  affection: 0xec4899,
  track: 0x2a2a4a,
  label: 0x8888aa,
};

type PetStateData = Extract<WsEvent, { type: 'pet.state' }>['data'];
interface StatBar { fg: Graphics; current: number; target: number; color: number }

export interface SceneTextures {
  spritesheet: Texture;
  grass: Texture;  // Grass.png
  water: Texture;  // Water.png
  biom: Texture;   // Basic Grass Biom things 1.png
  house: Texture;  // Wooden House.png
  roof: Texture;   // Wooden_House_Roof_Tilset.png
  walls: Texture;  // Wooden_House_Walls_Tilset.png
  door: Texture;   // Doors.png
}

export class PetRoom extends Container {
  readonly overlays: Container;
  private readonly bg: SceneBackground;
  private readonly petSprite: PetSprite;
  private readonly visitor: VisitorSprite;
  private readonly statRoot = new Container();
  private readonly bars: [StatBar, StatBar, StatBar];
  private readonly bubble: DialogueBubble;
  private readonly gift: GiftAnimation;
  private readonly flash = new Graphics();
  private flashElapsed = -1;
  private visitSlideOutTimer = -1;

  constructor(private readonly app: Application, textures: SceneTextures) {
    super();
    this.overlays = new Container();

    this.bg = new SceneBackground(textures.grass, textures.water, textures.biom, textures.house, textures.roof, textures.walls, textures.door);
    this.petSprite = new PetSprite(textures.spritesheet);
    this.visitor = new VisitorSprite(textures.spritesheet);

    this.addChild(this.bg, this.visitor, this.petSprite, this.statRoot);

    const hungerBar = this.makeBar(C.hunger);
    const moodBar = this.makeBar(C.mood);
    const affectionBar = this.makeBar(C.affection);
    this.bars = [hungerBar, moodBar, affectionBar];
    this.buildStatRows(['Hunger', 'Mood', 'Affection'], [hungerBar, moodBar, affectionBar]);

    this.bubble = new DialogueBubble(app);
    this.gift = new GiftAnimation(app);
    this.flash.alpha = 0;
    this.overlays.addChild(this.bubble, this.gift, this.flash);

    this.layout(app.screen.width, app.screen.height);
    app.ticker.add(this.onTick, this);
  }

  private makeBar(color: number): StatBar {
    return { fg: new Graphics(), current: 70, target: 70, color };
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
    this.bg.layout(w, h);

    const petX = this.bg.petStandX;
    const petY = this.bg.petStandY;

    this.petSprite.x = petX;
    this.petSprite.y = petY;

    this.bubble.setPetPosition(petX, petY - PET_SPRITE_H);
    this.gift.setOrigin(petX, petY - PET_SPRITE_H / 2);

    this.statRoot.x = (w - BAR_W) / 2;
    this.statRoot.y = h - STAT_BOTTOM_PAD;

    this.flash.clear();
    this.flash.rect(0, 0, w, h).fill({ color: 0xfbbf24, alpha: 0.18 });
  }

  private readonly onTick = (ticker: Ticker): void => {
    const speed = 1 - Math.exp(-5 * (ticker.deltaMS / 1000));
    for (const bar of this.bars) {
      bar.current += (bar.target - bar.current) * speed;
      const w = Math.max(2, BAR_W * (bar.current / 100));
      bar.fg.clear();
      bar.fg.roundRect(0, 14, w, BAR_H, Math.min(4, w / 2)).fill(bar.color);
    }

    if (this.flashElapsed >= 0) {
      this.flashElapsed += ticker.deltaMS;
      const t = Math.min(1, this.flashElapsed / FRIEND_FLASH_MS);
      this.flash.alpha = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
      if (t >= 1) { this.flash.alpha = 0; this.flashElapsed = -1; }
    }

    if (this.visitSlideOutTimer >= 0) {
      this.visitSlideOutTimer -= ticker.deltaMS;
      if (this.visitSlideOutTimer < 0) {
        this.visitor.slideOut(this.app.screen.width + 80);
      }
    }

    this.petSprite.update(ticker.deltaMS);
    this.visitor.update(ticker);
  };

  updateStats(data: PetStateData): void {
    this.bars[0].target = data.hunger;
    this.bars[1].target = data.mood;
    this.bars[2].target = data.affection;
  }

  showDialogue(message: string): void { this.bubble.enqueue(message); }

  showVisit(fromPetId: string, message: string): void {
    const visitorTargetX = this.bg.petStandX + 100;
    const visitorY = this.bg.petStandY;
    const offscreenX = this.app.screen.width + 80;

    this.visitSlideOutTimer = -1;
    this.visitor.slideIn(offscreenX, visitorTargetX, visitorY, () => {
      this.bubble.enqueue(`[${fromPetId}] ${message}`);
      this.visitSlideOutTimer = VISIT_SLIDE_OUT_DELAY_MS;
    });
    this.petSprite.flashHappy();
  }

  showGift(from: string): void {
    this.gift.spawn(from);
    this.petSprite.flashHappy();
  }

  showFriendUnlocked(petId: string): void {
    this.bubble.enqueue(`Friend unlocked: ${petId}!`);
    this.flashElapsed = 0;
    this.petSprite.flashHappy();
  }

  destroy(options?: Parameters<Container['destroy']>[0]): void {
    super.destroy(options);
  }
}
