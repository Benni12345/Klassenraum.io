/**
 * Anonymous guest save token.
 *
 * Game progress lives on the server. This 48-hex token is the only handle the
 * client has on a guest save, and it must be sent on hello so a CrazyGames
 * login can copy that save into a brand-new account.
 *
 * CrazyGames restores the *account* localStorage on login. A fresh account has
 * none, so `kr_token` would be wiped and the next hello would mint a blank
 * save. Mirror the token to sessionStorage (same-tab, not synced by CG) the
 * same way tutorial Skip is cached.
 */

const LOCAL_KEY = 'kr_token';
const SESSION_KEY = 'kr_token';
const TOKEN_RE = /^[a-f0-9]{48}$/;

/** CrazyGames Data key — guest token backup that localStorage restore may miss. */
export const CG_GUEST_TOKEN_KEY = 'kr_guest_token';

export function isAccountToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_RE.test(value);
}

function readStore(store: 'localStorage' | 'sessionStorage', key: string): string | null {
  try {
    const storage = globalThis[store];
    if (!storage) return null;
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(store: 'localStorage' | 'sessionStorage', key: string, value: string): void {
  try {
    const storage = globalThis[store];
    if (!storage) return;
    storage.setItem(key, value);
  } catch {
    /* private mode / quota */
  }
}

/**
 * Guest token for the next hello. Prefers sessionStorage (this tab's guest
 * session) over localStorage, because CrazyGames may restore an *older*
 * account localStorage on login. Re-mirrors so a later auth reload still
 * sees it.
 */
export function readAccountToken(): string | null {
  const localRaw = readStore('localStorage', LOCAL_KEY);
  const sessionRaw = readStore('sessionStorage', SESSION_KEY);
  const local = isAccountToken(localRaw) ? localRaw : null;
  const session = isAccountToken(sessionRaw) ? sessionRaw : null;
  // Session is the current tab. An older kr_token restored with the account
  // would otherwise roll the player back to an earlier guest snapshot.
  const token = session ?? local;
  if (!token) return null;
  if (token !== local) writeStore('localStorage', LOCAL_KEY, token);
  if (token !== session) writeStore('sessionStorage', SESSION_KEY, token);
  return token;
}

/** Persist a newly issued guest token to localStorage and sessionStorage. */
export function writeAccountToken(token: string): void {
  if (!isAccountToken(token)) return;
  writeStore('localStorage', LOCAL_KEY, token);
  writeStore('sessionStorage', SESSION_KEY, token);
}

/**
 * Copy whatever guest token we still have into sessionStorage. Call before a
 * CrazyGames auth reload so login cannot drop the migrate handle.
 */
export function stashAccountToken(): void {
  const token = readAccountToken();
  if (token) writeStore('sessionStorage', SESSION_KEY, token);
}

/** Use `candidate` only when this tab has no guest token of its own. */
export function adoptAccountToken(candidate: string | null | undefined): string | null {
  const existing = readAccountToken();
  if (existing) return existing;
  if (!isAccountToken(candidate)) return null;
  writeAccountToken(candidate);
  return candidate;
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', stashAccountToken);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stashAccountToken();
  });
}
