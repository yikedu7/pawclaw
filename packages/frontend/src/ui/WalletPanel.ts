import { Icons } from './icons';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? 'http://localhost:3001';

/** Returns true if the address is a real on-chain address (non-empty, non-placeholder). */
function isRealAddress(addr: string | null | undefined): addr is string {
  if (!addr) return false;
  // Reject obvious placeholders like "0x1234...5678" that contain "..."
  if (addr.includes('...')) return false;
  // A real EVM address is 42 hex chars starting with 0x
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/** Centered modal overlay showing the pet's wallet info and assets. */
export class WalletPanel {
  readonly el: HTMLDivElement;
  private visible = false;
  private petId: string | null;
  private token: string | null;
  private fullAddress: string | null = null;

  constructor(petId?: string, token?: string) {
    this.petId = petId ?? null;
    this.token = token ?? null;

    this.el = document.createElement('div');
    this.el.id = 'wallet-overlay';
    this.el.hidden = true;

    const modal = document.createElement('div');
    modal.id = 'wallet-modal';
    modal.className = 'ui-panel';

    // ── Header ──────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'wallet-header';

    const title = document.createElement('span');
    title.className = 'wallet-title';
    title.append(Icons.wallet(12), ' Wallet');

    const closeBtn = document.createElement('button');
    closeBtn.className = 'wallet-close-btn';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => this.close());

    header.append(title, closeBtn);

    // ── Address bar ──────────────────────────────────────────────────
    const addressBar = document.createElement('div');
    addressBar.className = 'wallet-address-bar';

    const addressText = document.createElement('span');
    addressText.className = 'wallet-address-text wallet-address-pending';
    addressText.textContent = 'Creating wallet\u2026';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'wallet-copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.hidden = true;
    copyBtn.addEventListener('click', () => {
      if (this.fullAddress) {
        navigator.clipboard.writeText(this.fullAddress).catch(() => {});
      }
    });

    const actionRow = document.createElement('div');
    actionRow.className = 'wallet-action-row';

    const depositBtn = document.createElement('button');
    depositBtn.className = 'wallet-btn wallet-btn-deposit';
    depositBtn.textContent = 'Deposit';

    const withdrawBtn = document.createElement('button');
    withdrawBtn.className = 'wallet-btn wallet-btn-withdraw';
    withdrawBtn.textContent = 'Withdraw';

    actionRow.append(depositBtn, withdrawBtn);
    addressBar.append(addressText, copyBtn, actionRow);

    // ── PAW balance row ──────────────────────────────────────────────
    const pawRow = document.createElement('div');
    pawRow.className = 'wallet-paw-row';

    const pawLeft = document.createElement('div');
    pawLeft.className = 'wallet-paw-left';

    const pawIcon = Icons.coins(14);
    const pawLabel = document.createElement('span');
    pawLabel.className = 'wallet-paw-label';
    pawLabel.textContent = 'PAW Balance';

    pawLeft.append(pawIcon, pawLabel);

    const pawRight = document.createElement('div');
    pawRight.className = 'wallet-paw-right';

    const pawBalance = document.createElement('span');
    pawBalance.className = 'wallet-paw-balance';
    pawBalance.textContent = '— PAW';

    const buyBtn = document.createElement('button');
    buyBtn.className = 'wallet-btn wallet-btn-buy';
    buyBtn.textContent = 'Buy';

    pawRight.append(pawBalance, buyBtn);
    pawRow.append(pawLeft, pawRight);

    // ── Token Assets ─────────────────────────────────────────────────
    const tokensSection = document.createElement('div');
    tokensSection.className = 'wallet-section';

    const tokensSectionTitle = document.createElement('div');
    tokensSectionTitle.className = 'wallet-section-title';
    tokensSectionTitle.textContent = 'Token Assets';
    tokensSection.appendChild(tokensSectionTitle);

    const TOKEN_CHAINS = [
      {
        chain: 'X Layer',
        tokens: [
          { symbol: 'OKB', balance: '0.42', usd: '$12.60' },
          { symbol: 'xETH', balance: '0.01', usd: '$25.00' },
        ],
      },
      {
        chain: 'Base',
        tokens: [
          { symbol: 'ETH', balance: '0.005', usd: '$12.50' },
        ],
      },
    ];

    for (const chainData of TOKEN_CHAINS) {
      const chainLabel = document.createElement('div');
      chainLabel.className = 'wallet-chain-label';
      chainLabel.textContent = chainData.chain;
      tokensSection.appendChild(chainLabel);

      for (const token of chainData.tokens) {
        const tokenRow = document.createElement('div');
        tokenRow.className = 'wallet-token-row';

        const tokenSymbol = document.createElement('span');
        tokenSymbol.className = 'wallet-token-symbol';
        tokenSymbol.textContent = token.symbol;

        const tokenBalance = document.createElement('span');
        tokenBalance.className = 'wallet-token-balance';
        tokenBalance.textContent = token.balance;

        const tokenUsd = document.createElement('span');
        tokenUsd.className = 'wallet-token-usd';
        tokenUsd.textContent = token.usd;

        tokenRow.append(tokenSymbol, tokenBalance, tokenUsd);
        tokensSection.appendChild(tokenRow);
      }
    }

    // ── NFT Assets ───────────────────────────────────────────────────
    const nftSection = document.createElement('div');
    nftSection.className = 'wallet-section';

    const nftSectionTitle = document.createElement('div');
    nftSectionTitle.className = 'wallet-section-title';
    nftSectionTitle.textContent = 'NFT Assets';
    nftSection.appendChild(nftSectionTitle);

    const nftGrid = document.createElement('div');
    nftGrid.className = 'wallet-nft-grid';

    for (let i = 0; i < 8; i++) {
      const slot = document.createElement('div');
      slot.className = i === 0 ? 'wallet-nft-slot wallet-nft-slot-filled' : 'wallet-nft-slot wallet-nft-slot-empty';

      if (i === 0) {
        const img = document.createElement('img');
        img.src = '/assets/objects/gift.png';
        img.alt = 'MVP Trophy';
        img.className = 'wallet-nft-img';
        const caption = document.createElement('span');
        caption.className = 'wallet-nft-caption';
        caption.textContent = 'MVP Trophy';
        slot.append(img, caption);
      }

      nftGrid.appendChild(slot);
    }

    nftSection.appendChild(nftGrid);

    // ── Body ─────────────────────────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'wallet-body';
    body.append(addressBar, pawRow, tokensSection, nftSection);

    modal.append(header, body);
    this.el.appendChild(modal);

    // Store refs for data updates
    this._addressText = addressText;
    this._copyBtn = copyBtn;
    this._pawBalance = pawBalance;

    // Close on backdrop click
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.close();
    });
  }

  private _addressText: HTMLSpanElement;
  private _copyBtn: HTMLButtonElement;
  private _pawBalance: HTMLSpanElement;

  open(): void {
    this.visible = true;
    this.el.hidden = false;
    this._fetchData();
  }

  /**
   * Update the displayed wallet address.
   * If addr is a real on-chain address, show the truncated form and enable copy.
   * If addr is null/empty/placeholder, show the pending state and hide copy.
   */
  setAddress(addr: string | null | undefined): void {
    if (isRealAddress(addr)) {
      this.fullAddress = addr;
      this._addressText.textContent = truncateAddress(addr);
      this._addressText.classList.remove('wallet-address-pending');
      this._copyBtn.hidden = false;
    } else {
      this.fullAddress = null;
      this._addressText.textContent = 'Creating wallet\u2026';
      this._addressText.classList.add('wallet-address-pending');
      this._copyBtn.hidden = true;
    }
  }

  private _fetchData(): void {
    if (!this.petId || !this.token) return;
    fetch(`${BACKEND_URL}/api/pets/${this.petId}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ wallet_address?: string | null; paw_balance?: string }>;
      })
      .then((data) => {
        this.setAddress(data.wallet_address);
        const bal = parseFloat(data.paw_balance ?? '0').toFixed(2);
        this._pawBalance.textContent = `${bal} PAW`;
      })
      .catch(() => {
        // leave defaults
      });
  }

  close(): void {
    this.visible = false;
    this.el.hidden = true;
  }

  isOpen(): boolean {
    return this.visible;
  }

  toggle(): void {
    if (this.visible) {
      this.close();
    } else {
      this.open();
    }
  }
}
