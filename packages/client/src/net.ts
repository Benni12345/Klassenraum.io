import type { ClientMsg, ServerMsg } from '@shared/protocol';
import type { AvatarSpec } from '@shared/types';

export type NetStatus = 'connecting' | 'open' | 'reconnecting' | 'replaced';

/** Same-origin in dev/self-host; set VITE_WS_URL for CrazyGames (client on CDN, server elsewhere). */
function wsEndpoint(): string {
  const configured = import.meta.env.VITE_WS_URL;
  if (configured) return configured;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

interface NetHooks {
  onMessage(msg: ServerMsg): void;
  onStatus(status: NetStatus): void;
}

export interface JoinInfo {
  name?: string;
  avatar?: AvatarSpec;
  /** CrazyGames JWT for server-side account linking. */
  cgToken?: string;
}

/**
 * WebSocket client with auto-reconnect (except when replaced by another tab).
 * Sends hello automatically on every (re)connect.
 */
export class Net {
  private ws: WebSocket | null = null;
  private backoff = 1000;
  private hooks: NetHooks;
  private joinInfo: JoinInfo = {};
  private stopped = false;
  /** Fresh CG token provider called on each (re)connect. */
  private cgTokenProvider: (() => Promise<string | null>) | null = null;

  constructor(hooks: NetHooks) {
    this.hooks = hooks;
  }

  setCgTokenProvider(fn: (() => Promise<string | null>) | null): void {
    this.cgTokenProvider = fn;
  }

  /** Name/avatar are only used when no token exists yet (account creation). */
  connect(joinInfo?: JoinInfo): void {
    if (joinInfo) this.joinInfo = { ...this.joinInfo, ...joinInfo };
    this.stopped = false;
    this.open();
  }

  private open(): void {
    this.hooks.onStatus(this.ws ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(wsEndpoint());
    this.ws = ws;

    ws.onopen = () => {
      this.backoff = 1000;
      void this.sendHello(ws);
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
        return; // Another tab took over; don't fight it.
      }
      if (this.stopped) return;
      this.hooks.onStatus('reconnecting');
      setTimeout(() => this.open(), this.backoff);
      this.backoff = Math.min(this.backoff * 1.7, 10_000);
    };

    ws.onerror = () => ws.close();
  }

  private async sendHello(ws: WebSocket): Promise<void> {
    const token = localStorage.getItem('kr_token') ?? undefined;
    let cgToken = this.joinInfo.cgToken;
    if (this.cgTokenProvider) {
      try {
        cgToken = (await this.cgTokenProvider()) ?? cgToken;
      } catch {
        /* guest play */
      }
    }
    if (ws.readyState !== WebSocket.OPEN) return;
    const hello: ClientMsg = {
      t: 'hello',
      ...(token ? { token } : {}),
      ...(this.joinInfo.name ? { name: this.joinInfo.name } : {}),
      ...(this.joinInfo.avatar ? { avatar: this.joinInfo.avatar } : {}),
      ...(cgToken ? { cgToken } : {}),
    };
    ws.send(JSON.stringify(hello));
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
