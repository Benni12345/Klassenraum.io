/**
 * Where the game WebSocket lives. Resolution order:
 * 1. `VITE_WS_URL` at build time (Vercel env var)
 * 2. `/config.json` at runtime (`public/config.json` — edit without rebuild)
 * 3. Same origin `/ws` (single-process `npm start` or dev proxy)
 */
let cached: string | null = null;

function sameOriginWs(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

export async function getWsUrl(): Promise<string> {
  if (cached) return cached;

  const fromEnv = import.meta.env.VITE_WS_URL as string | undefined;
  if (fromEnv?.trim()) {
    cached = fromEnv.trim();
    return cached;
  }

  try {
    const res = await fetch('/config.json', { cache: 'no-store' });
    if (res.ok) {
      const cfg = (await res.json()) as { wsUrl?: unknown };
      if (typeof cfg.wsUrl === 'string' && cfg.wsUrl.trim()) {
        cached = cfg.wsUrl.trim();
        return cached;
      }
    }
  } catch {
    // Offline or no config file — fall through to same-origin.
  }

  cached = sameOriginWs();
  return cached;
}

/** Drop cached URL so the next connect re-reads config.json / env. */
export function clearWsUrlCache(): void {
  cached = null;
}

/** True when we're not using a custom server URL (likely static-only hosting). */
export function isDefaultWsUrl(url: string): boolean {
  return url === sameOriginWs();
}
