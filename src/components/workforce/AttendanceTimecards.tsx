import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, Download, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { addDaysToDateKey, todayBusinessDate } from '../../lib/date';
import type { WfEmployeeRateRow, WfEmployeeRow, WfHolidayRow, WfPunchRow, WfShiftRow, WfTimecardOverrideRow } from '../../lib/database.types';
import { buildTimecards, loadOverrides, loadPunches, loadRateHistory, loadWorkforceBasics } from '../../lib/workforce/data';
import { formatPeriod, formatShortDate, qty, weekdayShort } from '../../lib/workforce/format';
import { rateOn } from '../../lib/workforce/payroll';
import { datesInRange, EXCEPTION_LABELS, isUnresolvedException, type DayResult, type EmployeeTimecard } from '../../lib/workforce/timecard';
import { DEFAULT_PAY_RULES, type PayRules } from '../../lib/workforce/types';
import { csvEscape, downloadTextFile } from '../fuel/fuelUtils';
import { Badge, Card, EmptyState, ErrorBanner, Field, LoadingRow, StatCard, ToolbarButton } from './WorkforceUi';
import TimecardPanel from './TimecardPanel';

const MAX_DAYS = 31;

interface Props {
  canAdjust: boolean;
  canViewRates: boolean;
  range: { dateFrom: string; dateTo: string } | null;
  onRangeChange: (range: { dateFrom: string; dateTo: string }) => void;
}

function cellLabel(day: DayResult): string {
  if (day.punchMinutes.length === 0 && !day.override) return '';
  const credit = day.daysCredit === 0.5 ? '½' : qty(day.daysCredit);
  return day.otHours > 0 ? `${credit} +${qty(day.otHours)}` : credit;
}

