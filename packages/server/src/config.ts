import path from 'node:path';
import { EVENT_MAX_GAP_MS, EVENT_MIN_GAP_MS } from '@shared/balance.js';

export const CONFIG = {
  port: Number(process.env.PORT ?? 8080),
  dbPath: process.env.DB_PATH ?? path.resolve(process.cwd(), 'data/klassenraum.db'),
  /** Directory with the built client; resolved relative to the bundle at runtime. */
  staticDir: process.env.STATIC_DIR ?? '',
  tickMs: 500,
  flushMs: 30_000,
  /** Event pacing is overridable for local testing (e.g. EVENT_MIN_GAP_MS=5000). */
  eventMinGapMs: Number(process.env.EVENT_MIN_GAP_MS ?? EVENT_MIN_GAP_MS),
  eventMaxGapMs: Number(process.env.EVENT_MAX_GAP_MS ?? EVENT_MAX_GAP_MS),
};
