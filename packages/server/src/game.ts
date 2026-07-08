import crypto from 'node:crypto';
import {
  AVATAR_RANGES,
  baseBps,
  CHAT_MAX,
  clickMult,
  clickPower,
  CLICKS_PER_SEC_MAX,
  DETENTION_FACTOR,
  DETENTION_MS,
  deskTier,
  EMOTE_COUNT,
  EVENT_MAX_GAP_MS,
  EVENT_MIN_GAP_MS,
  GENERATORS,
  GOAL_BUFF_MS,
  GOAL_BUFF_MULT,
  goalTarget,
  NAME_MAX,
  NAME_MIN,
  OFFLINE_CAP_MS,
  PATROL_CATCH_CHANCE,
  PATROL_MS,
  QUIZ_BUFF_MS,
  QUIZ_BUFF_MULT,
  QUIZ_MS,
  quizReward,
  resolveBuy,
  SEAT_GRACE_MS,
  starMult,
  starsForRun,
  STEAL_COOLDOWN_MS,
  stealAmount,
  SUB_BUFF_MS,
  SUB_BUFF_MULT,
  UPGRADE_BY_ID,
} from '@shared/balance.js';
import type {
  AvatarSpec,
  Buff,
  ChatEntry,
  GoalState,
  PlayerPublic,
  PlayerYou,
  RoomEvent,
} from '@shared/types.js';
import type { ServerMsg, TickTuple } from '@shared/protocol.js';
import type { Db, PlayerRow } from './db.js';

export interface Outbox {
  send(playerId: string, msg: ServerMsg): void;
  broadcast(msg: ServerMsg): void;
}

interface PlayerState extends PlayerRow {
  seat: number;
  online: boolean;
  sleepUntil: number;
  lastCalc: number;
  buffs: Buff[];
  detentionUntil: number;
  clickWinStart: number;
  clickWinCount: number;
  quizAnswered: boolean;
  dirty: boolean;
}

interface ActiveQuiz {
  answer: number;
  winners: string[];
}

const CHAT_HISTORY = 50;

export class Room {
  /** Seated players: online or sleeping (grace period). Keyed by player id. */
  readonly players = new Map<string, PlayerState>();
  private seats: (string | null)[] = [];
  private event: RoomEvent | null = null;
  private quiz: ActiveQuiz | null = null;
  private nextEventAt: number;
  private goalLevel: number;
  private goalProgress: number;
  private chat: ChatEntry[] = [];

  constructor(
    private db: Db,
    private out: Outbox,
    private now: () => number = Date.now,
  ) {
    this.goalLevel = Number(db.getMeta('goal_level') ?? 0);
    this.goalProgress = Number(db.getMeta('goal_progress') ?? 0);
    this.nextEventAt = this.now() + randBetween(EVENT_MIN_GAP_MS, EVENT_MAX_GAP_MS);
  }

  // -------------------------------------------------------------------------
  // Join / leave

  /**
   * Handles a hello. Returns the player id, plus the raw token when a new
   * account was created. Never trusts client-provided economy data.
   */
  hello(
    token: string | undefined,
    name: string | undefined,
    avatar: AvatarSpec | undefined,
  ): { playerId: string; newToken?: string; offline?: { ms: number; bp: number } } {
    const now = this.now();

    if (token && /^[a-f0-9]{48}$/.test(token)) {
      const hash = hashToken(token);
      const seated = this.findSeatedByTokenHash(hash);
      if (seated) {
        // Reconnect while still seated (possibly replacing another tab).
        this.settle(seated, now);
        seated.online = true;
        seated.sleepUntil = 0;
        this.out.broadcast({ t: 'join', p: this.publicOf(seated) });
        return { playerId: seated.id };
      }
      const row = this.db.loadPlayerByToken(hash);
      if (row) {
        const offline = this.applyOfflineGains(row, now);
        const p = this.seatPlayer(row, now);
        this.out.broadcast({ t: 'join', p: this.publicOf(p) });
        return { playerId: p.id, offline };
      }
      // Unknown token (wiped DB?) -> fall through and create a fresh account.
    }

    const id = crypto.randomBytes(6).toString('base64url');
    const newToken = crypto.randomBytes(24).toString('hex');
    const row: PlayerRow = {
      id,
      name: sanitizeName(name) ?? `Schüler-${id.slice(0, 4)}`,
      avatar: sanitizeAvatar(avatar),
      bp: 0,
      runBp: 0,
      lifetimeBp: 0,
      clicks: 0,
      gens: GENERATORS.map(() => 0),
      upgrades: [],
      stars: 0,
      grade: 0,
      stolenTotal: 0,
      lostTotal: 0,
      lastStealAt: 0,
      createdAt: now,
      lastSeen: now,
    };
    this.db.createPlayer(row, hashToken(newToken));
    const p = this.seatPlayer(row, now);
    this.out.broadcast({ t: 'join', p: this.publicOf(p) });
    return { playerId: id, newToken };
  }

