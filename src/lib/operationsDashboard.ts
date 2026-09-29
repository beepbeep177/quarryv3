import type {
  QuarrySiteDailyEntry,
  SandWashingDailyEntry,
  StoneCrusherDailyEntry,
  WobblerDailyEntry,
} from './database.types';
import { getWobblerStatus } from './wobblerOperations';

export type OperationsModuleKey = 'stoneCrusher' | 'sandWashing' | 'quarrySite' | 'wobbler';
export type OperationsStatus = 'Completed' | 'With Downtime' | 'Needs Review' | 'No Operation';

export interface OperationsAccess {
  stoneCrusher: boolean;
  sandWashing: boolean;
  quarrySite: boolean;
  wobbler: boolean;
}

export interface OperationsData {
  stoneCrusher: StoneCrusherDailyEntry[];
  sandWashing: SandWashingDailyEntry[];
  quarrySite: QuarrySiteDailyEntry[];
  wobbler: WobblerDailyEntry[];
}

export interface OperationsDaySummary {
  date: string;
  expectedCount: number;
  submittedCount: number;
  completenessPercent: number;
  totalDieselLiters: number;
  totalOperationMinutes: number;
  totalDowntimeMinutes: number;
  stoneCrusher: {
    status: OperationsStatus;
    entry: StoneCrusherDailyEntry | null;
  };
  sandWashing: {
    status: OperationsStatus;
    entry: SandWashingDailyEntry | null;
  };
  quarrySite: {
    status: OperationsStatus;
    entry: QuarrySiteDailyEntry | null;
  };
  wobbler: {
    status: OperationsStatus;
    entry: WobblerDailyEntry | null;
  };
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function hasRecordedBreakdown(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized !== '' && normalized !== 'no trouble' && normalized !== 'no breakdown';
}

function stoneCrusherStatus(entry: StoneCrusherDailyEntry | null): OperationsStatus {
  if (!entry) return 'No Operation';
  if (entry.operation_minutes === 0 && entry.total_dumps === 0) return 'No Operation';
  if (entry.downtime_minutes > 0 || hasRecordedBreakdown(entry.breakdown)) return 'With Downtime';
  return 'Completed';
}

function sandWashingStatus(entry: SandWashingDailyEntry | null): OperationsStatus {
  if (!entry) return 'No Operation';
  if (entry.product === 'No Operation' || (entry.operation_minutes === 0 && entry.number_of_dumps === 0)) {
    return 'No Operation';
  }
  if (
    (entry.operation_minutes > 0 && entry.number_of_dumps === 0)
    || (entry.operation_minutes === 0 && entry.number_of_dumps > 0)
  ) return 'Needs Review';
  return 'Completed';
}

function quarrySiteStatus(entry: QuarrySiteDailyEntry | null): OperationsStatus {
  if (!entry) return 'No Operation';
  const hasTrips = entry.jafcor_binder_trips > 0 || entry.jafcor_boulder_trips > 0;
  const hasDiesel = entry.total_diesel_consumption_liters > 0 || entry.quarry_equipment_diesel_liters > 0;
  if (!hasTrips && !hasDiesel && !entry.number_of_trucks && entry.number_of_equipment === 0) return 'No Operation';
  if (!hasTrips && hasDiesel) return 'Needs Review';
  return 'Completed';
}

function wobblerStatus(entry: WobblerDailyEntry | null): OperationsStatus {
  if (!entry) return 'No Operation';
  const status = getWobblerStatus({
    operationMinutes: entry.operation_minutes,
    downtimeMinutes: entry.downtime_minutes,
    dumps: entry.number_of_dumps,
    loaders: entry.number_of_loaders,
    breakdown: entry.breakdown,
  });
  return status;
}

export function buildOperationsDaySummary(
  date: string,
  data: OperationsData,
  access: OperationsAccess,
): OperationsDaySummary {
  const stoneCrusher = access.stoneCrusher
    ? data.stoneCrusher.find(entry => entry.entry_date === date) ?? null
    : null;
  const sandWashing = access.sandWashing
    ? data.sandWashing.find(entry => entry.entry_date === date) ?? null
    : null;
  const quarrySite = access.quarrySite
    ? data.quarrySite.find(entry => entry.entry_date === date) ?? null
    : null;
  const wobbler = access.wobbler
    ? data.wobbler.find(entry => entry.entry_date === date) ?? null
    : null;

  const expectedCount = Object.values(access).filter(Boolean).length;
  const submittedCount = [stoneCrusher, sandWashing, quarrySite, wobbler].filter(Boolean).length;

  return {
    date,
    expectedCount,
    submittedCount,
    completenessPercent: expectedCount > 0 ? round2((submittedCount / expectedCount) * 100) : 0,
    totalDieselLiters: round2(
      (stoneCrusher?.genset_diesel_consumption ?? 0)
      + (sandWashing?.genset_diesel_consumption_liters ?? 0)
      + (quarrySite?.total_diesel_consumption_liters ?? 0)
      + (wobbler?.genset_diesel_consumption_liters ?? 0),
    ),
    totalOperationMinutes:
      (stoneCrusher?.operation_minutes ?? 0)
      + (sandWashing?.operation_minutes ?? 0)
      + (wobbler?.operation_minutes ?? 0),
    totalDowntimeMinutes:
      (stoneCrusher?.downtime_minutes ?? 0)
      + (wobbler?.downtime_minutes ?? 0),
    stoneCrusher: { status: access.stoneCrusher ? stoneCrusherStatus(stoneCrusher) : 'No Operation', entry: stoneCrusher },
    sandWashing: { status: access.sandWashing ? sandWashingStatus(sandWashing) : 'No Operation', entry: sandWashing },
    quarrySite: { status: access.quarrySite ? quarrySiteStatus(quarrySite) : 'No Operation', entry: quarrySite },
    wobbler: { status: access.wobbler ? wobblerStatus(wobbler) : 'No Operation', entry: wobbler },
  };
}

export function buildOperationsDaySummaries(
  dates: string[],
  data: OperationsData,
  access: OperationsAccess,
) {
  return dates.map(date => buildOperationsDaySummary(date, data, access));
}

export function getAccessibleModuleKeys(access: OperationsAccess): OperationsModuleKey[] {
  return (Object.keys(access) as OperationsModuleKey[]).filter(key => access[key]);
}
