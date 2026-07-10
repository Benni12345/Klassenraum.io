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
  | { t: 'hello'; token?: string; name?: string; avatar?: AvatarSpec }
  | { t: 'click'; n: number }
  | { t: 'buy'; gen: number; qty: number } // qty: 1 | 10 | -1 (max)
  | { t: 'upgrade'; id: string }
  | { t: 'steal'; target: string }
  | { t: 'chat'; text: string }
  | { t: 'emote'; e: number }
  | { t: 'quiz'; answer: number }
  | { t: 'prestige' }
  | { t: 'leaderboard' }
  | { t: 'rename'; name: string; avatar?: AvatarSpec }
  | { t: 'ping'; ts: number }
  | { t: 'adBoost' };

// ---------------------------------------------------------------------------
// Server -> Client

/** Compact per-player tick tuple: [id, bp, bps, deskTier, detention(0|1)] */
export type TickTuple = [string, number, number, number, 0 | 1];

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
  | { t: 'steal'; attacker: string; victim: string; amount: number; caught: boolean }
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
