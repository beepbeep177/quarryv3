import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Calculator, Download, Lock, Printer, Save, Trash2, Unlock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { friendlyDbError } from '../../lib/dbErrors';
import type { WfEmployeeRow, WfPayrollPeriodRow } from '../../lib/database.types';
import {
  buildTimecards,
  loadCaBalances,
  loadOverrides,
  loadPunches,
  loadRateHistory,
  loadWorkforceBasics,
} from '../../lib/workforce/data';
import { formatDateTime, formatPeriod, money, parseAmount, peso, qty } from '../../lib/workforce/format';
import {
  buildPayrollLine,
  fromSavedLine,
  payrollTotals,
  rateOn,
  rateWarning,
  recomputeLine,
  toSavePayload,
  type PayInputs,
  type PayrollLine,
} from '../../lib/workforce/payroll';
import { DEFAULT_PAY_RULES, type PayRules } from '../../lib/workforce/types';
import { csvEscape, downloadTextFile } from '../fuel/fuelUtils';
import ActionModal from '../ActionModal';
import ReadOnlyNotice from '../ReadOnlyNotice';
import PayslipSheet from './PayslipSheet';
import { Badge, Card, EmptyState, ErrorBanner, LoadingRow, StatCard, SuccessBanner, ToolbarButton, WarningNote } from './WorkforceUi';

interface Props {
  period: WfPayrollPeriodRow;
  canManage: boolean;
  canLock: boolean;
  canUnlock: boolean;
  onBack: () => void;
  onChanged: () => void;
}

type EditableKey = Exclude<keyof PayInputs, 'dailyRate'>;

const EDITABLE: { key: EditableKey; label: string; step: string }[] = [
  { key: 'days', label: 'Days', step: '0.5' },
  { key: 'otHours', label: 'OT', step: '0.5' },
  { key: 'ndHours', label: 'ND', step: '0.5' },
  { key: 'regHolidays', label: 'Reg Hol', step: '1' },
  { key: 'specialHolidaysWorked', label: 'Spe Hol', step: '0.5' },
  { key: 'caDeduction', label: 'C.A', step: '0.01' },
  { key: 'sss', label: 'SSS', step: '0.01' },
  { key: 'philhealth', label: 'PhilHealth', step: '0.01' },
  { key: 'pagibig', label: 'Pag-IBIG', step: '0.01' },
  { key: 'otherDeductions', label: 'Other', step: '0.01' },
];

