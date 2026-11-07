import {
  Banknote,
  FileBarChart2,
  ReceiptText,
  RefreshCw,
  TrendingUp
} from 'lucide-react';
import ExpensesLedger from '../ExpensesLedger';
import Pagination from '../Pagination';
import { REPORT_PAGE_SIZE, fmt, formatBucketLabel } from './reportUtils';
import type { ReportsData } from './useReportsData';

export default function ExpensesReport({ data }: { data: ReportsData; }) {
  const {
    expenseGrouping,
    setExpenseSummaryPage,
    setExpenseCategoryPage,
    expenses,
    setExpenseLedgerFilter,
    loading,
    fetchReportData,
    expenseSummaryList,
    totalExpenseRecords,
    expenseCategoryTotals,
    topExpenseCategory,
    topExpenseCategoryAmount,
    totalExpenses,
    expenseSummaryCurrentPage,
    pagedExpenseSummary,
    expenseCategoryCurrentPage,
    pagedExpenseCategories
  } = data;
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Expenses', value: `₱${fmt(totalExpenses)}`, icon: <Banknote size={18} className="text-red-500" />, bg: 'bg-red-50' },
          { label: 'Records', value: String(totalExpenseRecords), icon: <ReceiptText size={18} className="text-amber-500" />, bg: 'bg-amber-50' },
          { label: 'Top Category', value: topExpenseCategory, icon: <FileBarChart2 size={18} className="text-violet-500" />, bg: 'bg-violet-50' },
          { label: 'Top Category Total', value: `₱${fmt(topExpenseCategoryAmount)}`, icon: <TrendingUp size={18} className="text-sky-500" />, bg: 'bg-sky-50' },
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
          <h2 className="font-semibold text-slate-800">{expenseGrouping === 'MONTH' ? 'Monthly Breakdown' : expenseGrouping === 'WEEK' ? 'Weekly Breakdown' : 'Daily Breakdown'}</h2>
        </div>
        {loading ? (
          <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
            <RefreshCw size={16} className="animate-spin" /> Loading expense report...
          </div>
        ) : expenseSummaryList.length === 0 ? (
          <div className="py-16 text-center">
            <Banknote size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No expense data in selected range</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Period</th>
                  <th className="px-4 py-3 text-right">Records</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedExpenseSummary.map(row => (
                  <tr key={row.bucketStart} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">
                      {formatBucketLabel(row.bucketStart, expenseGrouping)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{row.count}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600 tabular-nums">₱{fmt(row.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900">
                  <td className="px-4 py-3 text-slate-300 font-semibold text-xs uppercase">Totals</td>
                  <td className="px-4 py-3 text-right text-slate-300 font-semibold tabular-nums">{totalExpenseRecords}</td>
                  <td className="px-4 py-3 text-right text-red-300 font-bold tabular-nums">₱{fmt(totalExpenses)}</td>
                </tr>
              </tfoot>
            </table>
            <Pagination page={expenseSummaryCurrentPage} pageSize={REPORT_PAGE_SIZE} totalItems={expenseSummaryList.length} onPageChange={setExpenseSummaryPage} />
          </div>
        )}
      </div>

      {expenseCategoryTotals.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">By Category</h2>
          </div>
          {loading ? (
            <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
              <RefreshCw size={16} className="animate-spin" /> Loading...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedExpenseCategories.map(([catName, catTotal]) => (
                    <tr key={catName} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-700">{catName}</td>
                      <td className="px-4 py-3 text-right text-red-600 font-semibold tabular-nums">₱{fmt(catTotal)}</td>
                      <td className="px-4 py-3 text-right text-slate-500 tabular-nums">
                        {totalExpenses > 0 ? `${((catTotal / totalExpenses) * 100).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900">
                    <td className="px-4 py-3 text-slate-300 font-semibold text-xs uppercase">Total</td>
                    <td className="px-4 py-3 text-right text-red-300 font-bold tabular-nums">₱{fmt(totalExpenses)}</td>
                    <td className="px-4 py-3 text-right text-slate-400 tabular-nums">100%</td>
                  </tr>
                </tfoot>
              </table>
              <Pagination page={expenseCategoryCurrentPage} pageSize={REPORT_PAGE_SIZE} totalItems={expenseCategoryTotals.length} onPageChange={setExpenseCategoryPage} />
            </div>
          )}
        </div>
      )}

      <ExpensesLedger
        expenses={expenses}
        loading={loading}
        onRefresh={fetchReportData}
        onFilterChange={setExpenseLedgerFilter}
      />
    </>
  );
}