  private findSeatedByTokenHash(hash: string): PlayerState | null {
    // Token hashes are not kept in memory; resolve via DB id.
    const row = this.db.loadPlayerByToken(hash);
    return row ? (this.players.get(row.id) ?? null) : null;
  }

  private applyOfflineGains(
    row: PlayerRow,
    now: number,
  ): { ms: number; bp: number } | undefined {
    const elapsed = Math.min(Math.max(0, now - row.lastSeen), OFFLINE_CAP_MS);
    if (elapsed < 60_000) return undefined;
    const eco = { gens: row.gens, upgrades: row.upgrades, stars: row.stars };
    const gain = baseBps(eco) * starMult(row.stars) * (elapsed / 1000);
    if (gain <= 0) return undefined;
    row.bp += gain;
    row.runBp += gain;
    row.lifetimeBp += gain;
    this.goalProgress += gain;
    return { ms: elapsed, bp: gain };
  }

  private seatPlayer(row: PlayerRow, now: number): PlayerState {
    let seat = this.seats.indexOf(null);
    if (seat === -1) {
      seat = this.seats.length;
      this.seats.push(null);
    }
    this.seats[seat] = row.id;
    const p: PlayerState = {
      ...row,
      gens: padGens(row.gens),
      seat,
      online: true,
      sleepUntil: 0,
      lastCalc: now,
      buffs: [],
      detentionUntil: 0,
      clickWinStart: now,
      clickWinCount: 0,
      quizAnswered: false,
      dirty: true,
    };
    this.players.set(p.id, p);
    return p;
  }

