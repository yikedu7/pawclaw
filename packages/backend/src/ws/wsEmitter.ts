import type { WsEvent } from '@x-pet/shared';
import { getOwnerSocket } from './wsRegistry.js';

export function emitToOwner(ownerId: string, event: WsEvent): void {
  const socket = getOwnerSocket(ownerId);
  if (!socket || socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(event));
}
