import { describe, expect, it } from 'vitest';
import { PRESTIGE_BASE } from '../../shared/src/balance.js';
import type { ServerMsg } from '../../shared/src/protocol.js';
import type { CrazyGamesTokenPayload } from '../src/cgAuth.js';
import { Db } from '../src/db.js';
import { Room, guestName, isLegacyGuestName, sanitizeChosenName, sanitizeName, CgAuthError } from '../src/game.js';

/** Fake CrazyGames JWT: `cg:<userId>:<username>` (long enough to be parsed). */
async function fakeVerify(token: string): Promise<CrazyGamesTokenPayload> {
  const m = /^cg:([^:]+):([^:.]+)\.*$/.exec(token);
  if (!m) throw new Error('invalid token');
  return { userId: m[1]!, username: m[2]!, gameId: 'classroom' };
}

function cgToken(userId: string, username: string): string {
  return `cg:${userId}:${username}`.padEnd(24, '.');
}

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
  const room = new Room(db, out, clock.now, rng, undefined, fakeVerify);
  return { room, db, clock, sent, broadcasts };
}

describe('join and seats', () => {
  it('creates players with tokens and assigns dense seats', async () => {
    const { room } = setup();
    const a = await room.hello(undefined, 'Anna', undefined);
    const b = await room.hello(undefined, 'Ben', undefined);
    expect(a.newToken).toMatch(/^[a-f0-9]{48}$/);
    expect(room.youOf(a.playerId)!.seat).toBe(0);
    expect(room.youOf(b.playerId)!.seat).toBe(1);
    expect(room.roster().length).toBe(2);
  });

  it('frees seats after the grace period and reuses them', async () => {
    const { room, clock } = setup();
    const a = await room.hello(undefined, 'Anna', undefined);
    await room.hello(undefined, 'Ben', undefined);
    room.disconnect(a.playerId);
    room.tick();
    expect(room.roster().find((p) => p.id === a.playerId)!.online).toBe(false);
    clock.advance(5 * 60_000 + 1000);
    room.tick();
    expect(room.roster().find((p) => p.id === a.playerId)).toBeUndefined();
    const c = await room.hello(undefined, 'Cleo', undefined);
    expect(room.youOf(c.playerId)!.seat).toBe(0);
  });

  it('restores accounts by token, including offline gains', async () => {
    const { room, clock } = setup();
    const a = await room.hello(undefined, 'Anna', undefined);
    // Earn 25 BP by clicking, buy a pencil (0.1 BP/s).
    room.click(a.playerId, 40);
    room.buy(a.playerId, 0, 1);
    room.disconnect(a.playerId);
    clock.advance(6 * 60_000);
    room.tick(); // frees the seat, persists
    clock.advance(2 * 3_600_000);
    const back = await room.hello(a.newToken, undefined, undefined);
    expect(back.playerId).toBe(a.playerId);
    expect(back.offline).toBeDefined();
    expect(back.offline!.bp).toBeCloseTo(0.1 * 2 * 3600, 0);
    const you = room.youOf(a.playerId)!;
    expect(you.gens[0]).toBe(1);
  });
});

