interface Stat {
  key: string;
  label: string;
  fill: HTMLDivElement;
  valueEl: HTMLSpanElement;
}

/** Animated stat bars — hunger, mood, affection with smooth transitions. */
export class StatBars {
  readonly el: HTMLDivElement;
  private readonly stats: Stat[];

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'stat-bars';
    this.el.classList.add('ui-panel');

    const defs: { key: string; label: string; icon: string }[] = [
      { key: 'hunger', label: 'Hunger', icon: '🍎' },
      { key: 'mood', label: 'Mood', icon: '😊' },
      { key: 'affection', label: 'Love', icon: '💗' },
    ];

    this.stats = defs.map((def) => {
      const item = document.createElement('div');
      item.className = 'stat-item';

      const label = document.createElement('span');
      label.className = 'stat-label';
      label.textContent = `${def.icon} ${def.label}`;

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
