import { DiaryPanel } from './DiaryPanel';
import { FriendsPanel } from './FriendsPanel';
import { Icons } from './icons';

interface StatSlot {
  fill: HTMLDivElement;
  valueEl: HTMLSpanElement;
}

const STAT_DEFS = [
  { key: 'hunger',    icon: Icons.apple,  label: 'Hunger' },
  { key: 'mood',      icon: Icons.smile,  label: 'Mood' },
  { key: 'affection', icon: Icons.heart,  label: 'Love' },
];

/**
 * Bottom HUD bar — stat bars (left) | diary + friends (center) | wallet (right).
 * Mounts two panels (DiaryPanel, FriendsPanel) as siblings in the overlay.
 */
export class HudBar {
  readonly el: HTMLDivElement;
  readonly diaryPanel: DiaryPanel;
  readonly friendsPanel: FriendsPanel;

  private readonly slots: StatSlot[];

  constructor() {
    this.diaryPanel = new DiaryPanel();
    this.friendsPanel = new FriendsPanel();

    this.el = document.createElement('div');
    this.el.id = 'hud-bar';
    this.el.className = 'ui-panel';

    // ── Left: stat bars ─────────────────────────────────────────────
    const statsSection = document.createElement('div');
    statsSection.className = 'hud-stats';

    this.slots = STAT_DEFS.map((def) => {
      const item = document.createElement('div');
      item.className = 'hud-stat-item';

      const label = document.createElement('span');
      label.className = 'hud-stat-label';
      label.title = def.label;
      label.appendChild(def.icon());

      const track = document.createElement('div');
      track.className = 'stat-track';

      const fill = document.createElement('div');
      fill.className = `stat-fill ${def.key}`;
      fill.style.width = '70%';
      track.appendChild(fill);

      const valueEl = document.createElement('span');
      valueEl.className = 'stat-value';
      valueEl.textContent = '70';

      item.append(label, track, valueEl);
      statsSection.appendChild(item);

      return { fill, valueEl };
    });

    // ── Center: diary button + friends badge ─────────────────────────
    const centerSection = document.createElement('div');
    centerSection.className = 'hud-center';

    const diaryBtn = document.createElement('button');
    diaryBtn.className = 'hud-btn hud-diary-btn';
    diaryBtn.append(Icons.bookOpen(), ' Diary');
    diaryBtn.addEventListener('click', () => {
      this.friendsPanel.close();
      if (this.diaryPanel.isOpen()) {
        this.diaryPanel.close();
      } else {
        this.diaryPanel.open();
      }
    });

    const friendsBadge = document.createElement('button');
    friendsBadge.className = 'hud-btn hud-friends-btn';
    friendsBadge.append(Icons.users(), ' Friends');
    friendsBadge.addEventListener('click', () => {
      this.diaryPanel.close();
      this.friendsPanel.toggle();
    });

    centerSection.append(diaryBtn, friendsBadge);

    // ── Right: wallet stub ───────────────────────────────────────────
    const walletSection = document.createElement('div');
    walletSection.className = 'hud-wallet';

    walletSection.appendChild(Icons.wallet());

    const walletBalance = document.createElement('span');
    walletBalance.className = 'hud-wallet-balance';
    walletBalance.textContent = '0.05 OKB';

    walletSection.appendChild(walletBalance);

    this.el.append(statsSection, centerSection, walletSection);
  }

  updateStats(hunger: number, mood: number, affection: number): void {
    const values = [hunger, mood, affection];
    for (let i = 0; i < this.slots.length; i++) {
      const v = Math.round(Math.max(0, Math.min(100, values[i])));
      this.slots[i].fill.style.width = `${v}%`;
      this.slots[i].valueEl.textContent = String(v);

      // Hunger-specific state classes (warning at <20%, dead at 0%)
      if (i === 0) {
        this.slots[i].fill.classList.toggle('stat-warning', v > 0 && v < 20);
        this.slots[i].fill.classList.toggle('stat-dead', v === 0);
      }
    }
  }
}
