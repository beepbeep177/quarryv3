import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Download, HandCoins, Plus, Search, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { friendlyDbError, NOT_SAVED_MESSAGE } from '../../lib/dbErrors';
import { useBusinessToday } from '../../lib/date';
import type { WfCashAdvanceEntryRow, WfEmployeeRow } from '../../lib/database.types';
import { fetchAllPages } from '../../lib/fetchAll';
import { paginate } from '../../lib/pagination';
import { formatDate, money, parseAmount, peso } from '../../lib/workforce/format';
import { round2 } from '../../lib/workforce/payroll';
import { csvEscape, downloadTextFile } from '../fuel/fuelUtils';
import Pagination from '../Pagination';
import ReadOnlyNotice from '../ReadOnlyNotice';
import { Badge, Card, EmptyState, ErrorBanner, Field, FormModal, LoadingRow, PageHeader, RefreshButton, StatCard, ToolbarButton } from './WorkforceUi';

const PAGE_SIZE = 15;

interface Props {
  canManage: boolean;
}

interface EntryForm {
  employeeId: string;
  entryDate: string;
  type: 'advance' | 'adjustment';
  direction: 'increase' | 'decrease';
  amount: string;
  description: string;
}

const TYPE_LABEL: Record<WfCashAdvanceEntryRow['type'], string> = {
  advance: 'Advance',
  deduction: 'Payroll deduction',
  adjustment: 'Adjustment',
};

