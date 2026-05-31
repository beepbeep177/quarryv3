import { useEffect, useState } from 'react';
import { RefreshCw, ReceiptText, CheckCircle, Search, TrendingDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { TransactionWithRelations } from '../lib/database.types';

function fmt(v: number) {
  return v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AccountsReceivable() {
  const [records, setRecords] = useState<TransactionWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [markingId, setMarkingId] = useState<string | null>(null);

  useEffect(() => { fetchAR(); }, []);

  async function fetchAR() {
    setLoading(true);
    const { data } = await supabase
      .from('transactions')
      .select('*, customers(*), trucks(*)')
      .in('payment_mode', ['P.O', 'OFFSET'])
      .eq('status', 'PENDING')
      .order('transaction_date', { ascending: true });
    setRecords((data ?? []) as TransactionWithRelations[]);
    setLoading(false);
  }

  async function markPaid(id: string) {
    setMarkingId(id);
    await supabase.from('transactions').update({ status: 'PAID' }).eq('id', id);
    setRecords(prev => prev.filter(r => r.id !== id));
    setMarkingId(null);
  }

  const filtered = records.filter(r => {
    const q = search.toLowerCase();
    return !q || (r.customers?.name ?? '').toLowerCase().includes(q) || r.dr_number.toLowerCase().includes(q);
  });

  const totalPending = filtered.reduce((s, r) => s + (r.total_amount ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Accounts Receivable</h1>
          <p className="text-slate-500 text-sm mt-0.5">Pending P.O and OFFSET transactions</p>
        </div>
        <button onClick={fetchAR} disabled={loading} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Summary card */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
          <TrendingDown size={22} className="text-amber-600" />
        </div>
        <div>
          <p className="text-sm text-amber-700 font-medium">Total Outstanding</p>
          <p className="text-2xl font-bold text-amber-800 tabular-nums">₱{fmt(totalPending)}</p>
          <p className="text-xs text-amber-600">{filtered.length} pending transaction{filtered.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" placeholder="Search customer or DR#..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 bg-white" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
            <RefreshCw size={16} className="animate-spin" /> Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <ReceiptText size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">No outstanding receivables</p>
            <p className="text-slate-400 text-xs mt-1">All accounts are settled!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">DR #</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-right">Volume (m³)</th>
                  <th className="px-4 py-3 text-right">Total Amount</th>
                  <th className="px-4 py-3 text-center">Mode</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {new Date(r.transaction_date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-slate-700">{r.dr_number}</td>
                    <td className="px-4 py-3 text-slate-700">{r.customers?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-600 font-semibold">{r.volume_m3?.toFixed(4)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-800">₱{fmt(r.total_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      {r.payment_mode === 'P.O'
                        ? <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">P.O</span>
                        : <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">OFFSET</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => markPaid(r.id)}
                        disabled={markingId === r.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors disabled:opacity-60"
                      >
                        {markingId === r.id ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                        Mark Paid
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
