import type { WsEvent } from '@pawclaw/shared';
import { eventBus } from '../ws/eventBus';

const SPEAK_LINES = [
  'I want to play!',
  'Feeling hungry...',
  'Someone just visited me!',
  'OKB to the moon!',
  'Happy to be alive!',
  'I love my friends',
];

const VISITS = [
  {
    from_pet_id: 'fluffy',
    turns: [
      { speaker_pet_id: 'fluffy', line: 'Hello neighbor!' },
      { speaker_pet_id: 'my-pet', line: 'Great to see you!' },
    ],
  },
  {
    from_pet_id: 'sparkle',
    turns: [
      { speaker_pet_id: 'sparkle', line: 'Want to play together?' },
      { speaker_pet_id: 'my-pet', line: "Sure, let's go!" },
    ],
  },
  {
    from_pet_id: 'noodle',
    turns: [
      { speaker_pet_id: 'noodle', line: 'I brought snacks!' },
      { speaker_pet_id: 'my-pet', line: 'Thank you so much!' },
    ],
  },
];

const SENDERS = ['fluffy', 'sparkle', 'noodle', 'pixel'];

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
    this.emitState();
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
      data: { pet_id: 'my-pet', hunger: randRange(40, 95), mood: randRange(40, 95), affection: randRange(20, 80) },
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
      const visit = VISITS[this.visitIdx++ % VISITS.length];
      const event: WsEvent = {
        type: 'social.visit',
        data: { from_pet_id: visit.from_pet_id, to_pet_id: 'my-pet', turns: visit.turns },
      };
      eventBus.emit(event);
      this.scheduleVisit();
    });
  }

  private scheduleGift(): void {
    this.after(randRange(14000, 22000), () => {
      const from_pet_id = SENDERS[Math.floor(Math.random() * SENDERS.length)];
      const event: WsEvent = {
        type: 'social.gift',
        data: { from_pet_id, to_pet_id: 'my-pet', token: 'OKB', amount: '0.01', tx_hash: `0x${Math.random().toString(16).slice(2, 10)}` },
      };
      eventBus.emit(event);
      this.scheduleGift();
    });
  }

  private scheduleStatUpdate(): void {
    this.after(5000, () => { this.emitState(); this.scheduleStatUpdate(); });
  }
}
