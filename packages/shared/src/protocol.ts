import type {
  AvatarSpec,
  ChatEntry,
  GoalState,
  LeaderboardRow,
  PlayerPublic,
  PlayerYou,
  RoomEvent,
} from './types.js';

// ---------------------------------------------------------------------------
// Client -> Server

export type ClientMsg =
  | {
      t: 'hello';
      token?: string;
      name?: string;
      avatar?: AvatarSpec;
      /** CrazyGames JWT — verified server-side for account linking. */
      cgToken?: string;
      /**
       * Client cache of tutorial completion (local prefs / CrazyGames Data).
       * One-way: server may set tutorialDone true from this, never clear it.
       */
      tutorialDone?: boolean;
    }
  | { t: 'click'; n: number }
  | { t: 'buy'; gen: number; qty: number } // qty: 1 | 10 | -1 (max)
  | { t: 'upgrade'; id: string }
  | { t: 'steal'; target: string }
  | { t: 'spitball'; target: string }
  | { t: 'ink'; target: string }
  | { t: 'busy' }
  | { t: 'chat'; text: string }
  | { t: 'emote'; e: number }
  | { t: 'quiz'; answer: number }
  | { t: 'prestige' }
  | { t: 'leaderboard' }
  | { t: 'rename'; name: string; avatar?: AvatarSpec }
  | { t: 'ping'; ts: number }
  | { t: 'adBoost' }
  /** Persist guided-tutorial completion on the player's save. */
  | { t: 'tutorialDone' }
  /** Grant the welcome-back double of last offline earnings (after a rewarded ad). */
  | { t: 'doubleOffline' }
  /** Claim today's attendance. `recover` keeps a 1-day-missed streak (after an ad). */
  | { t: 'claimAttendance'; recover?: boolean }
  /** Double today's attendance payout (after a rewarded ad). */
  | { t: 'doubleAttendance' }
  /** Turn in a completed homework task, or `bonus` after all three. */
  | { t: 'claimHomework'; id: string }
  /** Equip an unlocked desk skin. */
  | { t: 'equipSkin'; id: string };

// ---------------------------------------------------------------------------
// Server -> Client

/** Compact per-player tick tuple: [id, bp, bps, deskTier, flags] */
export type TickTuple = [string, number, number, number, number];

/** Tick flags: detention, looking-busy shield, ink blot. */
export const TICK_DETENTION = 1;
export const TICK_BUSY = 2;
export const TICK_INK = 4;

export type PvpKind = 'plane' | 'spitball' | 'ink';

export type ServerMsg =
  | {
      t: 'welcome';
      you: PlayerYou;
      /** Only present when a new account was created; client must persist it. */
      token?: string;
      roster: PlayerPublic[];
      event: RoomEvent | null;
      goal: GoalState;
      chat: ChatEntry[];
      now: number;
      offline?: { ms: number; bp: number };
    }
  | { t: 'you'; you: PlayerYou }
  | { t: 'join'; p: PlayerPublic }
  | { t: 'sleep'; id: string }
  | { t: 'leave'; id: string }
  | { t: 'roster'; p: PlayerPublic }
  | { t: 'tick'; ps: TickTuple[]; goal: GoalState; now: number }
  | {
      t: 'steal';
      attacker: string;
      victim: string;
      amount: number;
      caught: boolean;
      kind: PvpKind;
      /** True when looking-busy blocked an airplane or ink blot. */
      blocked?: boolean;
    }
  | { t: 'busy'; id: string; until: number }
  | { t: 'chat'; msg: ChatEntry }
  | { t: 'emote'; id: string; e: number }
  | { t: 'event'; ev: RoomEvent | null }
  | { t: 'quizResult'; answer: number; winners: string[]; correctYou?: boolean }
  | { t: 'goal'; goal: GoalState; completed?: boolean }
  | { t: 'leaderboard'; rows: LeaderboardRow[] }
  | { t: 'error'; code: string }
  | { t: 'pong'; ts: number; now: number };

export function encode(msg: ClientMsg | ServerMsg): string {
  return JSON.stringify(msg);
}
