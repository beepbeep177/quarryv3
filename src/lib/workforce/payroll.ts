/**
 * Payroll engine. Mirrors the client's Salary.xlsx:
 *   RATE PER HR = rate / 8
 *   WEEKLY PAY  = days x rate
 *   O.T PAY     = OT hrs x rate per hr x OT multiplier
 *   NIGHT DIF   = ND hrs x rate per hr x ND rate
 *   HOLIDAY PAY = regular holidays x rate + special worked x rate x special premium
 *   NET SALARY  = total salary - C.A - SSS - PhilHealth - Pag-IBIG - other
 */
import { addDaysToDateKey } from '../date';
import type { PayRules, PayType } from './types';

export interface PayInputs {
  dailyRate: number;
  days: number;
  otHours: number;
  ndHours: number;
  regHolidays: number;
  specialHolidaysWorked: number;
  caDeduction: number;
  sss: number;
  philhealth: number;
  pagibig: number;
  otherDeductions: number;
}

export interface PayAmounts {
  hourlyRate: number;
  basicPay: number;
  otPay: number;
  ndPay: number;
  holidayPay: number;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
}

export interface PayrollLine extends PayInputs, PayAmounts {
  employeeId: string;
  employeeName: string;
  biometricId: string;
  payType: PayType;
  remarks: string;
}

