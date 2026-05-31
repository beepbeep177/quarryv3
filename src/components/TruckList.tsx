import { useEffect, useState } from 'react';
import { Truck, PlusCircle, Search, RefreshCw, X, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Truck as TruckType } from '../lib/database.types';

export default function TruckList() {
  const [trucks, setTrucks] = useState<TruckType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ plate_number: '', driver_name: '', capacity_m3: '' });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ plate_number?: string }>({});

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

  const filtered = trucks.filter(t =>
    !search || t.plate_number.toLowerCase().includes(search.toLowerCase()) || t.driver_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Truck List</h1>
          <p className="text-slate-500 text-sm mt-0.5">{trucks.length} registered truck{trucks.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors shadow-sm shadow-emerald-200">
          <PlusCircle size={16} />
          Add Truck
        </button>
      </div>

      {showForm && (
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-slate-400">
                    <Truck size={28} className="mx-auto mb-2 text-slate-300" />
                    No trucks found
                  </td>
                </tr>
              ) : filtered.map((t, i) => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 text-slate-400 text-xs">{i + 1}</td>
                  <td className="px-4 py-3 font-mono font-bold text-slate-800">{t.plate_number}</td>
                  <td className="px-4 py-3 text-slate-600">{t.driver_name || '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{t.capacity_m3 > 0 ? `${t.capacity_m3} m³` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
