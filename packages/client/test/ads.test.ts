import { describe, expect, it } from 'vitest';
import {
  firstSettledOr,
  MIDGAME_COOLDOWN_MS,
  nextMidgameAt,
  shouldRequestStartupAd,
  startupAdReady,
} from '../src/adStartup';

describe('shouldRequestStartupAd', () => {
  it('requests on CrazyGames when ads are allowed', () => {
    expect(shouldRequestStartupAd({ enabled: true, hasAdblock: false, disabled: false })).toBe(
      true,
    );
  });

  it('skips outside CrazyGames, with adblock, or when QA-disabled', () => {
    expect(shouldRequestStartupAd({ enabled: false, hasAdblock: false, disabled: false })).toBe(
      false,
    );
    expect(shouldRequestStartupAd({ enabled: true, hasAdblock: true, disabled: false })).toBe(false);
    expect(shouldRequestStartupAd({ enabled: true, hasAdblock: false, disabled: true })).toBe(false);
  });
});

describe('nextMidgameAt', () => {
  it('waits 3 minutes after load so preroll cooldown can expire', () => {
    expect(nextMidgameAt(1_000, 0)).toBe(1_000 + MIDGAME_COOLDOWN_MS);
  });

  it('waits 3 minutes after the later of load or the last video', () => {
    const loadedAt = 1_000;
    const lastVideoAt = loadedAt + 60_000;
    expect(nextMidgameAt(loadedAt, lastVideoAt)).toBe(lastVideoAt + MIDGAME_COOLDOWN_MS);
  });
});

describe('startupAdReady', () => {
  const dueAt = 181_000;
  const ok = {
    now: dueAt,
    dueAt,
    covered: false,
    visible: true,
    seated: true,
  };

  it('is not ready immediately after load', () => {
    expect(startupAdReady({ ...ok, now: 1_000, dueAt: 181_000 })).toBe(false);
  });

  it('is ready once cooldown elapsed and the classroom is playable', () => {
    expect(startupAdReady(ok)).toBe(true);
  });

  it('waits while a modal, hidden tab, or missing seat would reject the ad', () => {
    expect(startupAdReady({ ...ok, covered: true })).toBe(false);
    expect(startupAdReady({ ...ok, visible: false })).toBe(false);
    expect(startupAdReady({ ...ok, seated: false })).toBe(false);
  });
});

describe('firstSettledOr', () => {
  it('returns the promise value when it wins', async () => {
    await expect(firstSettledOr(Promise.resolve('ok'), 50, 'fallback')).resolves.toBe('ok');
  });

  it('returns the fallback when the promise rejects', async () => {
    await expect(firstSettledOr(Promise.reject(new Error('nope')), 50, 'fallback')).resolves.toBe(
      'fallback',
    );
  });

  it('returns the fallback when the promise is too slow', async () => {
    const slow = new Promise<string>((resolve) => {
      setTimeout(() => resolve('late'), 40);
    });
    await expect(firstSettledOr(slow, 5, 'fallback')).resolves.toBe('fallback');
  });
});
