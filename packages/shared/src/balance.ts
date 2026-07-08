/**
 * All game balance lives here so server (authoritative) and client (display,
 * prediction) always agree. Pure data + pure functions, no I/O.
 */

export interface GeneratorDef {
  id: string;
  baseCost: number;
  baseBps: number;
}

export const COST_GROWTH = 1.15;

export const GENERATORS: readonly GeneratorDef[] = [
  { id: 'pencil', baseCost: 15, baseBps: 0.1 },
  { id: 'notes', baseCost: 100, baseBps: 1 },
  { id: 'calc', baseCost: 1_100, baseBps: 8 },
  { id: 'group', baseCost: 12_000, baseBps: 47 },
  { id: 'cheat', baseCost: 130_000, baseBps: 260 },
  { id: 'espresso', baseCost: 1.4e6, baseBps: 1_400 },
  { id: 'bot', baseCost: 2e7, baseBps: 7_800 },
  { id: 'timeturner', baseCost: 3.3e8, baseBps: 44_000 },
  { id: 'brain', baseCost: 5.1e9, baseBps: 260_000 },
];

export interface UpgradeDef {
  id: string;
  kind: 'gen' | 'click';
  /** Generator index for kind 'gen'. */
  gen: number;
  /** Owned-count (gen) or total-clicks (click) required to unlock. */
  threshold: number;
  cost: number;
  mult: number;
}

const GEN_UPGRADE_TIERS = [
  { at: 10, costMult: 30 },
  { at: 25, costMult: 300 },
  { at: 50, costMult: 3_000 },
  { at: 100, costMult: 30_000 },
];

const CLICK_UPGRADES = [
  { at: 100, cost: 500 },
  { at: 1_000, cost: 50_000 },
  { at: 10_000, cost: 5e6 },
];

export const UPGRADES: readonly UpgradeDef[] = [
  ...GENERATORS.flatMap((g, gi) =>
    GEN_UPGRADE_TIERS.map((t, ti) => ({
      id: `${g.id}${ti}`,
      kind: 'gen' as const,
      gen: gi,
      threshold: t.at,
      cost: g.baseCost * t.costMult,
      mult: 2,
    })),
  ),
  ...CLICK_UPGRADES.map((c, i) => ({
    id: `click${i}`,
    kind: 'click' as const,
    gen: -1,
    threshold: c.at,
    cost: c.cost,
    mult: 2,
  })),
];

export const UPGRADE_BY_ID: ReadonlyMap<string, UpgradeDef> = new Map(
  UPGRADES.map((u) => [u.id, u]),
);

// ---------------------------------------------------------------------------
// Cost math (geometric series, growth r per owned unit)

/** Cost of buying `qty` units of generator `gi` when already owning `owned`. */
export function genCost(gi: number, owned: number, qty = 1): number {
  const g = GENERATORS[gi];
  if (!g || qty <= 0) return 0;
  const r = COST_GROWTH;
  return (g.baseCost * Math.pow(r, owned) * (Math.pow(r, qty) - 1)) / (r - 1);
}

/** Max units of generator `gi` affordable with `bp`, already owning `owned`. */
export function maxAffordable(gi: number, owned: number, bp: number): number {
  const g = GENERATORS[gi];
  if (!g) return 0;
  const r = COST_GROWTH;
  const first = g.baseCost * Math.pow(r, owned);
  if (bp < first) return 0;
  let n = Math.floor(Math.log((bp * (r - 1)) / first + 1) / Math.log(r));
  // Guard against float error at the boundary.
  while (n > 0 && genCost(gi, owned, n) > bp) n--;
  return n;
}

/**
 * Resolve a buy request (`qty` of 1, 10 or -1 = max) into an exact,
 * affordable quantity + cost. Returns qty 0 if nothing is affordable.
 */
export function resolveBuy(
  gi: number,
  owned: number,
  bp: number,
  qty: number,
): { qty: number; cost: number } {
  let q = qty === -1 ? maxAffordable(gi, owned, bp) : Math.max(0, Math.floor(qty));
  let cost = genCost(gi, owned, q);
  while (q > 0 && cost > bp) {
    q--;
    cost = genCost(gi, owned, q);
  }
  return q > 0 ? { qty: q, cost } : { qty: 0, cost: 0 };
}

