import { useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, Trash2, Droplet, Calendar, Filter } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { friendlyDbError, loadErrorMessage } from '../lib/dbErrors';
import { fetchAllPages } from '../lib/fetchAll';
import type { ExpenseWithCategory } from '../lib/database.types';
import Pagination from './Pagination';
import { paginate } from '../lib/pagination';
import ActionModal from './ActionModal';
import DateRangeFilter from './DateRangeFilter';
import { isWithinRange, useDateRange } from '../lib/dateRange';

const PAGE_SIZE = 10;

export interface ExpenseLedgerFilterState {
  /** True when any filter (category, dates or search) is applied. */
  active: boolean;
  filtered: ExpenseWithCategory[];
  category: string | null;
  dateLabel: string;
  search: string;
}

interface ExpensesLedgerProps {
  /** Called whenever the visible (filtered) expenses change, e.g. so a parent can export them. */
  onFilterChange?: (state: ExpenseLedgerFilterState) => void;
  refreshKey?: number;
  expenses?: ExpenseWithCategory[];
  loading?: boolean;
  title?: string;
  onRefresh?: () => void | Promise<void>;
  canEdit?: boolean;
  canDelete?: boolean;
  onEdit?: (expense: ExpenseWithCategory) => void;
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

export default function ExpensesLedger({ onFilterChange, refreshKey = 0, expenses: providedExpenses, loading: providedLoading, title = 'Expense Ledger', onRefresh, canEdit = false, canDelete = false, onEdit }: ExpensesLedgerProps) {
  const [internalExpenses, setInternalExpenses] = useState<ExpenseWithCategory[]>([]);
  const [internalLoading, setInternalLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [allCategoryNames, setAllCategoryNames] = useState<string[]>([]);
  const dates = useDateRange();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseWithCategory | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const isControlled = providedExpenses !== undefined;
  const expenses = providedExpenses ?? internalExpenses;
  const loading = providedLoading ?? internalLoading;

  useEffect(() => {
    if (!isControlled) fetchExpenses();
  }, [isControlled, refreshKey]);
  useEffect(() => { setPage(1); }, [search, categoryFilter, dates.from, dates.to, refreshKey]);

  async function fetchExpenses() {
    setInternalLoading(true);
    setError('');
    const { data, error: fetchError } = await fetchAllPages<ExpenseWithCategory>(async (from, to) => {
      const page = await supabase
        .from('expenses')
        .select('*, expense_categories(*)')
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to);
      return { data: page.data as ExpenseWithCategory[] | null, error: page.error };
    });
    if (fetchError) setError(loadErrorMessage('expenses', fetchError));
    setInternalExpenses((data ?? []) as ExpenseWithCategory[]);
    setInternalLoading(false);
  }

  async function refreshExpenses() {
    if (onRefresh) {
      await onRefresh();
      return;
    }

    await fetchExpenses();
  }

  function handleDelete(expense: ExpenseWithCategory) {
    setDeleteTarget(expense);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setError('');
    const { data: deletedRows, error: deleteError } = await supabase.from('expenses').delete().eq('id', deleteTarget.id).select('id');
    if (deleteError || !deletedRows?.length) {
      setError(friendlyDbError(deleteError));
      setDeletingId(null);
      return;
    }
    if (isControlled) {
      await onRefresh?.();
    } else {
      setInternalExpenses(prev => prev.filter(e => e.id !== deleteTarget.id));
    }
    setDeleteTarget(null);
    setDeletingId(null);
  }

  // Load every expense category so the filter lists all of them, not only the
  // ones that happen to appear in the current date range.
  useEffect(() => {
    let active = true;
    supabase
      .from('expense_categories')
      .select('name')
      .order('order', { ascending: true })
      .then(({ data }) => {
        if (active && data) setAllCategoryNames((data as { name: string }[]).map(row => row.name));
      });
    return () => { active = false; };
  }, [refreshKey]);

  // All categories with how many loaded expenses each has (0 if none in this view).
  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    allCategoryNames.forEach(name => counts.set(name, 0));
    expenses.forEach(e => {
      const name = e.expense_categories?.name ?? 'Uncategorized';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => (b[1] > 0 ? 1 : 0) - (a[1] > 0 ? 1 : 0) || a[0].localeCompare(b[0]));
  }, [allCategoryNames, expenses]);

  // Reset the filter if the selected category no longer exists (e.g. after a refresh).
  useEffect(() => {
    if (categoryFilter !== 'ALL' && !categoryOptions.some(([name]) => name === categoryFilter)) setCategoryFilter('ALL');
  }, [categoryFilter, categoryOptions]);

  const dateFilterActive = dates.active;
  const dateLabel = dates.label;

