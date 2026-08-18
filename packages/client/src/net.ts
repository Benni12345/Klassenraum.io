import type { ClientMsg, ServerMsg } from '@shared/protocol';
import type { AvatarSpec } from '@shared/types';
import { readAccountToken, writeAccountToken } from './accountToken';
import type { PlatformAuth } from './platform/types';
import { isTutorialDoneLocally } from './prefs';

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
  /** Force tutorialDone on hello (in addition to prefs / Data cache). */
  tutorialDone?: boolean;
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
  /** Fresh CrazyGames auth snapshot on each (re)connect. */
  private cgAuthProvider: (() => Promise<PlatformAuth>) | null = null;
  /** Last JWT that made it into a hello this session (reconnect fallback). */
  private lastCgToken: string | null = null;
  /** Last guest save token sent this page (survives a mid-session storage wipe). */
  private lastGuestToken: string | null = null;
  /** True when the hello we just sent included a CrazyGames JWT. */
  private expectingCg = false;

  constructor(hooks: NetHooks) {
    this.hooks = hooks;
  }

  setCgAuthProvider(fn: (() => Promise<PlatformAuth>) | null): void {
    this.cgAuthProvider = fn;
  }

  /** Name/avatar are only used when no token exists yet (account creation). */
  connect(joinInfo?: JoinInfo): void {
    if (joinInfo) this.joinInfo = { ...this.joinInfo, ...joinInfo };
    this.stopped = false;
    this.open();
  }

  /**
   * Close the current socket (if any) and hello again. Used on CrazyGames
   * login/logout so the still-in-memory guest token is sent with the new JWT
   * instead of relying on a full page reload (which can wipe storage).
   */
  reconnect(joinInfo?: JoinInfo): void {
    if (joinInfo) this.joinInfo = { ...this.joinInfo, ...joinInfo };
    const old = this.ws;
    this.stopped = true;
    this.ws = null;
    if (old && (old.readyState === WebSocket.OPEN || old.readyState === WebSocket.CONNECTING)) {
      old.close();
    }
    this.stopped = false;
    this.backoff = 1000;
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
        // A logged-in hello that comes back as a guest save is the "points
        // reset" bug — do not adopt it; reconnect and try the JWT again.
        if (this.expectingCg && !msg.you.cgLinked) {
          ws.close();
          return;
        }
        if (msg.token) {
          writeAccountToken(msg.token);
          this.lastGuestToken = msg.token;
        } else if (this.lastGuestToken) {
          writeAccountToken(this.lastGuestToken);
        }
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
      if (ev.code === 4402) {
        // Server rejected the JWT — don't reuse it on the next hello.
        this.lastCgToken = null;
        delete this.joinInfo.cgToken;
      }
      if (this.stopped) return;
      this.hooks.onStatus('reconnecting');
      setTimeout(() => this.open(), this.backoff);
      this.backoff = Math.min(this.backoff * 1.7, 10_000);
    };

    ws.onerror = () => ws.close();
  }

  private async sendHello(ws: WebSocket): Promise<void> {
    const token = readAccountToken() ?? this.lastGuestToken ?? undefined;
    if (token) {
      this.lastGuestToken = token;
      writeAccountToken(token);
    }
    let cgToken: string | undefined;
    let loggedIn = false;
    if (this.cgAuthProvider) {
      try {
        const auth = await this.cgAuthProvider();
        loggedIn = auth.loggedIn;
        // After logout, never keep sending a boot-time JWT.
        cgToken = loggedIn ? (auth.token ?? this.joinInfo.cgToken) : undefined;
      } catch {
        cgToken = this.joinInfo.cgToken;
      }
    } else {
      cgToken = this.joinInfo.cgToken;
    }
    const usableCg = typeof cgToken === 'string' && cgToken.length > 20 ? cgToken : undefined;
    const fallbackCg =
      !usableCg && loggedIn && this.lastCgToken ? this.lastCgToken : undefined;
    const jwt = usableCg ?? fallbackCg;
    if (ws.readyState !== WebSocket.OPEN) return;
    // Logged-in players must never hello as a guest — that seats a blank save
    // and looks like a progress reset until a later reload includes the JWT.
    if (loggedIn && !jwt) {
      this.expectingCg = true;
      ws.close();
      return;
    }
    this.expectingCg = Boolean(jwt);
    if (jwt) this.lastCgToken = jwt;
    // Carry local/Data tutorial completion on hello so Skip survives an
    // immediate login reload and restores onto the CrazyGames account.
    const tutorialDone = this.joinInfo.tutorialDone === true || isTutorialDoneLocally();
    const hello: ClientMsg = {
      t: 'hello',
      ...(token ? { token } : {}),
      ...(this.joinInfo.name ? { name: this.joinInfo.name } : {}),
      ...(this.joinInfo.avatar ? { avatar: this.joinInfo.avatar } : {}),
      ...(jwt ? { cgToken: jwt } : {}),
      ...(tutorialDone ? { tutorialDone: true } : {}),
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
