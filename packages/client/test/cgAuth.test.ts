import { describe, expect, it } from 'vitest';
import { resolveCrazyGamesAuth, type CrazyGamesUserModule } from '../src/platform/cgAuth';

function userMod(opts: {
  available?: boolean;
  users?: Array<{ username: string } | null | Error>;
  tokens?: Array<string | null | Error>;
}): CrazyGamesUserModule {
  let userCalls = 0;
  let tokenCalls = 0;
  const pick = <T,>(arr: T[] | undefined, i: number): T | undefined => {
    if (!arr || arr.length === 0) return undefined;
    return i < arr.length ? arr[i] : arr[arr.length - 1];
  };
  return {
    isUserAccountAvailable: opts.available,
    async getUser() {
      const v = pick(opts.users, userCalls++);
      if (v instanceof Error) throw v;
      return v ?? null;
    },
    async getUserToken() {
      const v = pick(opts.tokens, tokenCalls++);
      if (v instanceof Error) throw v;
      if (v === null || v === undefined) throw new Error('not logged in');
      return v;
    },
  };
}

const jwt = 'a'.repeat(24);

describe('resolveCrazyGamesAuth', () => {
  it('returns guest immediately when accounts are unavailable', async () => {
    const auth = await resolveCrazyGamesAuth(userMod({ available: false, users: [{ username: 'X' }], tokens: [jwt] }));
    expect(auth).toEqual({ token: null, loggedIn: false, username: null });
  });

  it('returns guest after two empty reads without waiting for later attempts', async () => {
    const sleeps: number[] = [];
    const auth = await resolveCrazyGamesAuth(
      userMod({
        users: [null, null, { username: 'Late' }],
        tokens: [new Error('nope'), new Error('nope'), jwt],
      }),
      { sleep: async (ms) => { sleeps.push(ms); } },
    );
    expect(auth.loggedIn).toBe(false);
    expect(auth.token).toBeNull();
    expect(sleeps).toEqual([200]);
  });

  it('keeps retrying while getUser says logged in until the JWT appears', async () => {
    const sleeps: number[] = [];
    const auth = await resolveCrazyGamesAuth(
      userMod({
        users: [{ username: 'Ada' }],
        tokens: [new Error('not ready'), new Error('not ready'), jwt],
      }),
      { sleep: async (ms) => { sleeps.push(ms); } },
    );
    expect(auth).toEqual({ token: jwt, loggedIn: true, username: 'Ada' });
    expect(sleeps).toEqual([200, 400]);
  });

  it('treats a JWT as logged-in even when getUser is still null', async () => {
    const auth = await resolveCrazyGamesAuth(
      userMod({
        users: [null],
        tokens: [jwt],
      }),
      { sleep: async () => {} },
    );
    expect(auth.loggedIn).toBe(true);
    expect(auth.token).toBe(jwt);
  });

  it('reports loggedIn without a token when the JWT never arrives', async () => {
    const auth = await resolveCrazyGamesAuth(
      userMod({
        users: [{ username: 'Ada' }],
        tokens: [new Error('not ready')],
      }),
      { sleep: async () => {} },
    );
    expect(auth.loggedIn).toBe(true);
    expect(auth.token).toBeNull();
    expect(auth.username).toBe('Ada');
  });
});
