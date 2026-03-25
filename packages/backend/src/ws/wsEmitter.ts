import type { WsEvent } from '@pawclaw/shared';
import { tickBus } from '../runtime/tick-bus.js';
import { getOwnerSocket } from './wsRegistry.js';

function emitToOwner(ownerId: string, event: WsEvent): void {
  const socket = getOwnerSocket(ownerId);
  if (!socket || socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(event));
}

// ws layer subscribes to runtime events and forwards them to WebSocket clients
tickBus.on('ownerEvent', emitToOwner);
