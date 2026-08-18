import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isAccountToken,
  readAccountToken,
  stashAccountToken,
  writeAccountToken,
} from '../src/accountToken';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  clear(): void {
    this.data.clear();
  }
}

const TOKEN = 'a'.repeat(48);

describe('accountToken', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: new MemoryStorage(),
      configurable: true,
    });
  });

  afterEach(() => {
    // Drop the fakes so later tests in this worker don't leak storage.
    delete (globalThis as { localStorage?: Storage }).localStorage;
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
  });

  it('accepts 48-hex guest tokens only', () => {
    expect(isAccountToken(TOKEN)).toBe(true);
    expect(isAccountToken('not-a-token')).toBe(false);
    expect(isAccountToken('a'.repeat(47))).toBe(false);
  });

  it('writes the token to both localStorage and sessionStorage', () => {
    writeAccountToken(TOKEN);
    expect(localStorage.getItem('kr_token')).toBe(TOKEN);
    expect(sessionStorage.getItem('kr_token')).toBe(TOKEN);
  });

  it('recovers the guest token after CrazyGames restores empty account localStorage', () => {
    writeAccountToken(TOKEN);
    // Fresh CrazyGames account: SDK replaces guest localStorage with {}.
    localStorage.clear();
    expect(localStorage.getItem('kr_token')).toBeNull();

    expect(readAccountToken()).toBe(TOKEN);
    // Restored so later reconnects / hasAccount still work.
    expect(localStorage.getItem('kr_token')).toBe(TOKEN);
  });

  it('mirrors a local-only token into sessionStorage for a later auth reload', () => {
    localStorage.setItem('kr_token', TOKEN);
    expect(sessionStorage.getItem('kr_token')).toBeNull();

    stashAccountToken();
    expect(sessionStorage.getItem('kr_token')).toBe(TOKEN);

    localStorage.clear();
    expect(readAccountToken()).toBe(TOKEN);
  });

  it('ignores corrupt values left in either store', () => {
    localStorage.setItem('kr_token', 'garbage');
    sessionStorage.setItem('kr_token', TOKEN);
    expect(readAccountToken()).toBe(TOKEN);
  });
});
