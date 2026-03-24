import { Application, Assets, Texture, TextureStyle } from 'pixi.js';
import { PetRoom } from './canvas/PetRoom';
import { LoadingScreen } from './canvas/LoadingScreen';
import { MockEvents } from './canvas/MockEvents';
import { eventBus } from './ws/eventBus';
import { WsClient, buildWsUrl } from './ws/WsClient';
import { initUI } from './ui';

// Crisp pixel-art rendering — nearest-neighbour, no bilinear blur.
TextureStyle.defaultOptions.scaleMode = 'nearest';

async function main(): Promise<void> {
  const mount = document.getElementById('canvas');
  if (!mount) throw new Error('#canvas element not found');

  const app = new Application();
  await app.init({
    resizeTo: mount,
    background: 0x7ec8c8, // fallback teal matching water colour
    antialias: false,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  mount.appendChild(app.canvas);

  const params = new URLSearchParams(location.search);
  const token = params.get('token') ?? import.meta.env.VITE_WS_TOKEN as string | undefined;
  const petId = params.get('pet_id') ?? undefined;
  initUI(mount, petId, token ?? undefined);

  const loader = new LoadingScreen(mount.clientWidth, mount.clientHeight);
  app.stage.addChild(loader);

  Assets.add({ alias: 'spritesheet', src: '/assets/characters/Basic Charakter Spritesheet.png' });
  Assets.add({ alias: 'grass',       src: '/assets/tilesets/Grass.png' });
  Assets.add({ alias: 'water',       src: '/assets/tilesets/Water.png' });
  Assets.add({ alias: 'biom',        src: '/assets/objects/Basic Grass Biom things 1.png' });
  Assets.add({ alias: 'house',       src: '/assets/tilesets/Wooden House.png' });
  Assets.add({ alias: 'walls',       src: '/assets/tilesets/Wooden_House_Walls_Tilset.png' });
  Assets.add({ alias: 'door',        src: '/assets/tilesets/Doors.png' });

  const textures = await Assets.load<Texture>(
    ['spritesheet', 'grass', 'water', 'biom', 'house', 'walls', 'door'],
    (p: number) => loader.setProgress(p),
  ) as Record<string, Texture>;

  app.stage.removeChild(loader);
  loader.destroy({ children: true });

  const room = new PetRoom(app, {
    spritesheet: textures['spritesheet'],
    grass:       textures['grass'],
    water:       textures['water'],
    biom:        textures['biom'],
    house:       textures['house'],
    walls:       textures['walls'],
    door:        textures['door'],
  });
  app.stage.addChild(room, room.overlays);

  new ResizeObserver(() => {
    room.layout(mount.clientWidth, mount.clientHeight);
  }).observe(mount);

  eventBus.on('pet.state',      (e) => room.updateStats(e.data));
  eventBus.on('pet.speak',      (e) => room.showDialogue(e.data.message));
  eventBus.on('social.visit',   (e) => {
    const lines = e.data.turns.map((t: { line: string }) => t.line).join(' / ');
    room.showVisit(e.data.from_pet_id, lines);
  });
  eventBus.on('social.gift',    (e) => room.showGift(e.data.from_pet_id));
  eventBus.on('friend.unlocked',(e) => room.showFriendUnlocked(e.data.pet_id));
  eventBus.on('error',          (e) => room.showDialogue(`Error: ${e.data.message}`));

  if (token) {
    new WsClient(buildWsUrl(token)).connect();
  } else {
    new MockEvents().start();
  }
}

main();