export type PayRules4Payroll = Pick<PayRules, 'otMultiplier' | 'ndRate' | 'specialHolidayPremium'>;

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function safe(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function computePay(inputs: PayInputs, rules: PayRules4Payroll): PayAmounts {
  const rate = safe(inputs.dailyRate);
  const hourly = rate / 8;
  const basicPay = round2(safe(inputs.days) * rate);
  const otPay = round2(safe(inputs.otHours) * hourly * rules.otMultiplier);
  const ndPay = round2(safe(inputs.ndHours) * hourly * rules.ndRate);
  const holidayPay = round2(safe(inputs.regHolidays) * rate + safe(inputs.specialHolidaysWorked) * rate * rules.specialHolidayPremium);
  const grossPay = round2(basicPay + otPay + ndPay + holidayPay);
  const totalDeductions = round2(
    safe(inputs.caDeduction) + safe(inputs.sss) + safe(inputs.philhealth) + safe(inputs.pagibig) + safe(inputs.otherDeductions),
  );
  return {
    hourlyRate: round2(hourly),
    basicPay,
    otPay,
    ndPay,
    holidayPay,
    grossPay,
    totalDeductions,
    netPay: round2(grossPay - totalDeductions),
  };
}

/** C.A deduction default: the per-payroll amount, never more than what is still owed. */
export function prefillCaDeduction(balance: number, perPayroll: number): number {
  return round2(Math.max(0, Math.min(safe(balance), safe(perPayroll))));
}

export interface RateHistoryEntry {
  employeeId: string;
  dailyRate: number;
  effectiveFrom: string;
}

/** Rate in effect on `onDate` (latest effective_from on or before it), or null. */
export function rateOn(history: RateHistoryEntry[], employeeId: string, onDate: string): number | null {
  let best: RateHistoryEntry | null = null;
  for (const entry of history) {
    if (entry.employeeId !== employeeId || entry.effectiveFrom > onDate) continue;
    if (!best || entry.effectiveFrom > best.effectiveFrom) best = entry;
  }
  return best ? Number(best.dailyRate) : null;
}

export type RateWarning = 'no_rate' | 'below_minimum';

export function rateWarning(rate: number | null, payType: PayType, minDailyWage: number): RateWarning | null {
  if (rate === null || !(rate > 0)) return 'no_rate';
  if (payType === 'daily' && minDailyWage > 0 && rate < minDailyWage) return 'below_minimum';
  return null;
}

export function buildPayrollLine(input: {
  employeeId: string;
  employeeName: string;
  biometricId: string;
  payType: PayType;
  dailyRate: number | null;
  summary: { days: number; otHours: number; ndHours: number; regHolidays: number; specialHolidaysWorked: number };
  caBalance: number;
  caPerPayroll: number;
  rules: PayRules4Payroll;
  remarks?: string;
}): PayrollLine {
  const inputs: PayInputs = {
    dailyRate: input.dailyRate ?? 0,
    days: input.summary.days,
    otHours: input.summary.otHours,
    ndHours: input.summary.ndHours,
    regHolidays: input.summary.regHolidays,
    specialHolidaysWorked: input.summary.specialHolidaysWorked,
    caDeduction: prefillCaDeduction(input.caBalance, input.caPerPayroll),
    sss: 0,
    philhealth: 0,
    pagibig: 0,
    otherDeductions: 0,
  };
  return {
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    biometricId: input.biometricId,
    payType: input.payType,
    remarks: input.remarks ?? '',
    ...inputs,
    ...computePay(inputs, input.rules),
  };
}

/** Re-runs the amounts after an edit to any input field. */
export function recomputeLine(line: PayrollLine, rules: PayRules4Payroll): PayrollLine {
  return { ...line, ...computePay(line, rules) };
}

export function payrollTotals(lines: PayAmounts[]) {
  const sum = (pick: (line: PayAmounts) => number) => round2(lines.reduce((total, line) => total + pick(line), 0));
  return {
    basicPay: sum(line => line.basicPay),
    otPay: sum(line => line.otPay),
    ndPay: sum(line => line.ndPay),
    holidayPay: sum(line => line.holidayPay),
    grossPay: sum(line => line.grossPay),
    totalDeductions: sum(line => line.totalDeductions),
    netPay: sum(line => line.netPay),
  };
}

/** New period: the day after the last period, 7 days long. Without history: the 7 days ending today. */
export function nextPeriodRange(lastDateTo: string | null, today: string, lengthDays = 7) {
  const dateFrom = lastDateTo ? addDaysToDateKey(lastDateTo, 1) : addDaysToDateKey(today, -(lengthDays - 1));
  return { dateFrom, dateTo: addDaysToDateKey(dateFrom, lengthDays - 1) };
}

/** Row shape for wf_save_payroll_lines. */
export function toSavePayload(lines: PayrollLine[]) {
  return lines.map(line => ({
    employee_id: line.employeeId,
    employee_name: line.employeeName,
    biometric_id: line.biometricId,
    pay_type: line.payType,
    daily_rate: line.dailyRate,
    days: line.days,
    ot_hours: line.otHours,
    nd_hours: line.ndHours,
    reg_holidays: line.regHolidays,
    special_holidays_worked: line.specialHolidaysWorked,
    basic_pay: line.basicPay,
    ot_pay: line.otPay,
    nd_pay: line.ndPay,
    holiday_pay: line.holidayPay,
    gross_pay: line.grossPay,
    ca_deduction: line.caDeduction,
    sss: line.sss,
    philhealth: line.philhealth,
    pagibig: line.pagibig,
    other_deductions: line.otherDeductions,
    net_pay: line.netPay,
    remarks: line.remarks,
  }));
}

/** Saved row back into an editable line. Stored amounts win: they are what was saved or posted. */
export function fromSavedLine(row: {
  employee_id: string; employee_name: string; biometric_id: string; pay_type: string; daily_rate: number;
  days: number; ot_hours: number; nd_hours: number; reg_holidays: number; special_holidays_worked: number;
  basic_pay: number; ot_pay: number; nd_pay: number; holiday_pay: number; gross_pay: number; net_pay: number;
  ca_deduction: number; sss: number; philhealth: number; pagibig: number; other_deductions: number; remarks: string;
}): PayrollLine {
  const inputs: PayInputs = {
    dailyRate: Number(row.daily_rate),
    days: Number(row.days),
    otHours: Number(row.ot_hours),
    ndHours: Number(row.nd_hours),
    regHolidays: Number(row.reg_holidays),
    specialHolidaysWorked: Number(row.special_holidays_worked),
    caDeduction: Number(row.ca_deduction),
    sss: Number(row.sss),
    philhealth: Number(row.philhealth),
    pagibig: Number(row.pagibig),
    otherDeductions: Number(row.other_deductions),
  };
  return {
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    biometricId: row.biometric_id,
    payType: row.pay_type === 'fixed' ? 'fixed' : 'daily',
    remarks: row.remarks ?? '',
    ...inputs,
    hourlyRate: round2(inputs.dailyRate / 8),
    basicPay: Number(row.basic_pay),
    otPay: Number(row.ot_pay),
    ndPay: Number(row.nd_pay),
    holidayPay: Number(row.holiday_pay),
    grossPay: Number(row.gross_pay),
    totalDeductions: round2(inputs.caDeduction + inputs.sss + inputs.philhealth + inputs.pagibig + inputs.otherDeductions),
    netPay: Number(row.net_pay),
  };
}
