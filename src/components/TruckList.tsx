import { useEffect, useMemo, useState } from 'react';
import { Truck, PlusCircle, Search, RefreshCw, X, Loader2, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Customer, Truck as TruckType } from '../lib/database.types';
import ReadOnlyNotice from './ReadOnlyNotice';
import Pagination from './Pagination';
import { paginate } from '../lib/pagination';
import ActionModal from './ActionModal';

const PAGE_SIZE = 10;

type TruckWithCustomer = TruckType & {
  customers?: Customer | null;
};

function formatVolume(v: number) {
  return v.toFixed(2);
}

interface TruckListProps {
  canAdd?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

export default function TruckList({ canAdd = false, canEdit = false, canDelete = false }: TruckListProps) {
  const [trucks, setTrucks] = useState<TruckWithCustomer[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ plate_number: '', driver_name: '', customer_id: '', length_cm: '', width_cm: '', height_cm: '', is_hauler: false });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ plate_number?: string }>({});
  const [saveError, setSaveError] = useState('');
  const [editingTruck, setEditingTruck] = useState<TruckWithCustomer | null>(null);
  const [editForm, setEditForm] = useState({ plate_number: '', driver_name: '', customer_id: '', length_cm: '', width_cm: '', height_cm: '', is_hauler: false });
  const [editSaving, setEditSaving] = useState(false);
  const [editErrors, setEditErrors] = useState<{ plate_number?: string }>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TruckWithCustomer | null>(null);
  const [page, setPage] = useState(1);
  const canManage = canAdd || canEdit || canDelete;

  useEffect(() => { fetchTrucks(); }, []);
  useEffect(() => { setPage(1); }, [search]);

  async function fetchTrucks() {
    setLoading(true);
    const [{ data: truckData }, { data: customerData }] = await Promise.all([
      supabase.from('trucks').select('*, customers(*)').order('plate_number'),
      supabase.from('customers').select('*').order('name'),
    ]);
    setTrucks((truckData ?? []) as TruckWithCustomer[]);
    setCustomers((customerData ?? []) as Customer[]);
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaveError('');
    if (!form.plate_number.trim()) { setErrors({ plate_number: 'Required' }); return; }
    setSaving(true);
    const l = parseFloat(form.length_cm) || 0;
    const w = parseFloat(form.width_cm) || 0;
    const h = parseFloat(form.height_cm) || 0;
    const { data, error } = await supabase.from('trucks').insert({
      plate_number: form.plate_number.trim().toUpperCase(),
      driver_name: form.driver_name,
      customer_id: form.customer_id || null,
      length_cm: l,
      width_cm: w,
      height_cm: h,
      capacity_m3: parseFloat(((l * w * h) / 1_000_000).toFixed(4)),
      is_hauler: form.is_hauler,
    }).select('*, customers(*)').maybeSingle();
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    if (data) {
      setTrucks(prev => [...prev, data as TruckWithCustomer].sort((a, b) => a.plate_number.localeCompare(b.plate_number)));
      setForm({ plate_number: '', driver_name: '', customer_id: '', length_cm: '', width_cm: '', height_cm: '', is_hauler: false });
      setShowForm(false);
      setErrors({});
    }
  }

  function startEdit(t: TruckWithCustomer) {
    setEditingTruck(t);
    setEditForm({
      plate_number: t.plate_number,
      driver_name: t.driver_name ?? '',
      customer_id: t.customer_id ?? '',
      length_cm: t.length_cm > 0 ? String(t.length_cm) : '',
      width_cm: t.width_cm > 0 ? String(t.width_cm) : '',
      height_cm: t.height_cm > 0 ? String(t.height_cm) : '',
      is_hauler: t.is_hauler,
    });
    setEditErrors({});
  }

  function cancelEdit() {
    setEditingTruck(null);
    setEditErrors({});
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError('');
    if (!editForm.plate_number.trim()) { setEditErrors({ plate_number: 'Required' }); return; }
    setEditSaving(true);
    const l = parseFloat(editForm.length_cm) || 0;
    const w = parseFloat(editForm.width_cm) || 0;
    const h = parseFloat(editForm.height_cm) || 0;
    const { data, error } = await supabase
      .from('trucks')
      .update({
        plate_number: editForm.plate_number.trim().toUpperCase(),
        driver_name: editForm.driver_name,
        customer_id: editForm.customer_id || null,
        length_cm: l,
        width_cm: w,
        height_cm: h,
        capacity_m3: parseFloat(((l * w * h) / 1_000_000).toFixed(4)),
        is_hauler: editForm.is_hauler,
      })
      .eq('id', editingTruck!.id)
      .select('*, customers(*)')
      .maybeSingle();
    setEditSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    if (data) {
      setTrucks(prev =>
        prev.map(t => t.id === editingTruck!.id ? data as TruckWithCustomer : t)
            .sort((a, b) => a.plate_number.localeCompare(b.plate_number))
      );
      setEditingTruck(null);
    }
  }

  function handleDelete(truck: TruckWithCustomer) {
    setDeleteTarget(truck);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setSaveError('');
    setDeletingId(deleteTarget.id);
    const { error } = await supabase.from('trucks').delete().eq('id', deleteTarget.id);
    if (error) {
      setSaveError(error.message);
      setDeletingId(null);
      return;
    }
    setTrucks(prev => prev.filter(t => t.id !== deleteTarget.id));
    setDeleteTarget(null);
    setDeletingId(null);
  }

  const filtered = trucks.filter(t => {
    const q = search.toLowerCase();
    return !q ||
      t.plate_number.toLowerCase().includes(q) ||
      (t.driver_name ?? '').toLowerCase().includes(q) ||
      (t.customers?.name ?? '').toLowerCase().includes(q) ||
      (t.is_hauler ? 'hauler' : '').includes(q);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedTrucks = useMemo(() => paginate(filtered, currentPage, PAGE_SIZE), [filtered, currentPage]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Truck List</h1>
          <p className="text-slate-500 text-sm mt-0.5">{trucks.length} registered truck{trucks.length !== 1 ? 's' : ''}</p>
        </div>
        {canAdd && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors shadow-sm shadow-emerald-200">
            <PlusCircle size={16} />
            Add Truck
          </button>
        )}
      </div>

      {!canManage && <ReadOnlyNotice message="This user group can review truck details only." />}

      {showForm && canAdd && (
        <div className="bg-white rounded-xl border border-emerald-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">New Truck</h2>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-6 gap-3">
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
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Customer</label>
              <select value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 bg-white">
                <option value="">Unassigned</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
            </div>
            <label className="rounded-lg border border-slate-200 px-3 py-2 flex items-center gap-2 text-sm text-slate-700 bg-slate-50 self-end">
              <input
                type="checkbox"
                checked={form.is_hauler}
                onChange={e => setForm(f => ({ ...f, is_hauler: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-200"
              />
              <span className="font-medium">Hauler truck</span>
            </label>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Length (cm)</label>
              <input type="number" step="0.01" min="0" value={form.length_cm} onChange={e => setForm(f => ({ ...f, length_cm: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400" placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Width (cm)</label>
              <input type="number" step="0.01" min="0" value={form.width_cm} onChange={e => setForm(f => ({ ...f, width_cm: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400" placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Height (cm)</label>
              <input type="number" step="0.01" min="0" value={form.height_cm} onChange={e => setForm(f => ({ ...f, height_cm: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400" placeholder="0.00" />
            </div>
            <div className="md:col-span-6 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Capacity:{' '}
                <span className="font-semibold text-emerald-600">
                  {formatVolume(((parseFloat(form.length_cm) || 0) * (parseFloat(form.width_cm) || 0) * (parseFloat(form.height_cm) || 0)) / 1_000_000)} m³
                </span>
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold disabled:opacity-70 flex items-center gap-2">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                  Save Truck
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {saveError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {saveError}
        </div>
      )}

      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" placeholder="Search plate, driver, or customer..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 bg-white" />
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
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-right">Dimensions (cm)</th>
                <th className="px-4 py-3 text-right">Capacity (m³)</th>
                {(canEdit || canDelete) && <th className="px-4 py-3 text-center w-20">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={(canEdit || canDelete) ? 8 : 7} className="px-4 py-12 text-center text-slate-400">
                    <Truck size={28} className="mx-auto mb-2 text-slate-300" />
                    No trucks found
                  </td>
                </tr>
              ) : pagedTrucks.map((t, i) => (
                editingTruck?.id === t.id ? (
                  <tr key={t.id} className="bg-blue-50/50">
                    <td className="px-5 py-3 text-slate-400 text-xs">{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="px-4 py-2" colSpan={7}>
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
                        <div className="flex-1 min-w-[160px]">
                          <select value={editForm.customer_id} onChange={e => setEditForm(f => ({ ...f, customer_id: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 bg-white">
                            <option value="">Unassigned</option>
                            {customers.map(customer => (
                              <option key={customer.id} value={customer.id}>{customer.name}</option>
                            ))}
                          </select>
                        </div>
                        <label className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={editForm.is_hauler}
                            onChange={e => setEditForm(f => ({ ...f, is_hauler: e.target.checked }))}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-200"
                          />
                          Hauler
                        </label>
                        <div className="w-20">
                         <input type="number" step="0.01" min="0" value={editForm.length_cm} onChange={e => setEditForm(f => ({ ...f, length_cm: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400" placeholder="L (cm)" />
                        </div>
                        <div className="w-20">
                         <input type="number" step="0.01" min="0" value={editForm.width_cm} onChange={e => setEditForm(f => ({ ...f, width_cm: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400" placeholder="W (cm)" />
                        </div>
                        <div className="w-20">
                         <input type="number" step="0.01" min="0" value={editForm.height_cm} onChange={e => setEditForm(f => ({ ...f, height_cm: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400" placeholder="H (cm)" />
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
                    <td className="px-5 py-3 text-slate-400 text-xs">{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-800">{t.plate_number}</td>
                    <td className="px-4 py-3 text-slate-600">{t.driver_name || '—'}</td>
                    <td className="px-4 py-3">
                      {t.is_hauler ? (
                        <span className="inline-flex px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
                          Hauler
                        </span>
                      ) : (
                        <span className="inline-flex px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200 text-xs font-semibold">
                          Regular
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{t.customers?.name ?? 'Unassigned'}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">
                      {(t.length_cm > 0 || t.width_cm > 0 || t.height_cm > 0)
                        ? `${t.length_cm} × ${t.width_cm} × ${t.height_cm}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{t.capacity_m3 > 0 ? `${formatVolume(t.capacity_m3)} m³` : '—'}</td>
                    {(canEdit || canDelete) && (
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {canEdit && (
                            <button onClick={() => startEdit(t)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit">
                              <Pencil size={14} />
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => handleDelete(t)} disabled={deletingId === t.id} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50" title="Delete">
                              {deletingId === t.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              ))}
            </tbody>
          </table>
          <Pagination page={currentPage} pageSize={PAGE_SIZE} totalItems={filtered.length} onPageChange={setPage} />
        </div>
      )}

      <ActionModal
        open={!!deleteTarget}
        title="Delete Truck"
        description="This will permanently remove the truck from the truck list."
        variant="danger"
        confirmLabel="Delete Truck"
        loading={!!deleteTarget && deletingId === deleteTarget.id}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      >
        <div className="space-y-3 text-sm text-slate-600">
          <p>
            Delete truck <span className="font-semibold text-slate-900">{deleteTarget?.plate_number}</span>? This cannot be undone.
          </p>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Assigned Customer</p>
            <p className="mt-1 font-medium text-slate-700">{deleteTarget?.customers?.name ?? 'Unassigned'}</p>
          </div>
        </div>
      </ActionModal>
    </div>
  );
}
