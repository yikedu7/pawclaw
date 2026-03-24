import { Icons } from './icons';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? 'http://localhost:3001';

/** Centered modal overlay showing the pet's diary from GET /api/pets/:id/diary. */
export class DiaryPanel {
  readonly el: HTMLDivElement;
  private visible = false;
  private body: HTMLDivElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'diary-overlay';
    this.el.hidden = true;

    const modal = document.createElement('div');
    modal.id = 'diary-modal';
    modal.className = 'ui-panel';

    const header = document.createElement('div');
    header.className = 'diary-header';

    const title = document.createElement('span');
    title.className = 'diary-title';
    title.append(Icons.bookOpen(12), ' My Diary');

    const closeBtn = document.createElement('button');
    closeBtn.className = 'diary-close-btn';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => this.close());

    header.append(title, closeBtn);

    this.body = document.createElement('div');
    this.body.className = 'diary-body';

    modal.append(header, this.body);
    this.el.appendChild(modal);

    // Close on backdrop click
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.close();
    });
  }

  open(): void {
    this.visible = true;
    this.el.hidden = false;
    this.body.textContent = 'Loading...';

    const params = new URLSearchParams(location.search);
    const petId = params.get('pet_id');
    const token = params.get('token');

    if (!petId) {
      this.showEmpty();
      return;
    }

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(`${BACKEND_URL}/api/pets/${petId}/diary`, { headers })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ diary: string | null; created_at?: string }>;
      })
      .then((data) => {
        if (data.diary == null) {
          this.showEmpty();
        } else {
          this.body.textContent = data.diary;
        }
      })
      .catch(() => {
        this.showEmpty();
      });
  }

  private showEmpty(): void {
    const empty = document.createElement('span');
    empty.className = 'diary-empty';
    empty.append(Icons.inbox(13), ' No entries yet — come back after your pet has had a big day!');
    this.body.replaceChildren(empty);
  }

  close(): void {
    this.visible = false;
    this.el.hidden = true;
  }

  isOpen(): boolean {
    return this.visible;
  }
}
