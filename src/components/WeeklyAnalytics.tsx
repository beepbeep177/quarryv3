import { useEffect, useState } from 'react';
import { TrendingDown, RefreshCw, Calendar, BarChart3 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ExpenseWithCategory } from '../lib/database.types';

function fmt(v: number) {
  return v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getWeekRange() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
    startDate: monday,
    endDate: sunday,
  };
}

interface WeeklyAnalyticsProps {
  refreshKey: number;
}

interface CategoryBreakdown {
  name: string;
  total: number;
  percentage: number;
  color: string;
}

export default function WeeklyAnalytics({ refreshKey }: WeeklyAnalyticsProps) {
  const [expenses, setExpenses] = useState<ExpenseWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const week = getWeekRange();

  useEffect(() => {
    fetchWeeklyExpenses();
  }, [refreshKey]);

  async function fetchWeeklyExpenses() {
    setLoading(true);
    const { data } = await supabase
      .from('expenses')
      .select('*, expense_categories(*)')
      .gte('expense_date', week.start)
      .lte('expense_date', week.end)
      .order('expense_date', { ascending: false });
    setExpenses((data ?? []) as ExpenseWithCategory[]);
    setLoading(false);
  }

  const totalExpenses = expenses.reduce((s, e) => s + (e.amount ?? 0), 0);

  const categoryBreakdown: Record<string, number> = {};
  expenses.forEach(e => {
    const catName = e.expense_categories?.name ?? 'Unknown';
    categoryBreakdown[catName] = (categoryBreakdown[catName] ?? 0) + (e.amount ?? 0);
  });

  const colorMap: Record<string, string> = {
    'Diesel': 'bg-amber-500',
    'Salary/Advances': 'bg-purple-500',
    'Materials & Maintenance': 'bg-blue-500',
    'Passway': 'bg-cyan-500',
    'Meals': 'bg-orange-500',
    'Diesel Misc/RFID': 'bg-yellow-500',
    'Miscellaneous': 'bg-slate-500',
  };

  const breakdownList: CategoryBreakdown[] = Object.entries(categoryBreakdown)
    .map(([name, total]) => ({
      name,
      total,
      percentage: (total / totalExpenses) * 100,
      color: colorMap[name] || 'bg-slate-400',
    }))
    .sort((a, b) => b.total - a.total);

  const formatDate = (d: Date) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 p-6 text-white">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <BarChart3 size={20} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-300">Weekly Summary</p>
            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
              <Calendar size={12} />
              {formatDate(week.startDate)} - {formatDate(week.endDate)}
            </p>
          </div>
        </div>
        <button
          onClick={fetchWeeklyExpenses}
          disabled={loading}
          className="p-2 rounded-lg text-slate-400 hover:bg-slate-700 transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-slate-400 text-sm">
          <RefreshCw size={16} className="animate-spin mx-auto mb-2" />
          Loading analytics...
        </div>
      ) : (
        <div className="space-y-4">
          {/* Total */}
          <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-lg p-4">
            <p className="text-sm text-slate-300 font-medium">Gross Weekly Expenses</p>
            <p className="text-3xl font-bold text-emerald-400 mt-1 tabular-nums">₱{fmt(totalExpenses)}</p>
            <p className="text-xs text-slate-400 mt-2">{expenses.length} transaction{expenses.length !== 1 ? 's' : ''}</p>
          </div>

          {/* Breakdown */}
          {breakdownList.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Category Breakdown</p>
              <div className="space-y-2.5">
                {breakdownList.map(item => (
                  <div key={item.name}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${item.color}`}></div>
                        <span className="text-sm text-slate-300 font-medium">{item.name}</span>
                      </div>
                      <span className="text-sm font-semibold text-slate-100 tabular-nums">₱{fmt(item.total)}</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${item.color} rounded-full transition-all`}
                        style={{ width: `${item.percentage}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{item.percentage.toFixed(1)}%</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-6 text-center">
              <TrendingDown size={28} className="text-slate-600 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">No expenses this week</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
