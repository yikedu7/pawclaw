const DISMISS_MS = 4000;
const ANIM_OUT_MS = 300;

/** Toast notification stack — slide-in, auto-dismiss after 4 s. */
export class Toasts {
  readonly el: HTMLDivElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'toast-container';
  }

  show(message: string, type: 'gift' | 'friend' = 'gift'): void {
    const toast = document.createElement('div');
    toast.className = `toast ui-panel toast-${type}`;
    toast.textContent = message;

    this.el.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), ANIM_OUT_MS);
    }, DISMISS_MS);
  }

  gift(from: string, to: string, amount: string, token: string): void {
    this.show(`🎁 ${from} sent ${amount} ${token} to ${to}`, 'gift');
  }

  friendUnlocked(petId: string): void {
    this.show(`💛 You and ${petId} are now friends!`, 'friend');
  }
}
