import { useState } from 'react';
import { Banknote } from 'lucide-react';
import ExpenseForm from './ExpenseForm';
import WeeklyAnalytics from './WeeklyAnalytics';
import ExpensesLedger from './ExpensesLedger';

export default function Expenses() {
  const [refreshKey, setRefreshKey] = useState(0);

  function handleExpenseSuccess() {
    setRefreshKey(k => k + 1);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <Banknote size={22} className="text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Expenses Management</h1>
        </div>
        <p className="text-slate-500 text-sm">Track and manage daily operational expenses</p>
      </div>

      {/* Form and Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form - Takes 2 columns on large screens */}
        <div className="lg:col-span-2">
          <ExpenseForm onSuccess={handleExpenseSuccess} />
        </div>

        {/* Weekly Analytics - Takes 1 column on large screens */}
        <div>
          <WeeklyAnalytics refreshKey={refreshKey} />
        </div>
      </div>

      {/* Ledger - Full width */}
      <ExpensesLedger refreshKey={refreshKey} />
    </div>
  );
}
