import { describe, expect, it } from 'vitest';
import {
  attendanceReward,
  ATTENDANCE_MIN,
  buildSchoolDay,
  bumpHomework,
  canRecoverStreak,
  defaultSchoolProgress,
  DESK_SKINS,
  emptyHomework,
  homeworkBonus,
  homeworkReward,
  nextStreak,
  parseHomework,
  pickHomework,
  sanitizeDeskSkin,
  streakMultiplier,
  unlockedSkins,
  utcDay,
} from '../src/school.js';

const DAY = 86_400_000;

describe('utc days', () => {
  it('floors milliseconds to UTC day numbers', () => {
    expect(utcDay(0)).toBe(0);
    expect(utcDay(DAY - 1)).toBe(0);
    expect(utcDay(DAY)).toBe(1);
    expect(utcDay(DAY * 10 + 50)).toBe(10);
  });
});

describe('attendance streaks', () => {
  it('starts at 1 and increments on consecutive days', () => {
    expect(nextStreak(0, 100, 0)).toBe(1);
    expect(nextStreak(100, 101, 4)).toBe(5);
    expect(nextStreak(101, 101, 5)).toBe(5);
  });

  it('resets after a gap and allows a one-day late slip', () => {
    expect(nextStreak(100, 102, 8)).toBe(1);
    expect(canRecoverStreak(100, 102, 8)).toBe(true);
    expect(canRecoverStreak(100, 103, 8)).toBe(false);
    expect(canRecoverStreak(100, 102, 0)).toBe(false);
  });

  it('scales the daily reward with streak and production', () => {
    expect(streakMultiplier(1)).toBe(1);
    expect(streakMultiplier(2)).toBe(1.2);
    expect(streakMultiplier(14)).toBe(3.6);
    expect(streakMultiplier(99)).toBe(3.6);
    expect(attendanceReward(0, 1)).toBe(ATTENDANCE_MIN);
    expect(attendanceReward(10, 1)).toBe(10 * 90);
    expect(attendanceReward(10, 2)).toBe(10 * 90 * 1.2);
  });
});

describe('homework', () => {
  it('always includes notes and shop, with a rotating third task', () => {
    const a = pickHomework('alice', 10);
    expect(a.slice(0, 2)).toEqual(['notes', 'shop']);
    expect(['steal', 'quiz']).toContain(a[2]);
    expect(pickHomework('alice', 10)).toEqual(a);
    expect(pickHomework('bob', 10)).toHaveLength(3);
  });

  it('caps progress at the target and reports completion once', () => {
    const first = bumpHomework(emptyHomework(), 'notes', 40);
    expect(first.completed).toBe(true);
    expect(first.hw.notes).toBe(40);
    const extra = bumpHomework(first.hw, 'notes', 10);
    expect(extra.completed).toBe(false);
    expect(extra.hw.notes).toBe(40);
  });

  it('parses stored JSON defensively', () => {
    expect(parseHomework('not json').notes).toBe(0);
    const hw = parseHomework({ notes: 12.8, claimed: ['notes', 3], bonusClaimed: true });
    expect(hw.notes).toBe(12);
    expect(hw.claimed).toEqual(['notes']);
    expect(hw.bonusClaimed).toBe(true);
  });

  it('scales turn-in rewards with production', () => {
    expect(homeworkReward(0)).toBe(250);
    expect(homeworkReward(10)).toBe(600);
    expect(homeworkBonus(0)).toBe(800);
    expect(homeworkBonus(10)).toBe(1800);
  });
});

describe('desk skins', () => {
  it('unlocks by best streak, stars and grade', () => {
    expect(unlockedSkins(0, 0, 0)).toEqual(['wood']);
    expect(unlockedSkins(3, 0, 0)).toContain('blue');
    expect(unlockedSkins(7, 0, 0)).toContain('green');
    expect(unlockedSkins(0, 5, 0)).toContain('star');
    expect(unlockedSkins(0, 0, 5)).toContain('chalkboard');
    expect(unlockedSkins(30, 5, 5).length).toBe(DESK_SKINS.length);
  });

  it('falls back to wood when a skin is not unlocked', () => {
    expect(sanitizeDeskSkin('galaxy', ['wood', 'blue'])).toBe('wood');
    expect(sanitizeDeskSkin('blue', ['wood', 'blue'])).toBe('blue');
  });
});

describe('school day snapshot', () => {
  it('marks today unclaimed and previews the upcoming streak', () => {
    const progress = defaultSchoolProgress();
    progress.streak = 4;
    progress.bestStreak = 6;
    progress.lastClaimDay = utcDay(DAY * 50);
    const day = buildSchoolDay('p1', progress, DAY * 51, 5, 0, 0);
    expect(day.claimed).toBe(false);
    expect(day.claimDay).toBe(50);
    expect(day.streak).toBe(4);
    expect(day.upcomingStreak).toBe(5);
    expect(day.reward).toBe(attendanceReward(5, 5));
    expect(day.homework).toHaveLength(3);
    expect(day.homework[0]!.id).toBe('notes');
  });

  it('flags a recoverable missed day', () => {
    const progress = defaultSchoolProgress();
    progress.streak = 9;
    progress.lastClaimDay = 10;
    const day = buildSchoolDay('p1', progress, DAY * 12, 1, 0, 0);
    expect(day.recoverable).toBe(true);
    expect(day.recoverStreak).toBe(10);
    expect(day.upcomingStreak).toBe(1);
  });
});
