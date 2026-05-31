import { useEffect, useState } from 'react';
import {
  TrendingUp,
  Layers,
  Clock,
  ArrowUpRight,
  RefreshCw,
  CalendarDays,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { TransactionWithRelations } from '../lib/database.types';

interface DashboardStats {
  totalSalesToday: number;
  totalVolume: number;
  pendingAR: number;
  transactionCount: number;
}

interface DashboardProps {
  onNavigate: (section: 'daily-add' | 'daily-view' | 'customers-ar') => void;
  refreshKey: number;
}

const today = new Date().toISOString().split('T')[0];

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(val);
}

function formatVolume(val: number) {
  return val.toFixed(4);
}

export default function Dashboard({ onNavigate, refreshKey }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats>({
    totalSalesToday: 0,
    totalVolume: 0,
    pendingAR: 0,
    transactionCount: 0,
  });
  const [recentTx, setRecentTx] = useState<TransactionWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [refreshKey]);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: todayTx } = await supabase
        .from('transactions')
        .select('*, customers(*), trucks(*)')
        .eq('transaction_date', today)
        .order('created_at', { ascending: false });

      const { data: allPending } = await supabase
        .from('transactions')
        .select('total_amount')
        .eq('payment_mode', 'P.O')
        .eq('status', 'PENDING');

      const txList = (todayTx ?? []) as TransactionWithRelations[];
      const totalSalesToday = txList.reduce((s, t) => s + (t.total_amount ?? 0), 0);
      const totalVolume = txList.reduce((s, t) => s + (t.volume_m3 ?? 0), 0);
      const pendingAR = (allPending ?? []).reduce((s, t) => s + (t.total_amount ?? 0), 0);

      setStats({
        totalSalesToday,
        totalVolume,
        pendingAR,
        transactionCount: txList.length,
      });
      setRecentTx(txList.slice(0, 6));
    } finally {
      setLoading(false);
    }
  }

  const statCards = [
    {
      label: 'Total Sales Today',
      value: formatCurrency(stats.totalSalesToday),
      sub: `${stats.transactionCount} transaction${stats.transactionCount !== 1 ? 's' : ''}`,
      icon: <TrendingUp size={22} className="text-emerald-400" />,
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      action: () => onNavigate('daily-view'),
    },
    {
      label: 'Total Volume (m³)',
      value: `${formatVolume(stats.totalVolume)} m³`,
      sub: 'Extracted today',
      icon: <Layers size={22} className="text-sky-400" />,
      bg: 'bg-sky-500/10',
      border: 'border-sky-500/20',
      action: () => onNavigate('daily-view'),
    },
    {
      label: 'Pending P.O (AR)',
      value: formatCurrency(stats.pendingAR),
      sub: 'Accounts receivable',
      icon: <Clock size={22} className="text-amber-400" />,
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      action: () => onNavigate('customers-ar'),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <div className="flex items-center gap-1.5 mt-1 text-slate-500 text-sm">
            <CalendarDays size={14} />
            <span>{new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {statCards.map(card => (
          <div
            key={card.label}
            onClick={card.action}
            className={`bg-white rounded-xl border ${card.border} p-5 cursor-pointer hover:shadow-md transition-shadow group`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`w-11 h-11 rounded-xl ${card.bg} flex items-center justify-center`}>
                {card.icon}
              </div>
              <ArrowUpRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
            </div>
            <p className="text-sm text-slate-500 font-medium">{card.label}</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{loading ? '—' : card.value}</p>
            <p className="text-xs text-slate-400 mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Today's Transactions</h2>
          <button
            onClick={() => onNavigate('daily-view')}
            className="text-sm text-emerald-600 font-medium hover:text-emerald-700 transition-colors"
          >
            View All
          </button>
        </div>

        {loading ? (
          <div className="py-16 flex items-center justify-center text-slate-400 text-sm">
            <RefreshCw size={16} className="animate-spin mr-2" /> Loading...
          </div>
        ) : recentTx.length === 0 ? (
          <div className="py-16 text-center">
            <Layers size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">No transactions today</p>
            <button
              onClick={() => onNavigate('daily-add')}
              className="mt-3 text-sm text-emerald-600 font-medium hover:text-emerald-700"
            >
              Add first entry
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                  <th className="px-5 py-3 text-left">DR #</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Truck</th>
                  <th className="px-4 py-3 text-right">Volume (m³)</th>
                  <th className="px-4 py-3 text-right">Total Amount</th>
                  <th className="px-4 py-3 text-center">Mode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentTx.map(tx => (
                  <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-slate-700 font-medium">{tx.dr_number}</td>
                    <td className="px-4 py-3 text-slate-700">{tx.customers?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{tx.trucks?.plate_number ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-700 tabular-nums">{tx.volume_m3?.toFixed(4)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800 tabular-nums">{formatCurrency(tx.total_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <PaymentBadge mode={tx.payment_mode} />
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

function PaymentBadge({ mode }: { mode: string }) {
  if (mode === 'CASH') return <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">CASH</span>;
  if (mode === 'P.O') return <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">P.O</span>;
  return <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">OFFSET</span>;
}
