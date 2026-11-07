import { useCallback, useState } from 'react';
import { CheckCircle, AlertTriangle, RefreshCw, Scale } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useBusinessToday } from '../lib/date';
import { useAsyncQuery } from '../lib/useAsyncQuery';
import { reconciliationChecks, peso, liters, type DailyReconciliationResult } from '../lib/reconciliation';
import ReconciliationDetails from './reconciliation/ReconciliationDetails';

export default function DailyReconciliation() {
  const today = useBusinessToday();
  const [selectedDate, setSelectedDate] = useState(today);
  const query = useCallback(async (signal: AbortSignal) => {
    const { data, error } = await supabase.rpc('get_daily_reconciliation', { p_date: selectedDate }).abortSignal(signal);
    if (error) throw new Error(error.message);
    if (!data) throw new Error('No reconciliation result was returned.');
    return data as unknown as DailyReconciliationResult;
  }, [selectedDate]);
  const { data, loading, error, refresh } = useAsyncQuery<DailyReconciliationResult | null>(query, null);
  const checks = data ? reconciliationChecks(data) : [];
  const issues = checks.filter(check => check.status === 'issue').length;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800"><Scale size={24} /> Daily Reconciliation</h1>
          <p className="mt-1 text-sm text-slate-500">Sales, collections, customer credit, and fuel postings in one read-only review.</p>
        </div>
        <div className="flex gap-2">
          <input aria-label="Reconciliation date" type="date" max={today} value={selectedDate} onChange={event => setSelectedDate(event.target.value || today)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          <button type="button" onClick={refresh} disabled={loading} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh</button>
        </div>
      </div>
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        Dates follow Philippine time. Sales include receivables and credit use; collections show money received. These totals are different measures. This screen checks recorded postings; physical cash and fuel still need an actual count. Historical results reflect current records and can change after edits, voids, or backdated entries.
      </div>
      {loading ? <div role="status" className="flex justify-center gap-2 py-16 text-sm text-slate-500"><RefreshCw size={16} className="animate-spin" /> Checking records…</div> : error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"><p>Unable to reconcile this date. {error}</p><button onClick={refresh} className="mt-2 font-semibold underline">Try again</button></div>
      ) : data && (
        <>
          <div className={`flex items-center gap-3 rounded-xl border p-4 ${issues > 0 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
            {issues > 0 ? <AlertTriangle size={20} /> : <CheckCircle size={20} />}
            <div><p className="font-semibold">{issues > 0 ? `${issues} check(s) need review` : 'No discrepancies found in the checks performed'}</p><p className="mt-1 text-xs">{data.sales.count} sales transaction(s). Snapshot: {new Date(data.generated_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} PHT.</p></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Sales total', peso(data.sales.total), `${data.sales.count} transactions; ${data.sales.volume.toFixed(2)} m³`],
              ['Collections received', peso(data.sales.direct_collections + data.sales.receivable_collections), 'Direct payments + receivable payments'],
              ['Receivables created', peso(data.sales.receivables_created), 'P.O / OFFSET portions of sales for this date'],
              ['Expenses recorded', peso(data.expenses), 'Recorded expenses, including posted fuel purchases'],
            ].map(([label, value, note]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-xl font-bold tabular-nums text-slate-800">{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></div>)}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {checks.map(check => <div key={check.label} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between gap-2"><h2 className="font-semibold text-slate-800">{check.label}</h2><span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${check.status === 'issue' ? 'bg-amber-100 text-amber-800' : check.status === 'balanced' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{check.status === 'issue' ? 'Review' : check.status === 'balanced' ? 'Matched' : 'Not compared'}</span></div><p className="mt-2 text-sm text-slate-500">{check.detail}</p></div>)}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold text-slate-800">Customer credit movement</h2>
              <dl className="mt-3 space-y-2 text-sm">
                {[
                  ['Opening balance', data.credit.opening], ['Credits / deposits', data.credit.credits],
                  ['Debits / credit used', data.credit.debits], ['Closing balance', data.credit.closing],
                ].map(([label, value]) => <div key={label} className="flex justify-between gap-4"><dt className="text-slate-500">{label}</dt><dd className={`font-semibold tabular-nums ${Number(value) < 0 ? 'text-red-600' : 'text-slate-800'}`}>{peso(Number(value))}</dd></div>)}
              </dl>
              <p className="mt-3 text-xs text-slate-500">{data.credit.negative_customers} customer(s) have negative balances. Negative customer credit is allowed and is not a posting discrepancy.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold text-slate-800">Activity breakdown</h2>
              <dl className="mt-3 space-y-2 text-sm">
                {[
                  ['Net sales (includes DR fees)', peso(data.sales.net_sales)],
                  ['Direct cash / GCash / bank sales', peso(data.sales.direct_collections)],
                  ['Receivable payments received', peso(data.sales.receivable_collections)],
                  ['Credit used (sales + settlements)', peso(data.sales.customer_credit_used)],
                  ['Fuel purchase records', liters(data.fuel.purchases_liters)],
                  ['Fuel issuance records', liters(data.fuel.issuances_liters)],
                ].map(([label, value]) => <div key={label} className="flex justify-between gap-4"><dt className="text-slate-500">{label}</dt><dd className="font-semibold tabular-nums text-slate-800">{value}</dd></div>)}
              </dl>
              <p className="mt-3 text-xs text-slate-500">Fuel source quantities include reversed records. Inventory below includes the reversal movements and edit corrections.</p>
            </div>
          </div>
          <ReconciliationDetails report={data} />
        </>
      )}
    </div>
  );
}
