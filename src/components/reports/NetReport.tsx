import {
  Banknote,
  Calendar,
  DollarSign,
  RefreshCw,
  TrendingUp
} from 'lucide-react';
import { FinancialStatementTable, FormulaAmount } from './ReportComponents';
import { fmt } from './reportUtils';
import type { ReportsData } from './useReportsData';

export default function NetReport({ data }: { data: ReportsData; }) {
  const { loading, grandNetSales, totalExpenses, revenueLineItems, expenseLineItems, netIncomeList, netIncome } = data;
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Revenue', value: `₱${fmt(grandNetSales)}`, icon: <DollarSign size={18} className="text-emerald-500" />, bg: 'bg-emerald-50' },
          { label: 'Expenses', value: `₱${fmt(totalExpenses)}`, icon: <Banknote size={18} className="text-red-500" />, bg: 'bg-red-50' },
          { label: 'Net Income', value: `₱${fmt(netIncome)}`, icon: <TrendingUp size={18} className={netIncome >= 0 ? 'text-emerald-500' : 'text-red-500'} />, bg: netIncome >= 0 ? 'bg-emerald-50' : 'bg-red-50' },
          { label: 'Tracked Periods', value: String(netIncomeList.length), icon: <Calendar size={18} className="text-sky-500" />, bg: 'bg-sky-50' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>{card.icon}</div>
            <p className="text-xs text-slate-500 font-medium">{card.label}</p>
            <p className="text-lg font-bold text-slate-800 mt-0.5 tabular-nums">{loading ? '—' : card.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2 bg-white rounded-xl border border-slate-200">
          <RefreshCw size={16} className="animate-spin" /> Loading net income report...
        </div>
      ) : grandNetSales === 0 && totalExpenses === 0 ? (
        <div className="py-16 text-center bg-white rounded-xl border border-slate-200">
          <Banknote size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No revenue or expenses in selected range</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <FinancialStatementTable
              title="Revenue Line Items"
              rows={revenueLineItems}
              total={grandNetSales}
              totalLabel="Total Revenue"
              tone="revenue"
            />
            <FinancialStatementTable
              title="Expense Line Items"
              rows={expenseLineItems}
              total={totalExpenses}
              totalLabel="Total Expenses"
              tone="expense"
            />
          </div>

          <div className="bg-sky-50/70 rounded-xl border border-sky-100 p-5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center">
                  <TrendingUp size={22} className={netIncome >= 0 ? 'text-emerald-600' : 'text-red-500'} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-semibold">Net Income (Revenue - Expenses)</p>
                  <p className={`text-2xl font-bold tabular-nums ${netIncome >= 0 ? 'text-slate-900' : 'text-red-600'}`}>₱{fmt(netIncome)}</p>
                </div>
              </div>
              <FormulaAmount label="Revenue" value={grandNetSales} tone="revenue" />
              <FormulaAmount label="Expenses" value={totalExpenses} tone="expense" prefix="-" />
              <FormulaAmount label="Net Income" value={netIncome} tone={netIncome >= 0 ? 'net' : 'expense'} prefix="=" />
            </div>
          </div>
        </>
      )}
    </>
  );
}
