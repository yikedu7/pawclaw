import { Application, Container, Graphics, Ticker, Texture } from 'pixi.js';
import type { WsEvent } from '@x-pet/shared';
import { DialogueBubble } from './DialogueBubble';
import { GiftAnimation } from './GiftAnimation';
import { SceneBackground } from './SceneBackground';
import { PetSprite } from './PetSprite';
import { VisitorSprite } from './VisitorSprite';

const PET_SPRITE_H = 144; // 48px frame × 3 scale
const FRIEND_FLASH_MS = 1200;
// How long (ms) visitor stays inside house during dialogue before exiting
const VISIT_INSIDE_MS = 4200;
// House interior height is 240px (5 tiles × 48px); place trophies at the centre (~2.5 tiles in)
const TROPHY_Y_OFFSET = -120; // px above petStandY — puts trophies in house interior centre
const TROPHY_X_START  = -60;  // first trophy: 60px left of door centre
const TROPHY_X_STEP   =  30;  // spread trophies 30px apart horizontally

type PetStateData = Extract<WsEvent, { type: 'pet.state' }>['data'];

export interface SceneTextures {
  spritesheet: Texture;
  grass: Texture;  // Grass.png
  water: Texture;  // Water.png
  biom: Texture;   // Basic Grass Biom things 1.png
  house: Texture;  // Wooden House.png
  walls: Texture;  // Wooden_House_Walls_Tilset.png
  door: Texture;   // Doors.png
  giftItem: Texture; // gift.png trophy sprite
}

export class PetRoom extends Container {
  readonly overlays: Container;
  private readonly bg: SceneBackground;
  private readonly petSprite: PetSprite;
  private readonly visitor: VisitorSprite;
  private readonly bubble: DialogueBubble;
  private readonly gift: GiftAnimation;
  private readonly flash = new Graphics();
  private readonly giftTexture: Texture;
  private flashElapsed = -1;

  constructor(private readonly app: Application, textures: SceneTextures) {
    super();
    this.overlays = new Container();
    this.giftTexture = textures.giftItem;

    this.bg = new SceneBackground(textures.grass, textures.water, textures.biom, textures.house, textures.walls, textures.door);
    this.petSprite = new PetSprite(textures.spritesheet);
    this.visitor = new VisitorSprite(textures.spritesheet);
    this.bubble = new DialogueBubble(app);
    this.gift = new GiftAnimation(app);

    this.addChild(this.bg, this.visitor, this.gift.trophyLayer, this.petSprite);

    this.flash.alpha = 0;
    this.overlays.addChild(this.bubble, this.gift, this.flash);

    this.layout(app.screen.width, app.screen.height);
    app.ticker.add(this.onTick, this);
  }

  layout(w: number, h: number): void {
    this.bg.layout(w, h);

    const petX = this.bg.petStandX;
    const petY = this.bg.petStandY;

    this.petSprite.x = petX;
    this.petSprite.y = petY;

    this.bubble.setPetPosition(petX, petY - PET_SPRITE_H);
    this.gift.setOrigin(petX, petY - PET_SPRITE_H / 2);

    this.flash.clear();
    this.flash.rect(0, 0, w, h).fill({ color: 0xfbbf24, alpha: 0.18 });
  }

  private readonly onTick = (ticker: Ticker): void => {
    if (this.flashElapsed >= 0) {
      this.flashElapsed += ticker.deltaMS;
      const t = Math.min(1, this.flashElapsed / FRIEND_FLASH_MS);
      this.flash.alpha = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
      if (t >= 1) { this.flash.alpha = 0; this.flashElapsed = -1; }
    }

    this.petSprite.update(ticker.deltaMS);
    this.visitor.update(ticker);
  };

  updateStats(_data: PetStateData): void {
    // Stats are now rendered by the DOM UI overlay (packages/frontend/src/ui/StatBars.ts)
  }

  showDialogue(message: string): void { this.bubble.enqueue(message); }

  showVisit(fromPetId: string, message: string): void {
    const doorX = this.bg.doorX;
    const doorY = this.bg.doorY;
    const offscreenX = this.app.screen.width + 80;

    this.visitor.walkThrough(offscreenX, doorY, [
      // Walk left from offscreen to door; disappear there while dialogue plays
      {
        x: doorX, y: doorY, row: 1,
        onArrive: () => { this.bubble.enqueue(`[${fromPetId}] ${message}`); },
        pauseMs: VISIT_INSIDE_MS,
      },
      // Reappear at door facing right, walk back offscreen
      { x: offscreenX, y: doorY, row: 2 },
    ]);
    this.petSprite.flashHappy();
  }

  showGift(from: string): void {
    this.gift.spawn(from);

    const petX = this.bg.petStandX;
    const petY = this.bg.petStandY;
    const spotX = petX + TROPHY_X_START + this.gift.trophyCount * TROPHY_X_STEP;
    const spotY = petY + TROPHY_Y_OFFSET; // inside house interior

    this.petSprite.walkTo([{ x: spotX, y: spotY }], () => {
      this.gift.placeTrophy(spotX, spotY, this.giftTexture);
      this.petSprite.walkTo([{ x: petX, y: petY }], () => {
        this.petSprite.flashHappy();
      });
    });
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
