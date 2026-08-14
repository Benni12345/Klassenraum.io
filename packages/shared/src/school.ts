/**
 * Daily school loop: attendance streaks, homework, and desk skins.
 * Pure data + functions so server (authoritative) and client (display) agree.
 */

export function utcDay(ms: number): number {
  return Math.floor(ms / 86_400_000);
}

export function msUntilNextUtcDay(now: number): number {
  return (utcDay(now) + 1) * 86_400_000 - now;
}

// ---------------------------------------------------------------------------
// Attendance ("Anwesenheit")

/** Seconds of production granted as the daily claim (before streak bonus). */
export const ATTENDANCE_BASE_SEC = 90;
export const ATTENDANCE_MIN = 400;
/** +20 % per extra consecutive day, capped so day 14+ is ×3.6. */
export const STREAK_BONUS_PER_DAY = 0.2;
export const STREAK_BONUS_CAP = 13;
/** Every 7th consecutive day grants a short production buff. */
export const ATTENDANCE_STREAK_BUFF_EVERY = 7;
export const ATTENDANCE_BUFF_MULT = 1.5;
export const ATTENDANCE_BUFF_MS = 10 * 60_000;

/** True on 7, 14, 21… — the only attendance moments that should fire CrazyGames happytime. */
export function isAttendanceMilestone(streak: number): boolean {
  return Number.isFinite(streak) && streak > 0 && streak % ATTENDANCE_STREAK_BUFF_EVERY === 0;
}

export function streakMultiplier(streak: number): number {
  const extra = Math.max(0, Math.min(STREAK_BONUS_CAP, Math.floor(streak) - 1));
  return 1 + extra * STREAK_BONUS_PER_DAY;
}

export function attendanceReward(effectiveBps: number, streak: number): number {
  const bps = Number.isFinite(effectiveBps) && effectiveBps > 0 ? effectiveBps : 0;
  return Math.max(ATTENDANCE_MIN, bps * ATTENDANCE_BASE_SEC) * streakMultiplier(streak);
}

/**
 * Streak after claiming today, given the last successful claim day.
 * A gap of more than one UTC day resets to 1.
 */
export function nextStreak(lastClaimDay: number, today: number, prevStreak: number): number {
  if (lastClaimDay === today) return Math.max(1, prevStreak);
  if (lastClaimDay > 0 && lastClaimDay === today - 1) return Math.max(1, prevStreak) + 1;
  return 1;
}

/** Missed exactly one UTC day with an existing streak — recoverable via rewarded ad. */
export function canRecoverStreak(lastClaimDay: number, today: number, prevStreak: number): boolean {
  return prevStreak > 0 && lastClaimDay > 0 && lastClaimDay === today - 2;
}

// ---------------------------------------------------------------------------
// Homework ("Hausaufgaben")

export type HomeworkKind = 'notes' | 'shop' | 'steal' | 'quiz';
export type HomeworkClaimId = HomeworkKind | 'bonus';

export interface HomeworkDef {
  id: HomeworkKind;
  target: number;
}

export const HOMEWORK_DEFS: Record<HomeworkKind, HomeworkDef> = {
  notes: { id: 'notes', target: 40 },
  shop: { id: 'shop', target: 1 },
  steal: { id: 'steal', target: 1 },
  quiz: { id: 'quiz', target: 1 },
};

export const HOMEWORK_KINDS: readonly HomeworkKind[] = ['notes', 'shop', 'steal', 'quiz'];

export interface HomeworkProgress {
  notes: number;
  shop: number;
  steal: number;
  quiz: number;
  claimed: string[];
  bonusClaimed: boolean;
}

export function emptyHomework(): HomeworkProgress {
  return { notes: 0, shop: 0, steal: 0, quiz: 0, claimed: [], bonusClaimed: false };
}

