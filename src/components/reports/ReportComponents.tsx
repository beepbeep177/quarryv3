import { fmt } from './reportUtils';
import type { FinancialLineItem } from './types';
export function DetailItem({
  label,
  value,
  mono = false,
  highlight = false
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-sm ${highlight
        ? 'text-emerald-600 font-bold'
        : 'text-slate-700 font-medium'
        } ${mono ? 'font-mono' : ''}`}>
        {value}
      </p>
    </div>
  );
}

const chartColors = ['#10b981', '#38bdf8', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b'];

export function PieChart({ data }: { data: { label: string; value: number; }[]; }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const gradient = total > 0
    ? data.map((item, index) => {
      const start = cursor;
      const end = cursor + (item.value / total) * 100;
      cursor = end;
      return `${chartColors[index % chartColors.length]} ${start}% ${end}%`;
    }).join(', ')
    : '#e2e8f0 0% 100%';

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <div className="relative w-40 h-40 rounded-full shrink-0" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="absolute inset-8 rounded-full bg-white flex items-center justify-center text-center">
          <div>
            <p className="text-xl font-bold text-slate-800 tabular-nums">{total}</p>
            <p className="text-xs text-slate-500">sold</p>
          </div>
        </div>
      </div>
      <div className="space-y-2 min-w-48 flex-1">
        {data.length === 0 ? (
          <p className="text-sm text-slate-500">No data available</p>
        ) : data.map((item, index) => (
          <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
              <span className="text-slate-600 truncate">{item.label}</span>
            </span>
            <span className="font-semibold text-slate-800 tabular-nums">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinancialStatementTable({
  title,
  rows,
  total,
  totalLabel,
  tone,
}: {
  title: string;
  rows: FinancialLineItem[];
  total: number;
  totalLabel: string;
  tone: 'revenue' | 'expense';
}) {
  const isRevenue = tone === 'revenue';
  const accent = isRevenue
    ? {
      border: 'border-t-emerald-200',
      header: 'bg-emerald-50/50',
      totalBg: 'bg-emerald-50',
      totalText: 'text-emerald-700',
    }
    : {
      border: 'border-t-red-200',
      header: 'bg-red-50/50',
      totalBg: 'bg-red-50',
      totalText: 'text-red-700',
    };

  return (
    <div className={`bg-white rounded-xl border border-slate-200 ${accent.border} border-t-2 overflow-hidden`}>
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={`${accent.header} text-slate-500 text-xs font-semibold uppercase tracking-wide`}>
              <th className="px-5 py-3 text-left">Description</th>
              <th className="px-4 py-3 text-right">Amount (₱)</th>
              <th className="px-4 py-3 text-right">% of {isRevenue ? 'Revenue' : 'Expenses'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-12 text-center text-slate-400">
                  No {isRevenue ? 'revenue' : 'expense'} line items found
                </td>
              </tr>
            ) : rows.map(row => (
              <tr key={row.label} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3 text-slate-700 font-medium">{row.label}</td>
                <td className="px-4 py-3 text-right text-slate-800 font-semibold tabular-nums">₱{fmt(row.amount)}</td>
                <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{total > 0 ? `${row.share.toFixed(2)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={accent.totalBg}>
              <td className={`px-5 py-4 text-xs uppercase font-bold ${accent.totalText}`}>{totalLabel}</td>
              <td className={`px-4 py-4 text-right font-bold tabular-nums ${accent.totalText}`}>₱{fmt(total)}</td>
              <td className={`px-4 py-4 text-right font-bold tabular-nums ${accent.totalText}`}>{total > 0 ? '100.00%' : '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export function FormulaAmount({
  label,
  value,
  tone,
  prefix = '',
}: {
  label: string;
  value: number;
  tone: 'revenue' | 'expense' | 'net';
  prefix?: string;
}) {
  const color = tone === 'revenue' ? 'text-emerald-600' : tone === 'expense' ? 'text-red-500' : 'text-slate-900';
  return (
    <div className="text-center md:text-right">
      <p className="text-xs text-slate-500 uppercase font-semibold">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${color}`}>
        {prefix && <span className="text-slate-400 mr-3">{prefix}</span>}
        ₱{fmt(value)}
      </p>
    </div>
  );
}