// ---------------------------------------------------------------------------
// Production

export interface EconomySnapshot {
  gens: number[];
  upgrades: string[];
  stars: number;
}

export function genMult(gi: number, upgrades: readonly string[]): number {
  let m = 1;
  for (const id of upgrades) {
    const u = UPGRADE_BY_ID.get(id);
    if (u && u.kind === 'gen' && u.gen === gi) m *= u.mult;
  }
  return m;
}

/** Production before stars/buffs/detention. */
export function baseBps(eco: EconomySnapshot): number {
  let sum = 0;
  for (let gi = 0; gi < GENERATORS.length; gi++) {
    const count = eco.gens[gi] ?? 0;
    if (count > 0) sum += count * GENERATORS[gi]!.baseBps * genMult(gi, eco.upgrades);
  }
  return sum;
}

export function starMult(stars: number): number {
  return 1 + stars * 0.1;
}

export function clickMult(upgrades: readonly string[]): number {
  let m = 1;
  for (const id of upgrades) {
    const u = UPGRADE_BY_ID.get(id);
    if (u && u.kind === 'click') m *= u.mult;
  }
  return m;
}

/** HS per click: flat base plus 5% of effective production. */
export function clickPower(effectiveBps: number, clickMultVal: number): number {
  return (1 + effectiveBps * 0.05) * clickMultVal;
}

/** Highest generator tier owned (0 = none, 1..9), drives desk visuals. */
export function deskTier(gens: readonly number[]): number {
  for (let gi = GENERATORS.length - 1; gi >= 0; gi--) {
    if ((gens[gi] ?? 0) > 0) return gi + 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Prestige ("Versetzung")

export const PRESTIGE_BASE = 1e9;

export function starsForRun(runBp: number): number {
  if (runBp < PRESTIGE_BASE) return 0;
  return Math.floor(Math.pow(runBp / PRESTIGE_BASE, 0.6));
}

// ---------------------------------------------------------------------------
// Stealing ("Papierflieger")

export const STEAL_COOLDOWN_MS = 5 * 60_000;
export const STEAL_VICTIM_PCT = 0.08;
export const PATROL_CATCH_CHANCE = 0.5;
export const DETENTION_MS = 90_000;
export const DETENTION_FACTOR = 0.25;

/** Cap relative to the attacker's own economy (anti farming in both directions). */
export function stealCap(attackerEffectiveBps: number): number {
  return attackerEffectiveBps * 600 + 250;
}

export function stealAmount(victimBp: number, attackerEffectiveBps: number): number {
  return Math.max(0, Math.min(victimBp * STEAL_VICTIM_PCT, stealCap(attackerEffectiveBps)));
}

// ---------------------------------------------------------------------------
// Offline progress

export const OFFLINE_CAP_MS = 8 * 3_600_000;

// ---------------------------------------------------------------------------
// Class goal ("Klassenziel")

export function goalTarget(level: number): number {
  return 50_000 * Math.pow(5, level);
}

export const GOAL_BUFF_MULT = 3;
export const GOAL_BUFF_MS = 300_000;

// ---------------------------------------------------------------------------
// Room events

export const EVENT_MIN_GAP_MS = 4 * 60_000;
export const EVENT_MAX_GAP_MS = 8 * 60_000;

export const QUIZ_MS = 20_000;
export const QUIZ_BUFF_MULT = 2;
export const QUIZ_BUFF_MS = 120_000;
/** Flat quiz reward: 5 minutes of production, at least 500 HS. */
export function quizReward(effectiveBps: number): number {
  return Math.max(500, effectiveBps * 300);
}

export const PATROL_MS = 45_000;

export const SUB_BUFF_MULT = 2;
export const SUB_BUFF_MS = 180_000;

// ---------------------------------------------------------------------------
// Misc rules

export const CLICKS_PER_SEC_MAX = 25;
export const SEAT_GRACE_MS = 5 * 60_000;
export const SEATS_PER_ROW = 6;
export const NAME_MIN = 2;
export const NAME_MAX = 16;
export const CHAT_MAX = 140;
export const EMOTE_COUNT = 8;
export const AVATAR_RANGES = { skin: 4, hair: 5, hairColor: 6, shirt: 8 } as const;
