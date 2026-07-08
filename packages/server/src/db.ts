import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
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
  }

  createPlayer(row: PlayerRow, tokenHash: string): void {
    this.db
      .prepare(
        `INSERT INTO players (id, token_hash, name, avatar, bp, run_bp, lifetime_bp, clicks,
           gens, upgrades, stars, grade, stolen_total, lost_total, last_steal_at, created_at, last_seen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

  savePlayer(row: PlayerRow): void {
    this.db
      .prepare(
        `UPDATE players SET name = ?, avatar = ?, bp = ?, run_bp = ?, lifetime_bp = ?, clicks = ?,
           gens = ?, upgrades = ?, stars = ?, grade = ?, stolen_total = ?, lost_total = ?,
           last_steal_at = ?, last_seen = ? WHERE id = ?`,
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
    createdAt: r.created_at as number,
    lastSeen: r.last_seen as number,
  };
}
