/** Shared Workforce rule types. All times are "HH:MM" in Philippine local time. */

export type OtRounding = 'nearest_hour' | 'floor_hour' | 'floor_half_hour' | 'exact';
export type PayType = 'daily' | 'fixed';
export type HolidayType = 'regular' | 'special';

export interface PayRules {
  otMultiplier: number;
  ndRate: number;
  ndStart: string;
  ndEnd: string;
  specialHolidayPremium: number;
  punchDedupeMinutes: number;
  minDailyWage: number;
}

export interface ShiftRule {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  breakStart: string;
  breakMinutes: number;
  halfDayMinHours: number;
  otRounding: OtRounding;
  crossesMidnight: boolean;
}

export interface EmployeeRule {
  id: string;
  payType: PayType;
  otEligible: boolean;
  shift: ShiftRule | null;
}

export interface Holiday {
  date: string;
  name: string;
  type: HolidayType;
}

export interface TimecardOverride {
  workDate: string;
  daysCredit: number | null;
  otHours: number | null;
  ndHours: number | null;
  reason: string;
}

/** The client's current manual process. Law minimums are noted in the Settings screen. */
export const DEFAULT_PAY_RULES: PayRules = {
  otMultiplier: 1,
  ndRate: 0.1,
  ndStart: '21:00',
  ndEnd: '06:00',
  specialHolidayPremium: 0.3,
  punchDedupeMinutes: 5,
  minDailyWage: 600,
};

export const LAW_OT_MULTIPLIER = 1.25;
export const LAW_ND_START = '22:00';
export const LAW_ND_RATE = 0.1;
export const LAW_SPECIAL_HOLIDAY_PREMIUM = 0.3;

/** Trims seconds from Postgres time values ("07:00:00" -> "07:00"). */
export function hhmm(value: string | null | undefined): string {
  return (value ?? '').slice(0, 5);
}

export function rulesFromSettingsRow(row: {
  ot_multiplier: number; nd_rate: number; nd_start: string; nd_end: string;
  special_holiday_premium: number; punch_dedupe_minutes: number; min_daily_wage: number;
} | null | undefined): PayRules {
  if (!row) return DEFAULT_PAY_RULES;
  return {
    otMultiplier: Number(row.ot_multiplier),
    ndRate: Number(row.nd_rate),
    ndStart: hhmm(row.nd_start),
    ndEnd: hhmm(row.nd_end),
    specialHolidayPremium: Number(row.special_holiday_premium),
    punchDedupeMinutes: Number(row.punch_dedupe_minutes),
    minDailyWage: Number(row.min_daily_wage),
  };
}

export function shiftFromRow(row: {
  id: string; name: string; start_time: string; end_time: string; break_start: string;
  break_minutes: number; half_day_min_hours: number; ot_rounding: string; crosses_midnight: boolean;
}): ShiftRule {
  return {
    id: row.id,
    name: row.name,
    startTime: hhmm(row.start_time),
    endTime: hhmm(row.end_time),
    breakStart: hhmm(row.break_start),
    breakMinutes: Number(row.break_minutes),
    halfDayMinHours: Number(row.half_day_min_hours),
    otRounding: row.ot_rounding as OtRounding,
    crossesMidnight: row.crosses_midnight,
  };
}
