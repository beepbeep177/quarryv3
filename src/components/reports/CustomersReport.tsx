import {
  DollarSign,
  FileBarChart2,
  Layers,
  RefreshCw,
  Users
} from 'lucide-react';
import type { TransactionWithRelations } from '../../lib/database.types';
import Pagination from '../Pagination';
import { REPORT_PAGE_SIZE, fmt, formatBucketLabel, formatDateLabel, formatTransactionTime, formatVolume } from './reportUtils';
import type { ReportsData } from './useReportsData';

export default function CustomersReport({ data, onOpenTransaction }: { data: ReportsData; onOpenTransaction: (transaction: TransactionWithRelations) => void; }) {
  const {
    customerGrouping,
    setCustomerSummaryPage,
    setCustomerTransactionsPage,
    loading,
    customerLoading,
    customerTransactions,
    customerSummaryList,
    customerTotalSales,
    customerTotalVolume,
    customerCount,
    selectedCustomer,
    customerSummaryCurrentPage,
    pagedCustomerSummary,
    customerTransactionsCurrentPage,
    pagedCustomerTransactions
  } = data;
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Sales Total', value: `₱${fmt(customerTotalSales)}`, icon: <DollarSign size={18} className="text-emerald-500" />, bg: 'bg-emerald-50' },
          { label: 'Volume Sold', value: `${formatVolume(customerTotalVolume)} m³`, icon: <Layers size={18} className="text-sky-500" />, bg: 'bg-sky-50' },
          { label: selectedCustomer ? 'Transactions' : 'Customers Reached', value: String(selectedCustomer ? customerTransactions.length : customerCount), icon: <Users size={18} className="text-violet-500" />, bg: 'bg-violet-50' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>{card.icon}</div>
            <p className="text-xs text-slate-500 font-medium">{card.label}</p>
            <p className="text-lg font-bold text-slate-800 mt-0.5 tabular-nums">{loading || customerLoading ? '—' : card.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">{selectedCustomer ? `${selectedCustomer.name} Summary` : 'Customer Sales Over Time'}</h2>
        </div>
        {loading || customerLoading ? (
          <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
            <RefreshCw size={16} className="animate-spin" /> Loading customer history...
          </div>
        ) : customerSummaryList.length === 0 ? (
          <div className="py-16 text-center">
            <Users size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No customer sales in selected range</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Period</th>
                  {!selectedCustomer && <th className="px-4 py-3 text-right">Customers</th>}
                  <th className="px-4 py-3 text-right">Transactions</th>
                  <th className="px-4 py-3 text-right">Volume (m³)</th>
                  <th className="px-4 py-3 text-right">Sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedCustomerSummary.map(summary => (
                  <tr key={summary.bucketStart} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">{formatBucketLabel(summary.bucketStart, customerGrouping)}</td>
                    {!selectedCustomer && <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{summary.customerIds.size}</td>}
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{summary.count}</td>
                    <td className="px-4 py-3 text-right text-emerald-600 font-semibold tabular-nums">{formatVolume(summary.volume)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800 tabular-nums">₱{fmt(summary.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={customerSummaryCurrentPage} pageSize={REPORT_PAGE_SIZE} totalItems={customerSummaryList.length} onPageChange={setCustomerSummaryPage} />
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-800">Transaction Drill-down</h2>
            <p className="text-xs text-slate-500 mt-1">Double-click a row to view full transaction details.</p>
          </div>
          <span className="text-xs text-slate-500 font-medium">{customerTransactions.length} record{customerTransactions.length !== 1 ? 's' : ''}</span>
        </div>
        {loading ? (
          <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
            <RefreshCw size={16} className="animate-spin" /> Loading transactions...
          </div>
        ) : customerTransactions.length === 0 ? (
          <div className="py-16 text-center">
            <FileBarChart2 size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No transaction records to show</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Time</th>
                  <th className="px-4 py-3 text-left">DR #</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Truck</th>
                  <th className="px-4 py-3 text-left">Material</th>

                  <th className="px-4 py-3 text-right">Length (cm)</th>
                  <th className="px-4 py-3 text-right">Width (cm)</th>
                  <th className="px-4 py-3 text-right">Height (cm)</th>
                  <th className="px-4 py-3 text-right">Volume (m³)</th>

                  <th className="px-4 py-3 text-right">Unit Price</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">DR Capitol</th>
                  <th className="px-4 py-3 text-right">Delivery</th>
                  <th className="px-4 py-3 text-right">Passway</th>
                  <th className="px-4 py-3 text-right">Kulot</th>
                  <th className="px-4 py-3 text-right">Total</th>

                  <th className="px-4 py-3 text-center">Mode</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                  {/* <th className="px-4 py-3 text-left">Created At</th> */}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {pagedCustomerTransactions.map(tx => (
                  <tr
                    key={tx.id}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                    onDoubleClick={() => onOpenTransaction(tx)}
                    title="Double-click to view details"
                  >
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {formatDateLabel(tx.transaction_date, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </td>

                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {formatTransactionTime(tx.transaction_time)}
                    </td>

                    <td className="px-4 py-3 font-mono font-semibold text-slate-700 whitespace-nowrap">
                      {tx.dr_number || '—'}
                    </td>

                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                      {tx.customers?.name ?? '—'}
                    </td>

                    <td className="px-4 py-3 text-slate-500 font-mono text-xs whitespace-nowrap">
                      {tx.trucks?.plate_number ?? '—'}
                    </td>

                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {tx.material_type ?? '—'}
                    </td>

                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                      {fmt(tx.length_cm ?? 0)}
                    </td>

                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                      {fmt(tx.width_cm ?? 0)}
                    </td>

                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                      {fmt(tx.height_cm ?? 0)}
                    </td>

                    <td className="px-4 py-3 text-right text-emerald-600 font-semibold tabular-nums">
                      {formatVolume(tx.volume_m3 ?? 0)}
                    </td>

                    <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                      ₱{fmt(tx.unit_price ?? 0)}
                    </td>

                    <td className="px-4 py-3 text-right text-slate-700 font-semibold tabular-nums">
                      ₱{fmt(tx.amount ?? 0)}
                    </td>

                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                      ₱{fmt(tx.dr_capitol ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                      ₱{fmt(tx.delivery_fee ?? 0)}
                    </td>

                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                      ₱{fmt(tx.passway ?? 0)}
                    </td>

                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                      ₱{fmt(tx.kulot ?? 0)}
                    </td>

                    <td className="px-4 py-3 text-right font-bold text-slate-800 tabular-nums">
                      ₱{fmt(tx.total_amount ?? 0)}
                    </td>

                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${tx.payment_mode === 'CASH'
                          ? 'bg-emerald-100 text-emerald-700'
                          : tx.payment_mode === 'P.O'
                            ? 'bg-amber-100 text-amber-700'
                            : tx.payment_mode === 'GCASH'
                              ? 'bg-blue-100 text-blue-700'
                              : tx.payment_mode === 'BANK_TRANSFER'
                                ? 'bg-violet-100 text-violet-700'
                                : tx.payment_mode === 'CUSTOMER_CREDIT'
                                  ? 'bg-teal-100 text-teal-700'
                                  : tx.payment_mode === 'OFFSET'
                                    ? 'bg-pink-100 text-pink-700'
                                    : tx.payment_mode === 'DONATION'
                                      ? 'bg-rose-100 text-rose-700'
                                      : tx.payment_mode === 'SPLIT'
                                        ? 'bg-cyan-100 text-cyan-700'
                                        : 'bg-slate-100 text-slate-600'
                          }`}
                      >
                        {tx.payment_mode === 'BANK_TRANSFER'
                          ? 'BANK'
                          : tx.payment_mode === 'CUSTOMER_CREDIT'
                            ? 'CREDIT'
                            : tx.payment_mode === 'DONATION'
                              ? 'DONATE'
                              : tx.payment_mode || '—'}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${tx.status === 'PAID'
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                          : 'bg-amber-50 text-amber-600 border-amber-200'
                          }`}
                      >
                        {tx.status || '—'}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-slate-500 max-w-[240px] truncate">
                      {tx.notes || '—'}
                    </td>

                    {/* <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {tx.created_at
                          ? formatDateLabel(tx.created_at, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })
                          : '—'}
                      </td> */}
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={customerTransactionsCurrentPage} pageSize={REPORT_PAGE_SIZE} totalItems={customerTransactions.length} onPageChange={setCustomerTransactionsPage} />
          </div>
        )}
      </div>
    </>
  );
}
