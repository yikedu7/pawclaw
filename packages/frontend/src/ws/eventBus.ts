/**
 * Typed in-process event bus for WsEvents.
 * The real WS client will call eventBus.emit() when messages arrive;
 * canvas modules subscribe here without knowing the transport.
 */
import type { WsEvent } from '@x-pet/shared';

type Handler<E extends WsEvent> = (event: E) => void;

class EventBus {
  private readonly listeners = new Map<string, Set<Handler<WsEvent>>>();

  on<T extends WsEvent['type']>(
    type: T,
    handler: Handler<Extract<WsEvent, { type: T }>>,
  ): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler as Handler<WsEvent>);
    return () => this.off(type, handler);
  }

  off<T extends WsEvent['type']>(
    type: T,
    handler: Handler<Extract<WsEvent, { type: T }>>,
  ): void {
    this.listeners.get(type)?.delete(handler as Handler<WsEvent>);
  }

  emit(event: WsEvent): void {
    this.listeners.get(event.type)?.forEach((h) => h(event));
  }
}

export const eventBus = new EventBus();
