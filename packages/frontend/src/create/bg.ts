import { Application, Assets, Texture, TextureStyle } from 'pixi.js';
import { PetRoom } from '../canvas/PetRoom';

TextureStyle.defaultOptions.scaleMode = 'nearest';

async function initBg(): Promise<void> {
  const mount = document.getElementById('bg-canvas');
  if (!mount) return;

  const app = new Application();
  await app.init({
    resizeTo: mount,
    background: 0x7ec8c8,
    antialias: false,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  mount.appendChild(app.canvas);

  Assets.add({ alias: 'spritesheet', src: '/assets/characters/Basic Charakter Spritesheet.png' });
  Assets.add({ alias: 'grass',       src: '/assets/tilesets/Grass.png' });
  Assets.add({ alias: 'water',       src: '/assets/tilesets/Water.png' });
  Assets.add({ alias: 'biom',        src: '/assets/objects/Basic Grass Biom things 1.png' });
  Assets.add({ alias: 'house',       src: '/assets/tilesets/Wooden House.png' });
  Assets.add({ alias: 'walls',       src: '/assets/tilesets/Wooden_House_Walls_Tilset.png' });
  Assets.add({ alias: 'door',        src: '/assets/tilesets/Doors.png' });
  Assets.add({ alias: 'giftItem',    src: '/assets/objects/gift.png' });

  const textures = await Assets.load<Texture>(
    ['spritesheet', 'grass', 'water', 'biom', 'house', 'walls', 'door', 'giftItem'],
  ) as Record<string, Texture>;

  const room = new PetRoom(app, {
    spritesheet: textures['spritesheet'],
    grass:       textures['grass'],
    water:       textures['water'],
    biom:        textures['biom'],
    house:       textures['house'],
    walls:       textures['walls'],
    door:        textures['door'],
    giftItem:    textures['giftItem'],
  });
  app.stage.addChild(room, room.overlays);

  new ResizeObserver(() => {
    room.layout(mount.clientWidth, mount.clientHeight);
  }).observe(mount);

  // Greeting animation on load; pet idles automatically after
  room.greet();
}

initBg();