export default function WorkforceCashAdvances({ canManage }: Props) {
  const today = useBusinessToday();
  const [employees, setEmployees] = useState<WfEmployeeRow[]>([]);
  const [entries, setEntries] = useState<WfCashAdvanceEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [withBalanceOnly, setWithBalanceOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [ledgerEmployeeId, setLedgerEmployeeId] = useState<string | null>(null);
  const [form, setForm] = useState<EntryForm | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    // Balances are computed from the full ledger, never typed in.
    const [employeeResult, entryResult] = await Promise.all([
      fetchAllPages<WfEmployeeRow>(async (from, to) => await supabase.from('wf_employees').select('*').order('full_name').range(from, to)),
      fetchAllPages<WfCashAdvanceEntryRow>(async (from, to) => await supabase.from('wf_cash_advance_entries').select('*').order('entry_date').order('created_at').range(from, to)),
    ]);
    const problem = employeeResult.error ?? entryResult.error;
    if (problem) setError(`Could not load cash advances. ${problem.message}`);
    setEmployees(employeeResult.data);
    setEntries(entryResult.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [search, withBalanceOnly]);

  const balances = useMemo(() => {
    const map = new Map<string, { balance: number; lastDate: string | null; advanced: number }>();
    for (const entry of entries) {
      const current = map.get(entry.employee_id) ?? { balance: 0, lastDate: null, advanced: 0 };
      map.set(entry.employee_id, {
        balance: round2(current.balance + Number(entry.amount)),
        lastDate: entry.entry_date,
        advanced: round2(current.advanced + (entry.type === 'advance' ? Number(entry.amount) : 0)),
      });
    }
    return map;
  }, [entries]);

  const rows = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return employees
      .filter(employee => {
        const info = balances.get(employee.id);
        if (withBalanceOnly && !(info && Math.abs(info.balance) >= 0.005)) return false;
        if (!info && employee.status !== 'active') return false;
        const haystack = `${employee.full_name} ${employee.biometric_id}`.toLowerCase();
        return words.every(word => haystack.includes(word));
      })
      .map(employee => ({ employee, info: balances.get(employee.id) ?? { balance: 0, lastDate: null, advanced: 0 } }))
      .sort((a, b) => b.info.balance - a.info.balance || a.employee.full_name.localeCompare(b.employee.full_name));
  }, [balances, employees, search, withBalanceOnly]);

  const totalOutstanding = useMemo(() => round2([...balances.values()].reduce((sum, info) => sum + Math.max(0, info.balance), 0)), [balances]);
  const owingCount = useMemo(() => [...balances.values()].filter(info => info.balance > 0.005).length, [balances]);
  const paged = useMemo(() => paginate(rows, page, PAGE_SIZE), [rows, page]);

  const ledgerEmployee = ledgerEmployeeId ? employees.find(employee => employee.id === ledgerEmployeeId) ?? null : null;
  const ledger = useMemo(() => {
    if (!ledgerEmployeeId) return [];
    let running = 0;
    return entries
      .filter(entry => entry.employee_id === ledgerEmployeeId)
      .map(entry => {
        running = round2(running + Number(entry.amount));
        return { entry, running };
      })
      .reverse();
  }, [entries, ledgerEmployeeId]);

  function openForm(type: EntryForm['type'], employeeId = '') {
    setForm({ employeeId, entryDate: today, type, direction: type === 'advance' ? 'increase' : 'decrease', amount: '', description: '' });
    setFormError('');
  }

  async function handleSave(event?: React.FormEvent) {
    event?.preventDefault();
    if (!form || !canManage || saving) return;
    const amount = parseAmount(form.amount);
    if (!form.employeeId) return setFormError('Choose an employee.');
    if (!form.entryDate) return setFormError('Choose a date.');
    if (!(amount > 0)) return setFormError('Enter an amount greater than zero.');
    if (form.type === 'adjustment' && !form.description.trim()) return setFormError('Explain the adjustment.');
    const signed = form.type === 'advance' || form.direction === 'increase' ? amount : -amount;
    setSaving(true);
    setFormError('');
    const { data, error: insertError } = await supabase
      .from('wf_cash_advance_entries')
      .insert({
        employee_id: form.employeeId,
        entry_date: form.entryDate,
        type: form.type,
        amount: round2(signed),
        description: form.description.trim(),
      })
      .select('id');
    setSaving(false);
    if (insertError || !data?.length) {
      setFormError(insertError ? friendlyDbError(insertError) : NOT_SAVED_MESSAGE);
      return;
    }
    setForm(null);
    await fetchData();
  }

  function handleExport() {
    const headers = ['Biometric ID', 'Name', 'C.A per Payroll', 'Total Advanced', 'Balance', 'Last Entry'];
    const csvRows = rows.map(({ employee, info }) => [employee.biometric_id, employee.full_name, employee.ca_deduction_per_payroll, info.advanced, info.balance, info.lastDate ?? '']);
    downloadTextFile(`cash-advances-${today}.csv`, [headers, ...csvRows].map(row => row.map(csvEscape).join(',')).join('\n'), 'text/csv;charset=utf-8');
  }

  const formBalance = form?.employeeId ? balances.get(form.employeeId)?.balance ?? 0 : 0;

  return (
    <div className="space-y-5">
      <PageHeader title="Cash Advances" subtitle="Vale ledger per employee. Payroll deductions are added automatically when a payroll is locked.">
        <ToolbarButton icon={<Download size={16} />} label="Export" onClick={handleExport} disabled={rows.length === 0} />
        <RefreshButton loading={loading} onClick={fetchData} />
        {canManage && <ToolbarButton icon={<Plus size={16} />} label="Adjustment" onClick={() => openForm('adjustment')} />}
        {canManage && <ToolbarButton tone="primary" icon={<HandCoins size={16} />} label="Add Advance" onClick={() => openForm('advance')} />}
      </PageHeader>
      {!canManage && <ReadOnlyNotice message="Your account can view cash advances only." />}
      <ErrorBanner message={error} />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Outstanding balance" value={peso(totalOutstanding)} tone="amber" />
        <StatCard label="Employees with balance" value={String(owingCount)} />
        <StatCard label="Ledger entries" value={String(entries.length)} tone="slate" />
      </div>

      <Card
        title="Balances"
        subtitle="Balance = advances + adjustments − payroll deductions."
        actions={(
          <>
            <div className="relative min-w-56">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name or ID..." className="input pl-9" />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={withBalanceOnly} onChange={event => setWithBalanceOnly(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
              With balance only
            </label>
          </>
        )}
      >
        {loading ? <LoadingRow label="Loading cash advances..." /> : rows.length === 0 ? (
          <EmptyState icon={<HandCoins size={34} />} title="No balances" detail="Recorded advances will appear here." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 text-left">Employee</th>
                    <th className="px-4 py-3 text-right">Per Payroll</th>
                    <th className="px-4 py-3 text-right">Total Advanced</th>
                    <th className="px-4 py-3 text-right">Balance</th>
                    <th className="px-4 py-3 text-left">Last Entry</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paged.map(({ employee, info }) => (
                    <tr key={employee.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-700">{employee.full_name}</p>
                        <p className="text-xs text-slate-400">ID {employee.biometric_id}{employee.status === 'inactive' ? ' · inactive' : ''}</p>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{employee.ca_deduction_per_payroll > 0 ? money(employee.ca_deduction_per_payroll) : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{money(info.advanced)}</td>
                      <td className={`px-4 py-3 text-right font-bold tabular-nums ${info.balance > 0 ? 'text-amber-700' : info.balance < 0 ? 'text-red-600' : 'text-slate-500'}`}>{money(info.balance)}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(info.lastDate)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2 text-xs font-semibold">
                          <button type="button" onClick={() => setLedgerEmployeeId(employee.id)} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"><BookOpen size={14} /> Ledger</button>
                          {canManage && <button type="button" onClick={() => openForm('advance', employee.id)} className="text-emerald-600 hover:text-emerald-700">+ Advance</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} totalItems={rows.length} onPageChange={setPage} />
          </>
        )}
      </Card>

      {ledgerEmployee && (
        <div className="fixed inset-0 z-[60] flex justify-end bg-slate-900/30" onClick={() => setLedgerEmployeeId(null)}>
          <aside className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl" onClick={event => event.stopPropagation()} aria-label="Cash advance ledger">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">ID {ledgerEmployee.biometric_id}</p>
                <h2 className="text-base font-bold text-slate-800">{ledgerEmployee.full_name}</h2>
                <p className="text-sm text-slate-500">Balance {peso(balances.get(ledgerEmployee.id)?.balance ?? 0)}</p>
              </div>
              <button type="button" onClick={() => setLedgerEmployeeId(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {ledger.length === 0 ? <EmptyState icon={<BookOpen size={30} />} title="No entries" detail="This employee has no cash advance history." /> : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">Entry</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                      <th className="px-4 py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ledger.map(({ entry, running }) => (
                      <tr key={entry.id}>
                        <td className="px-4 py-2 text-slate-600">{formatDate(entry.entry_date)}</td>
                        <td className="px-4 py-2">
                          <Badge tone={entry.type === 'advance' ? 'amber' : entry.type === 'deduction' ? 'emerald' : 'slate'}>{TYPE_LABEL[entry.type]}</Badge>
                          {entry.description && <p className="mt-0.5 text-xs text-slate-500">{entry.description}</p>}
                        </td>
                        <td className={`px-4 py-2 text-right tabular-nums ${entry.amount < 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{entry.amount > 0 ? '+' : ''}{money(entry.amount)}</td>
                        <td className="px-4 py-2 text-right font-semibold tabular-nums">{money(running)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </aside>
        </div>
      )}

      <FormModal
        open={!!form}
        title={form?.type === 'advance' ? 'Add Cash Advance' : 'Add Adjustment'}
        subtitle={form?.type === 'advance' ? 'Money given to the employee. It is deducted in payroll by their per-payroll amount.' : 'Corrects a balance. Entries are never edited or deleted.'}
        onClose={() => !saving && setForm(null)}
        footer={(
          <>
            <button type="button" onClick={() => setForm(null)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
            <ToolbarButton tone="primary" icon={<Plus size={15} />} label="Save Entry" onClick={() => handleSave()} disabled={saving} spinning={saving} />
          </>
        )}
      >
        {form && (
          <form onSubmit={handleSave} className="space-y-4">
            <ErrorBanner message={formError} />
            <Field label="Employee" helper={form.employeeId ? `Balance ${peso(formBalance)}` : undefined}>
              <select value={form.employeeId} onChange={event => setForm({ ...form, employeeId: event.target.value })} className="input" required>
                <option value="">Choose employee...</option>
                {employees.filter(employee => employee.status === 'active' || employee.id === form.employeeId).map(employee => (
                  <option key={employee.id} value={employee.id}>{employee.full_name} (ID {employee.biometric_id})</option>
                ))}
              </select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date"><input type="date" value={form.entryDate} onChange={event => setForm({ ...form, entryDate: event.target.value })} className="input" required /></Field>
              <Field label="Amount"><input type="number" min="0" step="0.01" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} className="input" placeholder="0.00" required /></Field>
            </div>
            {form.type === 'adjustment' && (
              <Field label="Direction">
                <select value={form.direction} onChange={event => setForm({ ...form, direction: event.target.value as EntryForm['direction'] })} className="input">
                  <option value="decrease">Decrease balance (e.g. paid back in cash)</option>
                  <option value="increase">Increase balance (e.g. opening balance)</option>
                </select>
              </Field>
            )}
            <Field label={form.type === 'adjustment' ? 'Reason (required)' : 'Description'}>
              <input value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} className="input" placeholder={form.type === 'advance' ? 'ex. Vale for medicine' : 'ex. Opening balance from logbook'} />
            </Field>
            <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
          </form>
        )}
      </FormModal>
    </div>
  );
}
