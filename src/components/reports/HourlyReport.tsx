import {
  Calendar,
  Clock3,
  FileBarChart2,
  RefreshCw,
  TrendingUp
} from 'lucide-react';
import { fmt, formatVolume } from './reportUtils';
import type { ReportsData } from './useReportsData';

export default function HourlyReport({ data }: { data: ReportsData; }) {
  const {
    transactions,
    loading,
    grandNetSales,
    grandVolume,
    cashTotal,
    poTotal,
    offsetTotal,
    gcashTotal,
    bankTransferTotal,
    customerCreditTotal,
    hourlyKpiList,
    peakHour,
    averageTransactionsPerActiveHour
  } = data;
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Peak Hour', value: peakHour?.label ?? '—', icon: <Clock3 size={18} className="text-emerald-500" />, bg: 'bg-emerald-50' },
          { label: 'Peak Transactions', value: String(peakHour?.count ?? 0), icon: <FileBarChart2 size={18} className="text-sky-500" />, bg: 'bg-sky-50' },
          { label: 'Active Hours', value: String(hourlyKpiList.length), icon: <Calendar size={18} className="text-violet-500" />, bg: 'bg-violet-50' },
          { label: 'Avg Tx / Active Hr', value: averageTransactionsPerActiveHour.toFixed(1), icon: <TrendingUp size={18} className="text-amber-500" />, bg: 'bg-amber-50' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>{card.icon}</div>
            <p className="text-xs text-slate-500 font-medium">{card.label}</p>
            <p className="text-lg font-bold text-slate-800 mt-0.5 tabular-nums truncate">{loading ? '—' : card.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Transactions by Captured Time</h2>
          <p className="text-xs text-slate-500 mt-1">Based on the system-captured transaction time, grouped per hour.</p>
        </div>
        {loading ? (
          <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
            <RefreshCw size={16} className="animate-spin" /> Loading hourly KPI...
          </div>
        ) : hourlyKpiList.length === 0 ? (
          <div className="py-16 text-center">
            <Clock3 size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No transaction time data in selected range</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Hour</th>
                  <th className="px-4 py-3 text-right">Transactions</th>
                  <th className="px-4 py-3 text-right">Volume (m³)</th>
                  <th className="px-4 py-3 text-right">Net Sales</th>
                  <th className="px-4 py-3 text-right">Avg Sale / Tx</th>
                  <th className="px-4 py-3 text-right">Cash</th>
                  <th className="px-4 py-3 text-right">P.O</th>
                  <th className="px-4 py-3 text-right">Offset</th>
                  <th className="px-4 py-3 text-right">GCash</th>
                  <th className="px-4 py-3 text-right">Bank</th>
                  <th className="px-4 py-3 text-right">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hourlyKpiList.map(bucket => (
                  <tr key={bucket.hour} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">{bucket.label}</td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{bucket.count}</td>
                    <td className="px-4 py-3 text-right text-emerald-600 font-semibold tabular-nums">{formatVolume(bucket.volume)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800 tabular-nums">₱{fmt(bucket.netSales)}</td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">₱{fmt(bucket.count > 0 ? bucket.netSales / bucket.count : 0)}</td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{bucket.cash > 0 ? `₱${fmt(bucket.cash)}` : '—'}</td>
                    <td className="px-4 py-3 text-right text-amber-600 tabular-nums">{bucket.po > 0 ? `₱${fmt(bucket.po)}` : '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-500 tabular-nums">{bucket.offset > 0 ? `₱${fmt(bucket.offset)}` : '—'}</td>
                    <td className="px-4 py-3 text-right text-blue-600 tabular-nums">{bucket.gcash > 0 ? `₱${fmt(bucket.gcash)}` : '—'}</td>
                    <td className="px-4 py-3 text-right text-violet-600 tabular-nums">{bucket.bankTransfer > 0 ? `₱${fmt(bucket.bankTransfer)}` : '—'}</td>
                    <td className="px-4 py-3 text-right text-teal-600 tabular-nums">{bucket.customerCredit > 0 ? `₱${fmt(bucket.customerCredit)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900">
                  <td className="px-4 py-3 text-slate-300 font-semibold text-xs uppercase">Totals</td>
                  <td className="px-4 py-3 text-right text-slate-300 font-semibold tabular-nums">{transactions.length}</td>
                  <td className="px-4 py-3 text-right text-emerald-400 font-bold tabular-nums">{formatVolume(grandVolume)}</td>
                  <td className="px-4 py-3 text-right text-white font-bold tabular-nums">₱{fmt(grandNetSales)}</td>
                  <td className="px-4 py-3 text-right text-slate-300 font-semibold tabular-nums">₱{fmt(transactions.length > 0 ? grandNetSales / transactions.length : 0)}</td>
                  <td className="px-4 py-3 text-right text-slate-300 font-semibold tabular-nums">₱{fmt(cashTotal)}</td>
                  <td className="px-4 py-3 text-right text-amber-400 font-semibold tabular-nums">₱{fmt(poTotal)}</td>
                  <td className="px-4 py-3 text-right text-slate-400 font-semibold tabular-nums">₱{fmt(offsetTotal)}</td>
                  <td className="px-4 py-3 text-right text-blue-400 font-semibold tabular-nums">₱{fmt(gcashTotal)}</td>
                  <td className="px-4 py-3 text-right text-violet-400 font-semibold tabular-nums">₱{fmt(bankTransferTotal)}</td>
                  <td className="px-4 py-3 text-right text-teal-400 font-semibold tabular-nums">₱{fmt(customerCreditTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
