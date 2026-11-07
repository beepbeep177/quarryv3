import { paymentLabel, type SalesDashboard } from '../../lib/dashboard';
import { shortDate } from '../../lib/dateRange';
import { peso } from '../../lib/reconciliation';

export default function DashboardRecentSales({ data }: { data: SalesDashboard }) {
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 p-5"><h2 className="font-semibold text-slate-800">Recent sales</h2><p className="mt-1 text-xs text-slate-500">Latest six entries within the selected date range · donations excluded</p></div>
    {!data.recent.length ? <p className="p-10 text-center text-sm text-slate-500">No sales recorded in this range.</p> : <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{['Date', 'DR number', 'Customer / truck', 'Product', 'Sales total', 'Payment'].map(label => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{data.recent.map(row => <tr key={row.id} className="text-slate-700"><td className="px-4 py-3">{shortDate(row.transaction_date)}</td><td className="px-4 py-3 font-medium">{row.dr_number || '—'}</td><td className="px-4 py-3">{row.customer || '—'}<span className="mt-1 block text-xs text-slate-500">{row.truck || '—'}</span></td><td className="px-4 py-3">{row.material_type || 'Unspecified'}</td><td className="px-4 py-3 font-semibold tabular-nums">{peso(row.total_amount ?? 0)}</td><td className="px-4 py-3">{paymentLabel(row.payment_mode)}</td></tr>)}</tbody></table></div>}
  </section>;
}
