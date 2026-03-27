import { Icons } from './icons';

interface Stat {
  key: string;
  label: string;
  fill: HTMLDivElement;
  valueEl: HTMLSpanElement;
}

const STAT_TOOLTIPS: Record<string, string> = {
  hunger: '🍗 Hunger — how hungry your pet is. Increases over time as credits are spent. Feed by topping up USDC to your pet\'s wallet.',
  mood: '😊 Mood — your pet\'s current mood. Improves through social interactions and rest.',
  affection: '❤️ Love — affection score. Grows with positive social events.',
};

/** Animated stat bars — hunger, mood, affection with smooth transitions. */
export class StatBars {
  readonly el: HTMLDivElement;
  private readonly stats: Stat[];

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'stat-bars';
    this.el.classList.add('ui-panel');

    // Panel title with ? tooltip trigger
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
    tooltip.innerHTML = Object.values(STAT_TOOLTIPS).map(t => `<p>${t}</p>`).join('');
    tooltip.style.display = 'none';

    helpBtn.addEventListener('mouseenter', () => { tooltip.style.display = 'block'; });
    helpBtn.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });

    titleRow.append(titleSpan, helpBtn, tooltip);
    this.el.appendChild(titleRow);

    const defs: { key: string; label: string; icon: () => SVGSVGElement }[] = [
      { key: 'hunger',    label: 'Hunger', icon: Icons.drumstick },
      { key: 'mood',      label: 'Mood',   icon: Icons.smile },
      { key: 'affection', label: 'Love',   icon: Icons.heart },
    ];

    this.stats = defs.map((def) => {
      const item = document.createElement('div');
      item.className = 'stat-item';

      const label = document.createElement('span');
      label.className = 'stat-label';
      label.append(def.icon(), ` ${def.label}`);

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
      this.el.appendChild(item);

      return { key: def.key, label: def.label, fill, valueEl };
    });
  }

  update(hunger: number, mood: number, affection: number): void {
    const values = [hunger, mood, affection];
    for (let i = 0; i < this.stats.length; i++) {
      const v = Math.round(Math.max(0, Math.min(100, values[i])));
      this.stats[i].fill.style.width = `${v}%`;
      this.stats[i].valueEl.textContent = String(v);
    }
  }
}
