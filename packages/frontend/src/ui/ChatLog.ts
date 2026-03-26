import { getAuth } from '../auth';
import { renderMarkdown } from './markdown';

const MAX_ENTRIES = 50;
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? 'http://localhost:3001';

// petId → display name, populated lazily from GET /api/pets/:id
const petNames = new Map<string, string>();

export async function resolvePetName(petId: string, token: string | null): Promise<string> {
  if (petNames.has(petId)) return petNames.get(petId)!;
  if (!token) return petId;
  try {
    const res = await fetch(`${BACKEND_URL}/api/pets/${petId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json() as { name?: string };
      if (data.name) { petNames.set(petId, data.name); return data.name; }
    }
  } catch { /* ignore */ }
  return petId;
}

interface ChatEntry {
  speaker: string;
  text: string;
  time: Date;
  /** If true, render text as markdown (for LLM/pet messages). */
  markdown?: boolean;
}

/** Scrollable chat log panel — auto-scrolls, max 50 entries. */
export class ChatLog {
  readonly el: HTMLDivElement;
  private readonly messages: HTMLDivElement;
  private count = 0;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'chat-log';
    this.el.classList.add('ui-panel');

    const header = document.createElement('div');
    header.className = 'chat-header';
    header.textContent = 'Chat';

    this.messages = document.createElement('div');
    this.messages.className = 'chat-messages';

    const inputRow = this.buildInputRow();

    this.el.append(header, this.messages, inputRow);
  }

  private buildInputRow(): HTMLDivElement {
    const auth = getAuth();
    const petId = auth?.pet_id ?? null;
    const token = auth?.token ?? null;

    const row = document.createElement('div');
    row.className = 'chat-input-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'chat-input';
    input.placeholder = 'Say something…';
    input.maxLength = 500;

    const btn = document.createElement('button');
    btn.className = 'chat-send-btn';
    btn.textContent = '▶';

    const send = async () => {
      const message = input.value.trim();
      if (!message || !petId || !token) return;

      input.disabled = true;
      btn.disabled = true;

      // Show user message immediately
      this.add({ speaker: 'You', text: message, time: new Date() });
      input.value = '';

      try {
        await fetch(`${BACKEND_URL}/api/pets/${petId}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ message }),
        });
        // Pet reply arrives via WS pet.speak event — no need to handle response body
      } finally {
        input.disabled = false;
        btn.disabled = false;
        input.focus();
      }
    };

    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    btn.addEventListener('click', send);

    row.append(input, btn);
    return row;
  }

  add(entry: ChatEntry): void {
    const row = document.createElement('div');
    row.className = 'chat-entry';

    const time = document.createElement('span');
    time.className = 'chat-time';
    time.textContent = this.formatTime(entry.time);

    const speaker = document.createElement('span');
    speaker.className = 'chat-speaker';
    speaker.textContent = entry.speaker;

    const text = document.createElement('span');
    text.className = 'chat-text';
    if (entry.markdown) {
      text.appendChild(renderMarkdown(entry.text));
    } else {
      text.textContent = entry.text;
    }

    row.append(time, speaker, text);
    this.messages.appendChild(row);
    this.count++;

    // Trim oldest entries beyond MAX_ENTRIES
    while (this.count > MAX_ENTRIES && this.messages.firstChild) {
      this.messages.removeChild(this.messages.firstChild);
      this.count--;
    }

    // Auto-scroll to bottom
    this.messages.scrollTop = this.messages.scrollHeight;
  }

  addSpeak(petId: string, message: string): void {
    const token = getAuth()?.token ?? null;
    const time = new Date();
    resolvePetName(petId, token).then((name) => {
      this.add({ speaker: name, text: message, time, markdown: true });
    });
  }

  addVisit(fromPetId: string, turns: { speaker_pet_id: string; line: string }[]): void {
    const token = getAuth()?.token ?? null;
    for (const turn of turns) {
      const time = new Date();
      resolvePetName(turn.speaker_pet_id, token).then((name) => {
        this.add({ speaker: name, text: turn.line, time, markdown: true });
      });
    }
  }

  private formatTime(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
