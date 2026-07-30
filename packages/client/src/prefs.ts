/**
 * Local preferences (audio, language, onboarding state).
 *
 * Game progress itself lives on the server — the only thing kept in
 * localStorage is the anonymous account token plus these preferences. Writes
 * are throttled to at most one per 30 s (CrazyGames limits save operations for
 * clicker games), with a final flush when the page goes away.
 */

const KEY = 'kr_prefs';
const LEGACY_LANG_KEY = 'kr_lang';
export const SAVE_INTERVAL_MS = 30_000;

export interface Prefs {
  lang: string | null;
  music: boolean;
  sfx: boolean;
  /** Tutorial completed or skipped. */
  tutorialDone: boolean;
  /** Ids of one-off interaction hints already shown. */
  hints: string[];
}

const DEFAULTS: Prefs = {
  lang: null,
  music: true,
  sfx: true,
  tutorialDone: false,
  hints: [],
};

function read(): Prefs {
  let stored: Partial<Prefs> = {};
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) stored = JSON.parse(raw) as Partial<Prefs>;
  } catch {
    /* corrupt or unavailable storage — fall back to defaults */
  }
  const prefs: Prefs = { ...DEFAULTS, ...stored };
  if (!prefs.lang) {
    try {
      prefs.lang = localStorage.getItem(LEGACY_LANG_KEY);
    } catch {
      /* ignore */
    }
  }
  if (!Array.isArray(prefs.hints)) prefs.hints = [];
  return prefs;
}

const prefs = read();

let dirty = false;
let lastWriteAt = 0;
let timer: number | null = null;

function write(): void {
  dirty = false;
  lastWriteAt = Date.now();
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* private mode / quota — preferences simply don't persist */
  }
}

function schedule(): void {
  if (timer !== null) return;
  const wait = Math.max(0, SAVE_INTERVAL_MS - (Date.now() - lastWriteAt));
  timer = window.setTimeout(write, wait);
}

export function getPrefs(): Readonly<Prefs> {
  return prefs;
}

/** Applies a change immediately in memory; persists it on the next slot. */
export function setPrefs(patch: Partial<Prefs>): void {
  let changed = false;
  const target = prefs as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (target[key] === value) continue;
    target[key] = value;
    changed = true;
  }
  if (!changed) return;
  dirty = true;
  schedule();
}

export function hasHint(id: string): boolean {
  return prefs.hints.includes(id);
}

export function markHint(id: string): void {
  if (prefs.hints.includes(id)) return;
  setPrefs({ hints: [...prefs.hints, id] });
}

/** Write pending changes right away (page unload, tab hide). */
export function flushPrefs(): void {
  if (dirty) write();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPrefs);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPrefs();
  });
}
