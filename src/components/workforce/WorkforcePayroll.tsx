import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Plus, Wallet } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { friendlyDbError, NOT_SAVED_MESSAGE } from '../../lib/dbErrors';
import { useBusinessToday } from '../../lib/date';
import type { WfPayrollPeriodRow } from '../../lib/database.types';
import { paginate } from '../../lib/pagination';
import { formatDateTime, formatPeriod, peso } from '../../lib/workforce/format';
import { nextPeriodRange, round2 } from '../../lib/workforce/payroll';
import { datesInRange } from '../../lib/workforce/timecard';
import Pagination from '../Pagination';
import ReadOnlyNotice from '../ReadOnlyNotice';
import PayrollRegister from './PayrollRegister';
import { Badge, Card, EmptyState, ErrorBanner, Field, FormModal, LoadingRow, PageHeader, RefreshButton, ToolbarButton } from './WorkforceUi';

const PAGE_SIZE = 10;

interface Props {
  canManage: boolean;
  canLock: boolean;
  canUnlock: boolean;
}

export default function WorkforcePayroll({ canManage, canLock, canUnlock }: Props) {
  const today = useBusinessToday();
  const [periods, setPeriods] = useState<WfPayrollPeriodRow[]>([]);
  const [totalsByPeriod, setTotalsByPeriod] = useState<Map<string, { count: number; net: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newRange, setNewRange] = useState({ dateFrom: '', dateTo: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchPeriods = useCallback(async () => {
    setLoading(true);
    setError('');
    const [periodResult, lineResult] = await Promise.all([
      supabase.from('wf_payroll_periods').select('*').order('date_from', { ascending: false }).limit(500),
      supabase.from('wf_payroll_lines').select('period_id, net_pay').limit(20000),
    ]);
    if (periodResult.error || lineResult.error) {
      setError(`Could not load payroll periods. ${(periodResult.error ?? lineResult.error)?.message ?? ''}`.trim());
    }
    setPeriods(periodResult.data ?? []);
    const totals = new Map<string, { count: number; net: number }>();
    for (const line of lineResult.data ?? []) {
      const current = totals.get(line.period_id) ?? { count: 0, net: 0 };
      totals.set(line.period_id, { count: current.count + 1, net: round2(current.net + Number(line.net_pay)) });
    }
    setTotalsByPeriod(totals);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPeriods(); }, [fetchPeriods]);

  const selected = useMemo(() => periods.find(period => period.id === selectedId) ?? null, [periods, selectedId]);
  const paged = useMemo(() => paginate(periods, page, PAGE_SIZE), [periods, page]);

  function openNew() {
    const latest = periods.reduce<string | null>((max, period) => (!max || period.date_to > max ? period.date_to : max), null);
    setNewRange(nextPeriodRange(latest, today));
    setFormError('');
    setCreating(true);
  }

  async function handleCreate(event?: React.FormEvent) {
    event?.preventDefault();
    if (!canManage || saving) return;
    if (!newRange.dateFrom || !newRange.dateTo || newRange.dateTo < newRange.dateFrom) {
      setFormError('Choose a valid date range.');
      return;
    }
    if (datesInRange(newRange.dateFrom, newRange.dateTo).length > 31) {
      setFormError('A payroll period can be at most 31 days.');
      return;
    }
    setSaving(true);
    const { data, error: insertError } = await supabase
      .from('wf_payroll_periods')
      .insert({ date_from: newRange.dateFrom, date_to: newRange.dateTo })
      .select('*');
    setSaving(false);
    if (insertError || !data?.length) {
      setFormError(insertError ? friendlyDbError(insertError) : NOT_SAVED_MESSAGE);
      return;
    }
    setCreating(false);
    await fetchPeriods();
    setSelectedId(data[0].id);
  }

  if (selected) {
    return (
      <PayrollRegister
        key={selected.id}
        period={selected}
        canManage={canManage}
        canLock={canLock}
        canUnlock={canUnlock}
        onBack={() => setSelectedId(null)}
        onChanged={fetchPeriods}
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Payroll" subtitle="Weekly payroll computed from timecards. Locking posts net pay to Expenses (Salary/Advances).">
        <RefreshButton loading={loading} onClick={fetchPeriods} />
        {canManage && <ToolbarButton tone="primary" icon={<Plus size={16} />} label="New Period" onClick={openNew} />}
      </PageHeader>
      {!canManage && <ReadOnlyNotice message="Your account can view payroll only." />}
      <ErrorBanner message={error} />

      <Card title="Payroll Periods">
        {loading ? <LoadingRow label="Loading payroll periods..." /> : periods.length === 0 ? (
          <EmptyState icon={<Wallet size={34} />} title="No payroll periods yet" detail={canManage ? 'Create the first period with "New Period".' : 'Payroll periods will appear here.'} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 text-left">Period</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Employees</th>
                    <th className="px-4 py-3 text-right">Net Pay</th>
                    <th className="px-4 py-3 text-left">Locked</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paged.map(period => {
                    const totals = totalsByPeriod.get(period.id);
                    return (
                      <tr key={period.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelectedId(period.id)}>
                        <td className="px-4 py-3 font-semibold text-slate-700">{formatPeriod(period.date_from, period.date_to)}</td>
                        <td className="px-4 py-3"><Badge tone={period.status === 'draft' ? 'amber' : 'emerald'}>{period.status === 'draft' ? 'Draft' : 'Locked'}</Badge></td>
                        <td className="px-4 py-3 text-right tabular-nums">{totals?.count ?? 0}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">{peso(totals?.net ?? 0)}</td>
                        <td className="px-4 py-3 text-slate-500">{period.locked_at ? formatDateTime(period.locked_at) : '—'}</td>
                        <td className="px-4 py-3 text-right text-slate-400"><ChevronRight size={16} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} totalItems={periods.length} onPageChange={setPage} />
          </>
        )}
      </Card>

      <FormModal
        open={creating}
        title="New Payroll Period"
        subtitle="Defaults to the day after the last period, 7 days long."
        onClose={() => !saving && setCreating(false)}
        footer={(
          <>
            <button type="button" onClick={() => setCreating(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
            <ToolbarButton tone="primary" icon={<Plus size={15} />} label="Create Period" onClick={() => handleCreate()} disabled={saving} spinning={saving} />
          </>
        )}
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <ErrorBanner message={formError} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From"><input type="date" value={newRange.dateFrom} onChange={event => setNewRange(previous => ({ ...previous, dateFrom: event.target.value }))} className="input" required /></Field>
            <Field label="To"><input type="date" value={newRange.dateTo} onChange={event => setNewRange(previous => ({ ...previous, dateTo: event.target.value }))} className="input" required /></Field>
          </div>
          <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
        </form>
      </FormModal>
    </div>
  );
}
