import { useEffect, useState } from 'react';
import { FileBarChart2, RefreshCw, TrendingUp, Layers, Calendar, DollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { TransactionWithRelations } from '../lib/database.types';

function fmt(v: number) {
  return v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface DailySummary {
  date: string;
  count: number;
  volume: number;
  cash: number;
  po: number;
  offset: number;
  total: number;
}

export default function Reports() {
  const [records, setRecords] = useState<TransactionWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => { fetchReport(); }, [dateFrom, dateTo]);

  async function fetchReport() {
    setLoading(true);
    const { data } = await supabase
      .from('transactions')
      .select('*, customers(*), trucks(*)')
      .gte('transaction_date', dateFrom)
      .lte('transaction_date', dateTo)
      .order('transaction_date', { ascending: false });
    setRecords((data ?? []) as TransactionWithRelations[]);
    setLoading(false);
  }

  const dailySummaries = records.reduce((acc, t) => {
    const d = t.transaction_date;
    if (!acc[d]) acc[d] = { date: d, count: 0, volume: 0, cash: 0, po: 0, offset: 0, total: 0 };
    acc[d].count++;
    acc[d].volume += t.volume_m3 ?? 0;
    acc[d].total += t.total_amount ?? 0;
    if (t.payment_mode === 'CASH') acc[d].cash += t.total_amount ?? 0;
    else if (t.payment_mode === 'P.O') acc[d].po += t.total_amount ?? 0;
    else acc[d].offset += t.total_amount ?? 0;
    return acc;
  }, {} as Record<string, DailySummary>);

  const summaryList = Object.values(dailySummaries).sort((a, b) => b.date.localeCompare(a.date));

  const grandTotal = records.reduce((s, t) => s + (t.total_amount ?? 0), 0);
  const grandVolume = records.reduce((s, t) => s + (t.volume_m3 ?? 0), 0);
  const cashTotal = records.filter(t => t.payment_mode === 'CASH').reduce((s, t) => s + (t.total_amount ?? 0), 0);
  const poTotal = records.filter(t => t.payment_mode === 'P.O').reduce((s, t) => s + (t.total_amount ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
          <p className="text-slate-500 text-sm mt-0.5">Sales summary and transaction history</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-2">
            <Calendar size={14} className="text-slate-400" />
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-sm text-slate-700 focus:outline-none bg-transparent" />
          </div>
          <span className="text-slate-400 text-sm">to</span>
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-2">
            <Calendar size={14} className="text-slate-400" />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-sm text-slate-700 focus:outline-none bg-transparent" />
          </div>
          <button onClick={fetchReport} disabled={loading} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue', value: `₱${fmt(grandTotal)}`, icon: <DollarSign size={18} className="text-emerald-500" />, bg: 'bg-emerald-50' },
          { label: 'Total Volume', value: `${grandVolume.toFixed(4)} m³`, icon: <Layers size={18} className="text-sky-500" />, bg: 'bg-sky-50' },
          { label: 'Cash Sales', value: `₱${fmt(cashTotal)}`, icon: <TrendingUp size={18} className="text-emerald-500" />, bg: 'bg-emerald-50' },
          { label: 'P.O Receivable', value: `₱${fmt(poTotal)}`, icon: <FileBarChart2 size={18} className="text-amber-500" />, bg: 'bg-amber-50' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>{card.icon}</div>
            <p className="text-xs text-slate-500 font-medium">{card.label}</p>
            <p className="text-lg font-bold text-slate-800 mt-0.5 tabular-nums">{loading ? '—' : card.value}</p>
          </div>
        ))}
      </div>

      {/* Daily Breakdown */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Daily Breakdown</h2>
        </div>
        {loading ? (
          <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
            <RefreshCw size={16} className="animate-spin" /> Loading report...
          </div>
        ) : summaryList.length === 0 ? (
          <div className="py-16 text-center">
            <FileBarChart2 size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No data in selected range</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-right">Transactions</th>
                  <th className="px-4 py-3 text-right">Volume (m³)</th>
                  <th className="px-4 py-3 text-right">Cash</th>
                  <th className="px-4 py-3 text-right">P.O</th>
                  <th className="px-4 py-3 text-right">Offset</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summaryList.map(s => (
                  <tr key={s.date} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">
                      {new Date(s.date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{s.count}</td>
                    <td className="px-4 py-3 text-right text-emerald-600 font-semibold tabular-nums">{s.volume.toFixed(4)}</td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{s.cash > 0 ? `₱${fmt(s.cash)}` : '—'}</td>
                    <td className="px-4 py-3 text-right text-amber-600 tabular-nums">{s.po > 0 ? `₱${fmt(s.po)}` : '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-500 tabular-nums">{s.offset > 0 ? `₱${fmt(s.offset)}` : '—'}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800 tabular-nums">₱{fmt(s.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900">
                  <td className="px-4 py-3 text-slate-300 font-semibold text-xs uppercase" colSpan={2}>Totals</td>
                  <td className="px-4 py-3 text-right text-emerald-400 font-bold tabular-nums">{grandVolume.toFixed(4)}</td>
                  <td className="px-4 py-3 text-right text-slate-300 font-semibold tabular-nums">₱{fmt(cashTotal)}</td>
                  <td className="px-4 py-3 text-right text-amber-400 font-semibold tabular-nums">₱{fmt(poTotal)}</td>
                  <td className="px-4 py-3 text-right text-slate-400 tabular-nums">—</td>
                  <td className="px-4 py-3 text-right text-white font-bold tabular-nums">₱{fmt(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
