import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_DESK_SKIN, parseHomework, type HomeworkProgress } from '@shared/school.js';
import type { AvatarSpec } from '@shared/types.js';

export interface PlayerRow {
  id: string;
  name: string;
  avatar: AvatarSpec;
  bp: number;
  runBp: number;
  lifetimeBp: number;
  clicks: number;
  gens: number[];
  upgrades: string[];
  stars: number;
  grade: number;
  stolenTotal: number;
  lostTotal: number;
  lastStealAt: number;
  lastAdRewardAt: number;
  cgUserId: string | null;
  /**
   * Timestamp at which this guest save was copied into a CrazyGames account.
   * Non-zero means "already migrated" — it must never be copied again, even if
   * the player logs out, keeps playing, and logs back in.
   */
  cgMigratedAt: number;
  /** Guided tutorial completed or skipped. */
  tutorialDone: boolean;
  streak: number;
  bestStreak: number;
  lastClaimDay: number;
  attendanceDoubledDay: number;
  hwDay: number;
  hw: HomeworkProgress;
  deskSkin: string;
  createdAt: number;
  lastSeen: number;
}

export interface LeaderboardDbRow {
  id: string;
  name: string;
  grade: number;
  stars: number;
  lifetimeBp: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL,
  bp REAL NOT NULL DEFAULT 0,
  run_bp REAL NOT NULL DEFAULT 0,
  lifetime_bp REAL NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  gens TEXT NOT NULL DEFAULT '[]',
  upgrades TEXT NOT NULL DEFAULT '[]',
  stars INTEGER NOT NULL DEFAULT 0,
  grade INTEGER NOT NULL DEFAULT 0,
  stolen_total REAL NOT NULL DEFAULT 0,
  lost_total REAL NOT NULL DEFAULT 0,
  last_steal_at INTEGER NOT NULL DEFAULT 0,
  last_ad_reward_at INTEGER NOT NULL DEFAULT 0,
  cg_user_id TEXT UNIQUE,
  cg_migrated_at INTEGER NOT NULL DEFAULT 0,
  tutorial_done INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  last_claim_day INTEGER NOT NULL DEFAULT 0,
  attendance_doubled_day INTEGER NOT NULL DEFAULT 0,
  hw_day INTEGER NOT NULL DEFAULT 0,
  hw_progress TEXT NOT NULL DEFAULT '{}',
  desk_skin TEXT NOT NULL DEFAULT 'wood',
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_players_lifetime ON players(lifetime_bp DESC);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export class Db {
  private db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(SCHEMA);
    this.migrate();
  }

