import { getAuth } from '../auth';
import { apiFetch } from '../api';
import { renderMarkdown } from './markdown';
import { SentenceDetector } from '../ws/SentenceDetector';

const MAX_ENTRIES = 50;

// petId → display name, populated lazily from GET /api/pets/:id
const petNames = new Map<string, string>();

export async function resolvePetName(petId: string, token: string | null): Promise<string> {
  if (petNames.has(petId)) return petNames.get(petId)!;
  if (!token) return petId;
  try {
    const res = await apiFetch(`/api/pets/${petId}`, {
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

export interface DialogueHandlers {
  startThinking: () => void;
  stopThinking: () => void;
  updateCurrent: (text: string) => void;
  enqueue: (sentence: string) => void;
}

/** Scrollable chat log panel — auto-scrolls, max 50 entries. */
export class ChatLog {
  readonly el: HTMLDivElement;
  private readonly messages: HTMLDivElement;
  private count = 0;
  private dialogueHandlers: DialogueHandlers | null = null;

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

  /** Wire canvas dialogue bubble handlers for streaming display. */
  setDialogueHandlers(handlers: DialogueHandlers): void {
    this.dialogueHandlers = handlers;
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

      // Insert a thinking row and trigger canvas thinking state
      const thinkingRow = this.addThinkingRow();
      this.dialogueHandlers?.startThinking();

      try {
        const res = await apiFetch(`/api/pets/${petId}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({ message }),
        });

        if (res.headers.get('Content-Type')?.includes('text/event-stream') && res.body) {
          await this.handleStream(res.body, thinkingRow, token, petId);
        } else {
          // Non-streaming fallback: pet reply arrives via WS pet.speak event
          thinkingRow.remove();
          this.count--;
          this.dialogueHandlers?.stopThinking();
        }
      } catch {
        thinkingRow.remove();
        this.count--;
        this.dialogueHandlers?.stopThinking();
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

  private async handleStream(
    body: ReadableStream<Uint8Array>,
    thinkingRow: HTMLDivElement,
    token: string,
    petId: string,
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let lineBuffer = '';
    let accumulated = '';
    let streamingRow: HTMLDivElement | null = null;
    let streamingTextEl: HTMLSpanElement | null = null;
    const handlers = this.dialogueHandlers;

    const detector = new SentenceDetector((sentence) => {
      handlers?.enqueue(sentence);
    });

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data.trimEnd() === '[DONE]' || data.trimEnd() === '[ERROR]') continue;

          // On first token: replace thinking row with streaming row
          if (streamingRow === null) {
            thinkingRow.remove();
            this.count--;

            const petName = await resolvePetName(petId, token);
            const { row, textEl } = this.createStreamingRow(petName);
            streamingRow = row;
            streamingTextEl = textEl;
            this.messages.appendChild(streamingRow);
            this.count++;
            this.scrollToBottom();

            handlers?.stopThinking();
          }

          accumulated += data;
          detector.push(data);
          handlers?.updateCurrent(accumulated);

          if (streamingTextEl) {
            streamingTextEl.textContent = accumulated;
            this.scrollToBottom();
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Flush remaining partial sentence
    const remaining = detector.flush();
    if (remaining) {
      handlers?.enqueue(remaining);
    }

    // If we never got a token (stream was empty), clean up
    if (streamingRow === null) {
      thinkingRow.remove();
      this.count--;
      handlers?.stopThinking();
    } else if (streamingTextEl && accumulated) {
      // Finalise row with markdown rendering
      streamingTextEl.textContent = '';
      streamingTextEl.appendChild(renderMarkdown(accumulated));
    }
  }

  private addThinkingRow(): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'chat-entry chat-thinking';

    const time = document.createElement('span');
    time.className = 'chat-time';
    time.textContent = this.formatTime(new Date());

    const speaker = document.createElement('span');
    speaker.className = 'chat-speaker';
    speaker.textContent = '…';

    const dots = document.createElement('span');
    dots.className = 'chat-thinking-dots';
    dots.innerHTML = '<span></span><span></span><span></span>';

    row.append(time, speaker, dots);
    this.messages.appendChild(row);
    this.count++;
    this.scrollToBottom();
    return row;
  }

  private createStreamingRow(speaker: string): { row: HTMLDivElement; textEl: HTMLSpanElement } {
    const row = document.createElement('div');
    row.className = 'chat-entry';

    const time = document.createElement('span');
    time.className = 'chat-time';
    time.textContent = this.formatTime(new Date());

    const speakerEl = document.createElement('span');
    speakerEl.className = 'chat-speaker';
    speakerEl.textContent = speaker;

    const textEl = document.createElement('span');
    textEl.className = 'chat-text';

    row.append(time, speakerEl, textEl);
    return { row, textEl };
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

    this.scrollToBottom();
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

  private scrollToBottom(): void {
    this.messages.scrollTop = this.messages.scrollHeight;
  }

  private formatTime(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
