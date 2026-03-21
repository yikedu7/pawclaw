import { eventBus } from '../ws/eventBus';
import type { WsEvent } from '../ws/types';

const SPEAK_LINES = [
  'I want to play!',
  'Feeling hungry...',
  'Someone just visited me!',
  'OKB to the moon! 🚀',
  'Happy to be alive!',
  'I love my friends ♥',
];

const VISITS = [
  { from: 'fluffy', dialogue: ['Hello neighbor!', 'Great to see you!'] },
  { from: 'sparkle', dialogue: ['Want to play together?', "Sure, let's go!"] },
  { from: 'noodle', dialogue: ['I brought snacks!', 'Thank you so much!'] },
];

const GIFT_SENDERS = ['fluffy', 'sparkle', 'noodle', 'pixel'];

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Emits mock WsEvents on randomised intervals to drive canvas animations
 * during development. Replace with real WS client for production.
 */
export class MockEvents {
  private timers: ReturnType<typeof setTimeout>[] = [];
  private running = false;
  private speakIdx = 0;
  private visitIdx = 0;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.emitState(); // initial snapshot
    this.scheduleSpeak();
    this.scheduleVisit();
    this.scheduleGift();
    this.scheduleStatUpdate();
  }

  stop(): void {
    this.running = false;
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private after(ms: number, fn: () => void): void {
    if (!this.running) return;
    this.timers.push(setTimeout(fn, ms));
  }

  private emitState(): void {
    const event: WsEvent = {
      type: 'pet.state',
      data: {
        hunger: randRange(40, 95),
        mood: randRange(40, 95),
        affection: randRange(20, 80),
      },
    };
    eventBus.emit(event);
  }

  private scheduleSpeak(): void {
    this.after(randRange(3500, 7000), () => {
      const message = SPEAK_LINES[this.speakIdx++ % SPEAK_LINES.length];
      eventBus.emit({ type: 'pet.speak', data: { pet_id: 'my-pet', message } });
      this.scheduleSpeak();
    });
  }

  private scheduleVisit(): void {
    this.after(randRange(9000, 16000), () => {
      const { from, dialogue } = VISITS[this.visitIdx++ % VISITS.length];
      eventBus.emit({ type: 'social.visit', data: { from, to: 'my-pet', dialogue } });
      this.scheduleVisit();
    });
  }

  private scheduleGift(): void {
    this.after(randRange(14000, 22000), () => {
      const from = GIFT_SENDERS[Math.floor(Math.random() * GIFT_SENDERS.length)];
      const tx_hash = `0x${Math.random().toString(16).slice(2, 10)}`;
      eventBus.emit({ type: 'social.gift', data: { from, to: 'my-pet', tx_hash } });
      this.scheduleGift();
    });
  }

  private scheduleStatUpdate(): void {
    this.after(5000, () => {
      this.emitState();
      this.scheduleStatUpdate();
    });
  }
}
