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
// How many px the visitor walks up into the door before disappearing
const DOOR_ENTER_DEPTH = 96;

type PetStateData = Extract<WsEvent, { type: 'pet.state' }>['data'];

export interface SceneTextures {
  spritesheet: Texture;
  grass: Texture;  // Grass.png
  water: Texture;  // Water.png
  biom: Texture;   // Basic Grass Biom things 1.png
  house: Texture;  // Wooden House.png
  walls: Texture;  // Wooden_House_Walls_Tilset.png
  door: Texture;   // Doors.png
}

export class PetRoom extends Container {
  readonly overlays: Container;
  private readonly bg: SceneBackground;
  private readonly petSprite: PetSprite;
  private readonly visitor: VisitorSprite;
  private readonly bubble: DialogueBubble;
  private readonly gift: GiftAnimation;
  private readonly flash = new Graphics();
  private flashElapsed = -1;

  constructor(private readonly app: Application, textures: SceneTextures) {
    super();
    this.overlays = new Container();

    this.bg = new SceneBackground(textures.grass, textures.water, textures.biom, textures.house, textures.walls, textures.door);
    this.petSprite = new PetSprite(textures.spritesheet);
    this.visitor = new VisitorSprite(textures.spritesheet);

    this.addChild(this.bg, this.visitor, this.petSprite);

    this.bubble = new DialogueBubble(app);
    this.gift = new GiftAnimation(app);
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
    const enterTopY = doorY - DOOR_ENTER_DEPTH;

    this.visitor.walkThrough(offscreenX, doorY, [
      // Phase 1: walk left from offscreen to door
      { x: doorX, y: doorY, row: 1 },
      // Phase 2: walk up into door, trigger dialogue, pause inside house
      {
        x: doorX,
        y: enterTopY,
        row: 3,
        onArrive: () => { this.bubble.enqueue(`[${fromPetId}] ${message}`); },
        pauseMs: VISIT_INSIDE_MS,
      },
      // Phase 4: reappear at door top, walk down to floor
      { x: doorX, y: doorY, row: 0 },
      // Phase 5: walk right offscreen
      { x: offscreenX, y: doorY, row: 2 },
    ]);
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
