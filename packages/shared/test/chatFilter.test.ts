import { describe, expect, it } from 'vitest';
import { moderateChat } from '../src/chatFilter.js';

describe('moderateChat', () => {
  it('redacts blocked English words', () => {
    expect(moderateChat('what the fuck')).toMatch(/^\*$|^what the \*+$/);
    expect(moderateChat('what the fuck')).toContain('what the');
    expect(moderateChat('what the fuck').toLowerCase()).not.toContain('fuck');
  });

  it('redacts blocked German words', () => {
    const out = moderateChat('du Arschloch');
    expect(out.toLowerCase()).not.toContain('arschloch');
  });

  it('leaves clean text alone', () => {
    expect(moderateChat('Hallo Klasse!')).toBe('Hallo Klasse!');
  });
});
