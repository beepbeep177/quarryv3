import { useEffect, useState } from 'react';
import { DollarSign, PlusCircle, RefreshCw, X, Loader2, Tag } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Pricing } from '../lib/database.types';

function fmt(v: number) {
  return v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PricingList() {
  const [pricingList, setPricingList] = useState<Pricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ material_type: '', unit_price: '', effective_date: new Date().toISOString().split('T')[0] });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ material_type?: string; unit_price?: string }>({});

  useEffect(() => { fetchPricing(); }, []);

  async function fetchPricing() {
    setLoading(true);
    const { data } = await supabase.from('pricing').select('*').order('material_type');
    setPricingList((data ?? []) as Pricing[]);
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!form.material_type.trim()) errs.material_type = 'Required';
    if (!form.unit_price || parseFloat(form.unit_price) <= 0) errs.unit_price = 'Must be > 0';
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSaving(true);
    const { data } = await supabase.from('pricing').insert({
      material_type: form.material_type.trim(),
      unit_price: parseFloat(form.unit_price),
      effective_date: form.effective_date,
    }).select().maybeSingle();
    setSaving(false);
    if (data) {
      setPricingList(prev => [...prev, data as Pricing].sort((a, b) => a.material_type.localeCompare(b.material_type)));
      setForm({ material_type: '', unit_price: '', effective_date: new Date().toISOString().split('T')[0] });
      setShowForm(false);
      setErrors({});
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pricing</h1>
          <p className="text-slate-500 text-sm mt-0.5">Material price list per m³</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors shadow-sm shadow-emerald-200">
          <PlusCircle size={16} />
          Add Pricing
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-emerald-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">New Price Entry</h2>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Material Type *</label>
              <input type="text" value={form.material_type} onChange={e => { setForm(f => ({ ...f, material_type: e.target.value })); setErrors({}); }} className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 ${errors.material_type ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-emerald-200 focus:border-emerald-400'}`} placeholder="Crushed Stone" />
              {errors.material_type && <p className="text-xs text-red-500 mt-1">{errors.material_type}</p>}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Unit Price (₱/m³) *</label>
              <input type="number" step="0.01" min="0" value={form.unit_price} onChange={e => { setForm(f => ({ ...f, unit_price: e.target.value })); setErrors({}); }} className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 ${errors.unit_price ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-emerald-200 focus:border-emerald-400'}`} placeholder="850.00" />
              {errors.unit_price && <p className="text-xs text-red-500 mt-1">{errors.unit_price}</p>}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Effective Date</label>
              <input type="date" value={form.effective_date} onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400" />
            </div>
            <div className="md:col-span-3 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold disabled:opacity-70 flex items-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                Save Price
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
          <RefreshCw size={16} className="animate-spin" /> Loading...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {pricingList.length === 0 ? (
            <div className="col-span-3 py-16 text-center bg-white rounded-xl border border-slate-200">
              <DollarSign size={32} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No pricing entries</p>
            </div>
          ) : pricingList.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <Tag size={18} className="text-emerald-600" />
                </div>
                <span className="text-xs text-slate-400">
                  {new Date(p.effective_date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              <p className="font-semibold text-slate-800">{p.material_type}</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1 tabular-nums">₱{fmt(p.unit_price)}</p>
              <p className="text-xs text-slate-400 mt-0.5">per m³</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
