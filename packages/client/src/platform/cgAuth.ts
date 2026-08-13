/**
 * Resolves CrazyGames login + JWT before the game hello.
 *
 * The SDK can report a logged-in user a beat before `getUserToken()` is ready
 * (and vice versa). Sending hello without the JWT seats a brand-new guest save,
 * which looks like a points reset until a later reload happens to include the
 * token. Never treat "logged in, token missing" as a guest.
 */

export interface CrazyGamesAuthSnapshot {
  token: string | null;
  loggedIn: boolean;
  username: string | null;
}

export interface CrazyGamesUserModule {
  isUserAccountAvailable?: boolean;
  getUser(): Promise<{ username?: string } | null>;
  getUserToken(): Promise<string>;
}

const TOKEN_MIN_LEN = 20;
const MAX_ATTEMPTS = 6;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function usableToken(token: unknown): string | null {
  return typeof token === 'string' && token.length > TOKEN_MIN_LEN ? token : null;
}

export async function resolveCrazyGamesAuth(
  user: CrazyGamesUserModule | null | undefined,
  opts?: { sleep?: (ms: number) => Promise<void> },
): Promise<CrazyGamesAuthSnapshot> {
  const sleep = opts?.sleep ?? defaultSleep;
  if (!user || user.isUserAccountAvailable === false) {
    return { token: null, loggedIn: false, username: null };
  }

  let username: string | null = null;
  let guestReads = 0;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    if (i > 0) await sleep(200 * i);

    try {
      const u = await user.getUser();
      if (u?.username) username = u.username;
    } catch {
      /* SDK not ready */
    }

    try {
      const token = usableToken(await user.getUserToken());
      if (token) return { token, loggedIn: true, username };
    } catch {
      /* guest, or JWT not ready yet */
    }

    if (username) continue;
    guestReads += 1;
    // Two consecutive "no user / no token" reads → actual guest. Logged-in
    // players keep retrying until a JWT appears or attempts are exhausted.
    if (guestReads >= 2) break;
  }

  return { token: null, loggedIn: Boolean(username), username };
}
