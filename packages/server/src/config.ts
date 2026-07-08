import path from 'node:path';

export const CONFIG = {
  port: Number(process.env.PORT ?? 8080),
  dbPath: process.env.DB_PATH ?? path.resolve(process.cwd(), 'data/klassenraum.db'),
  /** Directory with the built client; resolved relative to the bundle at runtime. */
  staticDir: process.env.STATIC_DIR ?? '',
  tickMs: 500,
  flushMs: 30_000,
};