  disconnect(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || !p.online) return;
    const now = this.now();
    this.settle(p, now);
    p.online = false;
    p.sleepUntil = now + SEAT_GRACE_MS;
    p.lastSeen = now;
    this.savePlayer(p);
    this.out.broadcast({ t: 'sleep', id: p.id });
  }

  // -------------------------------------------------------------------------
  // Economy core

  private effectiveBps(p: PlayerState, now: number): number {
    let mult = starMult(p.stars);
    for (const b of p.buffs) if (b.until > now) mult *= b.mult;
    if (p.detentionUntil > now) mult *= DETENTION_FACTOR;
    return baseBps(p) * mult;
  }

  /** Integrate production up to `now`. Call before reading or mutating bp. */
  private settle(p: PlayerState, now: number): void {
    const dt = (now - p.lastCalc) / 1000;
    p.lastCalc = now;
    if (dt <= 0) return;
    const gain = this.effectiveBps(p, now) * dt;
    if (gain > 0) {
      p.bp += gain;
      p.runBp += gain;
      p.lifetimeBp += gain;
      this.goalProgress += gain;
      p.dirty = true;
    }
    p.buffs = p.buffs.filter((b) => b.until > now);
  }

  private earn(p: PlayerState, amount: number): void {
    p.bp += amount;
    p.runBp += amount;
    p.lifetimeBp += amount;
    this.goalProgress += amount;
    p.dirty = true;
  }

  private addBuff(p: PlayerState, id: string, labelKey: string, mult: number, ms: number): void {
    const now = this.now();
    this.settle(p, now);
    const existing = p.buffs.find((b) => b.id === id);
    if (existing) existing.until = Math.max(existing.until, now + ms);
    else p.buffs.push({ id, labelKey, mult, until: now + ms });
    this.sendYou(p);
  }

  // -------------------------------------------------------------------------
  // Player actions

  click(playerId: string, n: number): void {
    const p = this.online(playerId);
    if (!p) return;
    const now = this.now();
    if (now - p.clickWinStart >= 1000) {
      p.clickWinStart = now;
      p.clickWinCount = 0;
    }
    const requested = Math.min(Math.max(0, Math.floor(n)), 40);
    const allowed = Math.min(requested, CLICKS_PER_SEC_MAX - p.clickWinCount);
    if (allowed <= 0) return;
    p.clickWinCount += allowed;
    this.settle(p, now);
    const power = clickPower(this.effectiveBps(p, now), clickMult(p.upgrades));
    this.earn(p, power * allowed);
    p.clicks += allowed;
  }

  buy(playerId: string, gen: number, qty: number): void {
    const p = this.online(playerId);
    if (!p) return;
    if (!Number.isInteger(gen) || gen < 0 || gen >= GENERATORS.length) return;
    if (qty !== 1 && qty !== 10 && qty !== -1) qty = 1;
    const now = this.now();
    this.settle(p, now);
    const { qty: q, cost } = resolveBuy(gen, p.gens[gen] ?? 0, p.bp, qty);
    if (q <= 0) {
      this.out.send(p.id, { t: 'error', code: 'poor' });
      return;
    }
    p.bp -= cost;
    p.gens[gen] = (p.gens[gen] ?? 0) + q;
    p.dirty = true;
    this.sendYou(p);
  }

  buyUpgrade(playerId: string, id: string): void {
    const p = this.online(playerId);
    if (!p) return;
    const u = UPGRADE_BY_ID.get(id);
    if (!u || p.upgrades.includes(id)) return;
    const unlocked =
      u.kind === 'gen' ? (p.gens[u.gen] ?? 0) >= u.threshold : p.clicks >= u.threshold;
    if (!unlocked) return;
    const now = this.now();
    this.settle(p, now);
    if (p.bp < u.cost) {
      this.out.send(p.id, { t: 'error', code: 'poor' });
      return;
    }
    p.bp -= u.cost;
    p.upgrades.push(id);
    p.dirty = true;
    this.sendYou(p);
  }

  prestige(playerId: string): void {
    const p = this.online(playerId);
    if (!p) return;
    const now = this.now();
    this.settle(p, now);
    const gained = starsForRun(p.runBp);
    if (gained < 1) {
      this.out.send(p.id, { t: 'error', code: 'prestige' });
      return;
    }
    p.stars += gained;
    p.grade += 1;
    p.bp = 0;
    p.runBp = 0;
    p.gens = GENERATORS.map(() => 0);
    p.upgrades = [];
    p.buffs = [];
    p.dirty = true;
    this.savePlayer(p);
    this.sendYou(p);
    this.out.broadcast({ t: 'roster', p: this.publicOf(p) });
  }

  steal(playerId: string, targetId: string): void {
    const p = this.online(playerId);
    if (!p) return;
    const now = this.now();
    if (p.detentionUntil > now) {
      this.out.send(p.id, { t: 'error', code: 'detention' });
      return;
    }
    if (now - p.lastStealAt < STEAL_COOLDOWN_MS) {
      this.out.send(p.id, { t: 'error', code: 'cooldown' });
      return;
    }
    const victim = this.players.get(targetId);
    if (!victim || !victim.online || victim.id === p.id) {
      this.out.send(p.id, { t: 'error', code: 'target' });
      return;
    }
    this.settle(p, now);
    this.settle(victim, now);
    p.lastStealAt = now; // Cooldown is consumed even when caught.
    p.dirty = true;

    if (this.event?.kind === 'patrol' && Math.random() < PATROL_CATCH_CHANCE) {
      p.detentionUntil = now + DETENTION_MS;
      this.out.broadcast({ t: 'steal', attacker: p.id, victim: victim.id, amount: 0, caught: true });
      this.sendYou(p);
      return;
    }

    const amount = stealAmount(victim.bp, this.effectiveBps(p, now));
    victim.bp -= amount;
    victim.lostTotal += amount;
    victim.dirty = true;
    p.bp += amount;
    p.stolenTotal += amount;
    this.out.broadcast({
      t: 'steal',
      attacker: p.id,
      victim: victim.id,
      amount: Math.round(amount * 10) / 10,
      caught: false,
    });
    this.sendYou(p);
    this.sendYou(victim);
  }

  chatMessage(playerId: string, text: string): void {
    const p = this.online(playerId);
    if (!p) return;
    const clean = text.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
    if (!clean) return;
    const entry: ChatEntry = {
      id: p.id,
      name: p.name,
      text: clean.slice(0, CHAT_MAX),
      ts: this.now(),
    };
    this.chat.push(entry);
    if (this.chat.length > CHAT_HISTORY) this.chat.shift();
    this.out.broadcast({ t: 'chat', msg: entry });
  }

  emote(playerId: string, e: number): void {
    const p = this.online(playerId);
    if (!p) return;
    if (!Number.isInteger(e) || e < 0 || e >= EMOTE_COUNT) return;
    this.out.broadcast({ t: 'emote', id: p.id, e });
  }

  quizAnswer(playerId: string, answer: number): void {
    const p = this.online(playerId);
    if (!p || !this.quiz || this.event?.kind !== 'quiz') return;
    if (p.quizAnswered) return;
    p.quizAnswered = true;
    if (Math.round(answer) === this.quiz.answer) {
      this.quiz.winners.push(p.id);
      const now = this.now();
      this.settle(p, now);
      this.earn(p, quizReward(this.effectiveBps(p, now)));
      this.addBuff(p, 'quiz', 'buff.quiz', QUIZ_BUFF_MULT, QUIZ_BUFF_MS);
    }
  }

  rename(playerId: string, name: string, avatar?: AvatarSpec): void {
    const p = this.online(playerId);
    if (!p) return;
    const clean = sanitizeName(name);
    if (clean) p.name = clean;
    if (avatar) p.avatar = sanitizeAvatar(avatar);
    p.dirty = true;
    this.sendYou(p);
    this.out.broadcast({ t: 'roster', p: this.publicOf(p) });
  }

  leaderboard(playerId: string): void {
    const rows = this.db.topPlayers(20).map((r) => {
      const seated = this.players.get(r.id);
      return {
        name: seated?.name ?? r.name,
        grade: r.grade,
        stars: r.stars,
        lifetimeBp: Math.max(r.lifetimeBp, seated?.lifetimeBp ?? 0),
        online: seated?.online ?? false,
      };
    });
    this.out.send(playerId, { t: 'leaderboard', rows });
  }

  // -------------------------------------------------------------------------
  // Tick: settlement, events, goal, broadcast

  tick(): void {
    const now = this.now();

    for (const p of this.players.values()) this.settle(p, now);

    // Free seats whose grace period expired.
    for (const p of [...this.players.values()]) {
      if (!p.online && now >= p.sleepUntil) {
        p.lastSeen = now;
        this.savePlayer(p);
        this.players.delete(p.id);
        this.seats[p.seat] = null;
        this.out.broadcast({ t: 'leave', id: p.id });
      }
    }

    this.updateEvent(now);
    this.updateGoal();

    const ps: TickTuple[] = [];
    for (const p of this.players.values()) {
      ps.push([
        p.id,
        round1(p.bp),
        round2(this.effectiveBps(p, now)),
        deskTier(p.gens),
        p.detentionUntil > now ? 1 : 0,
      ]);
    }
    this.out.broadcast({ t: 'tick', ps, goal: this.goal(), now });
  }

  private updateEvent(now: number): void {
    if (this.event && now >= this.event.endsAt) {
      if (this.event.kind === 'quiz' && this.quiz) {
        this.out.broadcast({
          t: 'quizResult',
          answer: this.quiz.answer,
          winners: this.quiz.winners.map((id) => this.players.get(id)?.name ?? '?'),
        });
        this.quiz = null;
      }
      this.event = null;
      this.nextEventAt = now + randBetween(EVENT_MIN_GAP_MS, EVENT_MAX_GAP_MS);
      this.out.broadcast({ t: 'event', ev: null });
    }

    const onlineCount = [...this.players.values()].filter((p) => p.online).length;
    if (!this.event && now >= this.nextEventAt && onlineCount >= 1) {
      this.startRandomEvent(now);
    }
  }

  private startRandomEvent(now: number): void {
    const roll = Math.random() * 6;
    if (roll < 3) {
      const q = makeQuiz();
      this.quiz = { answer: q.answer, winners: [] };
      for (const p of this.players.values()) p.quizAnswered = false;
      this.event = { kind: 'quiz', startedAt: now, endsAt: now + QUIZ_MS, question: q.question };
    } else if (roll < 5) {
      this.event = { kind: 'patrol', startedAt: now, endsAt: now + PATROL_MS };
    } else {
      this.event = { kind: 'sub', startedAt: now, endsAt: now + SUB_BUFF_MS };
      for (const p of this.players.values()) {
        if (p.online) this.addBuff(p, 'sub', 'buff.sub', SUB_BUFF_MULT, SUB_BUFF_MS);
      }
    }
    this.out.broadcast({ t: 'event', ev: this.event });
  }

  private updateGoal(): void {
    let completed = false;
    while (this.goalProgress >= goalTarget(this.goalLevel)) {
      this.goalProgress -= goalTarget(this.goalLevel);
      this.goalLevel += 1;
      completed = true;
    }
    if (completed) {
      for (const p of this.players.values()) {
        if (p.online) this.addBuff(p, 'goal', 'buff.goal', GOAL_BUFF_MULT, GOAL_BUFF_MS);
      }
      this.out.broadcast({ t: 'goal', goal: this.goal(), completed: true });
      this.persistGoal();
    }
  }

  // -------------------------------------------------------------------------
  // Snapshots

  goal(): GoalState {
    return {
      level: this.goalLevel,
      progress: Math.round(this.goalProgress),
      target: goalTarget(this.goalLevel),
    };
  }

  currentEvent(): RoomEvent | null {
    return this.event;
  }

  chatTail(): ChatEntry[] {
    return this.chat.slice(-20);
  }

  roster(): PlayerPublic[] {
    return [...this.players.values()].map((p) => this.publicOf(p));
  }

  publicOf(p: PlayerState): PlayerPublic {
    const now = this.now();
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      seat: p.seat,
      grade: p.grade,
      stars: p.stars,
      deskTier: deskTier(p.gens),
      bp: round1(p.bp),
      bps: round2(this.effectiveBps(p, now)),
      online: p.online,
      detention: p.detentionUntil > now,
    };
  }

  youOf(playerId: string): PlayerYou | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    const now = this.now();
    this.settle(p, now);
    const eff = this.effectiveBps(p, now);
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      seat: p.seat,
      bp: p.bp,
      bps: eff,
      baseBps: baseBps(p),
      clickPower: clickPower(eff, clickMult(p.upgrades)),
      gens: [...p.gens],
      upgrades: [...p.upgrades],
      clicks: p.clicks,
      stars: p.stars,
      grade: p.grade,
      runBp: p.runBp,
      lifetimeBp: p.lifetimeBp,
      starsIfGraduate: starsForRun(p.runBp),
      buffs: p.buffs.filter((b) => b.until > now),
      detentionUntil: p.detentionUntil,
      stealReadyAt: p.lastStealAt + STEAL_COOLDOWN_MS,
      stolenTotal: p.stolenTotal,
      lostTotal: p.lostTotal,
    };
  }

  private sendYou(p: PlayerState): void {
    if (!p.online) return;
    const you = this.youOf(p.id);
    if (you) this.out.send(p.id, { t: 'you', you });
  }

  // -------------------------------------------------------------------------
  // Persistence

  flush(): void {
    for (const p of this.players.values()) {
      if (p.dirty) {
        if (p.online) p.lastSeen = this.now();
        this.savePlayer(p);
      }
    }
    this.persistGoal();
  }

  private persistGoal(): void {
    this.db.setMeta('goal_level', String(this.goalLevel));
    this.db.setMeta('goal_progress', String(Math.round(this.goalProgress)));
  }

  private savePlayer(p: PlayerState): void {
    this.db.savePlayer(p);
    p.dirty = false;
  }

  shutdown(): void {
    const now = this.now();
    for (const p of this.players.values()) {
      this.settle(p, now);
      p.lastSeen = now;
      this.savePlayer(p);
    }
    this.persistGoal();
  }

  private online(playerId: string): PlayerState | null {
    const p = this.players.get(playerId);
    return p && p.online ? p : null;
  }
}