export function parseHomework(raw: unknown): HomeworkProgress {
  let src: unknown = raw;
  if (typeof raw === 'string') {
    try {
      src = JSON.parse(raw) as unknown;
    } catch {
      return emptyHomework();
    }
  }
  if (!src || typeof src !== 'object') return emptyHomework();
  const o = src as Record<string, unknown>;
  const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };
  const claimed = Array.isArray(o.claimed)
    ? o.claimed.filter((x): x is string => typeof x === 'string')
    : [];
  return {
    notes: num(o.notes),
    shop: num(o.shop),
    steal: num(o.steal),
    quiz: num(o.quiz),
    claimed,
    bonusClaimed: o.bonusClaimed === true,
  };
}

/** Always notes + shop; third task rotates so every day is completable-ish. */
export function pickHomework(playerId: string, day: number): HomeworkKind[] {
  const third: HomeworkKind = hash32(`${playerId}:${day}`) % 2 === 0 ? 'steal' : 'quiz';
  return ['notes', 'shop', third];
}

export function homeworkReward(effectiveBps: number): number {
  const bps = Number.isFinite(effectiveBps) && effectiveBps > 0 ? effectiveBps : 0;
  return Math.max(250, bps * 60);
}

export function homeworkBonus(effectiveBps: number): number {
  const bps = Number.isFinite(effectiveBps) && effectiveBps > 0 ? effectiveBps : 0;
  return Math.max(800, bps * 180);
}

export function bumpHomework(
  hw: HomeworkProgress,
  kind: HomeworkKind,
  n = 1,
): { hw: HomeworkProgress; completed: boolean } {
  const def = HOMEWORK_DEFS[kind];
  const before = hw[kind];
  const next = Math.min(def.target, before + Math.max(0, Math.floor(n)));
  if (next === before) return { hw, completed: false };
  return { hw: { ...hw, [kind]: next }, completed: before < def.target && next >= def.target };
}

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Desk skins

export type DeskSkinUnlock =
  | { kind: 'default' }
  | { kind: 'streak'; n: number }
  | { kind: 'stars'; n: number }
  | { kind: 'grade'; n: number };

export interface DeskSkinDef {
  id: string;
  unlock: DeskSkinUnlock;
}

export const DESK_SKINS: readonly DeskSkinDef[] = [
  { id: 'wood', unlock: { kind: 'default' } },
  { id: 'blue', unlock: { kind: 'streak', n: 3 } },
  { id: 'green', unlock: { kind: 'streak', n: 7 } },
  { id: 'gold', unlock: { kind: 'streak', n: 14 } },
  { id: 'galaxy', unlock: { kind: 'streak', n: 30 } },
  { id: 'star', unlock: { kind: 'stars', n: 5 } },
  { id: 'chalkboard', unlock: { kind: 'grade', n: 5 } },
];

export const DESK_SKIN_IDS: readonly string[] = DESK_SKINS.map((s) => s.id);
export const DEFAULT_DESK_SKIN = 'wood';

export function unlockedSkins(bestStreak: number, stars: number, grade: number): string[] {
  const ids: string[] = [];
  for (const s of DESK_SKINS) {
    const u = s.unlock;
    if (u.kind === 'default') ids.push(s.id);
    else if (u.kind === 'streak' && bestStreak >= u.n) ids.push(s.id);
    else if (u.kind === 'stars' && stars >= u.n) ids.push(s.id);
    else if (u.kind === 'grade' && grade >= u.n) ids.push(s.id);
  }
  return ids;
}

export function sanitizeDeskSkin(id: unknown, unlocked: readonly string[]): string {
  return typeof id === 'string' && unlocked.includes(id) ? id : DEFAULT_DESK_SKIN;
}

export interface DeskPalette {
  light: string;
  mid: string;
  dark: string;
}

export const DESK_PALETTES: Record<string, DeskPalette> = {
  wood: { light: '#d4a86a', mid: '#c4894a', dark: '#8a5a28' },
  blue: { light: '#7eb3d4', mid: '#4a7eab', dark: '#2f5478' },
  green: { light: '#8fbf7a', mid: '#4f8a45', dark: '#2f5d32' },
  gold: { light: '#f0d878', mid: '#d4a63a', dark: '#8a6a1e' },
  galaxy: { light: '#c89ae8', mid: '#6b3fa0', dark: '#3a1f66' },
  star: { light: '#ffe9a0', mid: '#e8b23a', dark: '#8a5a12' },
  chalkboard: { light: '#5d8a72', mid: '#2f5d46', dark: '#1e3d2e' },
};