describe('economy', () => {
  it('clamps clicks to 25 per second', async () => {
    const { room, clock } = setup();
    const a = await room.hello(undefined, 'Anna', undefined);
    room.click(a.playerId, 40);
    expect(room.youOf(a.playerId)!.clicks).toBe(25);
    room.click(a.playerId, 10);
    expect(room.youOf(a.playerId)!.clicks).toBe(25);
    clock.advance(1100);
    room.click(a.playerId, 10);
    expect(room.youOf(a.playerId)!.clicks).toBe(35);
  });

  it('produces over time after buying generators', async () => {
    const { room, clock } = setup();
    const a = await room.hello(undefined, 'Anna', undefined);
    room.click(a.playerId, 25); // 25 BP
    room.buy(a.playerId, 0, 1); // -15 BP
    const before = room.youOf(a.playerId)!;
    expect(before.gens[0]).toBe(1);
    expect(before.baseBps).toBeCloseTo(0.1);
    clock.advance(60_000);
    const after = room.youOf(a.playerId)!;
    expect(after.bp).toBeCloseTo(before.bp + 6, 1);
  });

  it('rejects unaffordable buys with an error', async () => {
    const { room, sent } = setup();
    const a = await room.hello(undefined, 'Anna', undefined);
    room.buy(a.playerId, 8, 1); // galaxy brain on starter BP
    const errs = (sent.get(a.playerId) ?? []).filter((m) => m.t === 'error');
    expect(errs.length).toBe(1);
  });

  it('starts new players with enough BP and a free first Stubby Pencil', async () => {
    const { room } = setup();
    const a = await room.hello(undefined, 'Anna', undefined);
    expect(room.youOf(a.playerId)!.bp).toBe(15);
    expect(room.youOf(a.playerId)!.tutorialDone).toBe(false);
    // First pencil is free while the tutorial is incomplete.
    room.buy(a.playerId, 0, 1);
    expect(room.youOf(a.playerId)!.gens[0]).toBe(1);
    expect(room.youOf(a.playerId)!.bp).toBe(15);
  });

  it('gives the first Stubby Pencil free even at 0 BP during the tutorial', async () => {
    const { room } = setup();
    const a = await room.hello(undefined, 'Anna', undefined);
    (room as any).players.get(a.playerId).bp = 0;
    room.buy(a.playerId, 0, 1);
    expect(room.youOf(a.playerId)!.gens[0]).toBe(1);
    expect(room.youOf(a.playerId)!.bp).toBe(0);
  });

  it('charges normal pencil price after the tutorial is marked done', async () => {
    const { room, sent } = setup();
    const a = await room.hello(undefined, 'Anna', undefined);
    room.markTutorialDone(a.playerId);
    expect(room.youOf(a.playerId)!.tutorialDone).toBe(true);
    (room as any).players.get(a.playerId).bp = 0;
    room.buy(a.playerId, 0, 1);
    const errs = (sent.get(a.playerId) ?? []).filter((m) => m.t === 'error' && m.code === 'poor');
    expect(errs.length).toBe(1);
    expect(room.youOf(a.playerId)!.gens[0]).toBe(0);
  });

  it('tops up starter BP for returning tutorial players with an empty desk', async () => {
    const { room, clock } = setup();
    const a = await room.hello(undefined, 'Anna', undefined);
    (room as any).players.get(a.playerId).bp = 0;
    room.disconnect(a.playerId);
    clock.advance(6 * 60_000);
    room.tick();
    const back = await room.hello(a.newToken, undefined, undefined);
    expect(room.youOf(back.playerId)!.bp).toBe(15);
  });

  it('persists tutorialDone on the player save', async () => {
    const { room, clock } = setup();
    const a = await room.hello(undefined, 'Anna', undefined);
    room.markTutorialDone(a.playerId);
    room.disconnect(a.playerId);
    clock.advance(6 * 60_000);
    room.tick();
    const back = await room.hello(a.newToken, undefined, undefined);
    expect(room.youOf(back.playerId)!.tutorialDone).toBe(true);
  });

  it('flushes tutorialDone immediately so a quick reconnect still sees it', async () => {
    const { room } = setup();
    const a = await room.hello(undefined, 'Anna', undefined);
    room.markTutorialDone(a.playerId);
    // No disconnect/flush tick — simulate Skip then an instant new session.
    room.disconnect(a.playerId);
    const back = await room.hello(a.newToken, undefined, undefined);
    expect(room.youOf(back.playerId)!.tutorialDone).toBe(true);
  });

  it('applies client tutorialDone from hello onto a CrazyGames account', async () => {
    const { room, clock } = setup();
    // Fresh CG account, no guest — client reports tutorialDone (Data / prefs).
    const linked = await room.hello(
      undefined,
      undefined,
      undefined,
      cgToken('uData', 'Synced'),
      true,
    );
    expect(room.youOf(linked.playerId)!.tutorialDone).toBe(true);
    room.disconnect(linked.playerId);
    clock.advance(6 * 60_000);
    room.tick();

    // New browser with only the CG token still sees completion.
    const fresh = await room.hello(undefined, undefined, undefined, cgToken('uData', 'Synced'));
    expect(room.youOf(fresh.playerId)!.tutorialDone).toBe(true);
  });

  it('applies client tutorialDone when linking a guest that never got the WS mark', async () => {
    const { room, clock } = setup();
    const guest = await room.hello(undefined, undefined, undefined);
    expect(room.youOf(guest.playerId)!.tutorialDone).toBe(false);
    room.disconnect(guest.playerId);

    // Skip landed in local prefs only; hello carries the flag during CG login.
    const linked = await room.hello(
      guest.newToken,
      undefined,
      undefined,
      cgToken('uRace', 'Racer'),
      true,
    );
    expect(room.youOf(linked.playerId)!.tutorialDone).toBe(true);
    room.disconnect(linked.playerId);
    clock.advance(6 * 60_000);
    room.tick();

    const fresh = await room.hello(undefined, undefined, undefined, cgToken('uRace', 'Racer'));
    expect(room.youOf(fresh.playerId)!.tutorialDone).toBe(true);
  });

  it('remembers CrazyGames tutorialDone via durable cg_user meta across fresh rows', async () => {
    const { room, db, clock } = setup();
    const linked = await room.hello(undefined, undefined, undefined, cgToken('uMeta', 'Meta'));
    room.markTutorialDone(linked.playerId);
    expect(db.isCgTutorialDone('uMeta')).toBe(true);
    room.disconnect(linked.playerId);
    clock.advance(6 * 60_000);
    room.tick();

    // Simulate a player row that lost the column but still has the meta flag.
    const row = db.loadPlayerByCgUserId('uMeta');
    expect(row).not.toBeNull();
    row!.tutorialDone = false;
    db.savePlayer(row!);

    const back = await room.hello(undefined, undefined, undefined, cgToken('uMeta', 'Meta'));
    expect(room.youOf(back.playerId)!.tutorialDone).toBe(true);
  });

  it('applies upgrades only when threshold met and affordable', async () => {
    const { room, clock } = setup();
    const a = await room.hello(undefined, 'Anna', undefined);
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
  it('transfers capped amounts and enforces cooldown', async () => {
    const { room, sent, broadcasts } = setup();
    const a = await room.hello(undefined, 'Anna', undefined);
    const b = await room.hello(undefined, 'Ben', undefined);
    // Pin victim BP so steal math is independent of the starter grant.
    (room as any).players.get(b.playerId).bp = 25;
    room.steal(a.playerId, b.playerId);
    const msg = broadcasts.find((m) => m.t === 'steal') as Extract<ServerMsg, { t: 'steal' }>;
    expect(msg).toBeDefined();
    expect(msg.caught).toBe(false);
    expect(msg.amount).toBeCloseTo(25 * 0.08, 1);
    expect(room.youOf(a.playerId)!.bp).toBeCloseTo(15 + 2, 1);
    expect(room.youOf(b.playerId)!.bp).toBeCloseTo(23, 1);
    room.steal(a.playerId, b.playerId);
    const errs = (sent.get(a.playerId) ?? []).filter(
      (m) => m.t === 'error' && m.code === 'cooldown',
    );
    expect(errs.length).toBe(1);
  });

  it('catches thieves during patrol (detention, nothing stolen)', async () => {
    const { room, broadcasts } = setup(() => 0.1); // rng below catch chance
    const a = await room.hello(undefined, 'Anna', undefined);
    const b = await room.hello(undefined, 'Ben', undefined);
    (room as any).players.get(b.playerId).bp = 25;
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

  it('refuses sleeping targets', async () => {
    const { room, sent } = setup();
    const a = await room.hello(undefined, 'Anna', undefined);
    const b = await room.hello(undefined, 'Ben', undefined);
    room.disconnect(b.playerId);
    room.steal(a.playerId, b.playerId);
    const errs = (sent.get(a.playerId) ?? []).filter(
      (m) => m.t === 'error' && m.code === 'target',
    );
    expect(errs.length).toBe(1);
  });
});

describe('prestige', () => {
  it('grants stars, resets the run, keeps lifetime stats', async () => {
    const { room } = setup();
    const a = await room.hello(undefined, 'Anna', undefined);
    const p = (room as any).players.get(a.playerId);
    p.runBp = PRESTIGE_BASE * 5;
    p.lifetimeBp = PRESTIGE_BASE * 5;
    p.bp = 123;
    p.gens[3] = 7;
    room.prestige(a.playerId);
    const you = room.youOf(a.playerId)!;
    expect(you.stars).toBe(Math.floor(Math.pow(5, 0.6)));
    expect(you.grade).toBe(1);
    expect(you.bp).toBe(0);
    expect(you.gens.every((g: number) => g === 0)).toBe(true);
    expect(you.lifetimeBp).toBeGreaterThanOrEqual(PRESTIGE_BASE * 5);
  });

  it('rejects prestige below threshold', async () => {
    const { room, sent } = setup();
    const a = await room.hello(undefined, 'Anna', undefined);
    room.prestige(a.playerId);
    expect(
      (sent.get(a.playerId) ?? []).some((m) => m.t === 'error' && m.code === 'prestige'),
    ).toBe(true);
  });
});

describe('class goal and events', () => {
  it('completes the goal, buffs everyone online, persists level', async () => {
    const { room, db, broadcasts } = setup();
    const a = await room.hello(undefined, 'Anna', undefined);
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

  it('runs a quiz: correct answers win a buff and reward', async () => {
    const { room, clock, broadcasts } = setup();
    const a = await room.hello(undefined, 'Anna', undefined);
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

  it('substitute event buffs all online players', async () => {
    const { room } = setup();
    const a = await room.hello(undefined, 'Anna', undefined);
    const b = await room.hello(undefined, 'Ben', undefined);
    room.forceEvent('sub');
    expect(room.youOf(a.playerId)!.buffs.some((x) => x.id === 'sub')).toBe(true);
    expect(room.youOf(b.playerId)!.buffs.some((x) => x.id === 'sub')).toBe(true);
  });
});

describe('persistence round-trip', () => {
  it('saves and restores full player state', async () => {
    const { room, db, clock } = setup();
    const a = await room.hello(undefined, 'Anna', undefined);
    room.click(a.playerId, 25);
    room.buy(a.playerId, 0, 1);
    room.flush();
    room.disconnect(a.playerId);
    clock.advance(6 * 60_000);
    room.tick();
    // New room instance over the same DB (server restart).
    const out2 = { send: () => {}, broadcast: () => {} };
    const room2 = new Room(db, out2, clock.now);
    const back = await room2.hello(a.newToken, undefined, undefined);
    const you = room2.youOf(back.playerId)!;
    expect(you.name).toBe('Anna');
    expect(you.gens[0]).toBe(1);
    expect(you.clicks).toBe(25);
  });
});

describe('ad boost', () => {
  it('grants 10% of HS on hand instantly and enforces cooldown', async () => {
    const { room, clock } = setup();
    const a = await room.hello(undefined, 'Anna', undefined);
    // Seed some HS so the reward is meaningful.
    room.click(a.playerId, 20);
    const before = room.youOf(a.playerId)!.bp;
    room.adBoost(a.playerId);
    const you = room.youOf(a.playerId)!;
    expect(you.bp).toBeCloseTo(before * 1.1, 5);
    expect(you.buffs.some((b) => b.id === 'ad')).toBe(false);
    expect(you.adRewardReadyAt).toBe(clock.now() + 60_000);
    const mid = you.bp;
    room.adBoost(a.playerId); // should no-op while cooling down
    expect(room.youOf(a.playerId)!.bp).toBeCloseTo(mid, 5);
  });
});

describe('name sanitization', () => {
  it('strips dangerous characters, keeps umlauts', async () => {
    expect(sanitizeName('  Müller<script> ')).toBe('Müllerscript');
    expect(sanitizeName('Ää Öö-Üü_ß.')).toBe('Ää Öö-Üü_ß.');
    expect(sanitizeName('x')).toBe(null);
    expect(sanitizeName(12 as unknown as string)).toBe(null);
    expect(sanitizeName('a'.repeat(40))!.length).toBe(20);
  });

  it('rejects profane player-chosen names', () => {
    expect(sanitizeChosenName('xXfuckerXx')).toBe(null);
    expect(sanitizeChosenName('Sh1tLord')).toBe(null);
    expect(sanitizeChosenName('Anna')).toBe('Anna');
  });

  it('names guests with a random stylized suffix', () => {
    expect(guestName()).toMatch(/^Student_\d{4}$/);
  });

  it('detects legacy Schüler guest names', () => {
    expect(isLegacyGuestName('Schüler-IJGJ')).toBe(true);
    expect(isLegacyGuestName('Schueler_ab12')).toBe(true);
    expect(isLegacyGuestName('Student_0192')).toBe(false);
    expect(isLegacyGuestName('CoolPlayer')).toBe(false);
  });

  it('renames legacy Schüler guests to Student_#### on reconnect', async () => {
    const { room, clock } = setup();
    const guest = await room.hello(undefined, undefined, undefined);
    const p = (room as any).players.get(guest.playerId);
    p.name = 'Schüler-IJGJ';
    room.disconnect(guest.playerId);
    clock.advance(6 * 60_000);
    room.tick();

    const back = await room.hello(guest.newToken, undefined, undefined);
    expect(back.playerId).toBe(guest.playerId);
    expect(room.youOf(guest.playerId)!.name).toMatch(/^Student_\d{4}$/);
  });

  it('keeps the CrazyGames username and blocks in-game renames', async () => {
    const { room, sent } = setup();
    const a = await room.hello(undefined, undefined, undefined, cgToken('u1', 'CoolPlayer'));
    expect(room.youOf(a.playerId)!.name).toBe('CoolPlayer');
    expect(room.youOf(a.playerId)!.cgLinked).toBe(true);
    room.rename(a.playerId, 'SomethingElse');
    expect(room.youOf(a.playerId)!.name).toBe('CoolPlayer');
    expect(
      (sent.get(a.playerId) ?? []).some((m) => m.t === 'error' && m.code === 'nameLocked'),
    ).toBe(true);
  });
});

describe('CrazyGames account linking', () => {
  it('migrates a guest save into a brand-new account exactly once', async () => {
    const { room, clock } = setup();

    // 1. Guest in an incognito tab buys one Stubby Pencil.
    const guest = await room.hello(undefined, undefined, undefined);
    (room as any).players.get(guest.playerId).bp = 100;
    room.buy(guest.playerId, 0, 1);
    expect(room.youOf(guest.playerId)!.gens[0]).toBe(1);
    room.disconnect(guest.playerId);

    // 2. Logs into a fresh CrazyGames account — guest progress is copied over.
    const linked = await room.hello(guest.newToken, undefined, undefined, cgToken('u1', 'Player'));
    expect(linked.playerId).not.toBe(guest.playerId);
    expect(room.youOf(linked.playerId)!.gens[0]).toBe(1);
    (room as any).players.get(linked.playerId).bp = 1_000;
    room.buy(linked.playerId, 0, 1);
    expect(room.youOf(linked.playerId)!.gens[0]).toBe(2);
    room.disconnect(linked.playerId);
    clock.advance(6 * 60_000);
    room.tick();

    // 3. Logs out: the guest save is untouched and keeps playing separately.
    const out1 = await room.hello(guest.newToken, undefined, undefined);
    expect(out1.playerId).toBe(guest.playerId);
    expect(room.youOf(guest.playerId)!.gens[0]).toBe(1);
    (room as any).players.get(guest.playerId).bp = 1e6;
    room.buy(guest.playerId, 0, 1);
    room.buy(guest.playerId, 0, 1);
    expect(room.youOf(guest.playerId)!.gens[0]).toBe(3);
    room.disconnect(guest.playerId);
    clock.advance(6 * 60_000);
    room.tick();

    // 4. Logs back into the same account: no second migration.
    const back = await room.hello(guest.newToken, undefined, undefined, cgToken('u1', 'Player'));
    expect(back.playerId).toBe(linked.playerId);
    expect(room.youOf(back.playerId)!.gens[0]).toBe(2);
  });

  it('migrates guest tutorialDone onto a new CrazyGames account and keeps it without the guest token', async () => {
    const { room, clock } = setup();

    // QA flow: guest skips the tutorial, then logs into a fresh CG account.
    const guest = await room.hello(undefined, undefined, undefined);
    room.markTutorialDone(guest.playerId);
    expect(room.youOf(guest.playerId)!.tutorialDone).toBe(true);
    room.disconnect(guest.playerId);

    const linked = await room.hello(guest.newToken, undefined, undefined, cgToken('uTut', 'Skipper'));
    expect(linked.playerId).not.toBe(guest.playerId);
    expect(room.youOf(linked.playerId)!.tutorialDone).toBe(true);
    room.disconnect(linked.playerId);
    clock.advance(6 * 60_000);
    room.tick();

    // New incognito: no guest token, only the CrazyGames account.
    const freshBrowser = await room.hello(undefined, undefined, undefined, cgToken('uTut', 'Skipper'));
    expect(freshBrowser.playerId).toBe(linked.playerId);
    expect(room.youOf(freshBrowser.playerId)!.tutorialDone).toBe(true);
  });

  it('merges guest tutorialDone into an existing CrazyGames account', async () => {
    const { room, clock } = setup();

    // Account already exists (e.g. prior login) without tutorial completion.
    const linked = await room.hello(undefined, undefined, undefined, cgToken('uOld', 'Veteran'));
    expect(room.youOf(linked.playerId)!.tutorialDone).toBe(false);
    room.disconnect(linked.playerId);
    clock.advance(6 * 60_000);
    room.tick();

    // Later guest session skips the tutorial, then logs into that account.
    const guest = await room.hello(undefined, undefined, undefined);
    room.markTutorialDone(guest.playerId);
    room.disconnect(guest.playerId);

    const back = await room.hello(guest.newToken, undefined, undefined, cgToken('uOld', 'Veteran'));
    expect(back.playerId).toBe(linked.playerId);
    expect(room.youOf(back.playerId)!.tutorialDone).toBe(true);
    room.disconnect(back.playerId);

    // Persists for a brand-new browser that only has the CG token.
    const fresh = await room.hello(undefined, undefined, undefined, cgToken('uOld', 'Veteran'));
    expect(room.youOf(fresh.playerId)!.tutorialDone).toBe(true);
  });

  it('never copies an already-migrated guest save into another account', async () => {
    const { room, clock } = setup();
    const guest = await room.hello(undefined, undefined, undefined);
    (room as any).players.get(guest.playerId).bp = 100;
    room.buy(guest.playerId, 0, 1);
    room.disconnect(guest.playerId);

    await room.hello(guest.newToken, undefined, undefined, cgToken('u1', 'First'));
    clock.advance(6 * 60_000);
    room.tick();

    const second = await room.hello(guest.newToken, undefined, undefined, cgToken('u2', 'Second'));
    expect(room.youOf(second.playerId)!.gens[0]).toBe(0);
  });

  it('resumes an existing account and refreshes the username', async () => {
    const { room, clock } = setup();
    const first = await room.hello(undefined, undefined, undefined, cgToken('u9', 'OldName'));
    (room as any).players.get(first.playerId).bp = 100;
    room.buy(first.playerId, 0, 1);
    room.disconnect(first.playerId);
    clock.advance(6 * 60_000);
    room.tick();

    const again = await room.hello(undefined, undefined, undefined, cgToken('u9', 'NewName'));
    expect(again.playerId).toBe(first.playerId);
    expect(room.youOf(again.playerId)!.name).toBe('NewName');
    expect(room.youOf(again.playerId)!.gens[0]).toBe(1);
  });

  it('does not create a player when only a bad JWT is sent', async () => {
    const { room } = setup();
    await expect(
      room.hello(undefined, undefined, undefined, 'this-is-not-a-valid-cg-jwt-token'),
    ).rejects.toThrow(CgAuthError);
    expect(room.roster().length).toBe(0);
  });

  it('does not seat a guest save when CrazyGames token verification fails', async () => {
    const { room } = setup();
    const guest = await room.hello(undefined, 'Anna', undefined);
    expect(room.youOf(guest.playerId)!.bp).toBe(15);
    room.disconnect(guest.playerId);

    await expect(
      room.hello(guest.newToken, undefined, undefined, 'this-is-not-a-valid-cg-jwt-token'),
    ).rejects.toThrow(CgAuthError);

    // Original guest is still the only seated save — not replaced by a blank one.
    expect(room.roster().length).toBe(1);
    expect(room.youOf(guest.playerId)!.name).toBe('Anna');
    expect(room.youOf(guest.playerId)!.cgLinked).toBe(false);
  });

  it('does not create a blank player when a logged-in hello has a bad JWT', async () => {
    const { room, clock } = setup();
    const linked = await room.hello(undefined, undefined, undefined, cgToken('uKeep', 'Keeper'));
    (room as any).players.get(linked.playerId).bp = 100;
    room.buy(linked.playerId, 0, 1);
    room.disconnect(linked.playerId);
    clock.advance(6 * 60_000);
    room.tick();
    expect(room.roster().length).toBe(0);

    await expect(
      room.hello(undefined, undefined, undefined, 'this-is-not-a-valid-cg-jwt-token'),
    ).rejects.toThrow(CgAuthError);
    expect(room.roster().length).toBe(0);

    const back = await room.hello(undefined, undefined, undefined, cgToken('uKeep', 'Keeper'));
    expect(back.playerId).toBe(linked.playerId);
    expect(room.youOf(back.playerId)!.gens[0]).toBe(1);
  });
});

describe('chat moderation', () => {
  it('masks profanity in passed notes', async () => {
    const { room, broadcasts } = setup();
    const a = await room.hello(undefined, 'Anna', undefined);
    room.chatMessage(a.playerId, 'you are a fucking idiot');
    const msg = broadcasts.filter((m) => m.t === 'chat').pop() as Extract<
      ServerMsg,
      { t: 'chat' }
    >;
    expect(msg.msg.text.toLowerCase()).not.toContain('fucking');
    expect(msg.msg.text).toContain('*');
  });
});
