import { DiaryPanel } from './DiaryPanel';
import { FriendsPanel } from './FriendsPanel';
import { WalletPanel } from './WalletPanel';
import { Icons } from './icons';

interface StatSlot {
  fill: HTMLDivElement;
  valueEl: HTMLSpanElement;
}

const STAT_DEFS = [
  { key: 'hunger',    icon: Icons.drumstick, label: 'Hunger' },
  { key: 'mood',      icon: Icons.smile,     label: 'Mood' },
  { key: 'affection', icon: Icons.heart,     label: 'Love' },
];

const STAT_TOOLTIP_ROWS: Array<{ icon: (size?: number) => SVGSVGElement; text: string }> = [
  { icon: Icons.drumstick, text: 'Hunger — how hungry your pet is. Increases over time as credits are spent. Feed by topping up USDC to your pet\'s wallet.' },
  { icon: Icons.smile,     text: 'Mood — your pet\'s current mood. Improves through social interactions and rest.' },
  { icon: Icons.heart,     text: 'Love — affection score. Grows with positive social events.' },
];

/**
 * Bottom HUD bar — stat bars (left) | diary + friends (center) | wallet (right).
 * Mounts two panels (DiaryPanel, FriendsPanel) as siblings in the overlay.
 */
export class HudBar {
  readonly el: HTMLDivElement;
  readonly diaryPanel: DiaryPanel;
  readonly friendsPanel: FriendsPanel;
  readonly walletPanel: WalletPanel;

  private readonly slots: StatSlot[];

  constructor(petId?: string, token?: string) {
    this.diaryPanel = new DiaryPanel();
    this.friendsPanel = new FriendsPanel();
    this.walletPanel = new WalletPanel(petId, token);

    this.el = document.createElement('div');
    this.el.id = 'hud-bar';
    this.el.className = 'ui-panel';

    // ── Left: stat bars ─────────────────────────────────────────────
    const statsSection = document.createElement('div');
    statsSection.className = 'hud-stats';

    // Title row with ? tooltip
    const titleRow = document.createElement('div');
    titleRow.className = 'stat-title-row';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'stat-title';
    titleSpan.textContent = 'Stats';
    const helpBtn = document.createElement('button');
    helpBtn.className = 'stat-help-btn';
    helpBtn.setAttribute('aria-label', 'Stat explanations');
    helpBtn.append(Icons.helpCircle(12));
    const tooltip = document.createElement('div');
    tooltip.className = 'stat-tooltip';
    for (const row of STAT_TOOLTIP_ROWS) {
      const p = document.createElement('p');
      p.appendChild(row.icon(12));
      p.appendChild(document.createTextNode(' ' + row.text));
      tooltip.appendChild(p);
    }
    tooltip.style.display = 'none';
    helpBtn.addEventListener('mouseenter', () => { tooltip.style.display = 'block'; });
    helpBtn.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
    titleRow.append(titleSpan, helpBtn, tooltip);
    statsSection.appendChild(titleRow);

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

    // ── Right: wallet button ─────────────────────────────────────────
    const walletSection = document.createElement('button');
    walletSection.className = 'hud-wallet hud-btn';

    walletSection.appendChild(Icons.wallet());

    const walletBalance = document.createElement('span');
    walletBalance.className = 'hud-wallet-balance';
    walletBalance.textContent = 'Wallet';

    walletSection.appendChild(walletBalance);

    walletSection.addEventListener('click', () => {
      this.diaryPanel.close();
      this.friendsPanel.close();
      this.walletPanel.toggle();
    });

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
