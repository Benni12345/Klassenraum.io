import { describe, expect, it } from 'vitest';
import {
  baseBps,
  clickMult,
  clickPower,
  COST_GROWTH,
  deskTier,
  GENERATORS,
  genCost,
  genMult,
  goalTarget,
  maxAffordable,
  resolveBuy,
  starMult,
  starsForRun,
  stealAmount,
  stealCap,
  UPGRADES,
} from '../src/balance.js';

describe('generator costs', () => {
  it('matches a naive loop sum for bulk buys', () => {
    for (const [gi, owned, qty] of [
      [0, 0, 1],
      [0, 7, 10],
      [3, 25, 13],
      [8, 100, 50],
    ] as const) {
      let sum = 0;
      for (let k = 0; k < qty; k++) {
        sum += GENERATORS[gi]!.baseCost * Math.pow(COST_GROWTH, owned + k);
      }
      const got = genCost(gi, owned, qty);
      expect(Math.abs(got - sum) / sum).toBeLessThan(1e-9);
    }
  });

  it('maxAffordable never exceeds the budget', () => {
    for (let owned = 0; owned < 60; owned += 7) {
      for (const budget of [0, 14, 15, 999, 1e6, 1e12]) {
        const n = maxAffordable(0, owned, budget);
        expect(genCost(0, owned, n)).toBeLessThanOrEqual(budget);
        // One more would be too expensive:
        expect(genCost(0, owned, n + 1)).toBeGreaterThan(budget);
      }
    }
  });

  it('resolveBuy clamps to affordable quantities', () => {
    expect(resolveBuy(0, 0, 14, 1)).toEqual({ qty: 0, cost: 0 });
    expect(resolveBuy(0, 0, 15, 1)).toEqual({ qty: 1, cost: 15 });
    const r = resolveBuy(0, 0, 1000, -1);
    expect(r.qty).toBeGreaterThan(1);
    expect(r.cost).toBeLessThanOrEqual(1000);
    const partial = resolveBuy(0, 0, 40, 10); // wants 10, can afford 2 (15 + 17.25)
    expect(partial.qty).toBe(2);
    expect(partial.cost).toBeLessThanOrEqual(40);
  });
});

describe('production', () => {
  it('applies generator upgrades multiplicatively', () => {
    const eco = { gens: [10, 0, 0, 0, 0, 0, 0, 0, 0], upgrades: [] as string[], stars: 0 };
    expect(baseBps(eco)).toBeCloseTo(1); // 10 pencils * 0.1
    eco.upgrades.push('pencil0');
    expect(baseBps(eco)).toBeCloseTo(2);
    eco.upgrades.push('pencil1');
    expect(baseBps(eco)).toBeCloseTo(4);
    expect(genMult(0, eco.upgrades)).toBe(4);
    expect(genMult(1, eco.upgrades)).toBe(1);
  });

  it('star and click multipliers', () => {
    expect(starMult(0)).toBe(1);
    expect(starMult(10)).toBeCloseTo(2);
    expect(clickMult(['click0', 'click1'])).toBe(4);
    expect(clickPower(0, 1)).toBe(1);
    expect(clickPower(100, 2)).toBeCloseTo((1 + 5) * 2);
  });

  it('deskTier reflects highest owned generator', () => {
    expect(deskTier([0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(0);
    expect(deskTier([5, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(1);
    expect(deskTier([5, 0, 2, 0, 0, 0, 0, 0, 1])).toBe(9);
  });

  it('upgrade table is well-formed', () => {
    expect(UPGRADES.length).toBe(GENERATORS.length * 4 + 3);
    const ids = new Set(UPGRADES.map((u) => u.id));
    expect(ids.size).toBe(UPGRADES.length);
  });
});

describe('prestige', () => {
  it('needs 1e9 run HS for the first star', () => {
    expect(starsForRun(1e9 - 1)).toBe(0);
    expect(starsForRun(1e9)).toBe(1);
    expect(starsForRun(1e12)).toBe(Math.floor(Math.pow(1000, 0.6)));
  });
});

describe('stealing', () => {
  it('takes 8% of victim, capped by attacker economy', () => {
    // Rich victim, poor attacker: capped by attacker.
    expect(stealAmount(1e9, 0)).toBe(250);
    expect(stealAmount(1e9, 10)).toBe(10 * 600 + 250);
    // Poor victim, rich attacker: 8% of victim.
    expect(stealAmount(1000, 1e6)).toBeCloseTo(80);
    expect(stealAmount(0, 1e6)).toBe(0);
    expect(stealCap(0)).toBe(250);
  });
});

describe('class goal', () => {
  it('targets scale 5x per level', () => {
    expect(goalTarget(0)).toBe(50_000);
    expect(goalTarget(2)).toBe(50_000 * 25);
  });
});
