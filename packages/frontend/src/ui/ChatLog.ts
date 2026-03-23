const MAX_ENTRIES = 50;

interface ChatEntry {
  speaker: string;
  text: string;
  time: Date;
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

    this.el.append(header, this.messages);
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
    text.textContent = entry.text;

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
    this.add({ speaker: petId, text: message, time: new Date() });
  }

  addVisit(fromPetId: string, turns: { speaker_pet_id: string; line: string }[]): void {
    for (const turn of turns) {
      this.add({ speaker: turn.speaker_pet_id, text: turn.line, time: new Date() });
    }
  }

  private formatTime(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
