import { EventEmitter } from 'node:events';
import type { WsEvent } from '@pawclaw/shared';

interface TickBusEvents {
  ownerEvent: [ownerId: string, event: WsEvent];
}

class TickBus extends EventEmitter<TickBusEvents> {}

export const tickBus = new TickBus();
