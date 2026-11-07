import { useCallback } from 'react';
import { Lightbulb, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAsyncQuery } from '../../lib/useAsyncQuery';
import { buildSalesInsights, type DailySalesInsights as InsightsData } from '../../lib/salesInsights';
import SalesInsightsContent from './SalesInsightsContent';

export default function DailySalesInsights({ date, allocationIssues = false }: { date: string; allocationIssues?: boolean }) {
  const query = useCallback(async (signal: AbortSignal) => {
    const { data, error } = await supabase.rpc('get_daily_sales_insights', { p_date: date }).abortSignal(signal);
    if (error) throw new Error(error.message);
    if (!data) throw new Error('No sales insight data was returned.');
    return data as unknown as InsightsData;
  }, [date]);
  const { data, loading, error, refresh } = useAsyncQuery<InsightsData | null>(query, null);
  return (
    <section aria-labelledby="sales-insights-title" className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="sales-insights-title" className="flex items-center gap-2 font-semibold text-slate-800"><Lightbulb size={19} className="text-indigo-600" /> Daily Sales Insights</h2>
          <p className="mt-1 text-xs text-slate-500">Calculated from recorded sales. Net sales include DR fees and exclude delivery, Passway, and Kulot fees. Donation entries are excluded.</p>
        </div>
        <button type="button" disabled={loading} onClick={refresh} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 disabled:opacity-50"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh insights</button>
      </div>
      {loading ? <p role="status" className="py-6 text-center text-sm text-slate-500">Calculating sales insights…</p> : error ? (
        <div role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Unable to load sales insights. <button type="button" onClick={refresh} className="font-semibold underline">Try again</button></div>
      ) : data && <SalesInsightsContent data={data} insights={buildSalesInsights(data)} allocationIssues={allocationIssues} />}
    </section>
  );
}
