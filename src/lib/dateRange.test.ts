import { describe, expect, it } from 'vitest';
import { describeRange, isWithinRange, presetRange } from './dateRange';

describe('presetRange', () => {
  const today = '2026-10-07'; // Wednesday
  it('computes the common presets', () => {
    expect(presetRange('TODAY', today)).toEqual({ from: today, to: today });
    expect(presetRange('THIS_WEEK', today)).toEqual({ from: '2026-10-05', to: '2026-10-11' });
    expect(presetRange('THIS_MONTH', today)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetRange('LAST_MONTH', today)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(presetRange('ALL', today)).toEqual({ from: '', to: '' });
  });

  it('handles February and year boundaries', () => {
    expect(presetRange('THIS_MONTH', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(presetRange('LAST_MONTH', '2027-01-15')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
});

describe('describeRange / isWithinRange', () => {
  it('swaps a reversed range and checks bounds inclusively', () => {
    const range = describeRange('2026-10-07', '2026-10-01');
    expect(range.start).toBe('2026-10-01');
    expect(range.end).toBe('2026-10-07');
    expect(isWithinRange('2026-10-01', range.start, range.end)).toBe(true);
    expect(isWithinRange('2026-10-08', range.start, range.end)).toBe(false);
    expect(describeRange('', '').active).toBe(false);
  });
});
