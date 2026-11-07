import { useCallback } from 'react';
import { CalendarDays, Plus, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useBusinessToday } from '../lib/date';
import { describeRange, presetRange, useDateRange } from '../lib/dateRange';
import { useAsyncQuery } from '../lib/useAsyncQuery';
import { paymentAmount, type SalesDashboard } from '../lib/dashboard';
import { peso } from '../lib/reconciliation';
import DateRangeFilter from './DateRangeFilter';
import DashboardCharts from './dashboard/DashboardCharts';
import DashboardInsights from './dashboard/DashboardInsights';
import DashboardRecentSales from './dashboard/DashboardRecentSales';

interface DashboardProps {
  onNavigate: (section: 'daily-add' | 'daily-view' | 'customers-ar') => void;
  onOpenProductReport: () => void;
  refreshKey: number;
  canManageRecords: boolean;
}

export default function Dashboard({ onNavigate, onOpenProductReport, refreshKey, canManageRecords }: DashboardProps) {
  const range = useDateRange('TODAY');
  const today = useBusinessToday();
  // Recalculate presets after Philippine midnight; keep explicit custom dates fixed.
  const dates = range.preset === 'CUSTOM' ? { from: range.from, to: range.to } : presetRange(range.preset, today);
  const normalized = describeRange(dates.from, dates.to);
  const start = normalized.start;
  const end = normalized.end && normalized.end < today ? normalized.end : today;
  const query = useCallback(async (signal: AbortSignal) => {
    if (start && start > today) throw new Error('Choose a date range up to today.');
    const { data, error } = await supabase.rpc('get_sales_dashboard', { p_from: start || undefined, p_to: end }).abortSignal(signal);
    if (error) throw new Error(error.message);
    if (!data) throw new Error('No dashboard snapshot was returned.');
    return data as unknown as SalesDashboard;
    // refreshKey invalidates the entire dashboard after a record changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, today, refreshKey]);
  const { data, loading, error, refresh } = useAsyncQuery<SalesDashboard | null>(query, null);
  const cards = data ? [
    { label: 'Sales total', value: peso(data.totals.sales), note: `${data.totals.transactions} sales transactions · includes fees` },
    { label: 'Net sales', value: peso(data.totals.net_sales), note: 'Material sales + DR fees' },
    { label: 'Sales volume', value: `${data.totals.volume.toFixed(2)} m³`, note: 'Non-donation sales' },
    { label: 'Pending receivables', value: peso(data.totals.pending_ar), note: 'Current pending P.O / OFFSET portions of sales dated in this range' },
    { label: 'GCash', value: peso(paymentAmount(data, 'GCASH')), note: 'Sales allocations, including split payments' },
    { label: 'Bank transfer', value: peso(paymentAmount(data, 'BANK_TRANSFER')), note: 'Sales allocations, including split payments' },
  ] : [];

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-slate-800">Dashboard</h1><p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><CalendarDays size={15} /> Sales performance & daily operations</p></div>
      <div className="flex flex-wrap gap-2">
        {canManageRecords && <button type="button" onClick={() => onNavigate('daily-add')} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"><Plus size={15} /> Add entry</button>}
        <button type="button" disabled={loading} onClick={refresh} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh</button>
      </div>
    </div>
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <DateRangeFilter range={{ ...range, ...dates }} maxDate={today} />
      <p className="text-xs leading-relaxed text-slate-500">Applies to all dashboard figures, charts, insights, and recent sales. Dates follow Philippine time; future dates are excluded. Donations are excluded throughout. Net sales exclude delivery, Passway, and Kulot fees.</p>
      {data && !loading && <p className="text-xs font-medium text-emerald-700">{describeRange(data.from, data.to).label}{data.partial ? ' · Includes today so far (partial)' : ' · Completed period'} · Updated {new Date(data.generated_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} PHT</p>}
    </div>
    {loading ? <div role="status" className="rounded-xl border border-slate-200 bg-white py-20 text-center text-sm text-slate-500"><RefreshCw size={22} className="mx-auto mb-3 animate-spin" />Loading dashboard for the selected range…</div>
      : error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"><p>Unable to load dashboard. {error}</p><button type="button" onClick={refresh} className="mt-2 font-semibold underline">Retry</button></div>
      : data && <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(card => <article key={card.label} className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-sm font-medium text-slate-500">{card.label}</h2><p className="mt-2 text-2xl font-bold tabular-nums text-slate-800">{card.value}</p><p className="mt-1 text-xs text-slate-500">{card.note}</p></article>)}</div>
        <DashboardInsights data={data} />
        <DashboardCharts data={data} />
        <DashboardRecentSales data={data} />
        <div className="flex flex-wrap gap-4 text-sm font-medium text-emerald-700"><button type="button" onClick={onOpenProductReport} className="hover:underline">Open product reports</button><button type="button" onClick={() => onNavigate('daily-view')} className="hover:underline">Open today's ledger</button><button type="button" onClick={() => onNavigate('customers-ar')} className="hover:underline">Open accounts receivable</button></div>
      </>}
  </div>;
}
