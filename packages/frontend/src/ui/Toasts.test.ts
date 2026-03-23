import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Toasts } from './Toasts';

describe('Toasts', () => {
  let toasts: Toasts;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    toasts = new Toasts();
    document.body.appendChild(toasts.el);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('gift() renders a toast with from/amount/token/to', () => {
    toasts.gift('pet-a', 'pet-b', '0.01', 'OKB');

    const toast = toasts.el.querySelector('.toast-gift');
    expect(toast).not.toBeNull();
    expect(toast!.textContent).toContain('pet-a');
    expect(toast!.textContent).toContain('0.01');
    expect(toast!.textContent).toContain('OKB');
    expect(toast!.textContent).toContain('pet-b');
  });

  it('friendUnlocked() renders a friend toast', () => {
    toasts.friendUnlocked('pet-a');

    const toast = toasts.el.querySelector('.toast-friend');
    expect(toast).not.toBeNull();
    expect(toast!.textContent).toContain('pet-a');
  });

  it('toast auto-removes after dismiss timeout', () => {
    toasts.gift('a', 'b', '1', 'OKB');
    expect(toasts.el.querySelectorAll('.toast')).toHaveLength(1);

    vi.advanceTimersByTime(4000 + 300 + 1);
    expect(toasts.el.querySelectorAll('.toast')).toHaveLength(0);
  });

  it('multiple toasts stack in container', () => {
    toasts.gift('a', 'b', '1', 'OKB');
    toasts.gift('c', 'd', '2', 'OKB');
    toasts.friendUnlocked('e');

    expect(toasts.el.querySelectorAll('.toast')).toHaveLength(3);
  });
});
