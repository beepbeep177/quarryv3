import { useEffect, useMemo, useState } from 'react';
import {
  FileBarChart2,
  RefreshCw,
  TrendingUp,
  Layers,
  Calendar,
  DollarSign,
  Users,
  Banknote,
  ReceiptText,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Customer, ExpenseWithCategory, TransactionWithRelations } from '../lib/database.types';

type ReportTab = 'sales' | 'customers' | 'net';
type PeriodMode = 'CUSTOM' | 'MONTHLY' | 'YEARLY';
type Grouping = 'DAY' | 'WEEK' | 'MONTH';

interface SalesSummary {
  bucketStart: string;
  count: number;
  volume: number;
  cash: number;
  po: number;
  offset: number;
  total: number;
}

interface CustomerSalesSummary {
  bucketStart: string;
  count: number;
  volume: number;
  total: number;
  customerIds: Set<string>;
}

interface NetIncomeSummary {
  bucketStart: string;
  revenue: number;
  expenses: number;
}

interface DateRangeSummary {
  start: string;
  end: string;
  label: string;
  salesGrouping: 'DAY' | 'MONTH';
}

function fmt(v: number) {
  return v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatVolume(v: number) {
  return v.toFixed(4);
}

function toInputDate(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function toMonthInput(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0')].join('-');
}

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function addDays(value: string, amount: number) {
  const next = parseDate(value);
  next.setDate(next.getDate() + amount);
  return toInputDate(next);
}

function getMonthRange(value: string) {
  const [year, month] = value.split('-').map(Number);
  const start = new Date(year, month - 1, 1, 12, 0, 0, 0);
  const end = new Date(year, month, 0, 12, 0, 0, 0);
  return { start: toInputDate(start), end: toInputDate(end) };
}

function getYearRange(value: string) {
  const year = Number(value);
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

function startOfWeek(value: string) {
  const date = parseDate(value);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return toInputDate(date);
}

function startOfMonth(value: string) {
  const date = parseDate(value);
  date.setDate(1);
  return toInputDate(date);
}

function addMonths(value: string, amount: number) {
  const date = parseDate(value);
  date.setMonth(date.getMonth() + amount);
  date.setDate(1);
  return toInputDate(date);
}

function compareDateStrings(a: string, b: string) {
  return a.localeCompare(b);
}

function formatDateLabel(value: string, options: Intl.DateTimeFormatOptions) {
  return parseDate(value).toLocaleDateString('en-PH', options);
}

function formatRangeLabel(start: string, end: string) {
  return `${formatDateLabel(start, { month: 'short', day: 'numeric', year: 'numeric' })} - ${formatDateLabel(end, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function getDateRangeSummary(periodMode: PeriodMode, dateFrom: string, dateTo: string, selectedMonth: string, selectedYear: string): DateRangeSummary {
  if (periodMode === 'MONTHLY') {
    const range = getMonthRange(selectedMonth);
    return {
      ...range,
      label: formatDateLabel(range.start, { month: 'long', year: 'numeric' }),
      salesGrouping: 'DAY',
    };
  }

  if (periodMode === 'YEARLY') {
    const range = getYearRange(selectedYear);
    return {
      ...range,
      label: selectedYear,
      salesGrouping: 'MONTH',
    };
  }

  const start = compareDateStrings(dateFrom, dateTo) <= 0 ? dateFrom : dateTo;
  const end = compareDateStrings(dateFrom, dateTo) <= 0 ? dateTo : dateFrom;
  return {
    start,
    end,
    label: formatRangeLabel(start, end),
    salesGrouping: 'DAY',
  };
}

function getBucketStart(value: string, grouping: Grouping) {
  if (grouping === 'WEEK') return startOfWeek(value);
  if (grouping === 'MONTH') return startOfMonth(value);
  return value;
}

function createContinuousBuckets(start: string, end: string, grouping: Grouping) {
  const buckets: string[] = [];
  let cursor = getBucketStart(start, grouping);
  const last = getBucketStart(end, grouping);

  while (compareDateStrings(cursor, last) <= 0) {
    buckets.push(cursor);
    cursor = grouping === 'DAY' ? addDays(cursor, 1) : grouping === 'WEEK' ? addDays(cursor, 7) : addMonths(cursor, 1);
  }

  return buckets;
}

function formatBucketLabel(bucketStart: string, grouping: Grouping) {
  if (grouping === 'MONTH') {
    return formatDateLabel(bucketStart, { month: 'long', year: 'numeric' });
  }

  if (grouping === 'WEEK') {
    const weekEnd = addDays(bucketStart, 6);
    return `${formatDateLabel(bucketStart, { month: 'short', day: 'numeric' })} - ${formatDateLabel(weekEnd, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }

  return formatDateLabel(bucketStart, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function tabButtonClass(active: boolean) {
  return active
    ? 'bg-slate-900 text-white shadow-sm'
    : 'bg-white text-slate-500 hover:text-slate-700 border border-slate-200';
}

export default function Reports() {
  const today = useMemo(() => toInputDate(new Date()), []);
  const defaultFrom = useMemo(() => addDays(today, -6), [today]);
  const currentMonth = useMemo(() => toMonthInput(new Date()), []);
  const currentYear = useMemo(() => String(new Date().getFullYear()), []);

  const [activeTab, setActiveTab] = useState<ReportTab>('sales');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('CUSTOM');
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(today);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [customerId, setCustomerId] = useState<'ALL' | string>('ALL');
  const [customerGrouping, setCustomerGrouping] = useState<Grouping>('WEEK');
  const [netGrouping, setNetGrouping] = useState<Grouping>('WEEK');
  const [transactions, setTransactions] = useState<TransactionWithRelations[]>([]);
  const [expenses, setExpenses] = useState<ExpenseWithCategory[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [customerLoading, setCustomerLoading] = useState(true);
  const [error, setError] = useState('');

  const range = useMemo(
    () => getDateRangeSummary(periodMode, dateFrom, dateTo, selectedMonth, selectedYear),
    [periodMode, dateFrom, dateTo, selectedMonth, selectedYear]
  );

  const yearOptions = useMemo(() => {
    const current = Number(currentYear);
    return Array.from({ length: 8 }, (_, index) => String(current - index));
  }, [currentYear]);

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    fetchReportData();
  }, [range.start, range.end]);

  async function fetchCustomers() {
    setCustomerLoading(true);
    const { data } = await supabase
      .from('customers')
      .select('*')
      .order('name', { ascending: true });
    setCustomers((data ?? []) as Customer[]);
    setCustomerLoading(false);
  }

  async function fetchReportData() {
    setLoading(true);
    setError('');

    const [transactionResult, expenseResult] = await Promise.all([
      supabase
        .from('transactions')
        .select('*, customers(*), trucks(*)')
        .gte('transaction_date', range.start)
        .lte('transaction_date', range.end)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false }),
      (supabase as any)
        .from('expenses')
        .select('*, expense_categories(*)')
        .gte('expense_date', range.start)
        .lte('expense_date', range.end)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ]);

    if (transactionResult.error || expenseResult.error) {
      setError(transactionResult.error?.message || expenseResult.error?.message || 'Unable to load report data.');
    }

    setTransactions((transactionResult.data ?? []) as TransactionWithRelations[]);
    setExpenses((expenseResult.data ?? []) as ExpenseWithCategory[]);
    setLoading(false);
  }

  const salesSummaryList = useMemo(() => {
    const bucketMap: Record<string, SalesSummary> = {};

    transactions.forEach(tx => {
      const bucketStart = getBucketStart(tx.transaction_date, range.salesGrouping);
      if (!bucketMap[bucketStart]) {
        bucketMap[bucketStart] = { bucketStart, count: 0, volume: 0, cash: 0, po: 0, offset: 0, total: 0 };
      }

      bucketMap[bucketStart].count += 1;
      bucketMap[bucketStart].volume += tx.volume_m3 ?? 0;
      bucketMap[bucketStart].total += tx.total_amount ?? 0;

      if (tx.payment_mode === 'CASH') bucketMap[bucketStart].cash += tx.total_amount ?? 0;
      else if (tx.payment_mode === 'P.O') bucketMap[bucketStart].po += tx.total_amount ?? 0;
      else bucketMap[bucketStart].offset += tx.total_amount ?? 0;
    });

    return Object.values(bucketMap).sort((a, b) => b.bucketStart.localeCompare(a.bucketStart));
  }, [transactions, range.salesGrouping]);

  const grandTotal = useMemo(() => transactions.reduce((sum, tx) => sum + (tx.total_amount ?? 0), 0), [transactions]);
  const grandVolume = useMemo(() => transactions.reduce((sum, tx) => sum + (tx.volume_m3 ?? 0), 0), [transactions]);
  const cashTotal = useMemo(() => transactions.filter(tx => tx.payment_mode === 'CASH').reduce((sum, tx) => sum + (tx.total_amount ?? 0), 0), [transactions]);
  const poTotal = useMemo(() => transactions.filter(tx => tx.payment_mode === 'P.O').reduce((sum, tx) => sum + (tx.total_amount ?? 0), 0), [transactions]);

  const customerTransactions = useMemo(() => {
    const filtered = customerId === 'ALL'
      ? transactions
      : transactions.filter(tx => tx.customer_id === customerId);

    return [...filtered].sort((a, b) => {
      if (a.transaction_date === b.transaction_date) {
        return b.created_at.localeCompare(a.created_at);
      }
      return b.transaction_date.localeCompare(a.transaction_date);
    });
  }, [transactions, customerId]);

  const customerSummaryList = useMemo(() => {
    const bucketMap: Record<string, CustomerSalesSummary> = {};

    customerTransactions.forEach(tx => {
      const bucketStart = getBucketStart(tx.transaction_date, customerGrouping);
      if (!bucketMap[bucketStart]) {
        bucketMap[bucketStart] = {
          bucketStart,
          count: 0,
          volume: 0,
          total: 0,
          customerIds: new Set<string>(),
        };
      }

      bucketMap[bucketStart].count += 1;
      bucketMap[bucketStart].volume += tx.volume_m3 ?? 0;
      bucketMap[bucketStart].total += tx.total_amount ?? 0;
      if (tx.customer_id) bucketMap[bucketStart].customerIds.add(tx.customer_id);
    });

    return Object.values(bucketMap).sort((a, b) => b.bucketStart.localeCompare(a.bucketStart));
  }, [customerTransactions, customerGrouping]);

  const customerTotalSales = useMemo(() => customerTransactions.reduce((sum, tx) => sum + (tx.total_amount ?? 0), 0), [customerTransactions]);
  const customerTotalVolume = useMemo(() => customerTransactions.reduce((sum, tx) => sum + (tx.volume_m3 ?? 0), 0), [customerTransactions]);

  const netIncomeList = useMemo(() => {
    const bucketKeys = createContinuousBuckets(range.start, range.end, netGrouping);
    const bucketMap: Record<string, NetIncomeSummary> = {};

    bucketKeys.forEach(bucketStart => {
      bucketMap[bucketStart] = { bucketStart, revenue: 0, expenses: 0 };
    });

    transactions.forEach(tx => {
      const bucketStart = getBucketStart(tx.transaction_date, netGrouping);
      if (!bucketMap[bucketStart]) bucketMap[bucketStart] = { bucketStart, revenue: 0, expenses: 0 };
      bucketMap[bucketStart].revenue += tx.total_amount ?? 0;
    });

    expenses.forEach(expense => {
      const bucketStart = getBucketStart(expense.expense_date, netGrouping);
      if (!bucketMap[bucketStart]) bucketMap[bucketStart] = { bucketStart, revenue: 0, expenses: 0 };
      bucketMap[bucketStart].expenses += expense.amount ?? 0;
    });

    return Object.values(bucketMap).sort((a, b) => b.bucketStart.localeCompare(a.bucketStart));
  }, [transactions, expenses, range.start, range.end, netGrouping]);

  const totalExpenses = useMemo(() => expenses.reduce((sum, expense) => sum + (expense.amount ?? 0), 0), [expenses]);
  const netIncome = grandTotal - totalExpenses;
  const selectedCustomer = customerId === 'ALL' ? null : customers.find(customer => customer.id === customerId) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
          <p className="text-slate-500 text-sm mt-0.5">Sales, customer performance, and net income views</p>
        </div>
        <button onClick={fetchReportData} disabled={loading} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'sales', label: 'Sales Summary' },
            { id: 'customers', label: 'Customer Sales History' },
            { id: 'net', label: 'Expense vs Revenue' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ReportTab)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tabButtonClass(activeTab === tab.id)}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['CUSTOM', 'MONTHLY', 'YEARLY'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setPeriodMode(mode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                periodMode === mode
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {mode === 'CUSTOM' ? 'Custom' : mode === 'MONTHLY' ? 'Monthly' : 'Yearly'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {periodMode === 'CUSTOM' ? (
            <>
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <Calendar size={14} className="text-slate-400" />
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-sm text-slate-700 focus:outline-none bg-transparent" />
              </div>
              <span className="text-slate-400 text-sm">to</span>
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <Calendar size={14} className="text-slate-400" />
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-sm text-slate-700 focus:outline-none bg-transparent" />
              </div>
            </>
          ) : periodMode === 'MONTHLY' ? (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <Calendar size={14} className="text-slate-400" />
              <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="text-sm text-slate-700 focus:outline-none bg-transparent" />
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <Calendar size={14} className="text-slate-400" />
              <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="text-sm text-slate-700 focus:outline-none bg-transparent">
                {yearOptions.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          )}

          {activeTab === 'customers' && (
            <>
              <select
                value={customerId}
                onChange={e => setCustomerId(e.target.value as 'ALL' | string)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                <option value="ALL">All Customers</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
              <div className="flex items-center gap-1.5">
                {(['DAY', 'WEEK', 'MONTH'] as const).map(group => (
                  <button
                    key={group}
                    onClick={() => setCustomerGrouping(group)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      customerGrouping === group
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {group}
                  </button>
                ))}
              </div>
            </>
          )}

          {activeTab === 'net' && (
            <div className="flex items-center gap-1.5">
              {(['DAY', 'WEEK', 'MONTH'] as const).map(group => (
                <button
                  key={group}
                  onClick={() => setNetGrouping(group)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    netGrouping === group
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {group}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Active period: <span className="text-slate-700">{range.label}</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {activeTab === 'sales' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Revenue', value: `₱${fmt(grandTotal)}`, icon: <DollarSign size={18} className="text-emerald-500" />, bg: 'bg-emerald-50' },
              { label: 'Total Volume', value: `${formatVolume(grandVolume)} m³`, icon: <Layers size={18} className="text-sky-500" />, bg: 'bg-sky-50' },
              { label: 'Cash Sales', value: `₱${fmt(cashTotal)}`, icon: <TrendingUp size={18} className="text-emerald-500" />, bg: 'bg-emerald-50' },
              { label: 'P.O Receivable', value: `₱${fmt(poTotal)}`, icon: <ReceiptText size={18} className="text-amber-500" />, bg: 'bg-amber-50' },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>{card.icon}</div>
                <p className="text-xs text-slate-500 font-medium">{card.label}</p>
                <p className="text-lg font-bold text-slate-800 mt-0.5 tabular-nums">{loading ? '—' : card.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">{range.salesGrouping === 'MONTH' ? 'Monthly Breakdown' : 'Daily Breakdown'}</h2>
            </div>
            {loading ? (
              <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
                <RefreshCw size={16} className="animate-spin" /> Loading report...
              </div>
            ) : salesSummaryList.length === 0 ? (
              <div className="py-16 text-center">
                <FileBarChart2 size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">No sales data in selected range</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Period</th>
                      <th className="px-4 py-3 text-right">Transactions</th>
                      <th className="px-4 py-3 text-right">Volume (m³)</th>
                      <th className="px-4 py-3 text-right">Cash</th>
                      <th className="px-4 py-3 text-right">P.O</th>
                      <th className="px-4 py-3 text-right">Offset</th>
                      <th className="px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {salesSummaryList.map(summary => (
                      <tr key={summary.bucketStart} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">
                          {formatBucketLabel(summary.bucketStart, range.salesGrouping)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{summary.count}</td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-semibold tabular-nums">{formatVolume(summary.volume)}</td>
                        <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{summary.cash > 0 ? `₱${fmt(summary.cash)}` : '—'}</td>
                        <td className="px-4 py-3 text-right text-amber-600 tabular-nums">{summary.po > 0 ? `₱${fmt(summary.po)}` : '—'}</td>
                        <td className="px-4 py-3 text-right text-slate-500 tabular-nums">{summary.offset > 0 ? `₱${fmt(summary.offset)}` : '—'}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800 tabular-nums">₱{fmt(summary.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-900">
                      <td className="px-4 py-3 text-slate-300 font-semibold text-xs uppercase">Totals</td>
                      <td className="px-4 py-3 text-right text-slate-300 font-semibold tabular-nums">{transactions.length}</td>
                      <td className="px-4 py-3 text-right text-emerald-400 font-bold tabular-nums">{formatVolume(grandVolume)}</td>
                      <td className="px-4 py-3 text-right text-slate-300 font-semibold tabular-nums">₱{fmt(cashTotal)}</td>
                      <td className="px-4 py-3 text-right text-amber-400 font-semibold tabular-nums">₱{fmt(poTotal)}</td>
                      <td className="px-4 py-3 text-right text-slate-400 font-semibold tabular-nums">₱{fmt(transactions.filter(tx => tx.payment_mode === 'OFFSET').reduce((sum, tx) => sum + (tx.total_amount ?? 0), 0))}</td>
                      <td className="px-4 py-3 text-right text-white font-bold tabular-nums">₱{fmt(grandTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'customers' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Sales Total', value: `₱${fmt(customerTotalSales)}`, icon: <DollarSign size={18} className="text-emerald-500" />, bg: 'bg-emerald-50' },
              { label: 'Volume Sold', value: `${formatVolume(customerTotalVolume)} m³`, icon: <Layers size={18} className="text-sky-500" />, bg: 'bg-sky-50' },
              { label: selectedCustomer ? 'Transactions' : 'Customers Reached', value: String(selectedCustomer ? customerTransactions.length : new Set(customerTransactions.map(tx => tx.customer_id)).size), icon: <Users size={18} className="text-violet-500" />, bg: 'bg-violet-50' },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>{card.icon}</div>
                <p className="text-xs text-slate-500 font-medium">{card.label}</p>
                <p className="text-lg font-bold text-slate-800 mt-0.5 tabular-nums">{loading || customerLoading ? '—' : card.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">{selectedCustomer ? `${selectedCustomer.name} Summary` : 'Customer Sales Over Time'}</h2>
            </div>
            {loading || customerLoading ? (
              <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
                <RefreshCw size={16} className="animate-spin" /> Loading customer history...
              </div>
            ) : customerSummaryList.length === 0 ? (
              <div className="py-16 text-center">
                <Users size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">No customer sales in selected range</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Period</th>
                      {!selectedCustomer && <th className="px-4 py-3 text-right">Customers</th>}
                      <th className="px-4 py-3 text-right">Transactions</th>
                      <th className="px-4 py-3 text-right">Volume (m³)</th>
                      <th className="px-4 py-3 text-right">Sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customerSummaryList.map(summary => (
                      <tr key={summary.bucketStart} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">{formatBucketLabel(summary.bucketStart, customerGrouping)}</td>
                        {!selectedCustomer && <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{summary.customerIds.size}</td>}
                        <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{summary.count}</td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-semibold tabular-nums">{formatVolume(summary.volume)}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800 tabular-nums">₱{fmt(summary.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-800">Transaction Drill-down</h2>
                <p className="text-xs text-slate-500 mt-1">Audit the underlying sales records for the selected customer and period.</p>
              </div>
              <span className="text-xs text-slate-500 font-medium">{customerTransactions.length} record{customerTransactions.length !== 1 ? 's' : ''}</span>
            </div>
            {loading ? (
              <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
                <RefreshCw size={16} className="animate-spin" /> Loading transactions...
              </div>
            ) : customerTransactions.length === 0 ? (
              <div className="py-16 text-center">
                <FileBarChart2 size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">No transaction records to show</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">DR #</th>
                      <th className="px-4 py-3 text-left">Customer</th>
                      <th className="px-4 py-3 text-left">Truck</th>
                      <th className="px-4 py-3 text-right">Volume (m³)</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-center">Mode</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customerTransactions.map(tx => (
                      <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDateLabel(tx.transaction_date, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                        <td className="px-4 py-3 font-mono font-semibold text-slate-700">{tx.dr_number}</td>
                        <td className="px-4 py-3 text-slate-700">{tx.customers?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-xs">{tx.trucks?.plate_number ?? '—'}</td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-semibold tabular-nums">{formatVolume(tx.volume_m3 ?? 0)}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800 tabular-nums">₱{fmt(tx.total_amount ?? 0)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            tx.payment_mode === 'CASH'
                              ? 'bg-emerald-100 text-emerald-700'
                              : tx.payment_mode === 'P.O'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                          }`}>{tx.payment_mode}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            tx.status === 'PAID'
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                              : 'bg-amber-50 text-amber-600 border-amber-200'
                          }`}>{tx.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'net' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { label: 'Revenue', value: `₱${fmt(grandTotal)}`, icon: <DollarSign size={18} className="text-emerald-500" />, bg: 'bg-emerald-50' },
              { label: 'Expenses', value: `₱${fmt(totalExpenses)}`, icon: <Banknote size={18} className="text-red-500" />, bg: 'bg-red-50' },
              { label: 'Net Income', value: `₱${fmt(netIncome)}`, icon: <TrendingUp size={18} className={netIncome >= 0 ? 'text-emerald-500' : 'text-red-500'} />, bg: netIncome >= 0 ? 'bg-emerald-50' : 'bg-red-50' },
              { label: 'Tracked Periods', value: String(netIncomeList.length), icon: <Calendar size={18} className="text-sky-500" />, bg: 'bg-sky-50' },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>{card.icon}</div>
                <p className="text-xs text-slate-500 font-medium">{card.label}</p>
                <p className="text-lg font-bold text-slate-800 mt-0.5 tabular-nums">{loading ? '—' : card.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">Expense vs Revenue Breakdown</h2>
            </div>
            {loading ? (
              <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
                <RefreshCw size={16} className="animate-spin" /> Loading net income report...
              </div>
            ) : netIncomeList.length === 0 ? (
              <div className="py-16 text-center">
                <Banknote size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">No revenue or expenses in selected range</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Period</th>
                      <th className="px-4 py-3 text-right">Revenue</th>
                      <th className="px-4 py-3 text-right">Expenses</th>
                      <th className="px-4 py-3 text-right">Net Income</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {netIncomeList.map(item => {
                      const periodNet = item.revenue - item.expenses;
                      return (
                        <tr key={item.bucketStart} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">{formatBucketLabel(item.bucketStart, netGrouping)}</td>
                          <td className="px-4 py-3 text-right text-emerald-600 font-semibold tabular-nums">₱{fmt(item.revenue)}</td>
                          <td className="px-4 py-3 text-right text-red-500 font-semibold tabular-nums">₱{fmt(item.expenses)}</td>
                          <td className={`px-4 py-3 text-right font-bold tabular-nums ${periodNet >= 0 ? 'text-slate-800' : 'text-red-600'}`}>₱{fmt(periodNet)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-900">
                      <td className="px-4 py-3 text-slate-300 font-semibold text-xs uppercase">Totals</td>
                      <td className="px-4 py-3 text-right text-emerald-400 font-bold tabular-nums">₱{fmt(grandTotal)}</td>
                      <td className="px-4 py-3 text-right text-red-300 font-bold tabular-nums">₱{fmt(totalExpenses)}</td>
                      <td className={`px-4 py-3 text-right font-bold tabular-nums ${netIncome >= 0 ? 'text-white' : 'text-red-300'}`}>₱{fmt(netIncome)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
