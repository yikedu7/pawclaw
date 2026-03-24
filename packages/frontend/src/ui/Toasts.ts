import { Icons } from './icons';

const DISMISS_MS = 4000;
const ANIM_OUT_MS = 300;

/** Toast notification stack — slide-in, auto-dismiss after 4 s. */
export class Toasts {
  readonly el: HTMLDivElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'toast-container';
  }

  show(content: string | Node, type: 'gift' | 'friend' = 'gift'): void {
    const toast = document.createElement('div');
    toast.className = `toast ui-panel toast-${type}`;
    if (typeof content === 'string') {
      toast.textContent = content;
    } else {
      toast.appendChild(content);
    }

    this.el.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), ANIM_OUT_MS);
    }, DISMISS_MS);
  }

  gift(from: string, to: string, amount: string, token: string, txHash?: string): void {
    const frag = document.createDocumentFragment();
    frag.append(Icons.gift(13), ` Gift: ${amount} ${token}`);

    if (txHash) {
      frag.appendChild(document.createTextNode(' '));
      const link = document.createElement('a');
      link.href = `https://www.okx.com/explorer/xlayer/tx/${txHash}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `${txHash.slice(0, 10)}…`;
      link.style.color = 'inherit';
      frag.appendChild(link);
    }

    this.show(frag, 'gift');
  }

  friendUnlocked(petId: string): void {
    const frag = document.createDocumentFragment();
    frag.append(Icons.heart(13), ` You and ${petId} are now friends!`);
    this.show(frag, 'friend');
  }
}
