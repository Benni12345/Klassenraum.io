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
  PRESTIGE_BASE,
  quoteBuy,
  resolveBuy,
  resolveTutorialBuy,
  starMult,
  starsForRun,
  stealAmount,
  stealCap,
  spitAmount,
  spitCap,
  pvpActionReadyAt,
  RECESS_CD_MS,
  STEAL_COOLDOWN_MS,
  UPGRADES,
  adRewardAmount,
  AD_REWARD_COOLDOWN_MS,
  AD_REWARD_INCOME_FRAC,
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

  it('resolveTutorialBuy gives the first Stubby Pencil free', () => {
    expect(resolveTutorialBuy(0, 0, 0, 1, false)).toEqual({ qty: 1, cost: 0 });
    expect(resolveTutorialBuy(0, 0, 0, 10, false)).toEqual({ qty: 1, cost: 0 });
    // After owning one (or tutorial done) normal pricing applies.
    expect(resolveTutorialBuy(0, 1, 0, 1, false)).toEqual({ qty: 0, cost: 0 });
    expect(resolveTutorialBuy(0, 0, 0, 1, true)).toEqual({ qty: 0, cost: 0 });
    expect(resolveTutorialBuy(0, 0, 15, 1, true)).toEqual({ qty: 1, cost: 15 });
  });

  it('quoteBuy shows real prices when unaffordable (never a bogus 0)', () => {
    // Sticky Notes base 100, Calculator base 1100 — player has only 12 BP.
    expect(quoteBuy(1, 0, 12, 1, true)).toEqual({
      qty: 1,
      cost: 100,
      free: false,
      affordable: false,
    });
    expect(quoteBuy(2, 0, 12, 1, true)).toEqual({
      qty: 1,
      cost: 1_100,
      free: false,
      affordable: false,
    });
    // Stubby Pencil still shows 15 when tutorial is done and BP is short.
    expect(quoteBuy(0, 0, 12, 1, true)).toEqual({
      qty: 1,
      cost: 15,
      free: false,
      affordable: false,
    });
    // Free first pencil during the tutorial.
    expect(quoteBuy(0, 0, 12, 1, false)).toEqual({
      qty: 1,
      cost: 0,
      free: true,
      affordable: true,
    });
    // Max with empty pockets still quotes the 1× price.
    expect(quoteBuy(1, 0, 0, -1, true)).toEqual({
      qty: 1,
      cost: 100,
      free: false,
      affordable: false,
    });
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
  it('needs PRESTIGE_BASE run HS for the first star', () => {
    expect(starsForRun(PRESTIGE_BASE - 1)).toBe(0);
    expect(starsForRun(PRESTIGE_BASE)).toBe(1);
    expect(starsForRun(PRESTIGE_BASE * 1000)).toBe(Math.floor(Math.pow(1000, 0.6)));
  });

  it('is reachable inside one session', () => {
    expect(PRESTIGE_BASE).toBeLessThanOrEqual(1e6);
  });
});

describe('stealing', () => {
  it('takes 5% of victim, capped by attacker economy', () => {
    // Rich victim, poor attacker: capped by attacker.
    expect(stealAmount(1e9, 0)).toBe(80);
    expect(stealAmount(1e9, 10)).toBe(10 * 90 + 80);
    // Poor victim, rich attacker: 5% of victim.
    expect(stealAmount(1000, 1e6)).toBeCloseTo(50);
    expect(stealAmount(0, 1e6)).toBe(0);
    expect(stealCap(0)).toBe(80);
  });

  it('spitballs take 2% with a smaller cap', () => {
    expect(spitAmount(1e9, 0)).toBe(15);
    expect(spitAmount(1e9, 10)).toBe(10 * 20 + 15);
    expect(spitAmount(1000, 1e6)).toBeCloseTo(20);
    expect(spitCap(0)).toBe(15);
  });

  it('clamps PvP cooldowns during recess', () => {
    const lastAt = 1_000_000;
    const readyAt = lastAt + STEAL_COOLDOWN_MS;
    expect(pvpActionReadyAt(readyAt, STEAL_COOLDOWN_MS, null)).toBe(readyAt);
    expect(pvpActionReadyAt(readyAt, STEAL_COOLDOWN_MS, 'quiz')).toBe(readyAt);
    expect(pvpActionReadyAt(readyAt, STEAL_COOLDOWN_MS, 'recess')).toBe(lastAt + RECESS_CD_MS);
  });
});

describe('class goal', () => {
  it('targets scale 5x per level', () => {
    expect(goalTarget(0)).toBe(50_000);
    expect(goalTarget(2)).toBe(50_000 * 25);
  });
});

describe('ad reward', () => {
  it('grants 10% of HS on hand', () => {
    expect(AD_REWARD_INCOME_FRAC).toBe(0.1);
    expect(AD_REWARD_COOLDOWN_MS).toBe(60_000);
    expect(adRewardAmount(1_000)).toBe(100);
    expect(adRewardAmount(0)).toBe(0);
    expect(adRewardAmount(-5)).toBe(0);
  });
});
