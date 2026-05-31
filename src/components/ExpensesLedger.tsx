import { useEffect, useState } from 'react';
import { Search, RefreshCw, Trash2, Droplet, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ExpenseWithCategory } from '../lib/database.types';

interface ExpensesLedgerProps {
  refreshKey: number;
  readOnly?: boolean;
}

function fmt(v: number) {
  return v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
  Diesel: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  'Salary/Advances': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  'Materials & Maintenance': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  Passway: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
  Meals: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  'Diesel Misc/RFID': { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  Miscellaneous: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
};

export default function ExpensesLedger({ refreshKey, readOnly = false }: ExpensesLedgerProps) {
  const [expenses, setExpenses] = useState<ExpenseWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchExpenses();
  }, [refreshKey]);

  async function fetchExpenses() {
    setLoading(true);
    const { data } = await supabase
      .from('expenses')
      .select('*, expense_categories(*)')
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false });
    setExpenses((data ?? []) as ExpenseWithCategory[]);
    setLoading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this expense?')) return;
    setDeletingId(id);
    await supabase.from('expenses').delete().eq('id', id);
    setExpenses(prev => prev.filter(e => e.id !== id));
    setDeletingId(null);
  }

  const filtered = expenses.filter(e => {
    const q = search.toLowerCase();
    return !q || (e.expense_categories?.name ?? '').toLowerCase().includes(q) ||
      e.payee_supplier.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q);
  });

  const catColor = (catName?: string) => {
    return categoryColors[catName ?? 'Miscellaneous'] || categoryColors.Miscellaneous;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-slate-800">Expense Ledger</h2>
        <button
          onClick={fetchExpenses}
          disabled={loading}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by category, payee, or description..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 bg-white"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
            <RefreshCw size={16} className="animate-spin" /> Loading expenses...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Droplet size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">No expenses recorded</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                  <th className="px-5 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-left">Payee</th>
                  <th className="px-4 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-center">Liters</th>
                  {!readOnly && <th className="px-4 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((exp, idx) => {
                  const colors = catColor(exp.expense_categories?.name);
                  return (
                    <tr key={exp.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-5 py-3 text-slate-400 text-xs">{idx + 1}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={13} className="text-slate-400" />
                          {new Date(exp.expense_date + 'T00:00:00').toLocaleDateString('en-PH', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${colors.bg} ${colors.text} ${colors.border}`}
                        >
                          {exp.expense_categories?.name ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-medium text-xs">{exp.payee_supplier}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs max-w-xs truncate">{exp.description || '—'}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800 tabular-nums">₱{fmt(exp.amount)}</td>
                      <td className="px-4 py-3 text-center">
                        {exp.liters_counter ? (
                          <div className="flex items-center justify-center gap-1 text-xs font-semibold text-amber-600">
                            <Droplet size={12} />
                            {exp.liters_counter.toFixed(2)}L
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      {!readOnly && (
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleDelete(exp.id)}
                            disabled={deletingId === exp.id}
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
