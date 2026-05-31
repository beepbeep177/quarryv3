import { useEffect, useState } from 'react';
import {
  RefreshCw,
  PlusCircle,
  Search,
  Filter,
  Layers,
  Trash2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { TransactionWithRelations, PaymentMode } from '../lib/database.types';

interface DailyLedgerProps {
  onAddEntry: () => void;
  refreshKey: number;
}

const today = new Date().toISOString().split('T')[0];

function fmt(v: number) {
  return v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DailyLedger({ onAddEntry, refreshKey }: DailyLedgerProps) {
  const [transactions, setTransactions] = useState<TransactionWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState<PaymentMode | 'ALL'>('ALL');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { fetchTransactions(); }, [refreshKey]);

  async function fetchTransactions() {
    setLoading(true);
    const { data } = await supabase
      .from('transactions')
      .select('*, customers(*), trucks(*)')
      .eq('transaction_date', today)
      .order('created_at', { ascending: false });
    setTransactions((data ?? []) as TransactionWithRelations[]);
    setLoading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this entry?')) return;
    setDeletingId(id);
    await supabase.from('transactions').delete().eq('id', id);
    setTransactions(prev => prev.filter(t => t.id !== id));
    setDeletingId(null);
  }

  const filtered = transactions.filter(t => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      t.dr_number.toLowerCase().includes(q) ||
      (t.customers?.name ?? '').toLowerCase().includes(q) ||
      (t.trucks?.plate_number ?? '').toLowerCase().includes(q);
    const matchMode = modeFilter === 'ALL' || t.payment_mode === modeFilter;
    return matchSearch && matchMode;
  });

  const totals = filtered.reduce(
    (acc, t) => ({
      volume: acc.volume + (t.volume_m3 ?? 0),
      amount: acc.amount + (t.total_amount ?? 0),
    }),
    { volume: 0, amount: 0 }
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Today's Ledger</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button
          onClick={onAddEntry}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors shadow-sm shadow-emerald-200"
        >
          <PlusCircle size={16} />
          Add Entry
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search DR#, customer, truck..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 bg-white"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter size={14} className="text-slate-400" />
          {(['ALL', 'CASH', 'P.O', 'OFFSET'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setModeFilter(mode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                modeFilter === mode
                  ? mode === 'CASH' ? 'bg-emerald-500 text-white'
                    : mode === 'P.O' ? 'bg-amber-500 text-white'
                    : mode === 'OFFSET' ? 'bg-slate-600 text-white'
                    : 'bg-slate-800 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        <button onClick={fetchTransactions} disabled={loading} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
            <RefreshCw size={16} className="animate-spin" /> Loading transactions...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Layers size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">No transactions found</p>
            <button onClick={onAddEntry} className="mt-3 text-sm text-emerald-600 font-medium hover:text-emerald-700">
              Add first entry
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">#</th>
                    <th className="px-4 py-3 text-left">DR #</th>
                    <th className="px-4 py-3 text-left">Customer</th>
                    <th className="px-4 py-3 text-left">Truck</th>
                    <th className="px-4 py-3 text-right">L × W × H (cm)</th>
                    <th className="px-4 py-3 text-right">Volume (m³)</th>
                    <th className="px-4 py-3 text-right">Unit Price</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right">Extras</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-center">Mode</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((tx, idx) => {
                    const extras = (tx.dr_capitol ?? 0) + (tx.passway ?? 0) + (tx.kulot ?? 0);
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-4 py-3 text-slate-400 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3 font-mono font-semibold text-slate-700">{tx.dr_number}</td>
                        <td className="px-4 py-3 text-slate-700 max-w-36">
                          <p className="truncate">{tx.customers?.name ?? '—'}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{tx.trucks?.plate_number ?? '—'}</td>
                        <td className="px-4 py-3 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">
                          {tx.length_cm} × {tx.width_cm} × {tx.height_cm}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-600 tabular-nums">{tx.volume_m3?.toFixed(4)}</td>
                        <td className="px-4 py-3 text-right text-slate-500 tabular-nums">₱{fmt(tx.unit_price)}</td>
                        <td className="px-4 py-3 text-right text-slate-700 tabular-nums">₱{fmt(tx.amount)}</td>
                        <td className="px-4 py-3 text-right text-slate-500 tabular-nums text-xs">
                          {extras > 0 ? `+₱${fmt(extras)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800 tabular-nums">₱{fmt(tx.total_amount)}</td>
                        <td className="px-4 py-3 text-center"><PaymentBadge mode={tx.payment_mode} /></td>
                        <td className="px-4 py-3 text-center"><StatusBadge status={tx.status} /></td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleDelete(tx.id)}
                            disabled={deletingId === tx.id}
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals Row */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-sm">
              <span className="text-slate-400 font-medium">{filtered.length} entries</span>
              <div className="flex items-center gap-8">
                <div className="text-right">
                  <p className="text-slate-500 text-xs">Total Volume</p>
                  <p className="text-emerald-400 font-bold tabular-nums">{totals.volume.toFixed(4)} m³</p>
                </div>
                <div className="text-right">
                  <p className="text-slate-500 text-xs">Total Amount</p>
                  <p className="text-white font-bold tabular-nums">₱{fmt(totals.amount)}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PaymentBadge({ mode }: { mode: string }) {
  if (mode === 'CASH') return <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">CASH</span>;
  if (mode === 'P.O') return <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">P.O</span>;
  return <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">OFFSET</span>;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'PAID') return <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200">PAID</span>;
  return <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-600 border border-amber-200">PENDING</span>;
}
