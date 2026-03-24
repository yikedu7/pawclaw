import { eventBus } from '../ws/eventBus';
import { Nameplate } from './Nameplate';
import { ChatLog, resolvePetName } from './ChatLog';
import { Toasts } from './Toasts';
import { HudBar } from './HudBar';
import './styles.css';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? 'http://localhost:3001';

/** Fetch pet data and apply PAW-based hunger to the HUD. */
async function loadPetHunger(petId: string, token: string, hudBar: HudBar): Promise<void> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/pets/${petId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json() as {
      paw_balance?: string;
      initial_credits?: number;
      mood?: number;
      affection?: number;
    };
    const pawBalance = parseFloat(data.paw_balance ?? '0');
    const initialCredits = data.initial_credits ?? 200;
    const hunger = Math.max(0, Math.min(100, Math.round((pawBalance / initialCredits) * 100)));
    hudBar.updateStats(hunger, data.mood ?? 100, data.affection ?? 0);
  } catch { /* ignore — WS events will update when available */ }
}

/** Initialize the DOM UI overlay and wire it to the WS eventBus. */
export function initUI(mount: HTMLElement, petId?: string, token?: string): void {
  const overlay = document.createElement('div');
  overlay.id = 'ui-overlay';

  const nameplate = new Nameplate('My Pet', '0x1234...5678', 'online');
  const chatLog = new ChatLog();
  const toasts = new Toasts();
  const hudBar = new HudBar(petId, token);

  overlay.append(nameplate.el, chatLog.el, toasts.el, hudBar.el, hudBar.diaryPanel.el, hudBar.friendsPanel.el, hudBar.walletPanel.el);
  mount.appendChild(overlay);

  // Load initial hunger from PAW balance on page open
  if (petId && token) {
    loadPetHunger(petId, token, hudBar).catch(() => {});
  }

  // Wire eventBus → UI components
  eventBus.on('pet.state', (e) => {
    hudBar.updateStats(e.data.hunger, e.data.mood, e.data.affection);
  });

  eventBus.on('pet.speak', (e) => {
    chatLog.addSpeak(e.data.pet_id, e.data.message);
  });

  eventBus.on('social.visit', (e) => {
    chatLog.addVisit(e.data.from_pet_id, e.data.turns);
  });

  eventBus.on('social.gift', (e) => {
    const isSent = petId && e.data.from_pet_id === petId;
    if (isSent) {
      resolvePetName(e.data.to_pet_id, token ?? null).then((toName) => {
        toasts.gift(e.data.from_pet_id, toName, e.data.amount, e.data.token, e.data.tx_hash, 'sent');
      });
    } else {
      resolvePetName(e.data.from_pet_id, token ?? null).then((fromName) => {
        toasts.gift(fromName, e.data.to_pet_id, e.data.amount, e.data.token, e.data.tx_hash, 'received');
      });
    }
  });

  eventBus.on('friend.unlocked', (e) => {
    toasts.friendUnlocked(e.data.pet_name ?? e.data.pet_id);
  });

  eventBus.on('pet.died', (e) => {
    // Drain hunger to 0 and show dead state
    hudBar.updateStats(0, 0, 0);
    toasts.show(`Pet ${e.data.pet_id} has died — PAW balance is 0. Top up to revive!`, 'gift');
  });

  eventBus.on('pet.revived', (e) => {
    // Refresh from API to get updated paw_balance
    if (token) {
      loadPetHunger(e.data.pet_id, token, hudBar).catch(() => {});
    }
    toasts.show(`Pet ${e.data.pet_id} has been revived!`, 'friend');
  });
}
