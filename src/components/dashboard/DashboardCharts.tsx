import { useId } from 'react';
import { paymentLabel, type SalesDashboard } from '../../lib/dashboard';
import { shortDate } from '../../lib/dateRange';
import { peso } from '../../lib/reconciliation';

const colors = ['#059669', '#0284c7', '#d97706', '#7c3aed', '#e11d48', '#475569', '#0891b2'];
const compact = (value: number) => new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const panel = 'rounded-xl border border-slate-200 bg-white p-5';
const empty = <p className="py-12 text-center text-sm text-slate-500">No sales data in this range.</p>;

export default function DashboardCharts({ data }: { data: SalesDashboard }) {
  const gradientId = useId();
  const values = data.trend.map(row => row.value);
  const min = Math.min(0, ...values), max = Math.max(1, ...values);
  const x = (index: number) => 65 + index / Math.max(1, values.length - 1) * 630;
  const y = (value: number) => 200 - (value - min) / (max - min) * 165;
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(' ');
  const productMax = Math.max(1, ...data.products.map(row => Math.abs(row.value)));
  const positivePayments = data.payments.filter(row => row.value > 0);
  const allocated = positivePayments.reduce((sum, row) => sum + row.value, 0);
  let cursor = 0;
  const gradient = positivePayments.map((row, index) => {
    const start = cursor; cursor += row.value / allocated * 100;
    return `${colors[index % colors.length]} ${start}% ${cursor}%`;
  }).join(', ');
  return <div className="grid gap-5 lg:grid-cols-2">
    <section className={`${panel} lg:col-span-2`} aria-label="Net sales trend">
      <h2 className="font-semibold text-slate-800">Net sales trend</h2><p className="mt-1 text-xs text-slate-500">{data.bucket === 'day' ? 'Daily' : data.bucket === 'month' ? 'Monthly' : 'Yearly'} totals · zero-record periods included · boundary buckets cover selected dates only</p>
      {!data.totals.transactions ? empty : <>
        <svg viewBox="0 0 720 245" className="mt-4 w-full max-h-72" role="img" aria-label={`Net sales by ${data.bucket}, ${data.from} to ${data.to}. Exact values in the expandable table below.`}>
          <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity="0.22" /><stop offset="100%" stopColor="#10b981" stopOpacity="0.01" /></linearGradient></defs>
          {[min, (max + min) / 2, max].map((value, index) => <g key={index}><line x1="65" x2="695" y1={y(value)} y2={y(value)} stroke="#e2e8f0" strokeDasharray="4 4" /><text x="55" y={y(value) + 4} textAnchor="end" fontSize="11" fill="#64748b">₱{compact(value)}</text></g>)}
          <polygon points={`${x(0)},${y(0)} ${points} ${x(values.length - 1)},${y(0)}`} fill={`url(#${gradientId})`} />
          <polyline points={points} fill="none" stroke="#059669" strokeWidth="3" strokeLinejoin="round" />
          {data.trend.map((row, index) => <circle key={row.date} cx={x(index)} cy={y(row.value)} r="3" fill="#059669"><title>{`${shortDate(row.date)}: ${peso(row.value)}, ${row.transactions} transactions`}</title></circle>)}
          {[...new Set([0, Math.floor((values.length - 1) / 2), values.length - 1])].map(index => <text key={index} x={x(index)} y="230" textAnchor={index === 0 ? 'start' : index === values.length - 1 ? 'end' : 'middle'} fontSize="11" fill="#64748b">{shortDate(data.trend[index].date)}</text>)}
        </svg>
        <details className="mt-2 text-xs text-slate-600"><summary className="cursor-pointer font-medium">View trend values</summary><div className="mt-3 max-h-56 overflow-auto"><table className="w-full text-left"><thead><tr><th className="p-2">Bucket starting</th><th className="p-2 text-right">Net sales</th><th className="p-2 text-right">Transactions</th></tr></thead><tbody>{data.trend.map(row => <tr key={row.date} className="border-t border-slate-100"><td className="p-2">{shortDate(row.date)}</td><td className="p-2 text-right">{peso(row.value)}</td><td className="p-2 text-right">{row.transactions}</td></tr>)}</tbody></table></div></details>
      </>}
    </section>
    <section className={panel} aria-label="Product sales bar chart"><h2 className="font-semibold text-slate-800">Product sales</h2><p className="mt-1 text-xs text-slate-500">Net sales · top six products, remaining products combined</p>
      {!data.products.length ? empty : <div className="mt-5 space-y-4">{data.products.map((row, index) => <div key={row.label}><div className="mb-1 flex flex-wrap justify-between gap-2 text-sm"><span className="font-medium text-slate-700">{row.label}</span><span className="tabular-nums text-slate-600">{peso(row.value)}</span></div><div className="h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className="h-full rounded-full" style={{ width: `${Math.abs(row.value) / productMax * 100}%`, backgroundColor: colors[index % colors.length] }} /></div><p className="mt-1 text-xs text-slate-500">{row.transactions} transactions · {row.volume.toFixed(2)} m³</p></div>)}</div>}
    </section>
    <section className={panel} aria-label="Payment allocation pie chart"><h2 className="font-semibold text-slate-800">Payment mix</h2><p className="mt-1 text-xs text-slate-500">Share of positive payment allocations, including fees · split payments separated</p>
      {!allocated ? empty : <div className="mt-6 flex flex-wrap items-center justify-center gap-6"><div role="img" aria-label="Payment allocation donut; amounts and percentages listed alongside" className="relative h-40 w-40 shrink-0 rounded-full" style={{ background: `conic-gradient(${gradient})` }}><div className="absolute inset-8 flex items-center justify-center rounded-full bg-white text-center"><span className="text-xs text-slate-500">Allocated<br /><strong className="text-lg text-slate-800">₱{compact(allocated)}</strong></span></div></div><ul className="min-w-48 flex-1 space-y-3">{positivePayments.map((row, index) => <li key={row.label} className="text-sm"><div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />{paymentLabel(row.label)}</span><strong className="text-slate-700">{(row.value / allocated * 100).toFixed(1)}%</strong></div><p className="ml-4 mt-0.5 text-xs text-slate-500">{peso(row.value)}</p></li>)}</ul></div>}
      <p className="mt-5 text-xs leading-relaxed text-slate-500">Credit use is not new cash. P.O / OFFSET allocations are separate from later collections. {data.totals.allocation_mismatches > 0 ? 'Allocation discrepancies exist; see Operational Sales Insights.' : ''}{data.payments.some(row => row.value < 0) ? ' Negative allocations are excluded from the pie.' : ''}</p>
    </section>
  </div>;
}
