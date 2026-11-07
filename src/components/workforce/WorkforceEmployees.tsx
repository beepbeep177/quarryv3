import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Edit3, Plus, Power, Save, Search, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { friendlyDbError, NOT_SAVED_MESSAGE } from '../../lib/dbErrors';
import { useBusinessToday } from '../../lib/date';
import type { WfEmployeeRateRow, WfEmployeeRow, WfShiftRow } from '../../lib/database.types';
import { paginate } from '../../lib/pagination';
import { normalizeBiometricId } from '../../lib/workforce/biometricParser';
import { loadRateHistory, loadWorkforceBasics } from '../../lib/workforce/data';
import { formatDate, money, parseAmount } from '../../lib/workforce/format';
import { rateOn, rateWarning } from '../../lib/workforce/payroll';
import { DEFAULT_PAY_RULES, type PayRules } from '../../lib/workforce/types';
import { csvEscape, downloadTextFile } from '../fuel/fuelUtils';
import ActionModal from '../ActionModal';
import Pagination from '../Pagination';
import ReadOnlyNotice from '../ReadOnlyNotice';
import { Badge, Card, EmptyState, ErrorBanner, Field, FormModal, LoadingRow, PageHeader, RefreshButton, ToolbarButton } from './WorkforceUi';

const PAGE_SIZE = 15;

interface Props {
  canManage: boolean;
  canViewRates: boolean;
}

interface EmployeeForm {
  biometric_id: string;
  full_name: string;
  department: string;
  position: string;
  status: 'active' | 'inactive';
  pay_type: 'daily' | 'fixed';
  ot_eligible: boolean;
  shift_id: string;
  ca_deduction_per_payroll: string;
  notes: string;
  new_rate: string;
  rate_effective_from: string;
}

function emptyForm(today: string, defaultShiftId: string): EmployeeForm {
  return {
    biometric_id: '', full_name: '', department: '', position: '', status: 'active', pay_type: 'daily',
    ot_eligible: true, shift_id: defaultShiftId, ca_deduction_per_payroll: '', notes: '', new_rate: '', rate_effective_from: today,
  };
}

function formFromEmployee(employee: WfEmployeeRow, today: string): EmployeeForm {
  return {
    biometric_id: employee.biometric_id,
    full_name: employee.full_name,
    department: employee.department,
    position: employee.position,
    status: employee.status,
    pay_type: employee.pay_type,
    ot_eligible: employee.ot_eligible,
    shift_id: employee.shift_id ?? '',
    ca_deduction_per_payroll: employee.ca_deduction_per_payroll ? String(employee.ca_deduction_per_payroll) : '',
    notes: employee.notes,
    new_rate: '',
    rate_effective_from: today,
  };
}