// ---------------------------------------------------------------------------
// Snapshot sent to the owning client

export interface SchoolProgress {
  streak: number;
  bestStreak: number;
  lastClaimDay: number;
  doubledDay: number;
  hwDay: number;
  hw: HomeworkProgress;
  deskSkin: string;
}

export interface HomeworkTaskView {
  id: HomeworkKind;
  target: number;
  progress: number;
  claimed: boolean;
  ready: boolean;
  reward: number;
}

export interface SchoolDay {
  /** Live streak (0 if broken and not recoverable). */
  streak: number;
  /** Streak after claiming today without a late slip. */
  upcomingStreak: number;
  /** Streak after a late-slip recover + today's claim. */
  recoverStreak: number;
  bestStreak: number;
  claimed: boolean;
  /** UTC day number of the last successful claim (0 = never). */
  claimDay: number;
  recoverable: boolean;
  doubled: boolean;
  /** HS granted if they claim now (reset or continue, without recover). */
  reward: number;
  /** HS granted if they recover a broken streak, then claim. */
  recoverReward: number;
  doubleReward: number;
  nextDayInMs: number;
  homework: HomeworkTaskView[];
  bonusClaimed: boolean;
  bonusReady: boolean;
  bonusReward: number;
  deskSkin: string;
  unlockedSkins: string[];
}

export function defaultSchoolProgress(): SchoolProgress {
  return {
    streak: 0,
    bestStreak: 0,
    lastClaimDay: 0,
    doubledDay: 0,
    hwDay: 0,
    hw: emptyHomework(),
    deskSkin: DEFAULT_DESK_SKIN,
  };
}

export function buildSchoolDay(
  playerId: string,
  progress: SchoolProgress,
  now: number,
  effectiveBps: number,
  stars: number,
  grade: number,
): SchoolDay {
  const today = utcDay(now);
  const claimed = progress.lastClaimDay === today;
  const recoverable = !claimed && canRecoverStreak(progress.lastClaimDay, today, progress.streak);
  const upcoming = claimed
    ? Math.max(1, progress.streak)
    : nextStreak(progress.lastClaimDay, today, progress.streak);
  const recovered = recoverable ? progress.streak + 1 : upcoming;
  const liveStreak =
    claimed || progress.lastClaimDay === today - 1 || recoverable
      ? Math.max(0, progress.streak)
      : 0;
  const reward = attendanceReward(effectiveBps, upcoming);
  const recoverReward = attendanceReward(effectiveBps, recovered);
  const hw = progress.hwDay === today ? progress.hw : emptyHomework();
  const kinds = pickHomework(playerId, today);
  const taskReward = homeworkReward(effectiveBps);
  const homework: HomeworkTaskView[] = kinds.map((id) => {
    const target = HOMEWORK_DEFS[id].target;
    const progressN = Math.min(target, hw[id]);
    const already = hw.claimed.includes(id);
    return {
      id,
      target,
      progress: progressN,
      claimed: already,
      ready: !already && progressN >= target,
      reward: taskReward,
    };
  });
  const allTurnedIn = homework.every((t) => t.claimed);
  const unlocked = unlockedSkins(progress.bestStreak, stars, grade);
  return {
    streak: liveStreak,
    upcomingStreak: upcoming,
    recoverStreak: recovered,
    bestStreak: progress.bestStreak,
    claimed,
    claimDay: progress.lastClaimDay,
    recoverable,
    doubled: progress.doubledDay === today,
    reward,
    recoverReward,
    doubleReward: reward,
    nextDayInMs: msUntilNextUtcDay(now),
    homework,
    bonusClaimed: hw.bonusClaimed,
    bonusReady: allTurnedIn && !hw.bonusClaimed,
    bonusReward: homeworkBonus(effectiveBps),
    deskSkin: sanitizeDeskSkin(progress.deskSkin, unlocked),
    unlockedSkins: unlocked,
  };
}