  /** Add columns introduced after the first release. */
  private migrate(): void {
    const cols = this.db.prepare('PRAGMA table_info(players)').all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('cg_user_id')) {
      this.db.exec('ALTER TABLE players ADD COLUMN cg_user_id TEXT');
      this.db.exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_players_cg_user ON players(cg_user_id) WHERE cg_user_id IS NOT NULL',
      );
    }
    if (!names.has('last_ad_reward_at')) {
      this.db.exec('ALTER TABLE players ADD COLUMN last_ad_reward_at INTEGER NOT NULL DEFAULT 0');
    }
    if (!names.has('cg_migrated_at')) {
      this.db.exec('ALTER TABLE players ADD COLUMN cg_migrated_at INTEGER NOT NULL DEFAULT 0');
    }
    if (!names.has('tutorial_done')) {
      this.db.exec('ALTER TABLE players ADD COLUMN tutorial_done INTEGER NOT NULL DEFAULT 0');
    }
    if (!names.has('streak')) {
      this.db.exec('ALTER TABLE players ADD COLUMN streak INTEGER NOT NULL DEFAULT 0');
    }
    if (!names.has('best_streak')) {
      this.db.exec('ALTER TABLE players ADD COLUMN best_streak INTEGER NOT NULL DEFAULT 0');
    }
    if (!names.has('last_claim_day')) {
      this.db.exec('ALTER TABLE players ADD COLUMN last_claim_day INTEGER NOT NULL DEFAULT 0');
    }
    if (!names.has('attendance_doubled_day')) {
      this.db.exec('ALTER TABLE players ADD COLUMN attendance_doubled_day INTEGER NOT NULL DEFAULT 0');
    }
    if (!names.has('hw_day')) {
      this.db.exec('ALTER TABLE players ADD COLUMN hw_day INTEGER NOT NULL DEFAULT 0');
    }
    if (!names.has('hw_progress')) {
      this.db.exec("ALTER TABLE players ADD COLUMN hw_progress TEXT NOT NULL DEFAULT '{}'");
    }
    if (!names.has('desk_skin')) {
      this.db.exec("ALTER TABLE players ADD COLUMN desk_skin TEXT NOT NULL DEFAULT 'wood'");
    }
  }

  createPlayer(row: PlayerRow, tokenHash: string): void {
    this.db
      .prepare(
        `INSERT INTO players (id, token_hash, name, avatar, bp, run_bp, lifetime_bp, clicks,
           gens, upgrades, stars, grade, stolen_total, lost_total, last_steal_at,
           last_ad_reward_at, cg_user_id, cg_migrated_at, tutorial_done,
           streak, best_streak, last_claim_day, attendance_doubled_day, hw_day, hw_progress, desk_skin,
           created_at, last_seen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        tokenHash,
        row.name,
        JSON.stringify(row.avatar),
        row.bp,
        row.runBp,
        row.lifetimeBp,
        row.clicks,
        JSON.stringify(row.gens),
        JSON.stringify(row.upgrades),
        row.stars,
        row.grade,
        row.stolenTotal,
        row.lostTotal,
        row.lastStealAt,
        row.lastAdRewardAt,
        row.cgUserId,
        row.cgMigratedAt,
        row.tutorialDone ? 1 : 0,
        row.streak,
        row.bestStreak,
        row.lastClaimDay,
        row.attendanceDoubledDay,
        row.hwDay,
        JSON.stringify(row.hw),
        row.deskSkin,
        row.createdAt,
        row.lastSeen,
      );
  }

  loadPlayerByToken(tokenHash: string): PlayerRow | null {
    const r = this.db
      .prepare('SELECT * FROM players WHERE token_hash = ?')
      .get(tokenHash) as Record<string, unknown> | undefined;
    return r ? decodeRow(r) : null;
  }

  loadPlayerByCgUserId(cgUserId: string): PlayerRow | null {
    const r = this.db
      .prepare('SELECT * FROM players WHERE cg_user_id = ?')
      .get(cgUserId) as Record<string, unknown> | undefined;
    return r ? decodeRow(r) : null;
  }

  /** Stamp a guest save as already copied into a CrazyGames account. */
  markCgMigrated(playerId: string, at: number): void {
    this.db.prepare('UPDATE players SET cg_migrated_at = ? WHERE id = ?').run(at, playerId);
  }

  /** Durable per-CrazyGames-account tutorial flag (survives odd save migrations). */
  setCgTutorialDone(cgUserId: string): void {
    this.setMeta(`cg_tut:${cgUserId}`, '1');
  }

  isCgTutorialDone(cgUserId: string): boolean {
    return this.getMeta(`cg_tut:${cgUserId}`) === '1';
  }

  savePlayer(row: PlayerRow): void {
    this.db
      .prepare(
        `UPDATE players SET name = ?, avatar = ?, bp = ?, run_bp = ?, lifetime_bp = ?, clicks = ?,
           gens = ?, upgrades = ?, stars = ?, grade = ?, stolen_total = ?, lost_total = ?,
           last_steal_at = ?, last_ad_reward_at = ?, cg_user_id = ?, cg_migrated_at = ?,
           tutorial_done = ?, streak = ?, best_streak = ?, last_claim_day = ?,
           attendance_doubled_day = ?, hw_day = ?, hw_progress = ?, desk_skin = ?, last_seen = ?
         WHERE id = ?`,
      )
      .run(
        row.name,
        JSON.stringify(row.avatar),
        row.bp,
        row.runBp,
        row.lifetimeBp,
        row.clicks,
        JSON.stringify(row.gens),
        JSON.stringify(row.upgrades),
        row.stars,
        row.grade,
        row.stolenTotal,
        row.lostTotal,
        row.lastStealAt,
        row.lastAdRewardAt,
        row.cgUserId,
        row.cgMigratedAt,
        row.tutorialDone ? 1 : 0,
        row.streak,
        row.bestStreak,
        row.lastClaimDay,
        row.attendanceDoubledDay,
        row.hwDay,
        JSON.stringify(row.hw),
        row.deskSkin,
        row.lastSeen,
        row.id,
      );
  }

  topPlayers(limit: number): LeaderboardDbRow[] {
    const rows = this.db
      .prepare(
        'SELECT id, name, grade, stars, lifetime_bp FROM players ORDER BY lifetime_bp DESC LIMIT ?',
      )
      .all(limit) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      grade: r.grade as number,
      stars: r.stars as number,
      lifetimeBp: r.lifetime_bp as number,
    }));
  }

  getMeta(key: string): string | null {
    const r = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return r?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value);
  }

  close(): void {
    this.db.close();
  }
}

function decodeRow(r: Record<string, unknown>): PlayerRow {
  return {
    id: r.id as string,
    name: r.name as string,
    avatar: JSON.parse(r.avatar as string) as AvatarSpec,
    bp: r.bp as number,
    runBp: r.run_bp as number,
    lifetimeBp: r.lifetime_bp as number,
    clicks: r.clicks as number,
    gens: JSON.parse(r.gens as string) as number[],
    upgrades: JSON.parse(r.upgrades as string) as string[],
    stars: r.stars as number,
    grade: r.grade as number,
    stolenTotal: r.stolen_total as number,
    lostTotal: r.lost_total as number,
    lastStealAt: r.last_steal_at as number,
    lastAdRewardAt: Number(r.last_ad_reward_at ?? 0),
    cgUserId: (r.cg_user_id as string | null) ?? null,
    cgMigratedAt: Number(r.cg_migrated_at ?? 0),
    tutorialDone: Number(r.tutorial_done ?? 0) !== 0,
    streak: Number(r.streak ?? 0),
    bestStreak: Number(r.best_streak ?? 0),
    lastClaimDay: Number(r.last_claim_day ?? 0),
    attendanceDoubledDay: Number(r.attendance_doubled_day ?? 0),
    hwDay: Number(r.hw_day ?? 0),
    hw: parseHomework(r.hw_progress),
    deskSkin: typeof r.desk_skin === 'string' && r.desk_skin ? r.desk_skin : DEFAULT_DESK_SKIN,
    createdAt: r.created_at as number,
    lastSeen: r.last_seen as number,
  };
}