export default function PayrollRegister({ period, canManage, canLock, canUnlock, onBack, onChanged }: Props) {
  const isDraft = period.status === 'draft';
  const editable = isDraft && canManage;
  const [lines, setLines] = useState<PayrollLine[]>([]);
  const [employees, setEmployees] = useState<WfEmployeeRow[]>([]);
  const [rules, setRules] = useState<PayRules>(DEFAULT_PAY_RULES);
  const [caBalances, setCaBalances] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [computeNotes, setComputeNotes] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<'lock' | 'unlock' | 'delete' | 'recompute' | null>(null);
  const [showPayslips, setShowPayslips] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    const [saved, basics, balances] = await Promise.all([
      supabase.from('wf_payroll_lines').select('*').eq('period_id', period.id).order('employee_name'),
      loadWorkforceBasics(),
      loadCaBalances(),
    ]);
    const problem = saved.error?.message ?? basics.error ?? balances.error;
    if (problem) setError(`Could not load payroll. ${problem}`);
    setLines((saved.data ?? []).map(row => fromSavedLine(row)));
    if (basics.data) {
      setRules(basics.data.rules);
      setEmployees(basics.data.employees);
    }
    setCaBalances(balances.data);
    setDirty(false);
    setLoading(false);
  }, [period.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const employeesById = useMemo(() => new Map(employees.map(employee => [employee.id, employee])), [employees]);
  const totals = useMemo(() => payrollTotals(lines), [lines]);
  const caTotal = useMemo(() => lines.reduce((sum, line) => sum + line.caDeduction, 0), [lines]);

  const caBalanceAfter = useMemo(() => new Map(lines.map(line => {
    const balance = caBalances.get(line.employeeId) ?? 0;
    // A locked payroll's deduction is already in the ledger balance.
    return [line.employeeId, isDraft ? balance - line.caDeduction : balance];
  })), [caBalances, isDraft, lines]);

  function lineWarnings(line: PayrollLine): { tone: 'red' | 'amber'; text: string }[] {
    const warnings: { tone: 'red' | 'amber'; text: string }[] = [];
    const rateIssue = rateWarning(line.dailyRate > 0 ? line.dailyRate : null, line.payType, rules.minDailyWage);
    if (rateIssue === 'no_rate') warnings.push({ tone: 'red', text: 'No rate' });
    if (rateIssue === 'below_minimum') warnings.push({ tone: 'amber', text: 'Below minimum wage' });
    if (isDraft && line.caDeduction > (caBalances.get(line.employeeId) ?? 0) + 0.005) warnings.push({ tone: 'amber', text: 'C.A more than balance' });
    if (line.netPay < 0) warnings.push({ tone: 'red', text: 'Negative net' });
    return warnings;
  }

  const blockingIssues = lines.filter(line => line.netPay < 0).length;

  async function computeFromTimecards() {
    setConfirm(null);
    setComputing(true);
    setError('');
    setNotice('');
    const [basics, punches, overrides, rates, balances] = await Promise.all([
      loadWorkforceBasics(),
      loadPunches(period.date_from, period.date_to),
      loadOverrides(period.date_from, period.date_to),
      loadRateHistory(),
      loadCaBalances(),
    ]);
    setComputing(false);
    const problem = basics.error ?? punches.error?.message ?? overrides.error?.message ?? rates.error?.message ?? balances.error;
    if (problem || !basics.data) {
      setError(`Could not compute payroll. ${problem ?? ''}`.trim());
      return;
    }
    const { employees: allEmployees, rules: currentRules } = basics.data;
    const cards = buildTimecards({
      employees: allEmployees,
      shifts: basics.data.shifts,
      punches: punches.data,
      overrides: overrides.data,
      holidays: basics.data.holidays,
      rules: currentRules,
      dateFrom: period.date_from,
      dateTo: period.date_to,
    });
    const history = rates.data.map(rate => ({ employeeId: rate.employee_id, dailyRate: Number(rate.daily_rate), effectiveFrom: rate.effective_from }));
    const previous = new Map(lines.map(line => [line.employeeId, line]));
    let exceptions = 0;
    const next: PayrollLine[] = [];
    for (const employee of allEmployees) {
      const card = cards.get(employee.id);
      if (!card) continue;
      exceptions += card.summary.exceptions;
      const hasPay = card.summary.days > 0 || card.summary.otHours > 0 || card.summary.ndHours > 0;
      if (!hasPay && !(employee.pay_type === 'fixed' && employee.status === 'active')) continue;
      const kept = previous.get(employee.id);
      const line = buildPayrollLine({
        employeeId: employee.id,
        employeeName: employee.full_name,
        biometricId: employee.biometric_id,
        payType: employee.pay_type,
        dailyRate: rateOn(history, employee.id, period.date_to),
        summary: card.summary,
        caBalance: balances.data.get(employee.id) ?? 0,
        caPerPayroll: Number(employee.ca_deduction_per_payroll),
        rules: currentRules,
        remarks: kept?.remarks,
      });
      // Keep government deductions typed into the previous draft.
      next.push(kept ? recomputeLine({ ...line, sss: kept.sss, philhealth: kept.philhealth, pagibig: kept.pagibig, otherDeductions: kept.otherDeductions }, currentRules) : line);
    }
    next.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    setLines(next);
    setRules(currentRules);
    setEmployees(allEmployees);
    setCaBalances(balances.data);
    setDirty(true);
    const notes: string[] = [];
    if (exceptions > 0) notes.push(`${exceptions} timecard exception${exceptions === 1 ? ' was' : 's were'} credited 0. Review them in Attendance before locking.`);
    const missingRates = next.filter(line => !(line.dailyRate > 0)).length;
    if (missingRates > 0) notes.push(`${missingRates} employee${missingRates === 1 ? ' has' : 's have'} no rate for this period. Set it in Employees, then compute again.`);
    setComputeNotes(notes);
    setNotice(`Computed ${next.length} lines from timecards. Review, then save the draft.`);
  }

  function updateLine(employeeId: string, key: EditableKey | 'remarks', value: string) {
    setLines(previous => previous.map(line => {
      if (line.employeeId !== employeeId) return line;
      if (key === 'remarks') return { ...line, remarks: value };
      return recomputeLine({ ...line, [key]: parseAmount(value) }, rules);
    }));
    setDirty(true);
    setNotice('');
  }

  async function handleSave() {
    if (!editable) return;
    setSaving(true);
    setError('');
    const { error: saveError } = await supabase.rpc('wf_save_payroll_lines', {
      p_period_id: period.id,
      p_lines: toSavePayload(lines),
      p_rules_snapshot: { ...rules },
    });
    setSaving(false);
    if (saveError) {
      setError(friendlyDbError(saveError));
      return;
    }
    setNotice('Draft saved.');
    setDirty(false);
    onChanged();
    await fetchData();
  }

  async function handleLock() {
    setSaving(true);
    setError('');
    const { error: lockError } = await supabase.rpc('wf_lock_payroll', { p_period_id: period.id });
    setSaving(false);
    setConfirm(null);
    if (lockError) {
      setError(friendlyDbError(lockError));
      return;
    }
    setNotice(`Payroll locked. ${peso(totals.netPay)} net pay posted to Expenses (Salary/Advances).`);
    onChanged();
    await fetchData();
  }

  async function handleUnlock() {
    setSaving(true);
    setError('');
    const { error: unlockError } = await supabase.rpc('wf_unlock_payroll', { p_period_id: period.id });
    setSaving(false);
    setConfirm(null);
    if (unlockError) {
      setError(friendlyDbError(unlockError));
      return;
    }
    setNotice('Payroll unlocked. Its expense and C.A deductions were removed.');
    onChanged();
    await fetchData();
  }

  async function handleDelete() {
    setSaving(true);
    const { data, error: deleteError } = await supabase.from('wf_payroll_periods').delete().eq('id', period.id).select('id');
    setSaving(false);
    setConfirm(null);
    if (deleteError || !data?.length) {
      setError(friendlyDbError(deleteError));
      return;
    }
    onChanged();
    onBack();
  }

  function handleExport() {
    const headers = [
      'Biometric ID', 'Name', 'Pay Type', 'Days', 'OT Hrs', 'Night Dif Hrs', 'Reg. Holiday', 'Spe. Holiday', 'Rate', 'Rate per Hr',
      'Weekly Pay', 'O.T Pay', 'Night Dif Pay', 'Holiday Pay', 'Total Salary', 'C.A', 'SSS', 'PhilHealth', 'Pag-IBIG', 'Other',
      'Total Deductions', 'Net Salary', 'C.A Balance', 'Remarks',
    ];
    const rows = lines.map(line => [
      line.biometricId, line.employeeName, line.payType, line.days, line.otHours, line.ndHours, line.regHolidays, line.specialHolidaysWorked,
      line.dailyRate, line.hourlyRate, line.basicPay, line.otPay, line.ndPay, line.holidayPay, line.grossPay, line.caDeduction, line.sss,
      line.philhealth, line.pagibig, line.otherDeductions, line.totalDeductions, line.netPay, caBalanceAfter.get(line.employeeId) ?? 0, line.remarks,
    ]);
    const totalRow = ['', 'TOTAL', '', '', '', '', '', '', '', '', totals.basicPay, totals.otPay, totals.ndPay, totals.holidayPay, totals.grossPay, '', '', '', '', '', totals.totalDeductions, totals.netPay, '', ''];
    downloadTextFile(`payroll-${period.date_from}-to-${period.date_to}.csv`, [headers, ...rows, totalRow].map(row => row.map(csvEscape).join(',')).join('\n'), 'text/csv;charset=utf-8');
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button type="button" onClick={onBack} className="mb-1 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700">
            <ArrowLeft size={15} /> All periods
          </button>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold text-slate-800">
            Payroll {formatPeriod(period.date_from, period.date_to)}
            <Badge tone={isDraft ? 'amber' : 'emerald'}>{isDraft ? 'Draft' : 'Locked'}</Badge>
          </h1>
          {!isDraft && <p className="mt-0.5 text-sm text-slate-500">Locked {formatDateTime(period.locked_at)}. Net pay posted to Expenses.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable && <ToolbarButton icon={<Calculator size={16} />} label="Compute from Timecards" onClick={() => (lines.length ? setConfirm('recompute') : computeFromTimecards())} disabled={computing || saving} spinning={computing} />}
          {editable && <ToolbarButton tone="primary" icon={<Save size={16} />} label="Save Draft" onClick={handleSave} disabled={!dirty || saving || lines.length === 0} spinning={saving && !confirm} />}
          {isDraft && canLock && <ToolbarButton tone="warning" icon={<Lock size={16} />} label="Lock & Post" onClick={() => setConfirm('lock')} disabled={dirty || saving || lines.length === 0 || blockingIssues > 0} />}
          {!isDraft && canUnlock && <ToolbarButton tone="danger" icon={<Unlock size={16} />} label="Unlock" onClick={() => setConfirm('unlock')} disabled={saving} />}
          <ToolbarButton icon={<Printer size={16} />} label="Payslips" onClick={() => setShowPayslips(true)} disabled={lines.length === 0} />
          <ToolbarButton icon={<Download size={16} />} label="CSV" onClick={handleExport} disabled={lines.length === 0} />
          {editable && <ToolbarButton tone="danger" icon={<Trash2 size={16} />} label="Delete" onClick={() => setConfirm('delete')} disabled={saving} />}
        </div>
      </div>

      {!canManage && isDraft && <ReadOnlyNotice message="Your account can view payroll only." />}
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />
      {computeNotes.map(note => <WarningNote key={note}>{note}</WarningNote>)}
      {dirty && editable && <WarningNote>You have unsaved changes. Save the draft before locking.</WarningNote>}
      {blockingIssues > 0 && <WarningNote>{blockingIssues} line{blockingIssues === 1 ? ' has' : 's have'} a negative net pay. Reduce the deductions before locking.</WarningNote>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Employees" value={String(lines.length)} />
        <StatCard label="Total salary (gross)" value={peso(totals.grossPay)} tone="sky" />
        <StatCard label="Deductions" value={peso(totals.totalDeductions)} tone="amber" detail={`C.A ${peso(caTotal)}`} />
        <StatCard label="Net salary" value={peso(totals.netPay)} tone="emerald" detail={isDraft ? 'Posted to Expenses when locked' : 'Posted to Expenses'} />
      </div>

      <Card title="Payroll Register" subtitle={editable ? 'Edit days, hours, holidays and deductions. Amounts update as you type.' : 'Saved values.'}>
        {loading ? <LoadingRow label="Loading payroll..." /> : lines.length === 0 ? (
          <EmptyState icon={<Calculator size={34} />} title="No payroll lines yet" detail={editable ? 'Use "Compute from Timecards" to fill the register.' : 'This period has no saved lines.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 font-semibold uppercase tracking-wide text-slate-500">
                  <th className="sticky left-0 z-10 min-w-44 bg-slate-50 px-3 py-2 text-left">Employee</th>
                  <th className="px-2 py-2 text-right">Rate</th>
                  {EDITABLE.slice(0, 5).map(column => <th key={column.key} className="px-1 py-2 text-right">{column.label}</th>)}
                  <th className="px-2 py-2 text-right">Weekly</th>
                  <th className="px-2 py-2 text-right">OT Pay</th>
                  <th className="px-2 py-2 text-right">ND Pay</th>
                  <th className="px-2 py-2 text-right">Holiday</th>
                  <th className="px-2 py-2 text-right">Gross</th>
                  {EDITABLE.slice(5).map(column => <th key={column.key} className="px-1 py-2 text-right">{column.label}</th>)}
                  <th className="px-2 py-2 text-right">Net</th>
                  <th className="px-2 py-2 text-left">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map(line => {
                  const warnings = lineWarnings(line);
                  const employee = employeesById.get(line.employeeId);
                  const cell = (column: typeof EDITABLE[number]) => (
                    <td key={column.key} className="px-1 py-1.5 text-right">
                      {editable ? (
                        <input
                          type="number"
                          min="0"
                          step={column.step}
                          value={line[column.key]}
                          onChange={event => updateLine(line.employeeId, column.key, event.target.value)}
                          aria-label={`${column.label} for ${line.employeeName}`}
                          className="w-16 rounded border border-slate-200 px-1.5 py-1 text-right tabular-nums focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-200"
                        />
                      ) : <span className="tabular-nums">{column.step === '0.01' ? money(line[column.key]) : qty(line[column.key])}</span>}
                    </td>
                  );
                  return (
                    <tr key={line.employeeId} className="hover:bg-slate-50/60">
                      <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                        <p className="font-semibold text-slate-700">{line.employeeName}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
                          <span>ID {line.biometricId}</span>
                          {line.payType === 'fixed' && <Badge tone="slate">Fixed</Badge>}
                          {warnings.map(warning => <Badge key={warning.text} tone={warning.tone}>{warning.text}</Badge>)}
                        </div>
                        {isDraft && employee && Number(employee.ca_deduction_per_payroll) > 0 && (
                          <p className="text-[11px] text-slate-400">C.A balance {money(caBalances.get(line.employeeId) ?? 0)}</p>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        <p>{money(line.dailyRate)}</p>
                        <p className="text-[10px] text-slate-400">{money(line.hourlyRate)}/hr</p>
                      </td>
                      {EDITABLE.slice(0, 5).map(cell)}
                      <td className="px-2 py-1.5 text-right tabular-nums">{money(line.basicPay)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{money(line.otPay)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{money(line.ndPay)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{money(line.holidayPay)}</td>
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-sky-700">{money(line.grossPay)}</td>
                      {EDITABLE.slice(5).map(cell)}
                      <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${line.netPay < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{money(line.netPay)}</td>
                      <td className="px-2 py-1.5">
                        {editable ? (
                          <input value={line.remarks} onChange={event => updateLine(line.employeeId, 'remarks', event.target.value)} aria-label={`Remarks for ${line.employeeName}`} className="w-32 rounded border border-slate-200 px-1.5 py-1 focus:border-emerald-400 focus:outline-none" />
                        ) : <span className="text-slate-500">{line.remarks}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-bold text-slate-700">
                  <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2">Total</td>
                  <td />
                  {EDITABLE.slice(0, 5).map(column => <td key={column.key} className="px-1 py-2 text-right tabular-nums">{qty(lines.reduce((sum, line) => sum + line[column.key], 0))}</td>)}
                  <td className="px-2 py-2 text-right tabular-nums">{money(totals.basicPay)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{money(totals.otPay)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{money(totals.ndPay)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{money(totals.holidayPay)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{money(totals.grossPay)}</td>
                  {EDITABLE.slice(5).map(column => <td key={column.key} className="px-1 py-2 text-right tabular-nums">{money(lines.reduce((sum, line) => sum + line[column.key], 0))}</td>)}
                  <td className="px-2 py-2 text-right tabular-nums">{money(totals.netPay)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-slate-400">
        Rules used: OT ×{rules.otMultiplier}, ND {Math.round(rules.ndRate * 100)}% ({rules.ndStart}–{rules.ndEnd}), special holiday +{Math.round(rules.specialHolidayPremium * 100)}%. SSS, PhilHealth and Pag-IBIG are typed in manually.
      </p>

      {showPayslips && (
        <PayslipSheet dateFrom={period.date_from} dateTo={period.date_to} lines={lines} caBalanceAfter={caBalanceAfter} onClose={() => setShowPayslips(false)} />
      )}

      <ActionModal
        open={confirm === 'recompute'}
        title="Compute from Timecards"
        description="Days, hours, holidays, rates and C.A deductions will be replaced with fresh values from timecards. SSS, PhilHealth, Pag-IBIG, other deductions and remarks are kept."
        variant="info"
        confirmLabel="Compute"
        onClose={() => setConfirm(null)}
        onConfirm={computeFromTimecards}
      />
      <ActionModal
        open={confirm === 'lock'}
        title="Lock & Post Payroll"
        description="The register becomes read-only, C.A deductions are written to each employee's ledger, and total net pay is posted to Expenses."
        variant="warning"
        confirmLabel="Lock & Post"
        loading={saving}
        onClose={() => setConfirm(null)}
        onConfirm={handleLock}
      >
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Net pay to Expenses</p>
            <p className="mt-1 font-bold tabular-nums text-slate-800">{peso(totals.netPay)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">C.A deductions</p>
            <p className="mt-1 font-bold tabular-nums text-slate-800">{peso(caTotal)} · {lines.filter(line => line.caDeduction > 0).length} employees</p>
          </div>
        </div>
      </ActionModal>
      <ActionModal
        open={confirm === 'unlock'}
        title="Unlock Payroll"
        description="This removes the posted expense and the C.A deductions made by this payroll so it can be edited again."
        variant="danger"
        confirmLabel="Unlock"
        loading={saving}
        onClose={() => setConfirm(null)}
        onConfirm={handleUnlock}
      />
      <ActionModal
        open={confirm === 'delete'}
        title="Delete Draft Period"
        description={`The draft payroll for ${formatPeriod(period.date_from, period.date_to)} and its ${lines.length} lines will be deleted. Attendance is not affected.`}
        variant="danger"
        confirmLabel="Delete"
        loading={saving}
        onClose={() => setConfirm(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
