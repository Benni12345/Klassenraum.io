/**
 * First-session midgame video ads (CrazyGames). Pure helpers so scheduling
 * stays testable without the DOM ad UI.
 *
 * The SDK frequency-caps midgames to ~3 minutes and counts the platform
 * preroll toward that window. A request right after loadingStop always
 * returns `adCooldown`.
 */

/** CrazyGames midgame interval, including preroll and rewarded ads. */
export const MIDGAME_COOLDOWN_MS = 180_000;
/** Clicker requirement: warn before a midgame so the player can stop tapping. */
export const STARTUP_AD_WARNING_MS = 3_000;
/** If the first eligible request still skips, try again after this delay. */
export const STARTUP_AD_RETRY_MS = 60_000;
export const STARTUP_AD_MAX_TRIES = 5;

/** Whether this session should ever schedule a startup midgame. */
export function shouldRequestStartupAd(opts: {
  enabled: boolean;
  hasAdblock: boolean;
  disabled: boolean;
}): boolean {
  return opts.enabled && !opts.hasAdblock && !opts.disabled;
}

/** Earliest time a midgame can fill after load and the last video request. */
export function nextMidgameAt(loadedAt: number, lastVideoAt: number): number {
  return Math.max(loadedAt, lastVideoAt) + MIDGAME_COOLDOWN_MS;
}

/** True when the SDK cooldown has elapsed and the classroom is playable. */
export function startupAdReady(opts: {
  now: number;
  dueAt: number;
  covered: boolean;
  visible: boolean;
  seated: boolean;
}): boolean {
  return opts.now >= opts.dueAt && !opts.covered && opts.visible && opts.seated;
}

/**
 * Resolves with `promise`, or `fallback` if it takes longer than `ms` / rejects.
 * Used so a hung SDK callback cannot freeze the classroom.
 */
export function firstSettledOr<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: T) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(fallback), ms);
    void promise.then(
      (value) => finish(value),
      () => finish(fallback),
    );
  });
}
