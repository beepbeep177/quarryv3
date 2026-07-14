import { useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, Trash2, Droplet, Calendar, X, Loader2, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ExpenseCategory, ExpenseWithCategory } from '../lib/database.types';
import Pagination from './Pagination';
import { paginate } from '../lib/pagination';

const PAGE_SIZE = 10;

interface ExpensesLedgerProps {
  refreshKey: number;
  canEdit?: boolean;
  canDelete?: boolean;
}

interface ExpenseEditForm {
  expense_date: string;
  category_id: string;
  amount: string;
  payee_supplier: string;
  description: string;
  liters_counter: string;
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

export default function ExpensesLedger({ refreshKey, canEdit = false, canDelete = false }: ExpensesLedgerProps) {
  const [expenses, setExpenses] = useState<ExpenseWithCategory[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<ExpenseWithCategory | null>(null);
  const [editForm, setEditForm] = useState<ExpenseEditForm | null>(null);
  const [editErrors, setEditErrors] = useState<Partial<Record<keyof ExpenseEditForm, string>>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchExpenses();
  }, [refreshKey]);
  useEffect(() => { fetchCategories(); }, []);
  useEffect(() => { setPage(1); }, [search, refreshKey]);

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

  async function fetchCategories() {
    const { data } = await supabase
      .from('expense_categories')
      .select('*')
      .order('order', { ascending: true });
    setCategories((data ?? []) as ExpenseCategory[]);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this expense?')) return;
    setDeletingId(id);
    await supabase.from('expenses').delete().eq('id', id);
    setExpenses(prev => prev.filter(e => e.id !== id));
    setDeletingId(null);
  }

  function startEdit(expense: ExpenseWithCategory) {
    if (!canEdit) return;
    setEditingExpense(expense);
    setEditForm({
      expense_date: expense.expense_date,
      category_id: expense.category_id,
      amount: String(expense.amount ?? ''),
      payee_supplier: expense.payee_supplier ?? '',
      description: expense.description ?? '',
      liters_counter: expense.liters_counter ? String(expense.liters_counter) : '',
    });
    setEditErrors({});
    setEditError('');
  }

  function closeEdit() {
    setEditingExpense(null);
    setEditForm(null);
    setEditErrors({});
    setEditError('');
  }

  function setEdit(key: keyof ExpenseEditForm, value: string) {
    setEditForm(form => form ? { ...form, [key]: value } : form);
    setEditErrors(errors => ({ ...errors, [key]: undefined }));
    setEditError('');
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingExpense || !editForm) return;

    const nextErrors: Partial<Record<keyof ExpenseEditForm, string>> = {};
    const selectedCategory = categories.find(category => category.id === editForm.category_id);
    const isDiesel = selectedCategory?.name === 'Diesel';
    const amount = Number(editForm.amount);
    const liters = Number(editForm.liters_counter);

    if (!editForm.expense_date) nextErrors.expense_date = 'Date required';
    if (!editForm.category_id) nextErrors.category_id = 'Category required';
    if (!editForm.payee_supplier.trim()) nextErrors.payee_supplier = 'Payee required';
    if (!amount || amount <= 0) nextErrors.amount = 'Amount required';
    if (isDiesel && (!liters || liters <= 0)) nextErrors.liters_counter = 'Liters required for Diesel';

    if (Object.keys(nextErrors).length > 0) {
      setEditErrors(nextErrors);
      return;
    }

    setEditSaving(true);
    setEditError('');
    const { data, error } = await supabase
      .from('expenses')
      .update({
        expense_date: editForm.expense_date,
        category_id: editForm.category_id,
        amount,
        payee_supplier: editForm.payee_supplier.trim(),
        description: editForm.description.trim(),
        liters_counter: isDiesel ? liters : null,
      })
      .eq('id', editingExpense.id)
      .select('*, expense_categories(*)')
      .maybeSingle();
    setEditSaving(false);

    if (error) {
      setEditError(error.message);
      return;
    }

