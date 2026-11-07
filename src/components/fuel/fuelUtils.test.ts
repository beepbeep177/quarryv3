import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkEntryDate, checkUnitCost } from './fuelUtils';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-19T04:00:00Z')); });
afterEach(() => vi.useRealTimers());

describe('fuel entry checks after extraction', () => {
  it('rejects future-dated entries', () => {
    expect(checkEntryDate('2026-10-20', '')).toMatchObject({ block: 'The date cannot be in the future.' });
  });
  it('requires remarks for late entries and accepts an explanation', () => {
    expect(checkEntryDate('2026-10-01', '').block).toBeTruthy();
    expect(checkEntryDate('2026-10-01', 'From logbook')).toEqual({ warnings: [] });
  });
  it('warns about dates more than 30 days old', () => {
    expect(checkEntryDate('2026-09-01', 'From logbook').warnings).toHaveLength(1);
  });
  it('accepts a normal unit cost', () => {
    expect(checkUnitCost(92.7, 90)).toEqual([]);
  });
  it('warns about unusually high or changed unit costs', () => {
    expect(checkUnitCost(500, 90)).toHaveLength(1);
    expect(checkUnitCost(150, 90)).toHaveLength(1);
  });
});
