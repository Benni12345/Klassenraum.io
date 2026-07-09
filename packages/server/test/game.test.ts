import { describe, expect, it } from 'vitest';
import type { ServerMsg } from '../../shared/src/protocol.js';
import { Db } from '../src/db.js';
import { Room, sanitizeName } from '../src/game.js';

function setup(rng: () => number = () => 0.99) {
  let now = 1_000_000_000;
  const clock = {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
  const sent = new Map<string, ServerMsg[]>();
  const broadcasts: ServerMsg[] = [];
  const out = {
    send: (id: string, m: ServerMsg) => {
      if (!sent.has(id)) sent.set(id, []);
      sent.get(id)!.push(m);
    },
    broadcast: (m: ServerMsg) => broadcasts.push(m),
  };
  const db = new Db(':memory:');
  const room = new Room(db, out, clock.now, rng);
  return { room, db, clock, sent, broadcasts };
}

describe('join and seats', () => {
  it('creates players with tokens and assigns dense seats', () => {
    const { room } = setup();
    const a = room.hello(undefined, 'Anna', undefined);
    const b = room.hello(undefined, 'Ben', undefined);
    expect(a.newToken).toMatch(/^[a-f0-9]{48}$/);
    expect(room.youOf(a.playerId)!.seat).toBe(0);
    expect(room.youOf(b.playerId)!.seat).toBe(1);
    expect(room.roster().length).toBe(2);
  });

  it('frees seats after the grace period and reuses them', () => {
    const { room, clock } = setup();
    const a = room.hello(undefined, 'Anna', undefined);
    room.hello(undefined, 'Ben', undefined);
    room.disconnect(a.playerId);
    room.tick();
    expect(room.roster().find((p) => p.id === a.playerId)!.online).toBe(false);
    clock.advance(5 * 60_000 + 1000);
    room.tick();
    expect(room.roster().find((p) => p.id === a.playerId)).toBeUndefined();
    const c = room.hello(undefined, 'Cleo', undefined);
    expect(room.youOf(c.playerId)!.seat).toBe(0);
  });

  it('restores accounts by token, including offline gains', () => {
    const { room, clock } = setup();
    const a = room.hello(undefined, 'Anna', undefined);
    // Earn 25 BP by clicking, buy a pencil (0.1 BP/s).
    room.click(a.playerId, 40);
    room.buy(a.playerId, 0, 1);
    room.disconnect(a.playerId);
    clock.advance(6 * 60_000);
    room.tick(); // frees the seat, persists
    clock.advance(2 * 3_600_000);
    const back = room.hello(a.newToken, undefined, undefined);
    expect(back.playerId).toBe(a.playerId);
    expect(back.offline).toBeDefined();
    expect(back.offline!.bp).toBeCloseTo(0.1 * 2 * 3600, 0);
    const you = room.youOf(a.playerId)!;
    expect(you.gens[0]).toBe(1);
  });
});

describe('economy', () => {
  it('clamps clicks to 25 per second', () => {
    const { room, clock } = setup();
    const a = room.hello(undefined, 'Anna', undefined);
    room.click(a.playerId, 40);
    expect(room.youOf(a.playerId)!.clicks).toBe(25);
    room.click(a.playerId, 10);
    expect(room.youOf(a.playerId)!.clicks).toBe(25);
    clock.advance(1100);
    room.click(a.playerId, 10);
    expect(room.youOf(a.playerId)!.clicks).toBe(35);
  });

  it('produces over time after buying generators', () => {
    const { room, clock } = setup();
    const a = room.hello(undefined, 'Anna', undefined);
    room.click(a.playerId, 25); // 25 BP
    room.buy(a.playerId, 0, 1); // -15 BP
    const before = room.youOf(a.playerId)!;
    expect(before.gens[0]).toBe(1);
    expect(before.baseBps).toBeCloseTo(0.1);
    clock.advance(60_000);
    const after = room.youOf(a.playerId)!;
    expect(after.bp).toBeCloseTo(before.bp + 6, 1);
  });

  it('rejects unaffordable buys with an error', () => {
    const { room, sent } = setup();
    const a = room.hello(undefined, 'Anna', undefined);
    room.buy(a.playerId, 8, 1); // galaxy brain on 0 BP
    const errs = (sent.get(a.playerId) ?? []).filter((m) => m.t === 'error');
    expect(errs.length).toBe(1);
  });

  it('applies upgrades only when threshold met and affordable', () => {
    const { room, clock } = setup();
    const a = room.hello(undefined, 'Anna', undefined);
    // Grind enough BP: simulate long idle with pencils.
    room.click(a.playerId, 25);
    room.buy(a.playerId, 0, 1);
    (room as any).players.get(a.playerId).bp = 1e6;
    room.buy(a.playerId, 0, 10);
    expect(room.youOf(a.playerId)!.gens[0]).toBe(11);
    room.buyUpgrade(a.playerId, 'pencil0'); // threshold 10 -> ok
    const you = room.youOf(a.playerId)!;
    expect(you.upgrades).toContain('pencil0');
    expect(you.baseBps).toBeCloseTo(11 * 0.1 * 2);
    room.buyUpgrade(a.playerId, 'pencil1'); // threshold 25 -> rejected silently
    expect(room.youOf(a.playerId)!.upgrades).not.toContain('pencil1');
    void clock;
  });
});

describe('stealing', () => {
  it('transfers capped amounts and enforces cooldown', () => {
    const { room, sent, broadcasts } = setup();
    const a = room.hello(undefined, 'Anna', undefined);
    const b = room.hello(undefined, 'Ben', undefined);
    room.click(b.playerId, 25); // victim has 25 BP
    room.steal(a.playerId, b.playerId);
    const msg = broadcasts.find((m) => m.t === 'steal') as Extract<ServerMsg, { t: 'steal' }>;
    expect(msg).toBeDefined();
    expect(msg.caught).toBe(false);
    expect(msg.amount).toBeCloseTo(25 * 0.08, 1);
    expect(room.youOf(a.playerId)!.bp).toBeCloseTo(2, 1);
    expect(room.youOf(b.playerId)!.bp).toBeCloseTo(23, 1);
    room.steal(a.playerId, b.playerId);
    const errs = (sent.get(a.playerId) ?? []).filter(
      (m) => m.t === 'error' && m.code === 'cooldown',
    );
    expect(errs.length).toBe(1);
  });

  it('catches thieves during patrol (detention, nothing stolen)', () => {
    const { room, broadcasts } = setup(() => 0.1); // rng below catch chance
    const a = room.hello(undefined, 'Anna', undefined);
    const b = room.hello(undefined, 'Ben', undefined);
    room.click(b.playerId, 25);
    room.forceEvent('patrol');
    room.steal(a.playerId, b.playerId);
    const msg = broadcasts.filter((m) => m.t === 'steal').pop() as Extract<
      ServerMsg,
      { t: 'steal' }
    >;
    expect(msg.caught).toBe(true);
    expect(room.youOf(b.playerId)!.bp).toBeCloseTo(25, 1);
    expect(room.youOf(a.playerId)!.detentionUntil).toBeGreaterThan(0);
  });

  it('refuses sleeping targets', () => {
    const { room, sent } = setup();
    const a = room.hello(undefined, 'Anna', undefined);
    const b = room.hello(undefined, 'Ben', undefined);
    room.disconnect(b.playerId);
    room.steal(a.playerId, b.playerId);
    const errs = (sent.get(a.playerId) ?? []).filter(
      (m) => m.t === 'error' && m.code === 'target',
    );
    expect(errs.length).toBe(1);
  });
});

describe('prestige', () => {
  it('grants stars, resets the run, keeps lifetime stats', () => {
    const { room } = setup();
    const a = room.hello(undefined, 'Anna', undefined);
    const p = (room as any).players.get(a.playerId);
    p.runBp = 5e9;
    p.lifetimeBp = 5e9;
    p.bp = 123;
    p.gens[3] = 7;
    room.prestige(a.playerId);
    const you = room.youOf(a.playerId)!;
    expect(you.stars).toBe(Math.floor(Math.pow(5, 0.6)));
    expect(you.grade).toBe(1);
    expect(you.bp).toBe(0);
    expect(you.gens.every((g: number) => g === 0)).toBe(true);
    expect(you.lifetimeBp).toBeGreaterThanOrEqual(5e9);
  });

  it('rejects prestige below threshold', () => {
    const { room, sent } = setup();
    const a = room.hello(undefined, 'Anna', undefined);
    room.prestige(a.playerId);
    expect(
      (sent.get(a.playerId) ?? []).some((m) => m.t === 'error' && m.code === 'prestige'),
    ).toBe(true);
  });
});

describe('class goal and events', () => {
  it('completes the goal, buffs everyone online, persists level', () => {
    const { room, db, broadcasts } = setup();
    const a = room.hello(undefined, 'Anna', undefined);
    (room as any).goalProgress = 49_999.5;
    room.click(a.playerId, 1);
    room.tick();
    const goalMsg = broadcasts.find(
      (m) => m.t === 'goal' && (m as { completed?: boolean }).completed,
    );
    expect(goalMsg).toBeDefined();
    expect(room.goal().level).toBe(1);
    const you = room.youOf(a.playerId)!;
    expect(you.buffs.some((b) => b.id === 'goal')).toBe(true);
    expect(you.bps).toBeCloseTo(you.baseBps * 3);
    expect(db.getMeta('goal_level')).toBe('1');
  });

  it('runs a quiz: correct answers win a buff and reward', () => {
    const { room, clock, broadcasts } = setup();
    const a = room.hello(undefined, 'Anna', undefined);
    room.forceEvent('quiz');
    const ev = broadcasts.filter((m) => m.t === 'event').pop() as Extract<
      ServerMsg,
      { t: 'event' }
    >;
    const q = ev.ev!.question!;
    const m = q.match(/(\d+) ([+−×]) (\d+)/)!;
    const x = Number(m[1]);
    const y = Number(m[3]);
    const answer = m[2] === '+' ? x + y : m[2] === '−' ? x - y : x * y;
    room.quizAnswer(a.playerId, answer);
    const you = room.youOf(a.playerId)!;
    expect(you.buffs.some((b) => b.id === 'quiz')).toBe(true);
    expect(you.bp).toBeGreaterThanOrEqual(500);
    clock.advance(21_000);
    room.tick();
    const result = broadcasts.find((msg) => msg.t === 'quizResult') as Extract<
      ServerMsg,
      { t: 'quizResult' }
    >;
    expect(result.winners).toEqual(['Anna']);
    expect(result.answer).toBe(answer);
  });

  it('substitute event buffs all online players', () => {
    const { room } = setup();
    const a = room.hello(undefined, 'Anna', undefined);
    const b = room.hello(undefined, 'Ben', undefined);
    room.forceEvent('sub');
    expect(room.youOf(a.playerId)!.buffs.some((x) => x.id === 'sub')).toBe(true);
    expect(room.youOf(b.playerId)!.buffs.some((x) => x.id === 'sub')).toBe(true);
  });
});

describe('persistence round-trip', () => {
  it('saves and restores full player state', () => {
    const { room, db, clock } = setup();
    const a = room.hello(undefined, 'Anna', undefined);
    room.click(a.playerId, 25);
    room.buy(a.playerId, 0, 1);
    room.flush();
    room.disconnect(a.playerId);
    clock.advance(6 * 60_000);
    room.tick();
    // New room instance over the same DB (server restart).
    const out2 = { send: () => {}, broadcast: () => {} };
    const room2 = new Room(db, out2, clock.now);
    const back = room2.hello(a.newToken, undefined, undefined);
    const you = room2.youOf(back.playerId)!;
    expect(you.name).toBe('Anna');
    expect(you.gens[0]).toBe(1);
    expect(you.clicks).toBe(25);
  });
});

describe('name sanitization', () => {
  it('strips dangerous characters, keeps umlauts', () => {
    expect(sanitizeName('  Müller<script> ')).toBe('Müllerscript');
    expect(sanitizeName('Ää Öö-Üü_ß.')).toBe('Ää Öö-Üü_ß.');
    expect(sanitizeName('x')).toBe(null);
    expect(sanitizeName(12 as unknown as string)).toBe(null);
    expect(sanitizeName('a'.repeat(40))!.length).toBe(16);
  });
});

describe('interaction', () => {
  it('broadcasts buy activity and top generators on roster', () => {
    const { room, broadcasts } = setup();
    const a = room.hello(undefined, 'Anna', undefined);
    room.click(a.playerId, 25);
    room.buy(a.playerId, 0, 1);
    const activities = broadcasts.filter((m) => m.t === 'activity');
    const buyAct = activities.find((m) => m.t === 'activity' && m.a.kind === 'buy');
    expect(buyAct?.t).toBe('activity');
    if (buyAct?.t === 'activity') {
      expect(buyAct.a.name).toBe('Anna');
    }
    const pub = room.roster().find((p) => p.id === a.playerId)!;
    expect(pub.topGens).toEqual([0]);
    expect(pub.pose).toBe('seated');
  });

  it('allows aisle walking and blocks stealing while away', () => {
    const { room, sent } = setup();
    const a = room.hello(undefined, 'Anna', undefined);
    const b = room.hello(undefined, 'Ben', undefined);
    for (let i = 0; i < 8; i++) room.move(a.playerId, 110, 120);
    const pub = room.roster().find((p) => p.id === a.playerId)!;
    expect(pub.pose).toBe('walking');
    expect(pub.pos).toBeDefined();
    expect(pub.pos!.x).toBeGreaterThanOrEqual(30);
    room.steal(a.playerId, b.playerId);
    expect(sent.get(a.playerId)?.some((m) => m.t === 'error' && m.code === 'walking')).toBe(true);
    room.returnToSeat(a.playerId);
    expect(room.roster().find((p) => p.id === a.playerId)!.pose).toBe('seated');
  });
});
