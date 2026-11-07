import { peso } from '../../lib/reconciliation';
import type { DailySalesInsights, SalesInsight } from '../../lib/salesInsights';

export default function SalesInsightsContent({ data, insights, allocationIssues = false }: { data: DailySalesInsights; insights: SalesInsight[]; allocationIssues?: boolean }) {
  const excludedTimes = data.partial_day ? data.current.missing_times + data.baseline.excluded_missing_times : data.current.missing_times;
  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span className="rounded-full bg-white px-2.5 py-1 font-medium text-indigo-700">{data.partial_day ? `Today so far · comparisons through ${data.comparison_cutoff} PHT` : `Full business day · ${data.date}`}</span>
        <span>As of {new Date(data.generated_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} PHT</span>
      </div>
      {allocationIssues && <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Payment allocation discrepancies were found for this date. Treat the payment-mix figures as provisional until those postings are reviewed.</p>}
      {excludedTimes > 0 && <p className="text-xs text-amber-700">{data.partial_day ? `${excludedTimes} entry/entries in this eight-day window have no posting time and are excluded from time-matched comparisons. Selected-day totals still include those entries.` : `${excludedTimes} selected-date entry/entries have no posting time and are excluded from peak-hour findings. Full-day comparisons and totals still include those entries.`}</p>}
      {data.current.transactions === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">No recorded non-donation sales for this date. Insights will appear when sales are available.</p>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            {insights.map(insight => <article key={insight.id} className={`rounded-lg border bg-white p-4 ${insight.tone === 'attention' ? 'border-amber-200' : 'border-slate-200'}`}>
              <h3 className="text-sm font-semibold text-slate-800">{insight.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{insight.detail}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{insight.note}</p>
            </article>)}
          </div>
          {data.top_products.length > 0 && <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3"><h3 className="text-sm font-semibold text-slate-800">Top products by net sales</h3><p className="mt-1 text-xs text-slate-500">Up to three products for the selected date.</p></div>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-4 py-2">Product</th><th className="px-4 py-2 text-right">Transactions</th><th className="px-4 py-2 text-right">Volume</th><th className="px-4 py-2 text-right">Net sales</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{data.top_products.map(product => <tr key={product.product}><td className="px-4 py-3 font-medium text-slate-700">{product.product}</td><td className="px-4 py-3 text-right tabular-nums">{product.transactions}</td><td className="px-4 py-3 text-right tabular-nums">{product.volume.toFixed(2)} m³</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{peso(product.net_sales)}</td></tr>)}</tbody>
            </table></div>
          </div>}
        </>
      )}
    </div>
  );
}
