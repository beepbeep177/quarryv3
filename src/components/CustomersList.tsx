import { useEffect, useState } from 'react';
import { UserPlus, Search, RefreshCw, Users, Building2, Phone, MapPin, X, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Customer } from '../lib/database.types';

export default function CustomersList() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', contact: '', address: '' });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ name?: string }>({});

  useEffect(() => { fetchCustomers(); }, []);

  async function fetchCustomers() {
    setLoading(true);
    const { data } = await supabase.from('customers').select('*').order('name');
    setCustomers((data ?? []) as Customer[]);
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setErrors({ name: 'Required' }); return; }
    setSaving(true);
    const { data } = await supabase.from('customers').insert({ name: form.name.trim(), contact: form.contact, address: form.address }).select().maybeSingle();
    setSaving(false);
    if (data) {
      setCustomers(prev => [...prev, data as Customer].sort((a, b) => a.name.localeCompare(b.name)));
      setForm({ name: '', contact: '', address: '' });
      setShowForm(false);
      setErrors({});
    }
  }

  const filtered = customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.contact.includes(search)
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Customers</h1>
          <p className="text-slate-500 text-sm mt-0.5">{customers.length} registered customer{customers.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors shadow-sm shadow-emerald-200"
        >
          <UserPlus size={16} />
          Add Customer
        </button>
      </div>

      {/* Add Customer Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-emerald-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">New Customer</h2>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Company Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setErrors({}); }}
                className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 ${errors.name ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-emerald-200 focus:border-emerald-400'}`}
                placeholder="e.g. ABC Construction Inc."
              />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Contact</label>
              <input type="text" value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400" placeholder="+63 9xx xxx xxxx" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Address</label>
              <input type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400" placeholder="City, Province" />
            </div>
            <div className="md:col-span-3 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold disabled:opacity-70 flex items-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                Save Customer
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" placeholder="Search customers..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 bg-white" />
      </div>

      {/* List */}
      {loading ? (
        <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
          <RefreshCw size={16} className="animate-spin" /> Loading...
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-xl border border-slate-200">
          <Users size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No customers found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(c => (
            <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <Building2 size={18} className="text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm truncate">{c.name}</p>
                  {c.contact && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
                      <Phone size={11} />
                      <span>{c.contact}</span>
                    </div>
                  )}
                  {c.address && (
                    <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-400">
                      <MapPin size={11} />
                      <span className="truncate">{c.address}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
