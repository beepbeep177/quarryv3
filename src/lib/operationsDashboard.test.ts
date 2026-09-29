import { describe, expect, it } from 'vitest';
import type {
  QuarrySiteDailyEntry,
  SandWashingDailyEntry,
  StoneCrusherDailyEntry,
  WobblerDailyEntry,
} from './database.types';
import { buildOperationsDaySummary, type OperationsAccess, type OperationsData } from './operationsDashboard';

const access: OperationsAccess = {
  stoneCrusher: true,
  sandWashing: true,
  quarrySite: true,
  wobbler: true,
};

const emptyData: OperationsData = {
  stoneCrusher: [],
  sandWashing: [],
  quarrySite: [],
  wobbler: [],
};

function entry<T>(value: Partial<T>): T {
  return value as T;
}

describe('buildOperationsDaySummary', () => {
  it('distinguishes saved no-operation records from missing entries', () => {
    const data: OperationsData = {
      ...emptyData,
      stoneCrusher: [entry<StoneCrusherDailyEntry>({
        entry_date: '2026-09-17', operation_minutes: 0, downtime_minutes: 0,
        total_dumps: 0, breakdown: '', genset_diesel_consumption: 0,
      })],
    };

    const result = buildOperationsDaySummary('2026-09-17', data, access);

    expect(result.submittedCount).toBe(1);
    expect(result.completenessPercent).toBe(25);
    expect(result.stoneCrusher.status).toBe('No Operation');
    expect(result.sandWashing.status).toBe('No Operation');
  });

  it('combines diesel without mixing output units', () => {
    const data: OperationsData = {
      stoneCrusher: [entry<StoneCrusherDailyEntry>({
        entry_date: '2026-09-17', operation_minutes: 240, downtime_minutes: 30,
        total_dumps: 10, breakdown: 'Belt adjustment', genset_diesel_consumption: 100,
      })],
      sandWashing: [entry<SandWashingDailyEntry>({
        entry_date: '2026-09-17', product: 'Vibro', operation_minutes: 240,
        number_of_dumps: 8, genset_diesel_consumption_liters: 80,
      })],
      quarrySite: [entry<QuarrySiteDailyEntry>({
        entry_date: '2026-09-17', jafcor_binder_trips: 2, jafcor_boulder_trips: 3,
        total_diesel_consumption_liters: 140, quarry_equipment_diesel_liters: 40,
        number_of_trucks: '4', number_of_equipment: 1,
      })],
      wobbler: [entry<WobblerDailyEntry>({
        entry_date: '2026-09-17', operation_minutes: 180, downtime_minutes: 0,
        number_of_dumps: 9, number_of_loaders: 1, breakdown: '',
        genset_diesel_consumption_liters: 60,
      })],
    };

    const result = buildOperationsDaySummary('2026-09-17', data, access);

    expect(result.totalDieselLiters).toBe(380);
    expect(result.totalOperationMinutes).toBe(660);
    expect(result.totalDowntimeMinutes).toBe(30);
    expect(result.stoneCrusher.status).toBe('With Downtime');
    expect(result.submittedCount).toBe(4);
  });

  it('uses only modules visible to the current user in completeness', () => {
    const result = buildOperationsDaySummary('2026-09-17', emptyData, {
      stoneCrusher: true,
      sandWashing: false,
      quarrySite: false,
      wobbler: true,
    });

    expect(result.expectedCount).toBe(2);
    expect(result.completenessPercent).toBe(0);
  });

  it('maps inconsistent and diesel-only entries to needs review', () => {
    const data: OperationsData = {
      ...emptyData,
      sandWashing: [entry<SandWashingDailyEntry>({
        entry_date: '2026-09-17', product: 'Vibro', operation_minutes: 120,
        number_of_dumps: 0, genset_diesel_consumption_liters: 20,
      })],
      quarrySite: [entry<QuarrySiteDailyEntry>({
        entry_date: '2026-09-17', jafcor_binder_trips: 0, jafcor_boulder_trips: 0,
        total_diesel_consumption_liters: 20, quarry_equipment_diesel_liters: 20,
        number_of_trucks: '', number_of_equipment: 1,
      })],
    };

    const result = buildOperationsDaySummary('2026-09-17', data, access);
    expect(result.sandWashing.status).toBe('Needs Review');
    expect(result.quarrySite.status).toBe('Needs Review');
  });
});
