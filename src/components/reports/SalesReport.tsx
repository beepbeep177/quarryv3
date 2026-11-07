import {
  Banknote,
  DollarSign,
  FileBarChart2,
  Layers,
  ReceiptText,
  RefreshCw,
  TrendingUp
} from 'lucide-react';
import Pagination from '../Pagination';
import { REPORT_PAGE_SIZE, fmt, formatBucketLabel, formatVolume } from './reportUtils';
import type { ReportsData } from './useReportsData';

export default function SalesReport({ data }: { data: ReportsData; }) {
  const {
    setSalesPage,
    transactions,
    loading,
    range,
    salesSummaryList,
    grandNetSales,
    grandDrFees,
    grandDeliveryFees,
    grandExtraFees,
    grandVolume,
    cashTotal,
    poTotal,
    offsetTotal,
    gcashTotal,
    bankTransferTotal,
    customerCreditTotal,
    salesCurrentPage,
    pagedSalesSummary
  } = data;
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
        {[
          { label: 'Net Sales', value: `₱${fmt(grandNetSales)}`, icon: <DollarSign size={18} className="text-emerald-500" />, bg: 'bg-emerald-50' },
          { label: 'Extra Fees', value: `₱${fmt(grandExtraFees)}`, icon: <ReceiptText size={18} className="text-orange-500" />, bg: 'bg-orange-50' },
          { label: 'Total Volume', value: `${formatVolume(grandVolume)} m³`, icon: <Layers size={18} className="text-sky-500" />, bg: 'bg-sky-50' },
          { label: 'Cash Sales', value: `₱${fmt(cashTotal)}`, icon: <TrendingUp size={18} className="text-emerald-500" />, bg: 'bg-emerald-50' },
          { label: 'P.O Receivable', value: `₱${fmt(poTotal)}`, icon: <ReceiptText size={18} className="text-amber-500" />, bg: 'bg-amber-50' },
          { label: 'GCash Sales', value: `₱${fmt(gcashTotal)}`, icon: <Banknote size={18} className="text-blue-500" />, bg: 'bg-blue-50' },
          { label: 'Bank Transfer', value: `₱${fmt(bankTransferTotal)}`, icon: <Banknote size={18} className="text-violet-500" />, bg: 'bg-violet-50' },
          { label: 'Customer Credit', value: `₱${fmt(customerCreditTotal)}`, icon: <Banknote size={18} className="text-teal-500" />, bg: 'bg-teal-50' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>{card.icon}</div>
            <p className="text-xs text-slate-500 font-medium">{card.label}</p>
            <p className="text-lg font-bold text-slate-800 mt-0.5 tabular-nums">{loading ? '—' : card.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">{range.salesGrouping === 'MONTH' ? 'Monthly Breakdown' : 'Daily Breakdown'}</h2>
        </div>
        {loading ? (
          <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
            <RefreshCw size={16} className="animate-spin" /> Loading report...
          </div>
        ) : salesSummaryList.length === 0 ? (
          <div className="py-16 text-center">
            <FileBarChart2 size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No sales data in selected range</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Period</th>
                  <th className="px-4 py-3 text-right">Transactions</th>
                  <th className="px-4 py-3 text-right">Volume (m³)</th>
                  <th className="px-4 py-3 text-right">Cash</th>
                  <th className="px-4 py-3 text-right">P.O</th>
                  <th className="px-4 py-3 text-right">Offset</th>
                  <th className="px-4 py-3 text-right">GCash</th>
                  <th className="px-4 py-3 text-right">Bank</th>
                  <th className="px-4 py-3 text-right">Credit</th>
                  <th className="px-4 py-3 text-right">DR Fees</th>
                  <th className="px-4 py-3 text-right">Delivery</th>
                  <th className="px-4 py-3 text-right">Extra Fees</th>
                  <th className="px-4 py-3 text-right">Net Sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedSalesSummary.map(summary => (
                  <tr key={summary.bucketStart} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">
                      {formatBucketLabel(summary.bucketStart, range.salesGrouping)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{summary.count}</td>
                    <td className="px-4 py-3 text-right text-emerald-600 font-semibold tabular-nums">{formatVolume(summary.volume)}</td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{summary.cash > 0 ? `₱${fmt(summary.cash)}` : '—'}</td>
                    <td className="px-4 py-3 text-right text-amber-600 tabular-nums">{summary.po > 0 ? `₱${fmt(summary.po)}` : '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-500 tabular-nums">{summary.offset > 0 ? `₱${fmt(summary.offset)}` : '—'}</td>
                    <td className="px-4 py-3 text-right text-blue-600 tabular-nums">{summary.gcash > 0 ? `₱${fmt(summary.gcash)}` : '—'}</td>
                    <td className="px-4 py-3 text-right text-violet-600 tabular-nums">{summary.bankTransfer > 0 ? `₱${fmt(summary.bankTransfer)}` : '—'}</td>
                    <td className="px-4 py-3 text-right text-teal-600 tabular-nums">{summary.customerCredit > 0 ? `₱${fmt(summary.customerCredit)}` : '—'}</td>
                    <td className="px-4 py-3 text-right text-emerald-600 tabular-nums">{summary.drFees > 0 ? `₱${fmt(summary.drFees)}` : '—'}</td>
                    <td className="px-4 py-3 text-right text-sky-600 tabular-nums">{summary.deliveryFees > 0 ? `₱${fmt(summary.deliveryFees)}` : '—'}</td>
                    <td className="px-4 py-3 text-right text-orange-500 tabular-nums">{summary.extraFees > 0 ? `₱${fmt(summary.extraFees)}` : '—'}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800 tabular-nums">₱{fmt(summary.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900">
                  <td className="px-4 py-3 text-slate-300 font-semibold text-xs uppercase">Totals</td>
                  <td className="px-4 py-3 text-right text-slate-300 font-semibold tabular-nums">{transactions.length}</td>
                  <td className="px-4 py-3 text-right text-emerald-400 font-bold tabular-nums">{formatVolume(grandVolume)}</td>
                  <td className="px-4 py-3 text-right text-slate-300 font-semibold tabular-nums">₱{fmt(cashTotal)}</td>
                  <td className="px-4 py-3 text-right text-amber-400 font-semibold tabular-nums">₱{fmt(poTotal)}</td>
                  <td className="px-4 py-3 text-right text-slate-400 font-semibold tabular-nums">₱{fmt(offsetTotal)}</td>
                  <td className="px-4 py-3 text-right text-blue-400 font-semibold tabular-nums">₱{fmt(gcashTotal)}</td>
                  <td className="px-4 py-3 text-right text-violet-400 font-semibold tabular-nums">₱{fmt(bankTransferTotal)}</td>
                  <td className="px-4 py-3 text-right text-teal-400 font-semibold tabular-nums">₱{fmt(customerCreditTotal)}</td>
                  <td className="px-4 py-3 text-right text-emerald-400 font-semibold tabular-nums">₱{fmt(grandDrFees)}</td>
                  <td className="px-4 py-3 text-right text-sky-400 font-semibold tabular-nums">₱{fmt(grandDeliveryFees)}</td>
                  <td className="px-4 py-3 text-right text-orange-400 font-semibold tabular-nums">₱{fmt(grandExtraFees)}</td>
                  <td className="px-4 py-3 text-right text-white font-bold tabular-nums">₱{fmt(grandNetSales)}</td>
                </tr>
              </tfoot>
            </table>
            <Pagination page={salesCurrentPage} pageSize={REPORT_PAGE_SIZE} totalItems={salesSummaryList.length} onPageChange={setSalesPage} />
          </div>
        )}
      </div>
    </>
  );
}
