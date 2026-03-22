import { Application, Assets, Texture, TextureStyle } from 'pixi.js';
import { PetRoom } from './canvas/PetRoom';
import { LoadingScreen } from './canvas/LoadingScreen';
import { MockEvents } from './canvas/MockEvents';
import { eventBus } from './ws/eventBus';

// Crisp pixel-art rendering — no bilinear blur on upscaled sprites.
TextureStyle.defaultOptions.scaleMode = 'nearest';

async function main(): Promise<void> {
  const mount = document.getElementById('canvas');
  if (!mount) throw new Error('#canvas element not found');

  const app = new Application();
  await app.init({
    resizeTo: mount,
    background: 0x1a1a2e,
    antialias: false,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  mount.appendChild(app.canvas);

  // Show loading screen while assets initialise.
  const loader = new LoadingScreen(mount.clientWidth, mount.clientHeight);
  app.stage.addChild(loader);

  Assets.add({ alias: 'spritesheet', src: '/assets/characters/Basic Charakter Spritesheet.png' });
  Assets.add({ alias: 'wall', src: '/assets/tilesets/Wooden House.png' });
  Assets.add({ alias: 'floor', src: '/assets/tilesets/Grass.png' });

  const textures = await Assets.load<Texture>(['spritesheet', 'wall', 'floor'], (p: number) =>
    loader.setProgress(p),
  ) as Record<string, Texture>;

  app.stage.removeChild(loader);
  loader.destroy({ children: true });

  const room = new PetRoom(app, {
    spritesheet: textures['spritesheet'],
    wall: textures['wall'],
    floor: textures['floor'],
  });
  app.stage.addChild(room, room.overlays);

  new ResizeObserver(() => {
    room.layout(mount.clientWidth, mount.clientHeight);
  }).observe(mount);

  eventBus.on('pet.state', (e) => room.updateStats(e.data));
  eventBus.on('pet.speak', (e) => room.showDialogue(e.data.message));
  eventBus.on('social.visit', (e) => {
    const lines = e.data.turns.map((t: { line: string }) => t.line).join(' / ');
    room.showVisit(e.data.from_pet_id, lines);
  });
  eventBus.on('social.gift', (e) => room.showGift(e.data.from_pet_id));
  eventBus.on('friend.unlocked', (e) => room.showFriendUnlocked(e.data.pet_id));
  eventBus.on('error', (e) => room.showDialogue(`Error: ${e.data.message}`));

  new MockEvents().start();
}

main();
