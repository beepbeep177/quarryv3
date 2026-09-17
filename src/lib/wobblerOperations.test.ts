import { describe, expect, it } from 'vitest';
import { calculateWobblerMetrics, getWobblerStatus } from './wobblerOperations';

describe('calculateWobblerMetrics', () => {
  it('converts decimal hours and calculates daily productivity rates', () => {
    expect(calculateWobblerMetrics({
      operationHours: 4,
      downtimeHours: 1,
      dumps: 80,
      loaders: 2,
      dieselLiters: 100,
      breakdown: 'No Trouble',
    })).toEqual({
      operationMinutes: 240,
      downtimeMinutes: 60,
      operationHours: 4,
      downtimeHours: 1,
      trackedHours: 5,
      dumps: 80,
      loaders: 2,
      dieselLiters: 100,
      dumpsPerHour: 20,
      dieselLitersPerHour: 25,
      status: 'With Downtime',
    });
  });

  it('rounds decimal hours to whole minutes and prevents negative values', () => {
    const metrics = calculateWobblerMetrics({
      operationHours: 2.555,
      downtimeHours: -1,
      dumps: -10,
      loaders: -2,
      dieselLiters: -20,
      breakdown: '',
    });

    expect(metrics.operationMinutes).toBe(153);
    expect(metrics.operationHours).toBe(2.55);
    expect(metrics.downtimeMinutes).toBe(0);
    expect(metrics.dumps).toBe(0);
    expect(metrics.loaders).toBe(0);
    expect(metrics.dieselLiters).toBe(0);
    expect(metrics.status).toBe('Needs Review');
  });
});

describe('getWobblerStatus', () => {
  it('marks a consistent operating record as completed', () => {
    expect(getWobblerStatus({
      operationMinutes: 240,
      downtimeMinutes: 0,
      dumps: 32,
      loaders: 2,
      breakdown: 'No Trouble',
    })).toBe('Completed');
  });

  it('marks a recorded equipment problem as with downtime', () => {
    expect(getWobblerStatus({
      operationMinutes: 120,
      downtimeMinutes: 0,
      dumps: 45,
      loaders: 1,
      breakdown: 'Repair Chain',
    })).toBe('With Downtime');
  });

  it('marks inconsistent activity as needing review', () => {
    expect(getWobblerStatus({
      operationMinutes: 120,
      downtimeMinutes: 0,
      dumps: 45,
      loaders: 0,
      breakdown: '',
    })).toBe('Needs Review');
  });

  it('marks an empty daily record as no work', () => {
    expect(getWobblerStatus({
      operationMinutes: 0,
      downtimeMinutes: 0,
      dumps: 0,
      loaders: 0,
      breakdown: '',
    })).toBe('No Work');
  });
});
