/**
 * Local preferences (audio, language, onboarding cache).
 *
 * Game progress itself lives on the server — the only thing kept in
 * localStorage is the anonymous account token (also mirrored to sessionStorage
 * so CrazyGames login cannot drop it) plus these preferences. Writes are
 * throttled to at most one per 30 s (CrazyGames limits save operations for
 * clicker games), with a final flush when the page goes away.
 *
 * Tutorial completion is a one-way flag mirrored to:
 * - the game backend player save (`tutorialDone`)
 * - local prefs (same-browser cache)
 * - sessionStorage (survives CrazyGames login wiping/restoring localStorage)
 * - the CrazyGames Data module (cloud-synced per CrazyGames account)
 */

const KEY = 'kr_prefs';
const LEGACY_LANG_KEY = 'kr_lang';
/** Survives CG account-login localStorage restores within the same tab. */
const SESSION_TUTORIAL_KEY = 'kr_tutorial_done';
export const SAVE_INTERVAL_MS = 30_000;

/** CrazyGames Data module key — syncs across browsers for the same CG account. */
export const CG_TUTORIAL_KEY = 'tutorialDone';

export interface Prefs {
  lang: string | null;
  music: boolean;
  sfx: boolean;
  /** Tutorial completed or skipped (cache; also on server + CG Data). */
  tutorialDone: boolean;
  /** Ids of one-shot interaction hints already shown. */
  hints: string[];
}

const DEFAULTS: Prefs = {
  lang: null,
  music: true,
  sfx: true,
  tutorialDone: false,
  hints: [],
};

function readSessionTutorialDone(): boolean {
  try {
    return sessionStorage.getItem(SESSION_TUTORIAL_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSessionTutorialDone(): void {
  try {
    sessionStorage.setItem(SESSION_TUTORIAL_KEY, '1');
  } catch {
    /* private mode */
  }
}

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
  // CG login can restore an empty account localStorage over guest prefs; the
  // session flag still carries Skip across the auth reload in this tab.
  if (!prefs.tutorialDone && readSessionTutorialDone()) prefs.tutorialDone = true;
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
  if (prefs.tutorialDone) writeSessionTutorialDone();
}

function schedule(): void {
  if (timer !== null) return;
  const wait = Math.max(0, SAVE_INTERVAL_MS - (Date.now() - lastWriteAt));
  timer = window.setTimeout(write, wait);
}

export function getPrefs(): Readonly<Prefs> {
  return prefs;
}

/** True when any same-tab cache says the tutorial was finished/skipped. */
export function isTutorialDoneLocally(): boolean {
  return prefs.tutorialDone || readSessionTutorialDone();
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
  if (patch.tutorialDone === true) writeSessionTutorialDone();
  dirty = true;
  schedule();
}

/**
 * One-way mark that the tutorial is done in every client-side cache that can
 * survive a CrazyGames auth reload (prefs, sessionStorage).
 */
export function rememberTutorialDoneLocally(): void {
  writeSessionTutorialDone();
  setPrefs({ tutorialDone: true });
  flushPrefs();
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
  else if (prefs.tutorialDone) writeSessionTutorialDone();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPrefs);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPrefs();
  });
}
