import {
  baseBps,
  clickMult,
  clickPower,
  DETENTION_FACTOR,
  resolveTutorialBuy,
  starMult,
  UPGRADE_BY_ID,
} from '@shared/balance';
import { bumpHomework, type HomeworkKind } from '@shared/school';
import type { PvpKind, ServerMsg } from '@shared/protocol';
import { TICK_BUSY, TICK_DETENTION, TICK_INK } from '@shared/protocol';
import type {
  AvatarSpec,
  ChatEntry,
  GoalState,
  LeaderboardRow,
  PlayerPublic,
  PlayerYou,
  RoomEvent,
} from '@shared/types';
import { readAccountToken } from './accountToken';
import { Net, type JoinInfo, type NetStatus } from './net';
import type { PlatformAuth } from './platform/types';

export interface StealFx {
  attacker: string;
  victim: string;
  amount: number;
  caught: boolean;
  kind: PvpKind;
  blocked: boolean;
}

interface Events {
  change: void;
  you: void;
  roster: void;
  steal: StealFx;
  busy: { id: string; until: number };
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
  quizAnsweredAt = 0;
  /** Offline earnings from this hello, until the welcome-back prompt consumes them. */
  pendingOffline: { ms: number; bp: number } | null = null;

  private net: Net;
  private timeOffset = 0;
  private lastFrame = performance.now();
  private clickQueue = 0;
  /** Retry tutorialDone if it was marked while the socket was down. */
  private pendingTutorialDone = false;
  private handlers = new Map<keyof Events, Set<Handler<never>>>();

  constructor() {
    this.net = new Net({
      onMessage: (m) => this.onMessage(m),
      onStatus: (s) => {
        this.status = s;
        this.emit('status', s);
      },
    });
    setInterval(() => this.flushClicks(), 300);
  }

  setCgAuthProvider(fn: (() => Promise<PlatformAuth>) | null): void {
    this.net.setCgAuthProvider(fn);
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
    return readAccountToken() !== null;
  }

  connect(joinInfo?: JoinInfo): void {
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
    this.bumpLocalHomework('notes', 1);
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
    const { qty: q, cost } = resolveTutorialBuy(
      gen,
      y.gens[gen] ?? 0,
      y.bp,
      qty,
      y.tutorialDone,
    );
    if (q <= 0) return;
    y.bp -= cost;
    y.gens[gen] = (y.gens[gen] ?? 0) + q;
    this.recomputeYouRates();
    this.bumpLocalHomework('shop', 1);
    this.net.send({ t: 'buy', gen, qty });
    this.emit('you', undefined);
    this.emit('change', undefined);
  }

  /** Persist guided-tutorial completion on the game backend (Skip counts). */
  markTutorialDone(): void {
    if (this.you) {
      this.you.tutorialDone = true;
      this.emit('you', undefined);
    }
    if (this.net.isOpen) {
      this.pendingTutorialDone = false;
      this.net.send({ t: 'tutorialDone' });
    } else {
      // Welcome/reconnect will flush this so Skip is not lost on a blip.
      this.pendingTutorialDone = true;
    }
  }

  buyUpgrade(id: string): void {
    const y = this.you;
    const u = UPGRADE_BY_ID.get(id);
    if (!y || !u || y.upgrades.includes(id) || y.bp < u.cost) return;
    y.bp -= u.cost;
    y.upgrades.push(id);
    this.recomputeYouRates();
    this.bumpLocalHomework('shop', 1);
    this.net.send({ t: 'upgrade', id });
    this.emit('you', undefined);
    this.emit('change', undefined);
  }

  steal(target: string): void {
    this.net.send({ t: 'steal', target });
  }

  spitball(target: string): void {
    this.net.send({ t: 'spitball', target });
  }

  ink(target: string): void {
    this.net.send({ t: 'ink', target });
  }

  lookBusy(): void {
    this.net.send({ t: 'busy' });
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

  setAvatar(avatar: AvatarSpec): void {
    this.net.send({ t: 'rename', name: '', avatar });
  }

  requestLeaderboard(): void {
    this.net.send({ t: 'leaderboard' });
  }

  claimAdBoost(): void {
    this.net.send({ t: 'adBoost' });
  }

  doubleOffline(): void {
    this.net.send({ t: 'doubleOffline' });
  }

  claimAttendance(recover = false): void {
    this.net.send({ t: 'claimAttendance', recover });
  }

  doubleAttendance(): void {
    this.net.send({ t: 'doubleAttendance' });
  }

  claimHomework(id: string): void {
    this.net.send({ t: 'claimHomework', id });
  }

  equipSkin(id: string): void {
    const y = this.you;
    if (!y?.school.unlockedSkins.includes(id)) return;
    y.school.deskSkin = id;
    const me = this.roster.get(y.id);
    if (me) me.deskSkin = id;
    this.net.send({ t: 'equipSkin', id });
    this.emit('you', undefined);
    this.emit('roster', undefined);
  }

  private bumpLocalHomework(kind: HomeworkKind, n: number): void {
    const y = this.you;
    if (!y) return;
    const task = y.school.homework.find((h) => h.id === kind);
    if (!task || task.claimed) return;
    const { hw, completed } = bumpHomework(
      {
        notes: 0,
        shop: 0,
        steal: 0,
        quiz: 0,
        claimed: [],
        bonusClaimed: false,
        [kind]: task.progress,
      },
      kind,
      n,
    );
    task.progress = hw[kind];
    task.ready = !task.claimed && task.progress >= task.target;
    if (completed) this.emit('you', undefined);
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
        // Re-send a Skip/Done that happened while disconnected.
        if (this.pendingTutorialDone && !this.you.tutorialDone) {
          this.you.tutorialDone = true;
          this.pendingTutorialDone = false;
          this.net.send({ t: 'tutorialDone' });
        } else if (this.you.tutorialDone) {
          this.pendingTutorialDone = false;
        }
        this.pendingOffline = msg.offline ?? null;
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
        for (const [id, bp, bps, tier, flags] of msg.ps) {
          const p = this.roster.get(id);
          if (!p) continue;
          p.bp = bp;
          p.bps = bps;
          p.deskTier = tier;
          p.detention = (flags & TICK_DETENTION) !== 0;
          p.busy = (flags & TICK_BUSY) !== 0;
          p.inked = (flags & TICK_INK) !== 0;
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
        this.emit('steal', {
          attacker: msg.attacker,
          victim: msg.victim,
          amount: msg.amount,
          caught: msg.caught,
          kind: msg.kind ?? 'plane',
          blocked: msg.blocked === true,
        });
        if (msg.kind === 'ink' && !msg.caught && !msg.blocked) {
          const v = this.roster.get(msg.victim);
          if (v) v.inked = true;
        }
        break;
      case 'busy': {
        const p = this.roster.get(msg.id);
        if (p) p.busy = true;
        if (this.you && this.you.id === msg.id) this.you.busyUntil = msg.until;
        this.emit('busy', { id: msg.id, until: msg.until });
        this.emit('roster', undefined);
        break;
      }
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
