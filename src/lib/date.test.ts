import { describe, expect, it } from 'vitest';
import { addDaysToDateKey, dayOfWeekForDateKey, toBusinessDateKey } from './date';

describe('toBusinessDateKey', () => {
  it('uses Philippine time, not UTC, before 8 AM', () => {
    // 2026-09-25 23:30 UTC is 2026-09-26 07:30 in Manila.
    expect(toBusinessDateKey(new Date('2026-09-25T23:30:00Z'))).toBe('2026-09-26');
  });

  it('keeps the same day later in the day', () => {
    expect(toBusinessDateKey(new Date('2026-09-26T10:00:00Z'))).toBe('2026-09-26');
  });

  it('rolls over at Manila midnight', () => {
    expect(toBusinessDateKey(new Date('2026-09-26T15:59:00Z'))).toBe('2026-09-26');
    expect(toBusinessDateKey(new Date('2026-09-26T16:00:00Z'))).toBe('2026-09-27');
  });
});

describe('date key helpers', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDaysToDateKey('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDaysToDateKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDateKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('computes the day of week', () => {
    expect(dayOfWeekForDateKey('2026-09-26')).toBe(6); // Saturday
    expect(dayOfWeekForDateKey('2026-09-27')).toBe(0); // Sunday
  });
});
