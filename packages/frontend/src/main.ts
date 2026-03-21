import { Application } from 'pixi.js';
import { PetRoom } from './canvas/PetRoom';
import { MockEvents } from './canvas/MockEvents';
import { eventBus } from './ws/eventBus';

async function main(): Promise<void> {
  const mount = document.getElementById('canvas');
  if (!mount) throw new Error('#canvas element not found');

  const app = new Application();
  await app.init({
    resizeTo: mount,
    background: 0x1a1a2e,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  mount.appendChild(app.canvas);

  const room = new PetRoom(app);
  app.stage.addChild(room, room.overlays);

  // ResizeObserver gives actual CSS px of the mount element — avoids the race
  // between window.resize and PixiJS's internal resizeTo handler.
  new ResizeObserver(() => {
    room.layout(mount.clientWidth, mount.clientHeight);
  }).observe(mount);

  eventBus.on('pet.state', (e) => room.updateStats(e.data));
  eventBus.on('pet.speak', (e) => room.showDialogue(e.data.message));
  eventBus.on('social.visit', (e) => {
    const lines = e.data.turns.map((t) => t.line).join(' / ');
    room.showDialogue(`[${e.data.from_pet_id}] ${lines}`);
  });
  eventBus.on('social.gift', (e) => room.showGift(e.data.from_pet_id));
  eventBus.on('friend.unlocked', (e) => room.showFriendUnlocked(e.data.pet_id));
  eventBus.on('error', (e) => room.showDialogue(`Error: ${e.data.message}`));

  new MockEvents().start();
}

main();
