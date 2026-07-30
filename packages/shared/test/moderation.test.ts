import { describe, expect, it } from 'vitest';
import { containsProfanity, isCleanUsername, moderateChat } from '../src/moderation.js';

describe('moderateChat', () => {
  it('masks blocked English words', () => {
    const out = moderateChat('what the fuck');
    expect(out.startsWith('what the ')).toBe(true);
    expect(out.toLowerCase()).not.toContain('fuck');
  });

  it('masks blocked German words', () => {
    expect(moderateChat('du Arschloch').toLowerCase()).not.toContain('arschloch');
    expect(moderateChat('so eine Scheiße').toLowerCase()).not.toContain('scheiß');
  });

  it('leaves clean text alone', () => {
    expect(moderateChat('Hallo Klasse!')).toBe('Hallo Klasse!');
    expect(moderateChat('Great class, pass me the analysis')).toBe(
      'Great class, pass me the analysis',
    );
  });

  it('sees through leetspeak, padding and repeats', () => {
    for (const evasion of ['sh1t', 'f u c k', 'f.u.c.k', 'fuuuuck', '@sshole', 'b1tch', 'FUCK']) {
      expect(containsProfanity(evasion)).toBe(true);
    }
  });

  it('keeps innocent words that contain blocked stems', () => {
    for (const safe of [
      'therapist',
      'Scunthorpe',
      'classic assassin',
      'cocktail',
      'titanium',
      'analysis',
      'my methodical homework',
      'a bass in the grass',
    ]) {
      expect(containsProfanity(safe)).toBe(false);
    }
  });

  it('preserves message length when masking', () => {
    const input = 'you are a bitch ok';
    expect(moderateChat(input)).toHaveLength(input.length);
  });
});

describe('isCleanUsername', () => {
  it('rejects embedded profanity', () => {
    expect(isCleanUsername('xXfuckerXx')).toBe(false);
    expect(isCleanUsername('Sh1tLord')).toBe(false);
    expect(isCleanUsername('n1gg3r')).toBe(false);
  });

  it('accepts ordinary names', () => {
    for (const name of ['Student_0192', 'Anna', 'Ben.Miller', 'Müller-42', 'Guest_7781']) {
      expect(isCleanUsername(name)).toBe(true);
    }
  });
});
