import type { WsEvent } from '@x-pet/shared';
import { eventBus } from './eventBus';

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

export class WsClient {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private closed = false;

  constructor(
    private readonly url: string,
  ) {}

  connect(): void {
    if (this.closed) return;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.attempt = 0;
    };

    this.ws.onmessage = (ev) => {
      let event: WsEvent;
      try {
        event = JSON.parse(ev.data as string) as WsEvent;
      } catch {
        return;
      }
      eventBus.emit(event);
    };

    this.ws.onclose = (ev) => {
      if (this.closed) return;
      // 4001 = auth rejected; do not reconnect
      if (ev.code === 4001) return;
      const delay = Math.min(BACKOFF_BASE_MS * 2 ** this.attempt, BACKOFF_MAX_MS);
      this.attempt++;
      setTimeout(() => this.connect(), delay);
    };

    this.ws.onerror = () => {
      // onclose fires after onerror; reconnect is handled there
    };
  }

  disconnect(): void {
    this.closed = true;
    this.ws?.close();
  }
}

export function buildWsUrl(token: string): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const host = import.meta.env.VITE_WS_HOST ?? location.host;
  return `${proto}://${host}/ws?token=${encodeURIComponent(token)}`;
}
