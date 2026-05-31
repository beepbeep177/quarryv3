import { useEffect, useState } from 'react';
import { DollarSign, PlusCircle, RefreshCw, X, Loader2, Tag, Pencil, Trash2 } from 'lucide-react';
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
  const [editingPricing, setEditingPricing] = useState<Pricing | null>(null);
  const [editForm, setEditForm] = useState({ material_type: '', unit_price: '', effective_date: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editErrors, setEditErrors] = useState<{ material_type?: string; unit_price?: string }>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  function startEdit(p: Pricing) {
    setEditingPricing(p);
    setEditForm({ material_type: p.material_type, unit_price: String(p.unit_price), effective_date: p.effective_date });
    setEditErrors({});
  }

  function cancelEdit() {
    setEditingPricing(null);
    setEditErrors({});
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof editErrors = {};
    if (!editForm.material_type.trim()) errs.material_type = 'Required';
    if (!editForm.unit_price || parseFloat(editForm.unit_price) <= 0) errs.unit_price = 'Must be > 0';
    if (Object.keys(errs).length > 0) { setEditErrors(errs); return; }
    setEditSaving(true);
    const { data } = await supabase
      .from('pricing')
      .update({
        material_type: editForm.material_type.trim(),
        unit_price: parseFloat(editForm.unit_price),
        effective_date: editForm.effective_date,
      })
      .eq('id', editingPricing!.id)
      .select()
      .maybeSingle();
    setEditSaving(false);
    if (data) {
      setPricingList(prev =>
        prev.map(p => p.id === editingPricing!.id ? data as Pricing : p)
            .sort((a, b) => a.material_type.localeCompare(b.material_type))
      );
      setEditingPricing(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this pricing entry? This cannot be undone.')) return;
    setDeletingId(id);
    await supabase.from('pricing').delete().eq('id', id);
    setPricingList(prev => prev.filter(p => p.id !== id));
    setDeletingId(null);
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
            <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow group">
              {editingPricing?.id === p.id ? (
                /* Inline Edit Form */
                <form onSubmit={handleEditSubmit} className="space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Edit Price</p>
                    <button type="button" onClick={cancelEdit} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Material Type *</label>
                    <input type="text" value={editForm.material_type} onChange={e => { setEditForm(f => ({ ...f, material_type: e.target.value })); setEditErrors({}); }} className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 ${editErrors.material_type ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-emerald-200 focus:border-emerald-400'}`} />
                    {editErrors.material_type && <p className="text-xs text-red-500 mt-1">{editErrors.material_type}</p>}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Unit Price (₱/m³) *</label>
                    <input type="number" step="0.01" min="0" value={editForm.unit_price} onChange={e => { setEditForm(f => ({ ...f, unit_price: e.target.value })); setEditErrors({}); }} className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 ${editErrors.unit_price ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-emerald-200 focus:border-emerald-400'}`} />
                    {editErrors.unit_price && <p className="text-xs text-red-500 mt-1">{editErrors.unit_price}</p>}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Effective Date</label>
                    <input type="date" value={editForm.effective_date} onChange={e => setEditForm(f => ({ ...f, effective_date: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400" />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={cancelEdit} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50">Cancel</button>
                    <button type="submit" disabled={editSaving} className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold disabled:opacity-70 flex items-center gap-1.5">
                      {editSaving ? <Loader2 size={12} className="animate-spin" /> : null}Save
                    </button>
                  </div>
                </form>
              ) : (
                /* Card View */
                <>
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <Tag size={18} className="text-emerald-600" />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-400 mr-1">
                        {new Date(p.effective_date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => startEdit(p)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleDelete(p.id)} disabled={deletingId === p.id} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50" title="Delete">
                          {deletingId === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <p className="font-semibold text-slate-800">{p.material_type}</p>
                  <p className="text-2xl font-bold text-emerald-600 mt-1 tabular-nums">₱{fmt(p.unit_price)}</p>
                  <p className="text-xs text-slate-400 mt-0.5">per m³</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
