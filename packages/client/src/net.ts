import type { ClientMsg, ServerMsg } from '@shared/protocol';
import type { AvatarSpec } from '@shared/types';
import { getWsUrl } from './config';

export type NetStatus = 'connecting' | 'open' | 'reconnecting' | 'replaced' | 'failed';

interface NetHooks {
  onMessage(msg: ServerMsg): void;
  onStatus(status: NetStatus, detail?: { wsUrl: string; attempts: number }): void;
}

const MAX_FAIL_ATTEMPTS = 6;

/**
 * WebSocket client with auto-reconnect (except when replaced by another tab).
 * Sends hello automatically on every (re)connect.
 */
export class Net {
  private ws: WebSocket | null = null;
  private backoff = 1000;
  private hooks: NetHooks;
  private joinInfo: { name?: string; avatar?: AvatarSpec } = {};
  private stopped = false;
  private wsUrl: string | null = null;
  private failAttempts = 0;
  private everOpened = false;

  constructor(hooks: NetHooks) {
    this.hooks = hooks;
  }

  get url(): string | null {
    return this.wsUrl;
  }

  /** Name/avatar are only used when no token exists yet (account creation). */
  connect(joinInfo?: { name?: string; avatar?: AvatarSpec }): void {
    if (joinInfo) this.joinInfo = joinInfo;
    this.stopped = false;
    this.failAttempts = 0;
    this.everOpened = false;
    void this.open();
  }

  private async open(): Promise<void> {
    if (this.stopped) return;
    this.hooks.onStatus(this.everOpened ? 'reconnecting' : 'connecting');

    try {
      this.wsUrl = await getWsUrl();
    } catch {
      this.wsUrl = null;
    }
    if (!this.wsUrl) {
      this.onFailed();
      return;
    }

    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      this.backoff = 1000;
      this.failAttempts = 0;
      this.everOpened = true;
      const token = localStorage.getItem('kr_token') ?? undefined;
      this.sendRaw({ t: 'hello', token, ...this.joinInfo });
    };

    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data as string) as ServerMsg;
      } catch {
        return;
      }
      if (msg.t === 'welcome') {
        if (msg.token) localStorage.setItem('kr_token', msg.token);
        this.hooks.onStatus('open');
      }
      this.hooks.onMessage(msg);
    };

    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (ev.code === 4001) {
        this.hooks.onStatus('replaced');
        return;
      }
      if (this.stopped) return;
      if (!this.everOpened) {
        this.failAttempts++;
        if (this.failAttempts >= MAX_FAIL_ATTEMPTS) {
          this.onFailed();
          return;
        }
      }
      this.hooks.onStatus('reconnecting', {
        wsUrl: this.wsUrl!,
        attempts: this.failAttempts,
      });
      setTimeout(() => void this.open(), this.backoff);
      this.backoff = Math.min(this.backoff * 1.7, 10_000);
    };

    ws.onerror = () => ws.close();
  }

  private onFailed(): void {
    this.hooks.onStatus('failed', {
      wsUrl: this.wsUrl ?? '',
      attempts: this.failAttempts,
    });
  }

  send(msg: ClientMsg): void {
    this.sendRaw(msg);
  }

  private sendRaw(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
