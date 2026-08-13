import crypto from 'node:crypto';

const PUBLIC_KEY_URL = 'https://sdk.crazygames.com/publicKey.json';

export interface CrazyGamesTokenPayload {
  userId: string;
  gameId: string;
  username: string;
  profilePictureUrl?: string;
  iat?: number;
  exp?: number;
}

let cachedKey: { pem: string; fetchedAt: number } | null = null;
const KEY_TTL_MS = 60 * 60_000;

async function fetchPublicKey(force = false): Promise<string> {
  if (!force && cachedKey && Date.now() - cachedKey.fetchedAt < KEY_TTL_MS) {
    return cachedKey.pem;
  }
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(PUBLIC_KEY_URL);
      if (!res.ok) throw new Error(`CG public key HTTP ${res.status}`);
      const data = (await res.json()) as { publicKey?: string };
      if (!data.publicKey) throw new Error('CG public key missing');
      cachedKey = { pem: data.publicKey, fetchedAt: Date.now() };
      return cachedKey.pem;
    } catch (err) {
      lastErr = err;
      if (i < 2) await new Promise((r) => setTimeout(r, 150 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}

/**
 * Verify a CrazyGames user JWT (RS256) and return the payload.
 * Retries once with a fresh public key if signature verification fails.
 */
export async function verifyCrazyGamesToken(token: string): Promise<CrazyGamesTokenPayload> {
  if (typeof token !== 'string' || token.split('.').length !== 3) {
    throw new Error('invalid token format');
  }

  const tryVerify = async (forceKey: boolean): Promise<CrazyGamesTokenPayload> => {
    const pem = await fetchPublicKey(forceKey);
    const [headerB64, payloadB64, sigB64] = token.split('.') as [string, string, string];
    const data = Buffer.from(`${headerB64}.${payloadB64}`);
    const sig = b64urlToBuf(sigB64);
    const key = crypto.createPublicKey(pem);
    const ok = crypto.verify('RSA-SHA256', data, key, sig);
    if (!ok) throw new Error('invalid signature');

    const payload = JSON.parse(b64urlToBuf(payloadB64).toString('utf8')) as CrazyGamesTokenPayload;
    if (!payload.userId || !payload.username) throw new Error('incomplete payload');
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) {
      throw new Error('token expired');
    }
    return payload;
  };

  try {
    return await tryVerify(false);
  } catch (err) {
    // Key may have rotated — refetch once.
    if (cachedKey) {
      return await tryVerify(true);
    }
    throw err;
  }
}
