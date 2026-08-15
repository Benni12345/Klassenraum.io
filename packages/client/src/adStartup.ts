/**
 * Startup midgame video ads (CrazyGames). Pure helpers so boot can request
 * every session while tests stay free of the DOM ad UI.
 */

/** Whether this session should request a startup midgame video ad. */
export function shouldRequestStartupAd(opts: {
  enabled: boolean;
  hasAdblock: boolean;
  disabled: boolean;
}): boolean {
  return opts.enabled && !opts.hasAdblock && !opts.disabled;
}

/**
 * Resolves with `promise`, or `fallback` if it takes longer than `ms` / rejects.
 * Used so a hung SDK callback cannot block joining the classroom.
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
