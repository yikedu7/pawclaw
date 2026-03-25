/** Pet nameplate — name, status indicator, truncated wallet address. */
export class Nameplate {
  readonly el: HTMLDivElement;
  private readonly statusDot: HTMLSpanElement;
  private readonly nameEl: HTMLSpanElement;
  private readonly walletEl: HTMLSpanElement;

  constructor(
    name = 'My Pet',
    wallet = '0x0000...0000',
    status: 'online' | 'starting' | 'offline' = 'online',
  ) {
    this.el = document.createElement('div');
    this.el.id = 'pet-nameplate';
    this.el.classList.add('ui-panel');

    this.statusDot = document.createElement('span');
    this.statusDot.className = 'pet-status';
    this.statusDot.dataset.status = status;

    this.nameEl = document.createElement('span');
    this.nameEl.className = 'pet-name';
    this.nameEl.textContent = name;

    this.walletEl = document.createElement('span');
    this.walletEl.className = 'pet-wallet';
    this.walletEl.title = 'Click to copy';
    this.walletEl.style.cursor = 'pointer';
    this.walletEl.textContent = wallet;
    this.walletEl.addEventListener('click', () => {
      const full = this.walletEl.dataset.full ?? this.walletEl.textContent ?? '';
      navigator.clipboard.writeText(full).then(() => {
        const prev = this.walletEl.textContent;
        this.walletEl.textContent = 'Copied!';
        setTimeout(() => { this.walletEl.textContent = prev; }, 1200);
      });
    });

    this.el.append(this.statusDot, this.nameEl, this.walletEl);
  }

  setName(name: string): void {
    this.nameEl.textContent = name;
  }

  setWallet(address: string): void {
    this.walletEl.dataset.full = address;
    this.walletEl.textContent = address.length > 14
      ? `${address.slice(0, 6)}...${address.slice(-4)}`
      : address;
  }

  setStatus(status: 'online' | 'starting' | 'offline'): void {
    this.statusDot.dataset.status = status;
  }
}
