import { describe, expect, it } from 'vitest';
import { calculateStoneCrusherVolumes, deriveStoneCrusherRate } from './stoneCrusherOperations';

describe('calculateStoneCrusherVolumes', () => {
  it('calculates each product volume and plant capacity from daily output rates', () => {
    expect(calculateStoneCrusherVolumes(240, {
      g1: 22.5,
      threeFourth: 12.5,
      sThreeFourth: 40,
      s1c: 10,
    })).toEqual({
      operationMinutes: 240,
      operationHours: 4,
      rates: {
        g1: 22.5,
        threeFourth: 12.5,
        sThreeFourth: 40,
        s1c: 10,
      },
      volumes: {
        g1: 90,
        threeFourth: 50,
        sThreeFourth: 160,
        s1c: 40,
      },
      totalVolume: 340,
      plantCapacityCbmPerHour: 85,
    });
  });

  it('uses whole operation minutes and allows products with a zero rate', () => {
    const result = calculateStoneCrusherVolumes(153.4, {
      g1: 43,
      threeFourth: 0,
      sThreeFourth: 29,
      s1c: -10,
    });

    expect(result.operationMinutes).toBe(153);
    expect(result.volumes).toEqual({
      g1: 109.65,
      threeFourth: 0,
      sThreeFourth: 73.95,
      s1c: 0,
    });
    expect(result.totalVolume).toBe(183.6);
    expect(result.plantCapacityCbmPerHour).toBe(72);
  });

  it('returns zero volumes and capacity when there is no operation time', () => {
    const result = calculateStoneCrusherVolumes(0, {
      g1: 22.5,
      threeFourth: 12.5,
      sThreeFourth: 40,
      s1c: 10,
    });

    expect(result.totalVolume).toBe(0);
    expect(result.plantCapacityCbmPerHour).toBe(0);
  });
});

describe('deriveStoneCrusherRate', () => {
  it('keeps a stored rate and derives a legacy rate from volume when needed', () => {
    expect(deriveStoneCrusherRate(21.25, 90, 240)).toBe(21.25);
    expect(deriveStoneCrusherRate(null, 90, 240)).toBe(22.5);
    expect(deriveStoneCrusherRate(null, 90, 0)).toBe(0);
  });
});
