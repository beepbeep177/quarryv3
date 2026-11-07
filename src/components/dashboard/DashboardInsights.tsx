import { ChevronDown, Lightbulb } from 'lucide-react';
import { dashboardInsights, type SalesDashboard } from '../../lib/dashboard';

export default function DashboardInsights({ data }: { data: SalesDashboard }) {
  return <details open className="group rounded-xl border border-indigo-200 bg-indigo-50/40">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
      <span><span className="flex items-center gap-2 font-semibold text-slate-800"><Lightbulb size={19} className="text-indigo-600" /> Operational Sales Insights</span><span className="mt-1 block text-xs text-slate-500">Facts from the selected date range · click to expand or collapse</span></span>
      <ChevronDown size={19} className="shrink-0 transition-transform group-open:rotate-180" />
    </summary>
    <div className="space-y-3 px-5 pb-5">
      {data.totals.allocation_mismatches > 0 && <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{data.totals.allocation_mismatches} payment allocation discrepancy/discrepancies. Treat payment charts and insights as provisional; review postings in Daily Reconciliation.</p>}
      {!data.totals.transactions ? <p className="text-sm text-slate-500">No recorded sales in this range. Insights will appear when sales are available.</p> : <div className="grid gap-3 lg:grid-cols-2">{dashboardInsights(data).map(fact => <article key={fact.id} className={`rounded-lg border bg-white p-4 ${fact.tone === 'attention' ? 'border-amber-200' : 'border-slate-200'}`}>
        <h3 className="text-sm font-semibold text-slate-800">{fact.title}</h3><p className="mt-2 text-sm text-slate-700">{fact.detail}</p><p className="mt-2 text-xs leading-relaxed text-slate-500">{fact.note}</p>
      </article>)}</div>}
    </div>
  </details>;
}
