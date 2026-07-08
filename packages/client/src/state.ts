import {
  baseBps,
  clickMult,
  clickPower,
  DETENTION_FACTOR,
  resolveBuy,
  starMult,
  UPGRADE_BY_ID,
} from '@shared/balance';
import type { ServerMsg } from '@shared/protocol';
import type {
  ChatEntry,
  GoalState,
  LeaderboardRow,
  PlayerPublic,
  PlayerYou,
  RoomEvent,
} from '@shared/types';
import { Net, type NetStatus } from './net';
import { clearWsUrlCache } from './config';

export interface StealFx {
  attacker: string;
  victim: string;
  amount: number;
  caught: boolean;
}

interface Events {
  change: void;
  you: void;
  roster: void;
  steal: StealFx;
  emote: { id: string; e: number };
  chat: ChatEntry;
  event: RoomEvent | null;
  quizResult: { answer: number; winners: string[] };
  goalDone: void;
  leaderboard: LeaderboardRow[];
  status: NetStatus;
  error: string;
  offline: { ms: number; bp: number };
  joined: void;
}

type Handler<K extends keyof Events> = (payload: Events[K]) => void;

class Store {
  you: PlayerYou | null = null;
  roster = new Map<string, PlayerPublic>();
  event: RoomEvent | null = null;
  goal: GoalState = { level: 0, progress: 0, target: 50_000 };
  chatLog: ChatEntry[] = [];
  status: NetStatus = 'connecting';
  wsUrl: string | null = null;
  quizAnsweredAt = 0;

  private net: Net;
  private timeOffset = 0;
  private lastFrame = performance.now();
  private clickQueue = 0;
  private handlers = new Map<keyof Events, Set<Handler<never>>>();

  constructor() {
    this.net = new Net({
      onMessage: (m) => this.onMessage(m),
      onStatus: (s, detail) => {
        this.status = s;
        if (detail?.wsUrl) this.wsUrl = detail.wsUrl;
        this.emit('status', s);
      },
    });
    setInterval(() => this.flushClicks(), 300);
  }

  // ------------------------------------------------------------------ Events

  on<K extends keyof Events>(ev: K, fn: Handler<K>): void {
    if (!this.handlers.has(ev)) this.handlers.set(ev, new Set());
    this.handlers.get(ev)!.add(fn as Handler<never>);
  }

  private emit<K extends keyof Events>(ev: K, payload: Events[K]): void {
    this.handlers.get(ev)?.forEach((fn) => (fn as Handler<K>)(payload));
  }

  // ------------------------------------------------------------- Connection

  get hasAccount(): boolean {
    return localStorage.getItem('kr_token') !== null;
  }

  connect(joinInfo?: { name?: string; avatar?: PlayerYou['avatar'] }): void {
    clearWsUrlCache();
    this.net.connect(joinInfo);
  }

  serverNow(): number {
    return Date.now() + this.timeOffset;
  }

  // -------------------------------------------------------------- Prediction

  /** Advance local prediction; call once per animation frame. */
  frameAdvance(): void {
    const now = performance.now();
    const dt = Math.min(2, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.you) {
      this.you.bp += this.you.bps * dt;
      this.you.runBp += this.you.bps * dt;
      const sn = this.serverNow();
      // Drop locally-expired buffs so displayed bps doesn't overshoot.
      const active = this.you.buffs.filter((b) => b.until > sn);
      if (active.length !== this.you.buffs.length) {
        this.you.buffs = active;
        this.recomputeYouRates();
      }
    }
    for (const p of this.roster.values()) {
      if (p.online) p.bp += p.bps * dt;
    }
  }

  private recomputeYouRates(): void {
    const y = this.you;
    if (!y) return;
    const sn = this.serverNow();
    let mult = starMult(y.stars);
    for (const b of y.buffs) if (b.until > sn) mult *= b.mult;
    if (y.detentionUntil > sn) mult *= DETENTION_FACTOR;
    y.baseBps = baseBps({ gens: y.gens, upgrades: y.upgrades, stars: y.stars });
    y.bps = y.baseBps * mult;
    y.clickPower = clickPower(y.bps, clickMult(y.upgrades));
  }

  // ----------------------------------------------------------------- Actions

  click(): number {
    if (!this.you) return 0;
    this.clickQueue += 1;
    const gain = this.you.clickPower;
    this.you.bp += gain;
    this.you.clicks += 1;
    return gain;
  }

  private flushClicks(): void {
    if (this.clickQueue > 0 && this.net.isOpen) {
      this.net.send({ t: 'click', n: this.clickQueue });
      this.clickQueue = 0;
    }
  }

