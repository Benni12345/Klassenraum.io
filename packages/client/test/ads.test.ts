import { describe, expect, it } from 'vitest';
import { firstSettledOr, shouldRequestStartupAd } from '../src/adStartup';

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
