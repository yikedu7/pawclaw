import type { WebSocket } from '@fastify/websocket';

const registry = new Map<string, WebSocket>();

export function registerOwner(ownerId: string, socket: WebSocket): void {
  registry.set(ownerId, socket);
}

export function unregisterOwner(ownerId: string): void {
  registry.delete(ownerId);
}

export function getOwnerSocket(ownerId: string): WebSocket | undefined {
  return registry.get(ownerId);
}
