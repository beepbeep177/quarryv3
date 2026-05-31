import { useEffect, useState } from 'react';
import { Truck, PlusCircle, Search, RefreshCw, X, Loader2, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Truck as TruckType } from '../lib/database.types';
import ReadOnlyNotice from './ReadOnlyNotice';

export default function TruckList({ readOnly = false }: { readOnly?: boolean }) {
  const [trucks, setTrucks] = useState<TruckType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ plate_number: '', driver_name: '', capacity_m3: '' });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ plate_number?: string }>({});
  const [editingTruck, setEditingTruck] = useState<TruckType | null>(null);
  const [editForm, setEditForm] = useState({ plate_number: '', driver_name: '', capacity_m3: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editErrors, setEditErrors] = useState<{ plate_number?: string }>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { fetchTrucks(); }, []);

  async function fetchTrucks() {
    setLoading(true);
    const { data } = await supabase.from('trucks').select('*').order('plate_number');
    setTrucks((data ?? []) as TruckType[]);
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.plate_number.trim()) { setErrors({ plate_number: 'Required' }); return; }
    setSaving(true);
    const { data } = await supabase.from('trucks').insert({
      plate_number: form.plate_number.trim().toUpperCase(),
      driver_name: form.driver_name,
      capacity_m3: parseFloat(form.capacity_m3) || 0,
    }).select().maybeSingle();
    setSaving(false);
    if (data) {
      setTrucks(prev => [...prev, data as TruckType].sort((a, b) => a.plate_number.localeCompare(b.plate_number)));
      setForm({ plate_number: '', driver_name: '', capacity_m3: '' });
      setShowForm(false);
      setErrors({});
    }
  }

  function startEdit(t: TruckType) {
    setEditingTruck(t);
    setEditForm({ plate_number: t.plate_number, driver_name: t.driver_name ?? '', capacity_m3: t.capacity_m3 > 0 ? String(t.capacity_m3) : '' });
    setEditErrors({});
  }

  function cancelEdit() {
    setEditingTruck(null);
    setEditErrors({});
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editForm.plate_number.trim()) { setEditErrors({ plate_number: 'Required' }); return; }
    setEditSaving(true);
    const { data } = await supabase
      .from('trucks')
      .update({
        plate_number: editForm.plate_number.trim().toUpperCase(),
        driver_name: editForm.driver_name,
        capacity_m3: parseFloat(editForm.capacity_m3) || 0,
      })
      .eq('id', editingTruck!.id)
      .select()
      .maybeSingle();
    setEditSaving(false);
    if (data) {
      setTrucks(prev =>
        prev.map(t => t.id === editingTruck!.id ? data as TruckType : t)
            .sort((a, b) => a.plate_number.localeCompare(b.plate_number))
      );
      setEditingTruck(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this truck? This cannot be undone.')) return;
    setDeletingId(id);
    await supabase.from('trucks').delete().eq('id', id);
    setTrucks(prev => prev.filter(t => t.id !== id));
    setDeletingId(null);
  }

  const filtered = trucks.filter(t =>
    !search || t.plate_number.toLowerCase().includes(search.toLowerCase()) || (t.driver_name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Truck List</h1>
          <p className="text-slate-500 text-sm mt-0.5">{trucks.length} registered truck{trucks.length !== 1 ? 's' : ''}</p>
        </div>
        {!readOnly && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors shadow-sm shadow-emerald-200">
            <PlusCircle size={16} />
            Add Truck
          </button>
        )}
      </div>

      {readOnly && <ReadOnlyNotice message="Operators can review truck details, but only managers can add, edit, or delete trucks." />}

      {showForm && !readOnly && (
        <div className="bg-white rounded-xl border border-emerald-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">New Truck</h2>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Plate Number *</label>
              <input type="text" value={form.plate_number} onChange={e => { setForm(f => ({ ...f, plate_number: e.target.value })); setErrors({}); }} className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 uppercase ${errors.plate_number ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-emerald-200 focus:border-emerald-400'}`} placeholder="ABC-1234" />
              {errors.plate_number && <p className="text-xs text-red-500 mt-1">{errors.plate_number}</p>}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Driver Name</label>
              <input type="text" value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400" placeholder="Juan Dela Cruz" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Capacity (m³)</label>
              <input type="number" step="0.1" min="0" value={form.capacity_m3} onChange={e => setForm(f => ({ ...f, capacity_m3: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400" placeholder="12.5" />
            </div>
            <div className="md:col-span-3 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold disabled:opacity-70 flex items-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                Save Truck
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" placeholder="Search plate or driver..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 bg-white" />
      </div>

      {loading ? (
        <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
          <RefreshCw size={16} className="animate-spin" /> Loading...
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                <th className="px-5 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Plate Number</th>
                <th className="px-4 py-3 text-left">Driver</th>
                <th className="px-4 py-3 text-right">Capacity (m³)</th>
                {!readOnly && <th className="px-4 py-3 text-center w-20">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={readOnly ? 4 : 5} className="px-4 py-12 text-center text-slate-400">
                    <Truck size={28} className="mx-auto mb-2 text-slate-300" />
                    No trucks found
                  </td>
                </tr>
              ) : filtered.map((t, i) => (
                editingTruck?.id === t.id ? (
                  <tr key={t.id} className="bg-blue-50/50">
                    <td className="px-5 py-3 text-slate-400 text-xs">{i + 1}</td>
                    <td className="px-4 py-2" colSpan={4}>
                      <form onSubmit={handleEditSubmit} className="flex items-center gap-2 flex-wrap">
                        <div className="flex-1 min-w-[120px]">
                          <input
                            type="text"
                            value={editForm.plate_number}
                            onChange={e => { setEditForm(f => ({ ...f, plate_number: e.target.value })); setEditErrors({}); }}
                            className={`w-full px-2 py-1.5 rounded-lg border text-sm font-mono uppercase focus:outline-none focus:ring-2 ${editErrors.plate_number ? 'border-red-300 focus:ring-red-200' : 'border-slate-300 focus:ring-blue-200 focus:border-blue-400'}`}
                            placeholder="Plate"
                          />
                        </div>
                        <div className="flex-1 min-w-[120px]">
                          <input type="text" value={editForm.driver_name} onChange={e => setEditForm(f => ({ ...f, driver_name: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400" placeholder="Driver" />
                        </div>
                        <div className="w-24">
                          <input type="number" step="0.1" min="0" value={editForm.capacity_m3} onChange={e => setEditForm(f => ({ ...f, capacity_m3: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400" placeholder="m³" />
                        </div>
                        <div className="flex items-center gap-1">
                          <button type="submit" disabled={editSaving} className="px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold disabled:opacity-70 flex items-center gap-1">
                            {editSaving ? <Loader2 size={12} className="animate-spin" /> : null}Save
                          </button>
                          <button type="button" onClick={cancelEdit} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50">Cancel</button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-5 py-3 text-slate-400 text-xs">{i + 1}</td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-800">{t.plate_number}</td>
                    <td className="px-4 py-3 text-slate-600">{t.driver_name || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{t.capacity_m3 > 0 ? `${t.capacity_m3} m³` : '—'}</td>
                    {!readOnly && (
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEdit(t)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => handleDelete(t.id)} disabled={deletingId === t.id} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50" title="Delete">
                            {deletingId === t.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
