/**
 * Timecard engine: turns raw biometric punches into day credits, overtime and
 * night differential using the client's rules (see docs/workforce-module.md).
 *
 * Pure functions only. Times are Philippine local wall-clock values, handled as
 * whole minutes so there is no timezone drift.
 */
import type { EmployeeRule, Holiday, OtRounding, PayRules, ShiftRule, TimecardOverride } from './types';

export type DayException = 'single_punch' | 'missing_out_punch' | 'no_shift';

export const EXCEPTION_LABELS: Record<DayException, string> = {
  single_punch: 'Single punch',
  missing_out_punch: 'Missing out-punch',
  no_shift: 'No shift assigned',
};

export interface DayValues {
  daysCredit: number;
  otHours: number;
  ndHours: number;
}

export interface DayResult extends DayValues {
  date: string;
  /** Deduplicated punches as minutes from the work date's midnight (can exceed 1440 for night shifts). */
  punchMinutes: number[];
  rawPunchCount: number;
  workedMinutes: number;
  lateMinutes: number;
  /** Values computed from first/last punch, before exceptions and overrides. */
  computed: DayValues;
  exception: DayException | null;
  override: TimecardOverride | null;
  holiday: Holiday | null;
}

export interface TimecardSummary {
  days: number;
  otHours: number;
  ndHours: number;
  regHolidays: number;
  specialHolidaysWorked: number;
  exceptions: number;
  lateMinutes: number;
  daysPresent: number;
}

export interface EmployeeTimecard {
  days: DayResult[];
  summary: TimecardSummary;
}

const DAY = 1440;

export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

export function minutesToLabel(minutes: number): string {
  const nextDay = minutes >= DAY;
  const within = ((minutes % DAY) + DAY) % DAY;
  const label = `${String(Math.floor(within / 60)).padStart(2, '0')}:${String(within % 60).padStart(2, '0')}`;
  return nextDay ? `${label} (+1)` : label;
}

function dayIndex(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

function dateFromIndex(index: number): string {
  return new Date(index * 86_400_000).toISOString().slice(0, 10);
}

/** Inclusive list of YYYY-MM-DD keys. */
export function datesInRange(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  for (let index = dayIndex(dateFrom); index <= dayIndex(dateTo); index++) dates.push(dateFromIndex(index));
  return dates;
}

/** Accepts "YYYY-MM-DD HH:MM[:SS]" or the "T" form Postgres returns. Returns absolute minutes. */
export function parsePunchTimestamp(value: string): number {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})/);
  if (!match) throw new Error(`Invalid punch timestamp: ${value}`);
  return dayIndex(match[1]) * DAY + Number(match[2]) * 60 + Number(match[3]);
}

/** Collapses punches within `windowMinutes` of the last kept punch (double taps on the device). */
export function dedupePunches(sortedMinutes: number[], windowMinutes: number): number[] {
  const kept: number[] = [];
  for (const minute of sortedMinutes) {
    const last = kept[kept.length - 1];
    if (last !== undefined && minute - last <= windowMinutes) continue;
    kept.push(minute);
  }
  return kept;
}

/**
 * For shifts that cross midnight, punches before the midpoint of the off-duty
 * gap belong to the previous work date (19:00-04:00 shift: cutoff 11:30).
 */
export function workDateCutoff(shift: ShiftRule | null): number {
  if (!shift?.crossesMidnight) return 0;
  const start = timeToMinutes(shift.startTime);
  const end = timeToMinutes(shift.endTime);
  return end < start ? Math.floor((end + start) / 2) : 0;
}

/** Groups absolute punch minutes by work date, deduplicated. */
export function groupPunchesByWorkDate(absoluteMinutes: number[], shift: ShiftRule | null, dedupeMinutes: number) {
  const sorted = dedupePunches([...absoluteMinutes].sort((a, b) => a - b), dedupeMinutes);
  const raw = new Map<string, number>();
  const grouped = new Map<string, number[]>();
  const cutoff = workDateCutoff(shift);
  for (const absolute of [...absoluteMinutes].sort((a, b) => a - b)) {
    const index = Math.floor(absolute / DAY);
    const workIndex = absolute - index * DAY < cutoff ? index - 1 : index;
    const date = dateFromIndex(workIndex);
    raw.set(date, (raw.get(date) ?? 0) + 1);
  }
  for (const absolute of sorted) {
    const index = Math.floor(absolute / DAY);
    const workIndex = absolute - index * DAY < cutoff ? index - 1 : index;
    const date = dateFromIndex(workIndex);
    const list = grouped.get(date) ?? [];
    list.push(absolute - workIndex * DAY);
    grouped.set(date, list);
  }
  return { grouped, raw };
}