  const filtered = useMemo(() => expenses.filter(e => {
    const categoryName = e.expense_categories?.name ?? 'Uncategorized';
    if (categoryFilter !== 'ALL' && categoryName !== categoryFilter) return false;
    if (!isWithinRange(e.expense_date, dates.start, dates.end)) return false;
    const q = search.toLowerCase();
    return !q || categoryName.toLowerCase().includes(q) ||
      e.payee_supplier.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q);
  }), [categoryFilter, dates.end, dates.start, expenses, search]);
  const filtersActive = categoryFilter !== 'ALL' || search.trim() !== '' || dateFilterActive;

  useEffect(() => {
    onFilterChange?.({
      active: filtersActive,
      filtered,
      category: categoryFilter === 'ALL' ? null : categoryFilter,
      dateLabel,
      search: search.trim(),
    });
  }, [categoryFilter, dateLabel, filtered, filtersActive, onFilterChange, search]);
  const filteredTotal = filtered.reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedExpenses = useMemo(() => paginate(filtered, currentPage, PAGE_SIZE), [filtered, currentPage]);

  const catColor = (catName?: string) => {
    return categoryColors[catName ?? 'Miscellaneous'] || categoryColors.Miscellaneous;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-slate-800">{title}</h2>
        <button
          onClick={refreshExpenses}
          disabled={loading}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by category, payee, or description..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 bg-white"
          />
        </div>
        <div className="relative sm:w-64">
          <Filter size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            className={`w-full appearance-none pl-9 pr-8 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 bg-white ${
              categoryFilter === 'ALL' ? 'border-slate-200 text-slate-600' : 'border-emerald-300 text-emerald-700 font-medium'
            }`}
          >
            <option value="ALL">All categories ({expenses.length})</option>
            {categoryOptions.map(([name, count]) => (
              <option key={name} value={name}>{name} ({count})</option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">▾</span>
        </div>
      </div>

      <DateRangeFilter range={dates} />

      {filtersActive && !loading && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-4 py-2.5 text-sm">
          <span className="text-slate-600">
            {filtered.length} {filtered.length === 1 ? 'expense' : 'expenses'}
            {categoryFilter !== 'ALL' && <> in <span className="font-semibold text-slate-800">{categoryFilter}</span></>}
            {dateFilterActive && <> · <span className="font-semibold text-slate-800">{dateLabel}</span></>}
            {' · '}Total <span className="font-bold text-slate-800">₱{fmt(filteredTotal)}</span>
          </span>
          <button
            type="button"
            onClick={() => { setCategoryFilter('ALL'); setSearch(''); dates.applyPreset('ALL'); }}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
          >
            Clear filters
          </button>
        </div>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
            <RefreshCw size={16} className="animate-spin" /> Loading expenses...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Droplet size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">{filtersActive ? 'No expenses match the filters' : 'No expenses recorded'}</p>
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
                  {canDelete && <th className="px-4 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedExpenses.map((exp, idx) => {
                  const colors = catColor(exp.expense_categories?.name);
                  const isLinkedFuelExpense = exp.source_table === 'fuel_purchases';
                  return (
                    <tr
                      key={exp.id}
                      onDoubleClick={() => canEdit && !isLinkedFuelExpense && onEdit?.(exp)}
                      title={isLinkedFuelExpense ? 'Managed from Fuel Management' : canEdit ? 'Double-click to edit expense' : undefined}
                      className={`hover:bg-slate-50 transition-colors group ${canEdit && !isLinkedFuelExpense ? 'cursor-pointer' : ''}`}
                    >
                      <td className="px-5 py-3 text-slate-400 text-xs">{(currentPage - 1) * PAGE_SIZE + idx + 1}</td>
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
                      <td className="px-4 py-3 text-slate-600 text-xs max-w-xs truncate">
                        {exp.description || '—'}
                        {isLinkedFuelExpense && <span className="ml-2 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Fuel Linked</span>}
                      </td>
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
                      {canDelete && (
                        <td className="px-4 py-3 text-center">
                          {!isLinkedFuelExpense && <button
                            onClick={event => {
                              event.stopPropagation();
                              handleDelete(exp);
                            }}
                            disabled={deletingId === exp.id}
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                          >
                            <Trash2 size={14} />
                          </button>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={currentPage} pageSize={PAGE_SIZE} totalItems={filtered.length} onPageChange={setPage} />
          </div>
        )}
      </div>

      <ActionModal
        open={!!deleteTarget}
        title="Delete Expense"
        description="This will permanently remove the selected expense record."
        variant="danger"
        confirmLabel="Delete Expense"
        loading={!!deleteTarget && deletingId === deleteTarget.id}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      >
        <div className="space-y-3 text-sm text-slate-600">
          <p>
            Delete <span className="font-semibold text-slate-900">{deleteTarget?.expense_categories?.name ?? 'expense'}</span> record?
          </p>
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Payee</p>
              <p className="mt-1 truncate font-medium text-slate-700">{deleteTarget?.payee_supplier ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Amount</p>
              <p className="mt-1 font-bold text-slate-800">PHP {deleteTarget ? fmt(deleteTarget.amount) : '0.00'}</p>
            </div>
          </div>
        </div>
      </ActionModal>
    </div>
  );
}
