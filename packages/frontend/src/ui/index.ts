import { eventBus } from '../ws/eventBus';
import { Nameplate } from './Nameplate';
import { ChatLog } from './ChatLog';
import { Toasts } from './Toasts';
import { StatBars } from './StatBars';
import './styles.css';

/** Initialize the DOM UI overlay and wire it to the WS eventBus. */
export function initUI(mount: HTMLElement): void {
  const overlay = document.createElement('div');
  overlay.id = 'ui-overlay';

  const nameplate = new Nameplate('My Pet', '0x1234...5678', 'online');
  const chatLog = new ChatLog();
  const toasts = new Toasts();
  const statBars = new StatBars();

  overlay.append(nameplate.el, chatLog.el, toasts.el, statBars.el);
  mount.appendChild(overlay);

  // Wire eventBus → UI components
  eventBus.on('pet.state', (e) => {
    statBars.update(e.data.hunger, e.data.mood, e.data.affection);
  });

  eventBus.on('pet.speak', (e) => {
    chatLog.addSpeak(e.data.pet_id, e.data.message);
  });

  eventBus.on('social.visit', (e) => {
    chatLog.addVisit(e.data.from_pet_id, e.data.turns);
  });

  eventBus.on('social.gift', (e) => {
    toasts.gift(e.data.from_pet_id, e.data.to_pet_id, e.data.amount, e.data.token);
  });

  eventBus.on('friend.unlocked', (e) => {
    toasts.friendUnlocked(e.data.pet_id);
  });
}
