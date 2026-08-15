import { describe, expect, it } from 'vitest';
import { canonicalCgUserId, normalizeCrazyGamesPayload } from '../src/cgAuth.js';

describe('canonicalCgUserId', () => {
  it('stringifies numbers and trims strings', () => {
    expect(canonicalCgUserId('  abc  ')).toBe('abc');
    expect(canonicalCgUserId(42)).toBe('42');
    expect(canonicalCgUserId('')).toBe(null);
    expect(canonicalCgUserId(null)).toBe(null);
    expect(canonicalCgUserId({ id: 'x' })).toBe(null);
  });
});

describe('normalizeCrazyGamesPayload', () => {
  it('reads userId, user_id, or sub', () => {
    expect(
      normalizeCrazyGamesPayload({ userId: 'A', username: 'Ada', gameId: 'g' }).userId,
    ).toBe('A');
    expect(
      normalizeCrazyGamesPayload({
        userId: '',
        user_id: 'B',
        username: 'Ada',
        gameId: 'g',
      }).userId,
    ).toBe('B');
    expect(
      normalizeCrazyGamesPayload({
        userId: '',
        sub: 'C',
        username: 'Ada',
        gameId: 'g',
      }).userId,
    ).toBe('C');
  });

  it('does not fall back to the username as the account key', () => {
    expect(() =>
      normalizeCrazyGamesPayload({ userId: '', username: 'Ada', gameId: 'g' }),
    ).toThrow(/incomplete payload/);
  });
});