function overlap(startA: number, endA: number, startB: number, endB: number): number {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

export function roundOtHours(minutes: number, rounding: OtRounding): number {
  if (minutes <= 0) return 0;
  switch (rounding) {
    case 'floor_hour': return Math.floor(minutes / 60);
    case 'floor_half_hour': return Math.floor(minutes / 30) / 2;
    case 'exact': return Math.round((minutes / 60) * 100) / 100;
    case 'nearest_hour':
    default: return Math.round(minutes / 60);
  }
}

/** Minutes of [start, end] that fall inside the night-differential window on any day. */
export function nightMinutes(start: number, end: number, rules: Pick<PayRules, 'ndStart' | 'ndEnd'>): number {
  if (end <= start) return 0;
  const windowStart = timeToMinutes(rules.ndStart);
  let windowEnd = timeToMinutes(rules.ndEnd);
  if (windowEnd <= windowStart) windowEnd += DAY;
  let total = 0;
  const firstDay = Math.floor(start / DAY) - 1;
  const lastDay = Math.floor(end / DAY) + 1;
  for (let day = firstDay; day <= lastDay; day++) {
    total += overlap(start, end, day * DAY + windowStart, day * DAY + windowEnd);
  }
  return total;
}

interface ComputedDay {
  values: DayValues;
  workedMinutes: number;
  lateMinutes: number;
}

/** Steps 3-8: first/last punch against the shift. */
export function computeFromFirstLast(first: number, last: number, employee: EmployeeRule, shift: ShiftRule, rules: PayRules): ComputedDay {
  const shiftStart = timeToMinutes(shift.startTime);
  let shiftEnd = timeToMinutes(shift.endTime);
  if (shift.crossesMidnight || shiftEnd <= shiftStart) shiftEnd += DAY;
  let breakStart = timeToMinutes(shift.breakStart);
  if (breakStart < shiftStart && (shift.crossesMidnight || shiftEnd > DAY)) breakStart += DAY;
  const breakEnd = breakStart + shift.breakMinutes;

  // Early arrival earns nothing.
  const effectiveStart = Math.max(first, shiftStart);
  const span = Math.max(0, last - effectiveStart);
  const breakTaken = overlap(effectiveStart, last, breakStart, breakEnd);
  const workedMinutes = Math.max(0, span - breakTaken);

  const daysCredit = workedMinutes >= shift.halfDayMinHours * 60 ? 1 : workedMinutes > 0 ? 0.5 : 0;

  let otHours = 0;
  if (employee.otEligible && employee.payType === 'daily' && workedMinutes > 0) {
    // OT is work beyond 8 hours: late arrivals push the OT start later.
    const otStart = Math.max(shiftEnd, effectiveStart + 8 * 60 + shift.breakMinutes);
    otHours = roundOtHours(last - otStart, shift.otRounding);
  }

  // ND counts whole hours only: from 21:00, the first hour is credited at 22:00 (client note).
  const ndHours = workedMinutes > 0 ? Math.floor(nightMinutes(effectiveStart, last, rules) / 60) : 0;

  return {
    values: { daysCredit, otHours, ndHours },
    workedMinutes,
    lateMinutes: Math.max(0, first - shiftStart),
  };
}

function applyOverride(values: DayValues, override: TimecardOverride | null): DayValues {
  if (!override) return values;
  return {
    daysCredit: override.daysCredit ?? values.daysCredit,
    otHours: override.otHours ?? values.otHours,
    ndHours: override.ndHours ?? values.ndHours,
  };
}

const ZERO: DayValues = { daysCredit: 0, otHours: 0, ndHours: 0 };

/** One employee, one work date. `punchMinutes` must already be deduplicated and sorted. */
export function computeDay(input: {
  date: string;
  punchMinutes: number[];
  rawPunchCount?: number;
  employee: EmployeeRule;
  rules: PayRules;
  override?: TimecardOverride | null;
  holiday?: Holiday | null;
}): DayResult {
  const { date, punchMinutes, employee, rules } = input;
  const override = input.override ?? null;
  const base = {
    date,
    punchMinutes,
    rawPunchCount: input.rawPunchCount ?? punchMinutes.length,
    override,
    holiday: input.holiday ?? null,
  };

  if (punchMinutes.length === 0) {
    return { ...base, ...applyOverride(ZERO, override), computed: ZERO, workedMinutes: 0, lateMinutes: 0, exception: null };
  }

  const shift = employee.shift;
  if (!shift) {
    return { ...base, ...applyOverride(ZERO, override), computed: ZERO, workedMinutes: 0, lateMinutes: 0, exception: 'no_shift' };
  }

  if (punchMinutes.length === 1) {
    return { ...base, ...applyOverride(ZERO, override), computed: ZERO, workedMinutes: 0, lateMinutes: Math.max(0, punchMinutes[0] - timeToMinutes(shift.startTime)), exception: 'single_punch' };
  }

  const computed = computeFromFirstLast(punchMinutes[0], punchMinutes[punchMinutes.length - 1], employee, shift, rules);
  const exception: DayException | null = punchMinutes.length % 2 === 1 ? 'missing_out_punch' : null;
  const effective = exception ? ZERO : computed.values;

  return {
    ...base,
    ...applyOverride(effective, override),
    computed: computed.values,
    workedMinutes: computed.workedMinutes,
    lateMinutes: computed.lateMinutes,
    exception,
  };
}

export function isUnresolvedException(day: DayResult): boolean {
  return day.exception !== null && day.override === null;
}

/** All dates of a period for one employee, plus the period summary. */
export function computeTimecard(input: {
  employee: EmployeeRule;
  /** "YYYY-MM-DD HH:MM[:SS]" timestamps. Load through dateTo + 1 day for night shifts. */
  punches: string[];
  dateFrom: string;
  dateTo: string;
  rules: PayRules;
  holidays: Holiday[];
  overrides: TimecardOverride[];
}): EmployeeTimecard {
  const { employee, rules, dateFrom, dateTo } = input;
  const absolute = input.punches.map(parsePunchTimestamp);
  const { grouped, raw } = groupPunchesByWorkDate(absolute, employee.shift, rules.punchDedupeMinutes);
  const holidayByDate = new Map(input.holidays.map(holiday => [holiday.date, holiday]));
  const overrideByDate = new Map(input.overrides.map(override => [override.workDate, override]));

  const days = datesInRange(dateFrom, dateTo).map(date => computeDay({
    date,
    punchMinutes: grouped.get(date) ?? [],
    rawPunchCount: raw.get(date) ?? 0,
    employee,
    rules,
    override: overrideByDate.get(date) ?? null,
    holiday: holidayByDate.get(date) ?? null,
  }));

  return { days, summary: summarizeTimecard(days, employee, dateFrom, dateTo, input.holidays) };
}

export function summarizeTimecard(days: DayResult[], employee: EmployeeRule, dateFrom: string, dateTo: string, holidays: Holiday[]): TimecardSummary {
  const credited = days.filter(day => day.daysCredit > 0);
  const sum = (pick: (day: DayResult) => number) => Math.round(days.reduce((total, day) => total + pick(day), 0) * 100) / 100;
  const isFixed = employee.payType === 'fixed';
  const regularInPeriod = holidays.filter(holiday => holiday.type === 'regular' && holiday.date >= dateFrom && holiday.date <= dateTo);

  return {
    days: isFixed ? datesInRange(dateFrom, dateTo).length : sum(day => day.daysCredit),
    otHours: isFixed ? 0 : sum(day => day.otHours),
    ndHours: sum(day => day.ndHours),
    // Regular holidays are paid to daily workers who worked at least one day in the period.
    regHolidays: !isFixed && credited.length > 0 ? regularInPeriod.length : 0,
    specialHolidaysWorked: sum(day => (day.holiday?.type === 'special' ? day.daysCredit : 0)),
    exceptions: days.filter(isUnresolvedException).length,
    lateMinutes: days.reduce((total, day) => total + day.lateMinutes, 0),
    daysPresent: credited.length,
  };
}