// ---------------------------------------------------------------------------
// Helpers

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function sanitizeName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const clean = name
    .replace(/[^\p{L}\p{N} _.\-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
  return clean.length >= NAME_MIN ? clean : null;
}

export function sanitizeAvatar(a: unknown): AvatarSpec {
  const src = (a ?? {}) as Partial<Record<keyof AvatarSpec, unknown>>;
  const pick = (v: unknown, max: number): number =>
    Number.isInteger(v) && (v as number) >= 0 && (v as number) < max
      ? (v as number)
      : Math.floor(Math.random() * max);
  return {
    skin: pick(src.skin, AVATAR_RANGES.skin),
    hair: pick(src.hair, AVATAR_RANGES.hair),
    hairColor: pick(src.hairColor, AVATAR_RANGES.hairColor),
    shirt: pick(src.shirt, AVATAR_RANGES.shirt),
  };
}

function makeQuiz(): { question: string; answer: number } {
  const kind = Math.floor(Math.random() * 3);
  if (kind === 0) {
    const a = randInt(12, 99);
    const b = randInt(12, 99);
    return { question: `${a} + ${b} = ?`, answer: a + b };
  }
  if (kind === 1) {
    const a = randInt(30, 99);
    const b = randInt(11, a - 10);
    return { question: `${a} − ${b} = ?`, answer: a - b };
  }
  const a = randInt(3, 12);
  const b = randInt(4, 19);
  return { question: `${a} × ${b} = ?`, answer: a * b };
}

function padGens(gens: number[]): number[] {
  const out = GENERATORS.map((_, i) => Math.max(0, Math.floor(gens[i] ?? 0)));
  return out;
}

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