  buy(gen: number, qty: number): void {
    const y = this.you;
    if (!y) return;
    const { qty: q, cost } = resolveBuy(gen, y.gens[gen] ?? 0, y.bp, qty);
    if (q <= 0) return;
    y.bp -= cost;
    y.gens[gen] = (y.gens[gen] ?? 0) + q;
    this.recomputeYouRates();
    this.net.send({ t: 'buy', gen, qty });
    this.emit('you', undefined);
    this.emit('change', undefined);
  }

  buyUpgrade(id: string): void {
    const y = this.you;
    const u = UPGRADE_BY_ID.get(id);
    if (!y || !u || y.upgrades.includes(id) || y.bp < u.cost) return;
    y.bp -= u.cost;
    y.upgrades.push(id);
    this.recomputeYouRates();
    this.net.send({ t: 'upgrade', id });
    this.emit('you', undefined);
    this.emit('change', undefined);
  }

  steal(target: string): void {
    this.net.send({ t: 'steal', target });
  }

  sendChat(text: string): void {
    this.net.send({ t: 'chat', text });
  }

  sendEmote(e: number): void {
    this.net.send({ t: 'emote', e });
  }

  answerQuiz(answer: number): void {
    this.quizAnsweredAt = Date.now();
    this.net.send({ t: 'quiz', answer });
  }

  prestige(): void {
    this.net.send({ t: 'prestige' });
  }

  rename(name: string): void {
    this.net.send({ t: 'rename', name });
  }

  requestLeaderboard(): void {
    this.net.send({ t: 'leaderboard' });
  }

  ping(): void {
    this.net.send({ t: 'ping', ts: Date.now() });
  }

  // ---------------------------------------------------------------- Messages

  private onMessage(msg: ServerMsg): void {
    switch (msg.t) {
      case 'welcome': {
        this.timeOffset = msg.now - Date.now();
        this.you = msg.you;
        this.roster.clear();
        for (const p of msg.roster) this.roster.set(p.id, p);
        this.event = msg.event;
        this.goal = msg.goal;
        this.chatLog = msg.chat;
        this.emit('joined', undefined);
        if (msg.offline) this.emit('offline', msg.offline);
        this.emit('roster', undefined);
        this.emit('you', undefined);
        this.emit('event', this.event);
        this.emit('change', undefined);
        break;
      }
      case 'you':
        this.you = msg.you;
        this.emit('you', undefined);
        this.emit('change', undefined);
        break;
      case 'join': {
        this.roster.set(msg.p.id, msg.p);
        this.emit('roster', undefined);
        this.emit('change', undefined);
        break;
      }
      case 'sleep': {
        const p = this.roster.get(msg.id);
        if (p) p.online = false;
        this.emit('roster', undefined);
        break;
      }
      case 'leave':
        this.roster.delete(msg.id);
        this.emit('roster', undefined);
        this.emit('change', undefined);
        break;
      case 'roster': {
        this.roster.set(msg.p.id, msg.p);
        this.emit('roster', undefined);
        this.emit('change', undefined);
        break;
      }
      case 'tick': {
        this.timeOffset = msg.now - Date.now();
        for (const [id, bp, bps, tier, detention] of msg.ps) {
          const p = this.roster.get(id);
          if (!p) continue;
          p.bp = bp;
          p.bps = bps;
          p.deskTier = tier;
          p.detention = detention === 1;
        }
        // Reconcile own displayed value toward authoritative one.
        const mine = this.you && msg.ps.find(([id]) => id === this.you!.id);
        if (mine && this.you) {
          this.you.bp = this.you.bp * 0.5 + mine[1] * 0.5;
        }
        this.goal = msg.goal;
        this.emit('change', undefined);
        break;
      }
      case 'steal':
        this.emit('steal', msg);
        break;
      case 'chat':
        this.chatLog.push(msg.msg);
        if (this.chatLog.length > 60) this.chatLog.shift();
        this.emit('chat', msg.msg);
        break;
      case 'emote':
        this.emit('emote', { id: msg.id, e: msg.e });
        break;
      case 'event':
        this.event = msg.ev;
        this.emit('event', msg.ev);
        this.emit('change', undefined);
        break;
      case 'quizResult':
        this.emit('quizResult', { answer: msg.answer, winners: msg.winners });
        break;
      case 'goal':
        this.goal = msg.goal;
        if (msg.completed) this.emit('goalDone', undefined);
        this.emit('change', undefined);
        break;
      case 'leaderboard':
        this.emit('leaderboard', msg.rows);
        break;
      case 'error':
        this.emit('error', msg.code);
        break;
      case 'pong':
        this.timeOffset = msg.now - Date.now();
        break;
    }
  }
}

export const store = new Store();