    if (data) {
      setExpenses(prev => prev.map(expense => expense.id === editingExpense.id ? data as ExpenseWithCategory : expense));
      closeEdit();
    }
  }

  const filtered = expenses.filter(e => {
    const q = search.toLowerCase();
    return !q || (e.expense_categories?.name ?? '').toLowerCase().includes(q) ||
      e.payee_supplier.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedExpenses = useMemo(() => paginate(filtered, currentPage, PAGE_SIZE), [filtered, currentPage]);

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
                  {(canEdit || canDelete) && <th className="px-4 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedExpenses.map((exp, idx) => {
                  const colors = catColor(exp.expense_categories?.name);
                  return (
                    <tr
                      key={exp.id}
                      className={`hover:bg-slate-50 transition-colors group ${canEdit ? 'cursor-pointer' : ''}`}
                      onDoubleClick={() => startEdit(exp)}
                      title={canEdit ? 'Double-click to edit expense' : undefined}
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
                      {(canEdit || canDelete) && (
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            {canEdit && (
                              <button
                                onClick={() => startEdit(exp)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                                title="Edit expense"
                              >
                                <Pencil size={14} />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => handleDelete(exp.id)}
                                disabled={deletingId === exp.id}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                title="Delete expense"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
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

      {editingExpense && editForm && (
        <ExpenseEditModal
          form={editForm}
          categories={categories}
          errors={editErrors}
          saveError={editError}
          saving={editSaving}
          onClose={closeEdit}
          onSubmit={handleEditSubmit}
          onChange={setEdit}
        />
      )}
    </div>
  );
}

function ExpenseEditModal({
  form,
  categories,
  errors,
  saveError,
  saving,
  onClose,
  onSubmit,
  onChange,
}: {
  form: ExpenseEditForm;
  categories: ExpenseCategory[];
  errors: Partial<Record<keyof ExpenseEditForm, string>>;
  saveError: string;
  saving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onChange: (key: keyof ExpenseEditForm, value: string) => void;
}) {
  const selectedCategory = categories.find(category => category.id === form.category_id);
  const isDiesel = selectedCategory?.name === 'Diesel';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-800">Edit Expense</h2>
            <p className="text-xs text-slate-500 mt-0.5">Update past expense details.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {saveError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Date" error={errors.expense_date}>
              <input type="date" value={form.expense_date} onChange={e => onChange('expense_date', e.target.value)} className={inputClass(!!errors.expense_date)} />
            </Field>
            <Field label="Category" error={errors.category_id}>
              <select value={form.category_id} onChange={e => onChange('category_id', e.target.value)} className={inputClass(!!errors.category_id)}>
                <option value="">Select category</option>
                {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </Field>
            <Field label="Payee / Supplier" error={errors.payee_supplier}>
              <input value={form.payee_supplier} onChange={e => onChange('payee_supplier', e.target.value)} className={inputClass(!!errors.payee_supplier)} />
            </Field>
            <Field label="Amount" error={errors.amount}>
              <input type="number" min="0" step="0.01" value={form.amount} onChange={e => onChange('amount', e.target.value)} className={inputClass(!!errors.amount)} />
            </Field>
          </div>

          {isDiesel && (
            <Field label="Diesel Liters" error={errors.liters_counter}>
              <input type="number" min="0" step="0.01" value={form.liters_counter} onChange={e => onChange('liters_counter', e.target.value)} className={inputClass(!!errors.liters_counter)} />
            </Field>
          )}

          <Field label="Description" error={errors.description}>
            <textarea rows={3} value={form.description} onChange={e => onChange('description', e.target.value)} className={`${inputClass(false)} resize-none`} />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold disabled:opacity-70 flex items-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Update Expense
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-500 mb-1">{label}</span>
      {children}
      {error && <span className="block text-xs text-red-500 mt-1">{error}</span>}
    </label>
  );
}

function inputClass(hasError: boolean) {
  return `w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 bg-white ${
    hasError
      ? 'border-red-300 focus:ring-red-200'
      : 'border-slate-200 focus:ring-emerald-200 focus:border-emerald-400'
  }`;
}
