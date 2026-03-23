import { describe, it, expect, beforeEach } from 'vitest';
import { StatBars } from './StatBars';

describe('StatBars', () => {
  let statBars: StatBars;

  beforeEach(() => {
    document.body.innerHTML = '';
    statBars = new StatBars();
    document.body.appendChild(statBars.el);
  });

  it('renders three stat bars on construction', () => {
    const items = statBars.el.querySelectorAll('.stat-item');
    expect(items).toHaveLength(3);
  });

  it('update() sets fill widths correctly', () => {
    statBars.update(80, 60, 40);

    const fills = statBars.el.querySelectorAll<HTMLDivElement>('.stat-fill');
    expect(fills[0].style.width).toBe('80%');
    expect(fills[1].style.width).toBe('60%');
    expect(fills[2].style.width).toBe('40%');
  });

  it('update() sets value text correctly', () => {
    statBars.update(80, 60, 40);

    const values = statBars.el.querySelectorAll<HTMLSpanElement>('.stat-value');
    expect(values[0].textContent).toBe('80');
    expect(values[1].textContent).toBe('60');
    expect(values[2].textContent).toBe('40');
  });

  it('update() clamps values to 0–100', () => {
    statBars.update(-10, 150, 50);

    const values = statBars.el.querySelectorAll<HTMLSpanElement>('.stat-value');
    expect(values[0].textContent).toBe('0');
    expect(values[1].textContent).toBe('100');
    expect(values[2].textContent).toBe('50');
  });
});