export default function AttendanceTimecards({ canAdjust, canViewRates, range, onRangeChange }: Props) {
  const [employees, setEmployees] = useState<WfEmployeeRow[]>([]);
  const [shifts, setShifts] = useState<WfShiftRow[]>([]);
  const [holidays, setHolidays] = useState<WfHolidayRow[]>([]);
  const [rules, setRules] = useState<PayRules>(DEFAULT_PAY_RULES);
  const [punches, setPunches] = useState<Pick<WfPunchRow, 'employee_id' | 'punched_at'>[]>([]);
  const [overrides, setOverrides] = useState<WfTimecardOverrideRow[]>([]);
  const [rates, setRates] = useState<WfEmployeeRateRow[]>([]);
  const [draftRange, setDraftRange] = useState(range);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const [selected, setSelected] = useState<{ employeeId: string; date: string } | null>(null);
  const requestId = useRef(0);

  // Default to the most recent import's period.
  useEffect(() => {
    if (range) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('wf_attendance_imports')
        .select('date_from, date_to')
        .not('date_from', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const today = todayBusinessDate();
      onRangeChange(data?.date_from && data.date_to
        ? { dateFrom: data.date_from, dateTo: data.date_to }
        : { dateFrom: addDaysToDateKey(today, -6), dateTo: today });
    })();
    return () => { cancelled = true; };
  }, [onRangeChange, range]);

  useEffect(() => { setDraftRange(range); }, [range]);

  const fetchData = useCallback(async () => {
    if (!range) return;
    const current = ++requestId.current;
    setLoading(true);
    setError('');
    const [basics, punchResult, overrideResult, rateResult] = await Promise.all([
      loadWorkforceBasics(),
      loadPunches(range.dateFrom, range.dateTo),
      loadOverrides(range.dateFrom, range.dateTo),
      canViewRates ? loadRateHistory() : Promise.resolve({ data: [] as WfEmployeeRateRow[], error: null }),
    ]);
    if (current !== requestId.current) return;
    const problem = basics.error ?? punchResult.error?.message ?? overrideResult.error?.message ?? rateResult.error?.message;
    if (problem) setError(`Could not load attendance. ${problem}`);
    if (basics.data) {
      setEmployees(basics.data.employees);
      setShifts(basics.data.shifts);
      setHolidays(basics.data.holidays);
      setRules(basics.data.rules);
    }
    setPunches(punchResult.data);
    setOverrides(overrideResult.data);
    setRates(rateResult.data);
    setLoading(false);
  }, [canViewRates, range]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const reloadOverrides = useCallback(async () => {
    if (!range) return;
    const result = await loadOverrides(range.dateFrom, range.dateTo);
    if (result.error) setError(`Could not reload overrides. ${result.error.message}`);
    else setOverrides(result.data);
  }, [range]);

  const dates = useMemo(() => (range ? datesInRange(range.dateFrom, range.dateTo) : []), [range]);
  const holidayByDate = useMemo(() => new Map(holidays.map(holiday => [holiday.holiday_date, holiday])), [holidays]);
  const cards = useMemo(() => (range ? buildTimecards({
    employees, shifts, punches, overrides, holidays, rules, dateFrom: range.dateFrom, dateTo: range.dateTo,
  }) : new Map<string, EmployeeTimecard>()), [employees, holidays, overrides, punches, range, rules, shifts]);

  const rateHistory = useMemo(() => rates.map(rate => ({ employeeId: rate.employee_id, dailyRate: Number(rate.daily_rate), effectiveFrom: rate.effective_from })), [rates]);

  const rows = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return employees
      .filter(employee => cards.has(employee.id))
      .map(employee => ({ employee, card: cards.get(employee.id)! }))
      .filter(({ employee, card }) => {
        if (exceptionsOnly && card.summary.exceptions === 0) return false;
        const haystack = `${employee.full_name} ${employee.biometric_id} ${employee.department}`.toLowerCase();
        return words.every(word => haystack.includes(word));
      });
  }, [cards, employees, exceptionsOnly, search]);

  const totals = useMemo(() => {
    let exceptions = 0;
    let days = 0;
    let ot = 0;
    for (const card of cards.values()) {
      exceptions += card.summary.exceptions;
      days += card.summary.days;
      ot += card.summary.otHours;
    }
    return { exceptions, days, ot, employees: cards.size };
  }, [cards]);

  function applyRange() {
    if (!draftRange?.dateFrom || !draftRange.dateTo) return;
    const [dateFrom, dateTo] = draftRange.dateFrom <= draftRange.dateTo ? [draftRange.dateFrom, draftRange.dateTo] : [draftRange.dateTo, draftRange.dateFrom];
    if (datesInRange(dateFrom, dateTo).length > MAX_DAYS) {
      setError(`Choose ${MAX_DAYS} days or fewer.`);
      return;
    }
    onRangeChange({ dateFrom, dateTo });
  }

  function handleExport() {
    if (!range) return;
    const headers = ['Biometric ID', 'Name', ...dates.map(date => `${date} days`), ...dates.map(date => `${date} OT`), 'NO. OF DAYS', 'NO. OT', 'NIGHT DIFF', 'REG HOLIDAY', 'SPECIAL HOLIDAY', 'EXCEPTIONS', 'LATE MINUTES'];
    const csvRows = rows.map(({ employee, card }) => [
      employee.biometric_id,
      employee.full_name,
      ...card.days.map(day => day.daysCredit),
      ...card.days.map(day => day.otHours),
      card.summary.days, card.summary.otHours, card.summary.ndHours, card.summary.regHolidays,
      card.summary.specialHolidaysWorked, card.summary.exceptions, card.summary.lateMinutes,
    ]);
    downloadTextFile(`attendance-${range.dateFrom}-to-${range.dateTo}.csv`, [headers, ...csvRows].map(row => row.map(csvEscape).join(',')).join('\n'), 'text/csv;charset=utf-8');
  }

  const selectedEmployee = selected ? employees.find(employee => employee.id === selected.employeeId) ?? null : null;
  const selectedDay = selected ? cards.get(selected.employeeId)?.days.find(day => day.date === selected.date) ?? null : null;

  return (
    <div className="space-y-5">
      <Card
        title="Timecards"
        subtitle={range ? formatPeriod(range.dateFrom, range.dateTo) : 'Loading period...'}
        actions={(
          <>
            <Field label="From"><input type="date" value={draftRange?.dateFrom ?? ''} onChange={event => setDraftRange(previous => ({ dateFrom: event.target.value, dateTo: previous?.dateTo ?? event.target.value }))} className="input w-auto" /></Field>
            <Field label="To"><input type="date" value={draftRange?.dateTo ?? ''} onChange={event => setDraftRange(previous => ({ dateFrom: previous?.dateFrom ?? event.target.value, dateTo: event.target.value }))} className="input w-auto" /></Field>
            <div className="self-end"><ToolbarButton icon={<CalendarDays size={16} />} label="Show" onClick={applyRange} disabled={loading} /></div>
            <div className="self-end"><ToolbarButton icon={<Download size={16} />} label="CSV" onClick={handleExport} disabled={rows.length === 0} /></div>
          </>
        )}
      >
        <div className="space-y-4 p-5">
          <ErrorBanner message={error} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Employees" value={String(totals.employees)} />
            <StatCard label="Days credited" value={qty(totals.days)} tone="emerald" />
            <StatCard label="OT hours" value={qty(totals.ot)} tone="sky" />
            <StatCard label="Exceptions to review" value={String(totals.exceptions)} tone={totals.exceptions ? 'amber' : 'slate'} detail="Single punch, missing out-punch, no shift" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-60 flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name or ID..." className="input pl-9" />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={exceptionsOnly} onChange={event => setExceptionsOnly(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-amber-500" />
              Exceptions only
            </label>
            <p className="text-xs text-slate-400">Cell: day credit, +OT hours. Amber = needs review. Violet = overridden.</p>
          </div>
        </div>

        {loading ? <LoadingRow label="Computing timecards..." /> : rows.length === 0 ? (
          <EmptyState icon={<CalendarDays size={34} />} title={exceptionsOnly ? 'No exceptions in this period' : 'No attendance in this period'} detail="Import a biometric PDF or choose another date range." />
        ) : (
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 font-semibold uppercase tracking-wide text-slate-500">
                  <th className="sticky left-0 z-10 min-w-48 bg-slate-50 px-3 py-2 text-left">Employee</th>
                  {dates.map(date => {
                    const holiday = holidayByDate.get(date);
                    return (
                      <th key={date} title={holiday?.name} className={`min-w-14 px-1 py-2 text-center ${holiday ? (holiday.type === 'regular' ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700') : ''}`}>
                        <div>{weekdayShort(date)}</div>
                        <div className="font-normal normal-case">{formatShortDate(date)}</div>
                      </th>
                    );
                  })}
                  <th className="px-2 py-2 text-right">No. of Days</th>
                  <th className="px-2 py-2 text-right">No. OT</th>
                  <th className="px-2 py-2 text-right">Night Diff</th>
                  <th className="px-2 py-2 text-right">Reg Holiday</th>
                  <th className="px-2 py-2 text-right">Special Holiday</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ employee, card }) => {
                  const noRate = canViewRates && employee.pay_type === 'daily' && rateOn(rateHistory, employee.id, range!.dateTo) === null;
                  return (
                    <tr key={employee.id} className="hover:bg-slate-50/60">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2">
                        <p className="font-semibold text-slate-700">{employee.full_name}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
                          <span>ID {employee.biometric_id}</span>
                          {employee.pay_type === 'fixed' && <Badge tone="slate">Fixed</Badge>}
                          {noRate && <Badge tone="red">No rate</Badge>}
                          {!employee.shift_id && <Badge tone="amber">No shift</Badge>}
                        </div>
                      </td>
                      {card.days.map((day: DayResult) => {
                        const unresolved = isUnresolvedException(day);
                        const label = cellLabel(day);
                        const tone = unresolved
                          ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                          : day.override
                            ? 'bg-violet-50 text-violet-700 hover:bg-violet-100'
                            : label ? 'text-slate-700 hover:bg-emerald-50' : 'text-slate-300 hover:bg-slate-100';
                        return (
                          <td key={day.date} className="p-0.5 text-center">
                            <button
                              type="button"
                              onClick={() => setSelected({ employeeId: employee.id, date: day.date })}
                              title={day.exception ? EXCEPTION_LABELS[day.exception] : undefined}
                              className={`flex h-9 w-full items-center justify-center gap-0.5 rounded font-semibold tabular-nums transition-colors ${tone}`}
                            >
                              {unresolved && <AlertTriangle size={11} />}
                              {label || '·'}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-right font-bold tabular-nums text-slate-800">{qty(card.summary.days)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-sky-700">{qty(card.summary.otHours)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-violet-700">{qty(card.summary.ndHours)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{qty(card.summary.regHolidays)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{qty(card.summary.specialHolidaysWorked)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected && selectedEmployee && selectedDay && (
        <TimecardPanel
          employee={selectedEmployee}
          shift={shifts.find(shift => shift.id === selectedEmployee.shift_id) ?? null}
          day={selectedDay}
          canAdjust={canAdjust}
          onClose={() => setSelected(null)}
          onSaved={async () => {
            await reloadOverrides();
          }}
        />
      )}
    </div>
  );
}