export default function WorkforceEmployees({ canManage, canViewRates }: Props) {
  const today = useBusinessToday();
  const [employees, setEmployees] = useState<WfEmployeeRow[]>([]);
  const [shifts, setShifts] = useState<WfShiftRow[]>([]);
  const [rates, setRates] = useState<WfEmployeeRateRow[]>([]);
  const [rules, setRules] = useState<PayRules>(DEFAULT_PAY_RULES);
  const [defaultShiftId, setDefaultShiftId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [flagFilter, setFlagFilter] = useState<'all' | 'no_rate' | 'below_minimum'>('all');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<WfEmployeeRow | 'new' | null>(null);
  const [form, setForm] = useState<EmployeeForm>(() => emptyForm(today, ''));
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusTarget, setStatusTarget] = useState<WfEmployeeRow | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const saveInFlight = useRef(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    const [basics, rateResult] = await Promise.all([
      loadWorkforceBasics(),
      canViewRates ? loadRateHistory() : Promise.resolve({ data: [] as WfEmployeeRateRow[], error: null }),
    ]);
    if (basics.error || !basics.data) {
      setError(`Could not load employees. ${basics.error ?? ''}`.trim());
    } else {
      setEmployees(basics.data.employees);
      setShifts(basics.data.shifts);
      setRules(basics.data.rules);
      setDefaultShiftId(basics.data.settings?.default_shift_id ?? null);
    }
    if (rateResult.error) setError(`Could not load rates. ${rateResult.error.message}`);
    else setRates(rateResult.data);
    setLoading(false);
  }, [canViewRates]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [search, statusFilter, flagFilter]);

  const shiftsById = useMemo(() => new Map(shifts.map(shift => [shift.id, shift])), [shifts]);
  const rateHistory = useMemo(() => rates.map(rate => ({ employeeId: rate.employee_id, dailyRate: Number(rate.daily_rate), effectiveFrom: rate.effective_from })), [rates]);
  const currentRate = useCallback((employeeId: string) => rateOn(rateHistory, employeeId, today), [rateHistory, today]);

  const filtered = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return employees.filter(employee => {
      if (statusFilter !== 'all' && employee.status !== statusFilter) return false;
      if (canViewRates && flagFilter !== 'all' && rateWarning(currentRate(employee.id), employee.pay_type, rules.minDailyWage) !== flagFilter) return false;
      const haystack = `${employee.full_name} ${employee.biometric_id} ${employee.department} ${employee.position}`.toLowerCase();
      return words.every(word => haystack.includes(word));
    });
  }, [canViewRates, currentRate, employees, flagFilter, rules.minDailyWage, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(() => paginate(filtered, currentPage, PAGE_SIZE), [filtered, currentPage]);

  const flagCounts = useMemo(() => {
    const counts = { no_rate: 0, below_minimum: 0 };
    if (!canViewRates) return counts;
    for (const employee of employees) {
      if (employee.status !== 'active') continue;
      const warning = rateWarning(currentRate(employee.id), employee.pay_type, rules.minDailyWage);
      if (warning) counts[warning]++;
    }
    return counts;
  }, [canViewRates, currentRate, employees, rules.minDailyWage]);

  function openNew() {
    setEditing('new');
    setForm(emptyForm(today, defaultShiftId ?? shifts.find(shift => shift.is_active)?.id ?? ''));
    setFormError('');
  }

  function openEdit(employee: WfEmployeeRow) {
    setEditing(employee);
    setForm(formFromEmployee(employee, today));
    setFormError('');
  }

  function update<K extends keyof EmployeeForm>(key: K, value: EmployeeForm[K]) {
    setForm(previous => ({ ...previous, [key]: value }));
  }

  async function handleSave(event?: React.FormEvent) {
    event?.preventDefault();
    if (!canManage || !editing || saveInFlight.current) return;
    const biometricId = normalizeBiometricId(form.biometric_id);
    if (!biometricId || !/^[0-9A-Za-z-]+$/.test(biometricId)) return setFormError('Enter the biometric ID printed on the Time Master report (letters, numbers or dashes).');
    if (!form.full_name.trim()) return setFormError('Enter the employee name.');
    const newRate = form.new_rate.trim() ? parseAmount(form.new_rate) : null;
    if (newRate !== null && !(newRate > 0)) return setFormError('The daily rate must be more than zero.');
    if (newRate !== null && !form.rate_effective_from) return setFormError('Choose when the new rate takes effect.');

    saveInFlight.current = true;
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        biometric_id: biometricId,
        full_name: form.full_name.trim(),
        department: form.department.trim(),
        position: form.position.trim(),
        status: form.status,
        pay_type: form.pay_type,
        ot_eligible: form.ot_eligible,
        shift_id: form.shift_id || null,
        ca_deduction_per_payroll: parseAmount(form.ca_deduction_per_payroll),
        notes: form.notes.trim(),
      };
      const result = editing === 'new'
        ? await supabase.from('wf_employees').insert(payload).select('id')
        : await supabase.from('wf_employees').update(payload).eq('id', editing.id).select('id');
      if (result.error) {
        setFormError(result.error.code === '23505' ? `Biometric ID ${biometricId} is already assigned to another employee.` : friendlyDbError(result.error));
        return;
      }
      const employeeId = result.data?.[0]?.id;
      if (!employeeId) {
        setFormError(NOT_SAVED_MESSAGE);
        return;
      }
      if (newRate !== null) {
        const rateResult = await supabase
          .from('wf_employee_rates')
          .insert({ employee_id: employeeId, daily_rate: newRate, effective_from: form.rate_effective_from })
          .select('id');
        if (rateResult.error || !rateResult.data?.length) {
          setFormError(rateResult.error?.code === '23505'
            ? 'The employee was saved, but a rate already exists for that effective date. Pick another date or ask a manager to correct it.'
            : `The employee was saved, but the rate was not. ${friendlyDbError(rateResult.error)}`);
          await fetchData();
          return;
        }
      }
      setEditing(null);
      await fetchData();
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    if (!canManage || !statusTarget) return;
    setStatusSaving(true);
    const nextStatus = statusTarget.status === 'active' ? 'inactive' : 'active';
    const { data, error: updateError } = await supabase.from('wf_employees').update({ status: nextStatus }).eq('id', statusTarget.id).select('id');
    setStatusSaving(false);
    if (updateError || !data?.length) {
      setError(friendlyDbError(updateError));
    } else {
      setStatusTarget(null);
      await fetchData();
    }
  }

  function handleExport() {
    const headers = ['Biometric ID', 'Name', 'Department', 'Position', 'Status', 'Pay Type', 'OT Eligible', 'Shift', 'C.A per Payroll', ...(canViewRates ? ['Daily Rate'] : [])];
    const rows = filtered.map(employee => [
      employee.biometric_id, employee.full_name, employee.department, employee.position, employee.status,
      employee.pay_type, employee.ot_eligible ? 'Yes' : 'No', shiftsById.get(employee.shift_id ?? '')?.name ?? '',
      employee.ca_deduction_per_payroll,
      ...(canViewRates ? [currentRate(employee.id) ?? ''] : []),
    ]);
    downloadTextFile(`employees-${today}.csv`, [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n'), 'text/csv;charset=utf-8');
  }

  const editingRates = editing && editing !== 'new' ? rates.filter(rate => rate.employee_id === editing.id) : [];

  return (
    <div className="space-y-5">
      <PageHeader title="Employees" subtitle="Biometric ID is the matching key for attendance imports. Names can differ from the device.">
        <ToolbarButton icon={<Download size={16} />} label="Export" onClick={handleExport} disabled={filtered.length === 0} />
        <RefreshButton loading={loading} onClick={fetchData} />
        {canManage && <ToolbarButton tone="primary" icon={<Plus size={16} />} label="Add Employee" onClick={openNew} />}
      </PageHeader>

      {!canManage && <ReadOnlyNotice message="Your account can view employees only. Ask a manager to add employees or change rates." />}
      <ErrorBanner message={error} />

      {canViewRates && (flagCounts.no_rate > 0 || flagCounts.below_minimum > 0) && (
        <div className="flex flex-wrap gap-2 text-sm">
          {flagCounts.no_rate > 0 && (
            <button type="button" onClick={() => setFlagFilter('no_rate')} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 font-semibold text-red-700 hover:bg-red-100">
              {flagCounts.no_rate} active employee{flagCounts.no_rate === 1 ? '' : 's'} with no rate
            </button>
          )}
          {flagCounts.below_minimum > 0 && (
            <button type="button" onClick={() => setFlagFilter('below_minimum')} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 font-semibold text-amber-700 hover:bg-amber-100">
              {flagCounts.below_minimum} below the ₱{money(rules.minDailyWage)} minimum wage
            </button>
          )}
        </div>
      )}

      <Card
        title="Employee Masterlist"
        subtitle={`${filtered.length} of ${employees.length} employees`}
        actions={(
          <>
            <div className="relative min-w-56">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, ID, department..." className="input pl-9" />
            </div>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)} className="input w-auto" aria-label="Status filter">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All statuses</option>
            </select>
            {canViewRates && (
              <select value={flagFilter} onChange={event => setFlagFilter(event.target.value as typeof flagFilter)} className="input w-auto" aria-label="Rate filter">
                <option value="all">All rates</option>
                <option value="no_rate">No rate</option>
                <option value="below_minimum">Below minimum wage</option>
              </select>
            )}
          </>
        )}
      >
        {loading ? <LoadingRow label="Loading employees..." /> : filtered.length === 0 ? (
          <EmptyState icon={<Users size={34} />} title="No employees found" detail="Employees are created automatically by the first attendance import, or add them here." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 text-left">ID</th>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Department / Position</th>
                    <th className="px-4 py-3 text-left">Shift</th>
                    <th className="px-4 py-3 text-left">Pay</th>
                    {canViewRates && <th className="px-4 py-3 text-right">Daily Rate</th>}
                    <th className="px-4 py-3 text-right">C.A / Payroll</th>
                    {canManage && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paged.map(employee => {
                    const rate = currentRate(employee.id);
                    const warning = canViewRates ? rateWarning(rate, employee.pay_type, rules.minDailyWage) : null;
                    return (
                      <tr key={employee.id} className={`transition-colors hover:bg-slate-50 ${employee.status === 'inactive' ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{employee.biometric_id}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-700">{employee.full_name}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {employee.status === 'inactive' && <Badge tone="slate">Inactive</Badge>}
                            {warning === 'no_rate' && <Badge tone="red">No rate</Badge>}
                            {warning === 'below_minimum' && <Badge tone="amber" title={`Below the ₱${money(rules.minDailyWage)} minimum (warning only)`}>Below minimum wage</Badge>}
                            {!employee.shift_id && <Badge tone="amber">No shift</Badge>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <p>{employee.department || '—'}</p>
                          <p className="text-xs text-slate-400">{employee.position}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{shiftsById.get(employee.shift_id ?? '')?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-600">
                          <p className="capitalize">{employee.pay_type}</p>
                          <p className="text-xs text-slate-400">{employee.ot_eligible && employee.pay_type === 'daily' ? 'OT eligible' : 'No OT'}</p>
                        </td>
                        {canViewRates && <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-700">{rate === null ? '—' : `₱${money(rate)}`}</td>}
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{employee.ca_deduction_per_payroll > 0 ? `₱${money(employee.ca_deduction_per_payroll)}` : '—'}</td>
                        {canManage && (
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1.5">
                              <button type="button" onClick={() => openEdit(employee)} className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600" title="Edit employee">
                                <Edit3 size={15} />
                              </button>
                              <button type="button" onClick={() => setStatusTarget(employee)} className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600" title={employee.status === 'active' ? 'Deactivate' : 'Reactivate'}>
                                <Power size={15} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={currentPage} pageSize={PAGE_SIZE} totalItems={filtered.length} onPageChange={setPage} />
          </>
        )}
      </Card>

      <FormModal
        open={editing !== null}
        wide
        title={editing === 'new' ? 'Add Employee' : 'Edit Employee'}
        subtitle="Changing a name here never affects how attendance is matched: the biometric ID is the key."
        onClose={() => !saving && setEditing(null)}
        footer={(
          <>
            <button type="button" onClick={() => setEditing(null)} disabled={saving} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
            <ToolbarButton tone="primary" icon={<Save size={15} />} label="Save Employee" onClick={() => handleSave()} disabled={saving} spinning={saving} />
          </>
        )}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && <ErrorBanner message={formError} />}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Biometric ID" helper="Leading zeros are ignored">
              <input value={form.biometric_id} onChange={event => update('biometric_id', event.target.value)} className="input font-mono" placeholder="ex. 00000002" required />
            </Field>
            <Field label="Full Name">
              <input value={form.full_name} onChange={event => update('full_name', event.target.value)} className="input" placeholder="ex. DELA CRUZ, JUAN" required />
            </Field>
            <Field label="Department">
              <input value={form.department} onChange={event => update('department', event.target.value)} className="input" />
            </Field>
            <Field label="Position">
              <input value={form.position} onChange={event => update('position', event.target.value)} className="input" />
            </Field>
            <Field label="Shift">
              <select value={form.shift_id} onChange={event => update('shift_id', event.target.value)} className="input">
                <option value="">No shift (attendance flagged)</option>
                {shifts.map(shift => <option key={shift.id} value={shift.id}>{shift.name}{shift.is_active ? '' : ' (inactive)'}</option>)}
              </select>
            </Field>
            <Field label="Pay Type" helper={form.pay_type === 'fixed' ? 'Paid every calendar day, no OT' : 'Paid per day worked'}>
              <select value={form.pay_type} onChange={event => update('pay_type', event.target.value as EmployeeForm['pay_type'])} className="input">
                <option value="daily">Daily (per day worked)</option>
                <option value="fixed">Fixed (guards / office staff)</option>
              </select>
            </Field>
            <Field label="C.A Deduction per Payroll" helper="Prefills the payroll register">
              <input type="number" min="0" step="0.01" value={form.ca_deduction_per_payroll} onChange={event => update('ca_deduction_per_payroll', event.target.value)} className="input" placeholder="0.00" />
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={event => update('status', event.target.value as EmployeeForm['status'])} className="input">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.ot_eligible} onChange={event => update('ot_eligible', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
            Eligible for overtime pay
          </label>
          <Field label="Notes">
            <textarea value={form.notes} onChange={event => update('notes', event.target.value)} className="input min-h-16 resize-y" />
          </Field>

          {canViewRates && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-700">Daily Rate</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Rates are kept as history. Payroll uses the rate in effect on the last day of the period and saves a copy on each payroll line.
              </p>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <Field label="New Daily Rate" helper={editing !== 'new' && editing ? `Current: ${currentRate(editing.id) === null ? 'none' : `₱${money(currentRate(editing.id) ?? 0)}`}` : undefined}>
                  <input type="number" min="0" step="0.01" value={form.new_rate} onChange={event => update('new_rate', event.target.value)} className="input" placeholder="Leave blank to keep" />
                </Field>
                <Field label="Effective From">
                  <input type="date" value={form.rate_effective_from} onChange={event => update('rate_effective_from', event.target.value)} className="input" />
                </Field>
              </div>
              {form.new_rate && form.pay_type === 'daily' && parseAmount(form.new_rate) > 0 && parseAmount(form.new_rate) < rules.minDailyWage && (
                <p className="mt-2 text-xs font-medium text-amber-700">Below the ₱{money(rules.minDailyWage)} minimum daily wage set in Pay Rules (warning only).</p>
              )}
              {editingRates.length > 0 && (
                <table className="mt-3 w-full text-xs">
                  <thead><tr className="text-left text-slate-400"><th className="py-1">Effective</th><th className="py-1 text-right">Rate</th><th className="py-1 pl-3">Notes</th></tr></thead>
                  <tbody>
                    {editingRates.map(rate => (
                      <tr key={rate.id} className="border-t border-slate-200 text-slate-600">
                        <td className="py-1">{formatDate(rate.effective_from)}</td>
                        <td className="py-1 text-right tabular-nums">₱{money(rate.daily_rate)}</td>
                        <td className="py-1 pl-3">{rate.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
        </form>
      </FormModal>

      <ActionModal
        open={!!statusTarget}
        title={statusTarget?.status === 'active' ? 'Deactivate Employee' : 'Reactivate Employee'}
        description={statusTarget?.status === 'active'
          ? 'Inactive employees are hidden from timecards and payroll unless they still have punches in the period. Their history is kept.'
          : 'The employee will appear again in timecards and payroll.'}
        variant="warning"
        confirmLabel={statusTarget?.status === 'active' ? 'Deactivate' : 'Reactivate'}
        loading={statusSaving}
        onClose={() => setStatusTarget(null)}
        onConfirm={handleToggleStatus}
      >
        <p className="text-sm text-slate-600"><span className="font-semibold text-slate-900">{statusTarget?.full_name}</span> (ID {statusTarget?.biometric_id})</p>
      </ActionModal>
    </div>
  );
}
