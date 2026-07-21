import { useState } from 'react';
import { Banknote } from 'lucide-react';
import ExpenseForm from './ExpenseForm';
import WeeklyAnalytics from './WeeklyAnalytics';
import ExpensesLedger from './ExpensesLedger';
import ReadOnlyNotice from './ReadOnlyNotice';
import type { ExpenseWithCategory } from '../lib/database.types';

interface ExpensesProps {
  canAdd?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

export default function Expenses({ canAdd = false, canEdit = false, canDelete = false }: ExpensesProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingExpense, setEditingExpense] = useState<ExpenseWithCategory | null>(null);

  function handleExpenseSuccess() {
    setEditingExpense(null);
    setRefreshKey(k => k + 1);
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <Banknote size={22} className="text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Expenses Management</h1>
        </div>
        <p className="text-slate-500 text-sm">Track and manage daily operational expenses</p>
      </div>

      {!canAdd && !canEdit && !canDelete && <ReadOnlyNotice message="This user group can review expenses and analytics only." />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {(canAdd || editingExpense) && (
          <div className="lg:col-span-2">
            <ExpenseForm
              onSuccess={handleExpenseSuccess}
              expense={editingExpense}
              onCancelEdit={() => setEditingExpense(null)}
            />
          </div>
        )}

        <div className={!canAdd && !editingExpense ? 'lg:col-span-3' : ''}>
          <WeeklyAnalytics refreshKey={refreshKey} />
        </div>
      </div>

      <ExpensesLedger
        refreshKey={refreshKey}
        canEdit={canEdit}
        canDelete={canDelete}
        onEdit={setEditingExpense}
      />
    </div>
  );
}
