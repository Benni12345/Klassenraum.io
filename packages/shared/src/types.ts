import type { SchoolDay } from './school.js';

/** Avatar composition; indices into the client's sprite variant tables. */
export interface AvatarSpec {
  skin: number;
  hair: number;
  hairColor: number;
  shirt: number;
}

/** What everyone can see about a player at their desk. */
export interface PlayerPublic {
  id: string;
  name: string;
  avatar: AvatarSpec;
  seat: number;
  /** Number of graduations ("Versetzungen"); drives the grade badge. */
  grade: number;
  stars: number;
  /** 0 = bare desk, 1..9 = highest generator tier owned (drives desk clutter). */
  deskTier: number;
  /** Equipped desk skin id (wood, blue, …). */
  deskSkin: string;
  /** HS on hand (approximate; what a thief could target). */
  bp: number;
  bps: number;
  /** false = disconnected but still at the desk ("Zzz" grace period). */
  online: boolean;
  detention: boolean;
}

export interface Buff {
  id: string;
  /** i18n key for the buff label. */
  labelKey: string;
  mult: number;
  until: number;
}

/** Full private state for the owning player. */
export interface PlayerYou {
  id: string;
  name: string;
  avatar: AvatarSpec;
  seat: number;
  bp: number;
  /** Effective HS/s including stars, buffs and detention. */
  bps: number;
  baseBps: number;
  clickPower: number;
  gens: number[];
  upgrades: string[];
  clicks: number;
  stars: number;
  grade: number;
  runBp: number;
  lifetimeBp: number;
  starsIfGraduate: number;
  buffs: Buff[];
  detentionUntil: number;
  stealReadyAt: number;
  /** Server time when the next rewarded-ad income grant may be claimed. */
  adRewardReadyAt: number;
  /** Lifetime stats for flavor. */
  stolenTotal: number;
  lostTotal: number;
  /**
   * True when this save is bound to a CrazyGames account. The name then mirrors
   * the CrazyGames username and must not be editable in-game.
   */
  cgLinked: boolean;
  /** Guided tutorial completed or skipped (persisted on the game backend). */
  tutorialDone: boolean;
  /** Daily attendance, homework, and equipped desk skin. */
  school: SchoolDay;
}

export type EventKind = 'quiz' | 'patrol' | 'sub';

export interface RoomEvent {
  kind: EventKind;
  startedAt: number;
  endsAt: number;
  /** Quiz only: the question text (language-neutral arithmetic). */
  question?: string;
}

export interface GoalState {
  level: number;
  progress: number;
  target: number;
}

export interface ChatEntry {
  id: string;
  name: string;
  text: string;
  ts: number;
}

export interface LeaderboardRow {
  name: string;
  grade: number;
  stars: number;
  lifetimeBp: number;
  online: boolean;
}
