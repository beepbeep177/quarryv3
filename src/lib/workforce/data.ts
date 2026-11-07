/** Supabase loaders shared by the Workforce screens, plus the pure glue that builds timecards. */
import { addDaysToDateKey } from '../date';
import type {
  WfEmployeeRateRow,
  WfEmployeeRow,
  WfHolidayRow,
  WfPunchRow,
  WfSettingsRow,
  WfShiftRow,
  WfTimecardOverrideRow,
} from '../database.types';
import { fetchAllPages } from '../fetchAll';
import { supabase } from '../supabase';
import { computeTimecard, type EmployeeTimecard } from './timecard';
import {
  rulesFromSettingsRow,
  shiftFromRow,
  type EmployeeRule,
  type Holiday,
  type PayRules,
  type ShiftRule,
  type TimecardOverride,
} from './types';

export interface WorkforceBasics {
  settings: WfSettingsRow | null;
  rules: PayRules;
  shifts: WfShiftRow[];
  employees: WfEmployeeRow[];
  holidays: WfHolidayRow[];
}

export async function loadWorkforceBasics(): Promise<{ data: WorkforceBasics | null; error: string | null }> {
  const [settings, shifts, employees, holidays] = await Promise.all([
    supabase.from('wf_settings').select('*').limit(1).maybeSingle(),
    supabase.from('wf_shifts').select('*').order('name'),
    fetchAllPages<WfEmployeeRow>(async (from, to) => await supabase.from('wf_employees').select('*').order('full_name').range(from, to)),
    supabase.from('wf_holidays').select('*').order('holiday_date'),
  ]);
  const error = settings.error ?? shifts.error ?? employees.error ?? holidays.error;
  if (error) return { data: null, error: error.message };
  return {
    data: {
      settings: settings.data,
      rules: rulesFromSettingsRow(settings.data),
      shifts: shifts.data ?? [],
      employees: employees.data,
      holidays: holidays.data ?? [],
    },
    error: null,
  };
}

/** Punches for work dates dateFrom..dateTo. Loads one extra day so night-shift out-punches are included. */
export async function loadPunches(dateFrom: string, dateTo: string) {
  return fetchAllPages<Pick<WfPunchRow, 'employee_id' | 'punched_at'>>(async (from, to) => await supabase
    .from('wf_punches')
    .select('employee_id, punched_at')
    .gte('punched_at', `${dateFrom}T00:00:00`)
    .lt('punched_at', `${addDaysToDateKey(dateTo, 2)}T00:00:00`)
    .order('punched_at')
    .order('id')
    .range(from, to));
}

export async function loadOverrides(dateFrom: string, dateTo: string) {
  return fetchAllPages<WfTimecardOverrideRow>(async (from, to) => await supabase
    .from('wf_timecard_overrides')
    .select('*')
    .gte('work_date', dateFrom)
    .lte('work_date', dateTo)
    .order('work_date')
    .range(from, to));
}

export async function loadRateHistory() {
  return fetchAllPages<WfEmployeeRateRow>(async (from, to) => await supabase
    .from('wf_employee_rates')
    .select('*')
    .order('effective_from', { ascending: false })
    .range(from, to));
}

export async function loadCaBalances(): Promise<{ data: Map<string, number>; error: string | null }> {
  const { data, error } = await supabase.from('wf_cash_advance_balances').select('employee_id, balance');
  if (error) return { data: new Map(), error: error.message };
  return { data: new Map((data ?? []).map(row => [row.employee_id, Number(row.balance)])), error: null };
}

export function holidaysFromRows(rows: WfHolidayRow[]): Holiday[] {
  return rows.map(row => ({ date: row.holiday_date, name: row.name, type: row.type }));
}

export function overrideFromRow(row: WfTimecardOverrideRow): TimecardOverride {
  return {
    workDate: row.work_date,
    daysCredit: row.days_credit === null ? null : Number(row.days_credit),
    otHours: row.ot_hours === null ? null : Number(row.ot_hours),
    ndHours: row.nd_hours === null ? null : Number(row.nd_hours),
    reason: row.reason,
  };
}

export function employeeRule(employee: WfEmployeeRow, shiftsById: Map<string, ShiftRule>): EmployeeRule {
  return {
    id: employee.id,
    payType: employee.pay_type,
    otEligible: employee.ot_eligible,
    shift: employee.shift_id ? shiftsById.get(employee.shift_id) ?? null : null,
  };
}

/** Builds timecards for active employees and anyone with punches or overrides in the period. */
export function buildTimecards(input: {
  employees: WfEmployeeRow[];
  shifts: WfShiftRow[];
  punches: Pick<WfPunchRow, 'employee_id' | 'punched_at'>[];
  overrides: WfTimecardOverrideRow[];
  holidays: WfHolidayRow[];
  rules: PayRules;
  dateFrom: string;
  dateTo: string;
}): Map<string, EmployeeTimecard> {
  const shiftsById = new Map(input.shifts.map(shift => [shift.id, shiftFromRow(shift)]));
  const punchesByEmployee = new Map<string, string[]>();
  for (const punch of input.punches) {
    const list = punchesByEmployee.get(punch.employee_id) ?? [];
    list.push(punch.punched_at);
    punchesByEmployee.set(punch.employee_id, list);
  }
  const overridesByEmployee = new Map<string, TimecardOverride[]>();
  for (const row of input.overrides) {
    const list = overridesByEmployee.get(row.employee_id) ?? [];
    list.push(overrideFromRow(row));
    overridesByEmployee.set(row.employee_id, list);
  }
  const holidays = holidaysFromRows(input.holidays);
  const cards = new Map<string, EmployeeTimecard>();
  for (const employee of input.employees) {
    const punches = punchesByEmployee.get(employee.id) ?? [];
    const overrides = overridesByEmployee.get(employee.id) ?? [];
    if (employee.status !== 'active' && punches.length === 0 && overrides.length === 0) continue;
    cards.set(employee.id, computeTimecard({
      employee: employeeRule(employee, shiftsById),
      punches,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      rules: input.rules,
      holidays,
      overrides,
    }));
  }
  return cards;
}
