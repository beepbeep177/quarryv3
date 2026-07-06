import { useEffect, useState } from 'react';
import {
  TrendingUp,
  Layers,
  Clock,
  ArrowUpRight,
  RefreshCw,
  CalendarDays,
  Smartphone,
  Building2,
  Package,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { TransactionWithRelations } from '../lib/database.types';

interface DashboardStats {
  totalSalesToday: number;
  totalVolume: number;
  pendingAR: number;
  transactionCount: number;
  gcashTotal: number;
  bankTransferTotal: number;
}

interface DashboardProps {
  onNavigate: (section: 'daily-add' | 'daily-view' | 'customers-ar') => void;
  onOpenProductReport: () => void;
  refreshKey: number;
  canManageRecords: boolean;
}

interface ProductSalesSummary {
  materialType: string;
  quantity: number;
  volume: number;
  revenue: number;
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
  return val.toFixed(2);
}

function getSplitModeAmount(tx: TransactionWithRelations, mode: 'GCASH' | 'BANK_TRANSFER') {
  if (!Array.isArray(tx.split_payment_details)) return 0;
  let total = 0;
  for (const detail of tx.split_payment_details as unknown[]) {
    if (!detail || typeof detail !== 'object' || Array.isArray(detail)) continue;
    const record = detail as Record<string, unknown>;
    const selectedMode = typeof record.mode === 'string' ? record.mode : '';
    const amount = typeof record.amount === 'number' ? record.amount : Number(record.amount);
    if (selectedMode === mode && Number.isFinite(amount) && amount >= 0) {
      total += amount;
    }
  }
  return total;
}

const chartColors = ['#10b981', '#38bdf8', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b'];

function PieChart({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const gradient = total > 0
    ? data.map((item, index) => {
        const start = cursor;
        const end = cursor + (item.value / total) * 100;
        cursor = end;
        return `${chartColors[index % chartColors.length]} ${start}% ${end}%`;
      }).join(', ')
    : '#e2e8f0 0% 100%';

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="relative w-32 h-32 rounded-full shrink-0" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="absolute inset-7 rounded-full bg-white flex items-center justify-center text-center">
          <div>
            <p className="text-lg font-bold text-slate-800 tabular-nums">{total}</p>
            <p className="text-[11px] text-slate-500">sold</p>
          </div>
        </div>
      </div>
      <div className="space-y-2 min-w-44 flex-1">
        {data.length === 0 ? (
          <p className="text-sm text-slate-500">No data available</p>
        ) : data.map((item, index) => (
          <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
              <span className="text-slate-600 truncate">{item.label}</span>
            </span>
            <span className="font-semibold text-slate-800 tabular-nums">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard({ onNavigate, onOpenProductReport, refreshKey, canManageRecords }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats>({
    totalSalesToday: 0,
    totalVolume: 0,
    pendingAR: 0,
    transactionCount: 0,
  gcashTotal: 0,
  bankTransferTotal: 0,
  });
  const [recentTx, setRecentTx] = useState<TransactionWithRelations[]>([]);
  const [productSales, setProductSales] = useState<ProductSalesSummary[]>([]);
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
      const gcashTotal = txList.reduce((sum, tx) => {
        if (tx.payment_mode === 'GCASH') return sum + (tx.total_amount ?? 0);
        if (tx.payment_mode === 'SPLIT') return sum + getSplitModeAmount(tx, 'GCASH');
        return sum;
      }, 0);
      const bankTransferTotal = txList.reduce((sum, tx) => {
        if (tx.payment_mode === 'BANK_TRANSFER') return sum + (tx.total_amount ?? 0);
        if (tx.payment_mode === 'SPLIT') return sum + getSplitModeAmount(tx, 'BANK_TRANSFER');
        return sum;
      }, 0);

      setStats({
        totalSalesToday,
        totalVolume,
        pendingAR,
        transactionCount: txList.length,
        gcashTotal,
        bankTransferTotal,
      });
      setRecentTx(txList.slice(0, 6));
      const productMap: Record<string, ProductSalesSummary> = {};
      txList.forEach(tx => {
        const materialType = tx.material_type || 'Unspecified';
        if (!productMap[materialType]) {
          productMap[materialType] = { materialType, quantity: 0, volume: 0, revenue: 0 };
        }
        productMap[materialType].quantity += 1;
        productMap[materialType].volume += tx.volume_m3 ?? 0;
        productMap[materialType].revenue += tx.total_amount ?? 0;
      });
      setProductSales(Object.values(productMap).sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue || a.materialType.localeCompare(b.materialType)));
    } finally {
      setLoading(false);
    }
  }

  const productTotals = {
    quantity: productSales.reduce((sum, product) => sum + product.quantity, 0),
    volume: productSales.reduce((sum, product) => sum + product.volume, 0),
    revenue: productSales.reduce((sum, product) => sum + product.revenue, 0),
  };

  const productChartData = (() => {
    const top = productSales.slice(0, 5);
    const others = productSales.slice(5);
    const rows = top.map(product => ({ label: product.materialType, value: product.quantity }));
    const otherQuantity = others.reduce((sum, product) => sum + product.quantity, 0);
    if (otherQuantity > 0) rows.push({ label: 'Others', value: otherQuantity });
    return rows;
  })();

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
    {
      label: 'GCash Today',
      value: formatCurrency(stats.gcashTotal),
      sub: 'GCash payments',
      icon: <Smartphone size={22} className="text-blue-400" />,
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
      action: () => onNavigate('daily-view'),
    },
    {
      label: 'Bank Transfer Today',
      value: formatCurrency(stats.bankTransferTotal),
      sub: 'Bank transfer payments',
      icon: <Building2 size={22} className="text-violet-400" />,
      bg: 'bg-violet-500/10',
      border: 'border-violet-500/20',
      action: () => onNavigate('daily-view'),
    },
  ];

  return (
    <div className="space-y-6">
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

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
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

      <div
        onClick={onOpenProductReport}
        className="bg-white rounded-xl border border-slate-200 p-5 cursor-pointer hover:shadow-md transition-shadow group"
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Package size={22} className="text-emerald-500" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">Product Sales Performance</h2>
              <p className="text-xs text-slate-500 mt-1">Today by quantity sold</p>
            </div>
          </div>
          <ArrowUpRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
        </div>

        {loading ? (
          <div className="py-12 flex items-center justify-center text-slate-400 text-sm">
            <RefreshCw size={16} className="animate-spin mr-2" /> Loading product sales...
          </div>
        ) : productSales.length === 0 ? (
          <div className="py-12 text-center">
            <Package size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">No data available</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-center">
            <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Top Product', value: productSales[0]?.materialType ?? '—' },
                { label: 'Quantity Sold', value: String(productTotals.quantity) },
                { label: 'Products Sold', value: String(productSales.length) },
                { label: 'Revenue', value: formatCurrency(productTotals.revenue) },
              ].map(item => (
                <div key={item.label} className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-3">
                  <p className="text-xs text-slate-500 font-medium">{item.label}</p>
                  <p className="text-lg font-bold text-slate-800 mt-1 truncate tabular-nums">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="lg:col-span-2">
              <PieChart data={productChartData} />
            </div>
          </div>
        )}
      </div>

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
              onClick={() => onNavigate(canManageRecords ? 'daily-add' : 'daily-view')}
              className="mt-3 text-sm text-emerald-600 font-medium hover:text-emerald-700"
            >
              {canManageRecords ? 'Add first entry' : "View today's ledger"}
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
                    <td className="px-4 py-3 text-right text-slate-700 tabular-nums">{formatVolume(tx.volume_m3 ?? 0)}</td>
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
  if (mode === 'GCASH') return <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">GCASH</span>;
  if (mode === 'BANK_TRANSFER') return <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-100 text-violet-700">BANK</span>;
  if (mode === 'DONATION') return <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">DONATION</span>;
  if (mode === 'SPLIT') return <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-700">SPLIT</span>;
  return <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">OFFSET</span>;
}
