import type http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '@shared/protocol.js';
import type { Room, Outbox } from './game.js';

const MAX_MSG_BYTES = 2048;
const MAX_BAD_MSGS = 20;

interface ConnState {
  playerId: string | null;
  tokens: number;
  lastRefill: number;
  chatTokens: number;
  lastChatRefill: number;
  badMsgs: number;
  isAlive: boolean;
}

/**
 * WebSocket transport: authenticates hellos, rate-limits, dispatches actions
 * to the Room and routes Room output back to sockets.
 */
export class Net implements Outbox {
  private wss: WebSocketServer;
  private conns = new Map<WebSocket, ConnState>();
  private activeSocket = new Map<string, WebSocket>();
  private room!: Room;

  constructor(server: http.Server) {
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MSG_BYTES });
    server.on('upgrade', (req, socket, head) => {
      let pathname = '';
      try {
        pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
      } catch {
        // fall through to destroy
      }
      if (pathname !== '/ws') {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws));
    });

    // Heartbeat: drop dead sockets (flaky school wifi leaves zombies).
    setInterval(() => {
      for (const [ws, st] of this.conns) {
        if (!st.isAlive) {
          ws.terminate();
          continue;
        }
        st.isAlive = false;
        ws.ping();
      }
    }, 30_000).unref();
  }

  attachRoom(room: Room): void {
    this.room = room;
  }

  // ------------------------------------------------------------------ Outbox

  send(playerId: string, msg: ServerMsg): void {
    const ws = this.activeSocket.get(playerId);
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  broadcast(msg: ServerMsg): void {
    const data = JSON.stringify(msg);
    for (const ws of this.activeSocket.values()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    }
  }

  // -------------------------------------------------------------- Connection

  private onConnection(ws: WebSocket): void {
    const st: ConnState = {
      playerId: null,
      tokens: 15,
      lastRefill: Date.now(),
      chatTokens: 3,
      lastChatRefill: Date.now(),
      badMsgs: 0,
      isAlive: true,
    };
    this.conns.set(ws, st);

    ws.on('pong', () => (st.isAlive = true));
    ws.on('error', () => ws.terminate());
    ws.on('close', () => {
      this.conns.delete(ws);
      if (st.playerId && this.activeSocket.get(st.playerId) === ws) {
        this.activeSocket.delete(st.playerId);
        this.room.disconnect(st.playerId);
      }
    });
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      let msg: ClientMsg;
      try {
        msg = JSON.parse(data.toString('utf8')) as ClientMsg;
        if (typeof msg !== 'object' || msg === null || typeof msg.t !== 'string') throw 0;
      } catch {
        if (++st.badMsgs > MAX_BAD_MSGS) ws.close(4400, 'bad');
        return;
      }
      try {
        this.dispatch(ws, st, msg);
      } catch (err) {
        console.error('dispatch error', err);
      }
    });
  }

  private dispatch(ws: WebSocket, st: ConnState, msg: ClientMsg): void {
    if (st.playerId === null) {
      if (msg.t !== 'hello') {
        ws.close(4401, 'hello first');
        return;
      }
      this.handleHello(ws, st, msg);
      return;
    }

    if (msg.t === 'ping') {
      ws.send(JSON.stringify({ t: 'pong', ts: Number(msg.ts) || 0, now: Date.now() } satisfies ServerMsg));
      return;
    }

    if (!this.takeToken(st)) return;
    const id = st.playerId;

    switch (msg.t) {
      case 'hello':
        return; // Already joined on this socket.
      case 'click':
        this.room.click(id, Number(msg.n));
        return;
      case 'buy':
        this.room.buy(id, Number(msg.gen), Number(msg.qty));
        return;
      case 'upgrade':
        if (typeof msg.id === 'string') this.room.buyUpgrade(id, msg.id);
        return;
      case 'steal':
        if (typeof msg.target === 'string') this.room.steal(id, msg.target);
        return;
      case 'chat':
        if (typeof msg.text === 'string' && this.takeChatToken(st)) {
          this.room.chatMessage(id, msg.text);
        }
        return;
      case 'emote':
        this.room.emote(id, Number(msg.e));
        return;
      case 'quiz':
        this.room.quizAnswer(id, Number(msg.answer));
        return;
      case 'prestige':
        this.room.prestige(id);
        return;
      case 'leaderboard':
        this.room.leaderboard(id);
        return;
      case 'rename':
        if (typeof msg.name === 'string') this.room.rename(id, msg.name, msg.avatar);
        return;
      case 'adBoost':
        this.room.adBoost(id);
        return;
      default:
        return;
    }
  }

  private handleHello(
    ws: WebSocket,
    st: ConnState,
    msg: Extract<ClientMsg, { t: 'hello' }>,
  ): void {
    const token = typeof msg.token === 'string' ? msg.token : undefined;
    const name = typeof msg.name === 'string' ? msg.name : undefined;
    const { playerId, newToken, offline } = this.room.hello(token, name, msg.avatar);

    // One live socket per player: replace an older tab.
    const old = this.activeSocket.get(playerId);
    if (old && old !== ws) {
      const oldState = this.conns.get(old);
      if (oldState) oldState.playerId = null; // Prevent disconnect() on its close.
      old.close(4001, 'replaced');
    }
    st.playerId = playerId;
    this.activeSocket.set(playerId, ws);

    const you = this.room.youOf(playerId);
    if (!you) {
      ws.close(1011, 'join failed');
      return;
    }
    const welcome: ServerMsg = {
      t: 'welcome',
      you,
      ...(newToken ? { token: newToken } : {}),
      roster: this.room.roster(),
      event: this.room.currentEvent(),
      goal: this.room.goal(),
      chat: this.room.chatTail(),
      now: Date.now(),
      ...(offline ? { offline } : {}),
    };
    ws.send(JSON.stringify(welcome));
  }

  // ------------------------------------------------------------ Rate limits

  private takeToken(st: ConnState): boolean {
    const now = Date.now();
    st.tokens = Math.min(15, st.tokens + ((now - st.lastRefill) / 1000) * 8);
    st.lastRefill = now;
    if (st.tokens < 1) return false;
    st.tokens -= 1;
    return true;
  }

  private takeChatToken(st: ConnState): boolean {
    const now = Date.now();
    st.chatTokens = Math.min(3, st.chatTokens + ((now - st.lastChatRefill) / 1000) * 0.5);
    st.lastChatRefill = now;
    if (st.chatTokens < 1) return false;
    st.chatTokens -= 1;
    return true;
  }
}
