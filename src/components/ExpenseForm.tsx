import { useState, useEffect } from 'react';
import { Plus, X, Loader2, CheckCircle, Droplet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ExpenseCategory } from '../lib/database.types';

interface ExpenseFormProps {
  onSuccess: () => void;
}

interface FormData {
  amount: string;
  category_id: string;
  payee_supplier: string;
  description: string;
  liters_counter: string;
  expense_date: string;
}

const EMPTY_FORM: FormData = {
  amount: '',
  category_id: '',
  payee_supplier: '',
  description: '',
  liters_counter: '',
  expense_date: new Date().toISOString().split('T')[0],
};

export default function ExpenseForm({ onSuccess }: ExpenseFormProps) {
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  useEffect(() => {
    fetchCategories();
  }, []);

  async function fetchCategories() {
    const { data } = await supabase
      .from('expense_categories')
      .select('*')
      .order('order', { ascending: true });
    setCategories((data ?? []) as ExpenseCategory[]);
    if (data && data.length > 0 && !form.category_id) {
      setForm(f => ({ ...f, category_id: data[0].id }));
    }
  }

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return;
    const { data } = await supabase
      .from('expense_categories')
      .insert({
        name: newCategoryName.trim(),
        user_id: null,
        is_default: false,
        order: categories.length + 1,
      })
      .select()
      .maybeSingle();

    if (data) {
      setCategories(prev => [...prev, data as ExpenseCategory]);
      setForm(f => ({ ...f, category_id: data.id }));
      setNewCategoryName('');
      setShowNewCategory(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Partial<Record<keyof FormData, string>> = {};

    if (!form.amount || parseFloat(form.amount) <= 0) errs.amount = 'Amount required';
    if (!form.category_id) errs.category_id = 'Category required';
    if (!form.payee_supplier.trim()) errs.payee_supplier = 'Payee required';

    const selectedCat = categories.find(c => c.id === form.category_id);
    if (selectedCat?.name === 'Diesel' && (!form.liters_counter || parseFloat(form.liters_counter) <= 0)) {
      errs.liters_counter = 'Liters required for Diesel';
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('expenses').insert({
      expense_date: form.expense_date,
      category_id: form.category_id,
      amount: parseFloat(form.amount),
      payee_supplier: form.payee_supplier.trim(),
      description: form.description,
      liters_counter: selectedCat?.name === 'Diesel' ? parseFloat(form.liters_counter) : null,
    });

    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => {
        onSuccess();
        setForm(EMPTY_FORM);
        setSaved(false);
        if (categories.length > 0) {
          setForm(f => ({ ...f, category_id: categories[0].id }));
        }
      }, 800);
    }
  }

  const selectedCat = categories.find(c => c.id === form.category_id);
  const isDiesel = selectedCat?.name === 'Diesel';

  const set = (key: keyof FormData, val: string) => {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => ({ ...e, [key]: undefined }));
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
      <h2 className="text-lg font-bold text-slate-800 mb-5">Add New Expense</h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Amount */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
            Amount (₱)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={form.amount}
            onChange={e => set('amount', e.target.value)}
            className={`w-full px-4 py-3 rounded-lg border text-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 transition-all ${
              errors.amount
                ? 'border-red-300 focus:ring-red-200'
                : 'border-slate-200 focus:ring-emerald-200 focus:border-emerald-400'
            }`}
          />
          {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount}</p>}
        </div>

        {/* Category Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
            Category
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {categories.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => set('category_id', cat.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  form.category_id === cat.id
                    ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-200'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
            {showNewCategory ? (
              <div className="flex gap-1">
                <input
                  type="text"
                  autoFocus
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddCategory();
                    if (e.key === 'Escape') setShowNewCategory(false);
                  }}
                  placeholder="Category name..."
                  className="px-3 py-1.5 rounded-full text-xs border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="px-2 py-1.5 rounded-full bg-emerald-500 text-white text-xs hover:bg-emerald-600"
                >
                  <CheckCircle size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewCategory(false); setNewCategoryName(''); }}
                  className="px-2 py-1.5 rounded-full bg-slate-200 text-slate-600 text-xs hover:bg-slate-300"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowNewCategory(true)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-colors"
              >
                <Plus size={16} />
              </button>
            )}
          </div>
          {errors.category_id && <p className="text-xs text-red-500">{errors.category_id}</p>}
        </div>

        {/* Diesel Liters - Conditional */}
        {isDiesel && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <label className="block text-xs font-semibold text-amber-900 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Droplet size={14} />
              Liters Counter
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={form.liters_counter}
              onChange={e => set('liters_counter', e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border text-sm font-semibold focus:outline-none focus:ring-2 transition-all ${
                errors.liters_counter
                  ? 'border-red-300 focus:ring-red-200'
                  : 'border-amber-200 focus:ring-amber-200 focus:border-amber-400 bg-white'
              }`}
            />
            {errors.liters_counter && <p className="text-xs text-red-500 mt-1">{errors.liters_counter}</p>}
          </div>
        )}

        {/* Payee */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
            Payee / Supplier
          </label>
          <input
            type="text"
            placeholder="e.g., RTM Gas Station, Oro Oxygen"
            value={form.payee_supplier}
            onChange={e => set('payee_supplier', e.target.value)}
            className={`w-full px-4 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-all ${
              errors.payee_supplier
                ? 'border-red-300 focus:ring-red-200'
                : 'border-slate-200 focus:ring-emerald-200 focus:border-emerald-400'
            }`}
          />
          {errors.payee_supplier && <p className="text-xs text-red-500 mt-1">{errors.payee_supplier}</p>}
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
            Description / Remarks
          </label>
          <textarea
            rows={2}
            placeholder="e.g., Vulcanize for Loader WA380, New brake pads..."
            value={form.description}
            onChange={e => set('description', e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 resize-none"
          />
        </div>

        {/* Date */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
            Date
          </label>
          <input
            type="date"
            value={form.expense_date}
            onChange={e => set('expense_date', e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={saving || saved}
          className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-70 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2"
        >
          {saved ? (
            <><CheckCircle size={16} /> Expense Saved!</>
          ) : saving ? (
            <><Loader2 size={16} className="animate-spin" /> Saving...</>
          ) : (
            'Save Expense'
          )}
        </button>
      </form>
    </div>
  );
}
