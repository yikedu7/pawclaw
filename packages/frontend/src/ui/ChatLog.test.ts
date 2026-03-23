import { describe, it, expect, beforeEach } from 'vitest';
import { ChatLog } from './ChatLog';

describe('ChatLog', () => {
  let chatLog: ChatLog;

  beforeEach(() => {
    document.body.innerHTML = '';
    chatLog = new ChatLog();
    document.body.appendChild(chatLog.el);
  });

  it('renders chat-log panel with header and messages container', () => {
    expect(chatLog.el.id).toBe('chat-log');
    expect(chatLog.el.querySelector('.chat-header')?.textContent).toBe('Chat');
    expect(chatLog.el.querySelector('.chat-messages')).not.toBeNull();
  });

  it('add() appends a chat entry with speaker and text', () => {
    chatLog.add({ speaker: 'Luna', text: 'Hello world', time: new Date() });

    const entries = chatLog.el.querySelectorAll('.chat-entry');
    expect(entries).toHaveLength(1);
    expect(entries[0].querySelector('.chat-speaker')?.textContent).toBe('Luna');
    expect(entries[0].querySelector('.chat-text')?.textContent).toBe('Hello world');
  });

  it('add() includes a formatted time stamp', () => {
    const fixedDate = new Date(2025, 0, 1, 14, 30);
    chatLog.add({ speaker: 'Luna', text: 'Hi', time: fixedDate });

    const timeEl = chatLog.el.querySelector('.chat-time');
    expect(timeEl?.textContent).toBe('14:30');
  });

  it('trims oldest entries when exceeding 50', () => {
    for (let i = 0; i < 55; i++) {
      chatLog.add({ speaker: 'Bot', text: `msg ${i}`, time: new Date() });
    }
    const entries = chatLog.el.querySelectorAll('.chat-entry');
    expect(entries.length).toBeLessThanOrEqual(50);
  });
});
