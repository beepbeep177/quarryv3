import { useCallback, useEffect, useMemo, useState } from 'react';
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
  X,
  Download,
  FileText,
  Package,
  Pencil,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Customer, ExpenseWithCategory, PaymentMode, TransactionWithRelations } from '../lib/database.types';
import Pagination from './Pagination';
import { paginate } from '../lib/pagination';
import { getPaymentModeAmount } from '../lib/payment';

export type ReportTab = 'sales' | 'customers' | 'expenses' | 'net' | 'products';
type PeriodMode = 'CUSTOM' | 'MONTHLY' | 'YEARLY';
type Grouping = 'DAY' | 'WEEK' | 'MONTH';
type ExtraFeeFilter = 'ALL' | 'dr_capitol' | 'passway' | 'kulot';

const REPORT_PAGE_SIZE = 10;

interface SalesSummary {
  bucketStart: string;
  count: number;
  volume: number;
  cash: number;
  po: number;
  offset: number;
  gcash: number;
  bankTransfer: number;
  extraFees: number;
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

interface ExpenseSummaryRow {
  bucketStart: string;
  count: number;
  total: number;
  byCategory: Record<string, number>;
}

interface DateRangeSummary {
  start: string;
  end: string;
  label: string;
  salesGrouping: 'DAY' | 'MONTH';
}

interface ProductSalesSummary {
  materialType: string;
  quantity: number;
  volume: number;
  revenue: number;
}

interface FinancialLineItem {
  label: string;
  amount: number;
  share: number;
}

interface ExportReportData {
  title: string;
  filename: string;
  filterLines: string[];
  headers: string[];
  rows: (string | number)[][];
  totals?: (string | number)[];
}

// Helper component for modal detail items
function DetailItem({ 
  label, 
  value, 
  mono = false, 
  highlight = false 
}: { 
  label: string; 
  value: string; 
  mono?: boolean; 
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-sm ${
        highlight 
          ? 'text-emerald-600 font-bold' 
          : 'text-slate-700 font-medium'
      } ${mono ? 'font-mono' : ''}`}>
        {value}
      </p>
    </div>
  );
}

function fmt(v: number) {
  return v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatVolume(v: number) {
  return v.toFixed(2);
}

function csvEscape(value: string | number) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatCsvCell(value: string | number) {
  if (typeof value === 'number') return String(value);
  return value;
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function htmlEscape(value: string | number) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
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

function compactFinancialLineItems(rows: FinancialLineItem[], otherLabel: string, limit = 6) {
  if (rows.length <= limit + 1) return rows;
  const visible = rows.slice(0, limit);
  const otherAmount = rows.slice(limit).reduce((sum, row) => sum + row.amount, 0);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return [
    ...visible,
    {
      label: otherLabel,
      amount: otherAmount,
      share: total > 0 ? (otherAmount / total) * 100 : 0,
    },
  ];
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
    <div className="flex items-center gap-5 flex-wrap">
      <div className="relative w-40 h-40 rounded-full shrink-0" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="absolute inset-8 rounded-full bg-white flex items-center justify-center text-center">
          <div>
            <p className="text-xl font-bold text-slate-800 tabular-nums">{total}</p>
            <p className="text-xs text-slate-500">sold</p>
          </div>
        </div>
      </div>
      <div className="space-y-2 min-w-48 flex-1">
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

function FinancialStatementTable({
  title,
  rows,
  total,
  totalLabel,
  tone,
}: {
  title: string;
  rows: FinancialLineItem[];
  total: number;
  totalLabel: string;
  tone: 'revenue' | 'expense';
}) {
  const isRevenue = tone === 'revenue';
  const accent = isRevenue
    ? {
        border: 'border-t-emerald-200',
        header: 'bg-emerald-50/50',
        totalBg: 'bg-emerald-50',
        totalText: 'text-emerald-700',
      }
    : {
        border: 'border-t-red-200',
        header: 'bg-red-50/50',
        totalBg: 'bg-red-50',
        totalText: 'text-red-700',
      };

  return (
    <div className={`bg-white rounded-xl border border-slate-200 ${accent.border} border-t-2 overflow-hidden`}>
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={`${accent.header} text-slate-500 text-xs font-semibold uppercase tracking-wide`}>
              <th className="px-5 py-3 text-left">Description</th>
              <th className="px-4 py-3 text-right">Amount (₱)</th>
              <th className="px-4 py-3 text-right">% of {isRevenue ? 'Revenue' : 'Expenses'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-12 text-center text-slate-400">
                  No {isRevenue ? 'revenue' : 'expense'} line items found
                </td>
              </tr>
            ) : rows.map(row => (
              <tr key={row.label} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3 text-slate-700 font-medium">{row.label}</td>
                <td className="px-4 py-3 text-right text-slate-800 font-semibold tabular-nums">₱{fmt(row.amount)}</td>
                <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{total > 0 ? `${row.share.toFixed(2)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={accent.totalBg}>
              <td className={`px-5 py-4 text-xs uppercase font-bold ${accent.totalText}`}>{totalLabel}</td>
              <td className={`px-4 py-4 text-right font-bold tabular-nums ${accent.totalText}`}>₱{fmt(total)}</td>
              <td className={`px-4 py-4 text-right font-bold tabular-nums ${accent.totalText}`}>{total > 0 ? '100.00%' : '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function FormulaAmount({
  label,
  value,
  tone,
  prefix = '',
}: {
  label: string;
  value: number;
  tone: 'revenue' | 'expense' | 'net';
  prefix?: string;
}) {
  const color = tone === 'revenue' ? 'text-emerald-600' : tone === 'expense' ? 'text-red-500' : 'text-slate-900';
  return (
    <div className="text-center md:text-right">
      <p className="text-xs text-slate-500 uppercase font-semibold">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${color}`}>
        {prefix && <span className="text-slate-400 mr-3">{prefix}</span>}
        ₱{fmt(value)}
      </p>
    </div>
  );
}

interface ReportsProps {
  initialTab?: ReportTab;
  refreshKey?: number;
  canEditTransactions?: boolean;
  onEditTransaction?: (tx: TransactionWithRelations) => void;
}

export default function Reports({ initialTab = 'sales', refreshKey = 0, canEditTransactions = false, onEditTransaction }: ReportsProps) {
  const today = useMemo(() => toInputDate(new Date()), []);
  const defaultFrom = useMemo(() => addDays(today, -6), [today]);
  const currentMonth = useMemo(() => toMonthInput(new Date()), []);
  const currentYear = useMemo(() => String(new Date().getFullYear()), []);

  const [activeTab, setActiveTab] = useState<ReportTab>(initialTab);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('CUSTOM');
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(today);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [customerId, setCustomerId] = useState<'ALL' | string>('ALL');
  const [paymentModeFilter, setPaymentModeFilter] = useState<'ALL' | PaymentMode>('ALL');
  const [materialTypeFilter, setMaterialTypeFilter] = useState<'ALL' | string>('ALL');
  const [extraFeeFilter, setExtraFeeFilter] = useState<ExtraFeeFilter>('ALL');
  const [customerGrouping, setCustomerGrouping] = useState<Grouping>('WEEK');
  const [expenseGrouping, setExpenseGrouping] = useState<Grouping>('DAY');
  const [netGrouping, setNetGrouping] = useState<Grouping>('WEEK');
  const [salesPage, setSalesPage] = useState(1);
  const [customerSummaryPage, setCustomerSummaryPage] = useState(1);
  const [customerTransactionsPage, setCustomerTransactionsPage] = useState(1);
  const [expenseSummaryPage, setExpenseSummaryPage] = useState(1);
  const [expenseCategoryPage, setExpenseCategoryPage] = useState(1);
  const [productsPage, setProductsPage] = useState(1);
  const [transactions, setTransactions] = useState<TransactionWithRelations[]>([]);
  const [expenses, setExpenses] = useState<ExpenseWithCategory[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [customerLoading, setCustomerLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal state for transaction details
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithRelations | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const range = useMemo(
    () => getDateRangeSummary(periodMode, dateFrom, dateTo, selectedMonth, selectedYear),
    [periodMode, dateFrom, dateTo, selectedMonth, selectedYear]
  );

  const yearOptions = useMemo(() => {
    const current = Number(currentYear);
    return Array.from({ length: 8 }, (_, index) => String(current - index));
  }, [currentYear]);

  const fetchCustomers = useCallback(async () => {
    setCustomerLoading(true);
    const { data } = await supabase
      .from('customers')
      .select('*')
      .order('name', { ascending: true });
    setCustomers((data ?? []) as Customer[]);
    setCustomerLoading(false);
  }, []);

  const fetchReportData = useCallback(async () => {
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
      supabase
        .from('expenses')
        .select('*, expense_categories(*)')
        .gte('expense_date', range.start)
        .lte('expense_date', range.end)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ]);

    if (transactionResult.error || expenseResult.error) {
      const messages = [
        transactionResult.error ? `Transactions: ${transactionResult.error.message}` : null,
        expenseResult.error ? `Expenses: ${expenseResult.error.message}` : null,
      ].filter(Boolean);
      setError(messages.join(' • ') || 'Unable to load report data.');
    }

    setTransactions((transactionResult.data ?? []) as TransactionWithRelations[]);
    setExpenses((expenseResult.data ?? []) as ExpenseWithCategory[]);
    setLoading(false);
  }, [range.end, range.start]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData, refreshKey]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setSalesPage(1);
    setCustomerSummaryPage(1);
    setCustomerTransactionsPage(1);
    setExpenseSummaryPage(1);
    setExpenseCategoryPage(1);
    setProductsPage(1);
  }, [activeTab, range.start, range.end, customerId, paymentModeFilter, materialTypeFilter, extraFeeFilter, customerGrouping, expenseGrouping, netGrouping]);

  const salesSummaryList = useMemo(() => {
    const bucketMap: Record<string, SalesSummary> = {};

    transactions.forEach(tx => {
      const bucketStart = getBucketStart(tx.transaction_date, range.salesGrouping);
      if (!bucketMap[bucketStart]) {
        bucketMap[bucketStart] = { bucketStart, count: 0, volume: 0, cash: 0, po: 0, offset: 0, gcash: 0, bankTransfer: 0, extraFees: 0, total: 0 };
      }

      bucketMap[bucketStart].count += 1;
      bucketMap[bucketStart].volume += tx.volume_m3 ?? 0;
      // total = base sales only (excluding extra fees)
      bucketMap[bucketStart].total += tx.amount ?? 0;
      bucketMap[bucketStart].extraFees += (tx.dr_capitol ?? 0) + (tx.passway ?? 0) + (tx.kulot ?? 0);

      bucketMap[bucketStart].cash += getPaymentModeAmount(tx, 'CASH');
      bucketMap[bucketStart].po += getPaymentModeAmount(tx, 'P.O');
      bucketMap[bucketStart].offset += getPaymentModeAmount(tx, 'OFFSET');
      bucketMap[bucketStart].gcash += getPaymentModeAmount(tx, 'GCASH');
      bucketMap[bucketStart].bankTransfer += getPaymentModeAmount(tx, 'BANK_TRANSFER');
    });

    return Object.values(bucketMap).sort((a, b) => b.bucketStart.localeCompare(a.bucketStart));
  }, [transactions, range.salesGrouping]);

  const grandNetSales = useMemo(() => transactions.reduce((sum, tx) => sum + (tx.amount ?? 0), 0), [transactions]);
  const grandExtraFees = useMemo(() => transactions.reduce((sum, tx) => sum + (tx.dr_capitol ?? 0) + (tx.passway ?? 0) + (tx.kulot ?? 0), 0), [transactions]);
  const grandTotalWithFees = useMemo(() => transactions.reduce((sum, tx) => sum + (tx.total_amount ?? 0), 0), [transactions]);
  const grandVolume = useMemo(() => transactions.reduce((sum, tx) => sum + (tx.volume_m3 ?? 0), 0), [transactions]);
  const cashTotal = useMemo(() => transactions.reduce((sum, tx) => sum + getPaymentModeAmount(tx, 'CASH'), 0), [transactions]);
  const poTotal = useMemo(() => transactions.reduce((sum, tx) => sum + getPaymentModeAmount(tx, 'P.O'), 0), [transactions]);
  const offsetTotal = useMemo(() => transactions.reduce((sum, tx) => sum + getPaymentModeAmount(tx, 'OFFSET'), 0), [transactions]);
  const gcashTotal = useMemo(() => transactions.reduce((sum, tx) => sum + getPaymentModeAmount(tx, 'GCASH'), 0), [transactions]);
  const bankTransferTotal = useMemo(() => transactions.reduce((sum, tx) => sum + getPaymentModeAmount(tx, 'BANK_TRANSFER'), 0), [transactions]);

  const expenseSummaryList = useMemo(() => {
    const bucketMap: Record<string, ExpenseSummaryRow> = {};

    expenses.forEach(expense => {
      const bucketStart = getBucketStart(expense.expense_date, expenseGrouping);
      if (!bucketMap[bucketStart]) {
        bucketMap[bucketStart] = { bucketStart, count: 0, total: 0, byCategory: {} };
      }
      bucketMap[bucketStart].count += 1;
      bucketMap[bucketStart].total += expense.amount ?? 0;
      const catName = expense.expense_categories?.name ?? 'Uncategorized';
      bucketMap[bucketStart].byCategory[catName] = (bucketMap[bucketStart].byCategory[catName] ?? 0) + (expense.amount ?? 0);
    });

    return Object.values(bucketMap).sort((a, b) => b.bucketStart.localeCompare(a.bucketStart));
  }, [expenses, expenseGrouping]);

  const totalExpenseRecords = useMemo(() => expenses.length, [expenses]);

  const expenseCategoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach(expense => {
      const catName = expense.expense_categories?.name ?? 'Uncategorized';
      map[catName] = (map[catName] ?? 0) + (expense.amount ?? 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const topExpenseCategory = expenseCategoryTotals[0]?.[0] ?? '—';
  const topExpenseCategoryAmount = expenseCategoryTotals[0]?.[1] ?? 0;

  const materialTypeOptions = useMemo(() => {
    const types = new Set(transactions.map(tx => tx.material_type).filter(Boolean));
    return Array.from(types).sort();
  }, [transactions]);

  const customerTransactions = useMemo(() => {
    let filtered = customerId === 'ALL'
      ? transactions
      : transactions.filter(tx => tx.customer_id === customerId);

    if (paymentModeFilter !== 'ALL') {
      filtered = filtered.filter(tx => tx.payment_mode === paymentModeFilter);
    }

    if (materialTypeFilter !== 'ALL') {
      filtered = filtered.filter(tx => tx.material_type === materialTypeFilter);
    }

    if (extraFeeFilter !== 'ALL') {
      filtered = filtered.filter(tx => (tx[extraFeeFilter] ?? 0) > 0);
    }

    return [...filtered].sort((a, b) => {
      if (a.transaction_date === b.transaction_date) {
        return b.created_at.localeCompare(a.created_at);
      }
      return b.transaction_date.localeCompare(a.transaction_date);
    });
  }, [transactions, customerId, paymentModeFilter, materialTypeFilter, extraFeeFilter]);

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
      if (customerId === 'ALL' && tx.customer_id) bucketMap[bucketStart].customerIds.add(tx.customer_id);
    });

    return Object.values(bucketMap).sort((a, b) => b.bucketStart.localeCompare(a.bucketStart));
  }, [customerTransactions, customerGrouping, customerId]);

  const customerTotalSales = useMemo(() => customerTransactions.reduce((sum, tx) => sum + (tx.total_amount ?? 0), 0), [customerTransactions]);
  const customerTotalVolume = useMemo(() => customerTransactions.reduce((sum, tx) => sum + (tx.volume_m3 ?? 0), 0), [customerTransactions]);
  const customerCount = useMemo(() => new Set(customerTransactions.map(tx => tx.customer_id).filter(Boolean)).size, [customerTransactions]);

  const productSalesList = useMemo(() => {
    const map: Record<string, ProductSalesSummary> = {};

    transactions.forEach(tx => {
      const materialType = tx.material_type || 'Unspecified';
      if (!map[materialType]) {
        map[materialType] = { materialType, quantity: 0, volume: 0, revenue: 0 };
      }
      map[materialType].quantity += 1;
      map[materialType].volume += tx.volume_m3 ?? 0;
      map[materialType].revenue += tx.total_amount ?? 0;
    });

    return Object.values(map).sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue || a.materialType.localeCompare(b.materialType));
  }, [transactions]);

  const productTotals = useMemo(() => ({
    quantity: productSalesList.reduce((sum, product) => sum + product.quantity, 0),
    volume: productSalesList.reduce((sum, product) => sum + product.volume, 0),
    revenue: productSalesList.reduce((sum, product) => sum + product.revenue, 0),
  }), [productSalesList]);

  const totalExpenses = useMemo(() => expenses.reduce((sum, expense) => sum + (expense.amount ?? 0), 0), [expenses]);

  const productChartData = useMemo(() => {
    const top = productSalesList.slice(0, 5);
    const others = productSalesList.slice(5);
    const rows = top.map(product => ({ label: product.materialType, value: product.quantity }));
    const otherQuantity = others.reduce((sum, product) => sum + product.quantity, 0);
    if (otherQuantity > 0) rows.push({ label: 'Others', value: otherQuantity });
    return rows;
  }, [productSalesList]);

  const revenueLineItems = useMemo(() => {
    const rows = productSalesList.map(product => ({
      label: product.materialType,
      amount: product.revenue,
      share: grandTotalWithFees > 0 ? (product.revenue / grandTotalWithFees) * 100 : 0,
    }));
    if (grandExtraFees > 0) {
      rows.push({
        label: 'Other Sales',
        amount: grandExtraFees,
        share: grandTotalWithFees > 0 ? (grandExtraFees / grandTotalWithFees) * 100 : 0,
      });
    }
    return compactFinancialLineItems(rows, 'Other Sales');
  }, [grandExtraFees, grandTotalWithFees, productSalesList]);

  const expenseLineItems = useMemo(() => {
    const rows = expenseCategoryTotals.map(([label, amount]) => ({
      label,
      amount,
      share: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
    }));
    return compactFinancialLineItems(rows, 'Other Expenses');
  }, [expenseCategoryTotals, totalExpenses]);

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

  const netIncome = grandTotalWithFees - totalExpenses;
  const selectedCustomer = customerId === 'ALL' ? null : customers.find(customer => customer.id === customerId) ?? null;

  const salesCurrentPage = Math.min(salesPage, Math.max(1, Math.ceil(salesSummaryList.length / REPORT_PAGE_SIZE)));
  const pagedSalesSummary = useMemo(() => paginate(salesSummaryList, salesCurrentPage, REPORT_PAGE_SIZE), [salesSummaryList, salesCurrentPage]);
  const customerSummaryCurrentPage = Math.min(customerSummaryPage, Math.max(1, Math.ceil(customerSummaryList.length / REPORT_PAGE_SIZE)));
  const pagedCustomerSummary = useMemo(() => paginate(customerSummaryList, customerSummaryCurrentPage, REPORT_PAGE_SIZE), [customerSummaryList, customerSummaryCurrentPage]);
  const customerTransactionsCurrentPage = Math.min(customerTransactionsPage, Math.max(1, Math.ceil(customerTransactions.length / REPORT_PAGE_SIZE)));
  const pagedCustomerTransactions = useMemo(() => paginate(customerTransactions, customerTransactionsCurrentPage, REPORT_PAGE_SIZE), [customerTransactions, customerTransactionsCurrentPage]);
  const expenseSummaryCurrentPage = Math.min(expenseSummaryPage, Math.max(1, Math.ceil(expenseSummaryList.length / REPORT_PAGE_SIZE)));
  const pagedExpenseSummary = useMemo(() => paginate(expenseSummaryList, expenseSummaryCurrentPage, REPORT_PAGE_SIZE), [expenseSummaryList, expenseSummaryCurrentPage]);
  const expenseCategoryCurrentPage = Math.min(expenseCategoryPage, Math.max(1, Math.ceil(expenseCategoryTotals.length / REPORT_PAGE_SIZE)));
  const pagedExpenseCategories = useMemo(() => paginate(expenseCategoryTotals, expenseCategoryCurrentPage, REPORT_PAGE_SIZE), [expenseCategoryTotals, expenseCategoryCurrentPage]);
  const productsCurrentPage = Math.min(productsPage, Math.max(1, Math.ceil(productSalesList.length / REPORT_PAGE_SIZE)));
  const pagedProductSales = useMemo(() => paginate(productSalesList, productsCurrentPage, REPORT_PAGE_SIZE), [productSalesList, productsCurrentPage]);

  const getReportExportData = useCallback((): ExportReportData => {
    const periodLabel = `${periodMode === 'CUSTOM' ? 'Custom date range' : periodMode === 'MONTHLY' ? 'Monthly' : 'Yearly'}: ${range.label}`;
    const baseFilterLines = [
      periodLabel,
      `Date range: ${range.start} to ${range.end}`,
    ];

    if (activeTab === 'sales') {
      return {
        title: 'Sales Summary',
        filename: `sales-summary-${slugify(range.label)}`,
        filterLines: baseFilterLines,
        headers: ['Period', 'Transactions', 'Volume (m3)', 'Cash', 'P.O', 'Offset', 'GCash', 'Bank', 'Extra Fees', 'Net Sales'],
        rows: salesSummaryList.map(summary => [
          formatBucketLabel(summary.bucketStart, range.salesGrouping),
          summary.count,
          formatVolume(summary.volume),
          fmt(summary.cash),
          fmt(summary.po),
          fmt(summary.offset),
          fmt(summary.gcash),
          fmt(summary.bankTransfer),
          fmt(summary.extraFees),
          fmt(summary.total),
        ]),
        totals: ['Totals', transactions.length, formatVolume(grandVolume), fmt(cashTotal), fmt(poTotal), fmt(offsetTotal), fmt(gcashTotal), fmt(bankTransferTotal), fmt(grandExtraFees), fmt(grandNetSales)],
      };
    }

    if (activeTab === 'customers') {
      const selectedPayment = paymentModeFilter === 'ALL' ? 'All payment modes' : paymentModeFilter;
      const selectedMaterial = materialTypeFilter === 'ALL' ? 'All products' : materialTypeFilter;
      const customerLabel = selectedCustomer?.name ?? 'All customers';

      return {
        title: 'Customer Sales History',
        filename: `customer-sales-history-${slugify(customerLabel)}-${slugify(range.label)}`,
        filterLines: [...baseFilterLines, `Customer: ${customerLabel}`, `Payment mode: ${selectedPayment}`, `Product: ${selectedMaterial}`],
        headers: ['Date', 'DR #', 'Customer', 'Truck', 'Material', 'Length (cm)', 'Width (cm)', 'Height (cm)', 'Volume (m3)', 'Unit Price', 'Amount', 'DR Capitol', 'Passway', 'Kulot', 'Total', 'Mode', 'Status', 'Notes'],
        rows: customerTransactions.map(tx => [
          formatDateLabel(tx.transaction_date, { month: 'short', day: 'numeric', year: 'numeric' }),
          tx.dr_number || '',
          tx.customers?.name ?? '',
          tx.trucks?.plate_number ?? '',
          tx.material_type ?? '',
          fmt(tx.length_cm ?? 0),
          fmt(tx.width_cm ?? 0),
          fmt(tx.height_cm ?? 0),
          formatVolume(tx.volume_m3 ?? 0),
          fmt(tx.unit_price ?? 0),
          fmt(tx.amount ?? 0),
          fmt(tx.dr_capitol ?? 0),
          fmt(tx.passway ?? 0),
          fmt(tx.kulot ?? 0),
          fmt(tx.total_amount ?? 0),
          tx.payment_mode ?? '',
          tx.status ?? '',
          tx.notes ?? '',
        ]),
        totals: ['Totals', '', '', '', '', '', '', '', formatVolume(customerTotalVolume), '', fmt(customerTransactions.reduce((sum, tx) => sum + (tx.amount ?? 0), 0)), fmt(customerTransactions.reduce((sum, tx) => sum + (tx.dr_capitol ?? 0), 0)), fmt(customerTransactions.reduce((sum, tx) => sum + (tx.passway ?? 0), 0)), fmt(customerTransactions.reduce((sum, tx) => sum + (tx.kulot ?? 0), 0)), fmt(customerTotalSales), '', '', ''],
      };
    }

    if (activeTab === 'expenses') {
      return {
        title: 'Expense Summary',
        filename: `expense-summary-${slugify(range.label)}`,
        filterLines: baseFilterLines,
        headers: ['Category', 'Total', 'Share'],
        rows: expenseCategoryTotals.map(([catName, catTotal]) => [
          catName,
          fmt(catTotal),
          totalExpenses > 0 ? `${((catTotal / totalExpenses) * 100).toFixed(1)}%` : '',
        ]),
        totals: ['Total', fmt(totalExpenses), totalExpenses > 0 ? '100%' : ''],
      };
    }

    if (activeTab === 'products') {
      return {
        title: 'Product Sales Report',
        filename: `product-sales-report-${slugify(range.label)}`,
        filterLines: baseFilterLines,
        headers: ['Product', 'Quantity Sold', 'Volume (m3)', 'Revenue'],
        rows: productSalesList.map(product => [
          product.materialType,
          product.quantity,
          formatVolume(product.volume),
          fmt(product.revenue),
        ]),
        totals: ['Totals', productTotals.quantity, formatVolume(productTotals.volume), fmt(productTotals.revenue)],
      };
    }

    return {
      title: 'Expense vs Revenue',
      filename: `expense-vs-revenue-${slugify(range.label)}`,
      filterLines: [...baseFilterLines, `Tracked periods: ${netIncomeList.length}`],
      headers: ['Section', 'Description', 'Amount (PHP)', 'Share'],
      rows: [
        ...revenueLineItems.map(item => [
          'Revenue',
          item.label,
          fmt(item.amount),
          grandTotalWithFees > 0 ? `${item.share.toFixed(2)}%` : '',
        ]),
        ['Revenue', 'Total Revenue', fmt(grandTotalWithFees), grandTotalWithFees > 0 ? '100.00%' : ''],
        ['', '', '', ''],
        ...expenseLineItems.map(item => [
          'Expenses',
          item.label,
          fmt(item.amount),
          totalExpenses > 0 ? `${item.share.toFixed(2)}%` : '',
        ]),
        ['Expenses', 'Total Expenses', fmt(totalExpenses), totalExpenses > 0 ? '100.00%' : ''],
      ],
      totals: ['Net Income', 'Revenue - Expenses', fmt(netIncome), ''],
    };
  }, [
    activeTab,
    bankTransferTotal,
    cashTotal,
    customerTotalSales,
    customerTotalVolume,
    customerTransactions,
    expenseCategoryTotals,
    gcashTotal,
    grandExtraFees,
    grandNetSales,
    grandTotalWithFees,
    grandVolume,
    materialTypeFilter,
    netGrouping,
    netIncome,
    netIncomeList,
    offsetTotal,
    paymentModeFilter,
    periodMode,
    poTotal,
    productSalesList,
    productTotals.quantity,
    productTotals.revenue,
    productTotals.volume,
    range.end,
    range.label,
    range.salesGrouping,
    range.start,
    revenueLineItems,
    salesSummaryList,
    selectedCustomer,
    expenseLineItems,
    totalExpenses,
    transactions.length,
  ]);

  const exportCsv = useCallback(() => {
    const report = getReportExportData();
    const lines = [
      [report.title],
      ...report.filterLines.map(line => [line]),
      [`Generated: ${new Date().toLocaleString('en-PH')}`],
      [],
      report.headers,
      ...report.rows,
      ...(report.totals ? [report.totals] : []),
    ];
    const csv = `\uFEFF${lines.map(row => row.map(cell => csvEscape(formatCsvCell(cell))).join(',')).join('\r\n')}`;
    downloadTextFile(`${report.filename}.csv`, csv, 'text/csv;charset=utf-8');
  }, [getReportExportData]);

  const exportPdf = useCallback(() => {
    const report = getReportExportData();
    const generated = new Date().toLocaleString('en-PH');
    const rowsHtml = report.rows.map(row => `<tr>${row.map(cell => `<td>${htmlEscape(cell)}</td>`).join('')}</tr>`).join('');
    const totalsHtml = report.totals
      ? `<tfoot><tr>${report.totals.map(cell => `<td>${htmlEscape(cell)}</td>`).join('')}</tr></tfoot>`
      : '';
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow pop-ups to export the report PDF.');
      return;
    }

    printWindow.document.write(`<!doctype html>
      <html>
        <head>
          <title>${htmlEscape(report.title)}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; margin: 32px; }
            h1 { font-size: 22px; margin: 0 0 8px; }
            .meta { color: #475569; font-size: 12px; line-height: 1.55; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th { text-align: left; background: #f1f5f9; color: #475569; text-transform: uppercase; letter-spacing: .03em; }
            th, td { border: 1px solid #e2e8f0; padding: 7px 8px; }
            td:not(:first-child), th:not(:first-child) { text-align: right; }
            tfoot td { background: #0f172a; color: white; font-weight: 700; }
            @media print { body { margin: 18mm; } }
          </style>
        </head>
        <body>
          <h1>${htmlEscape(report.title)}</h1>
          <div class="meta">
            ${report.filterLines.map(line => `<div>${htmlEscape(line)}</div>`).join('')}
            <div>Generated: ${htmlEscape(generated)}</div>
          </div>
          <table>
            <thead><tr>${report.headers.map(header => `<th>${htmlEscape(header)}</th>`).join('')}</tr></thead>
            <tbody>${rowsHtml || `<tr><td colspan="${report.headers.length}">No records found.</td></tr>`}</tbody>
            ${totalsHtml}
          </table>
        </body>
      </html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }, [getReportExportData]);

  // Handle row double-click
  const handleRowDoubleClick = (tx: TransactionWithRelations) => {
    setSelectedTransaction(tx);
    setIsModalOpen(true);
  };

  // Close modal
  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedTransaction(null);
  };

  const editSelectedTransaction = () => {
    if (!selectedTransaction || !canEditTransactions || !onEditTransaction) return;
    const tx = selectedTransaction;
    closeModal();
    onEditTransaction(tx);
  };

  return (
    <div className="space-y-5">
      {/* Transaction Detail Modal */}
      {isModalOpen && selectedTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeModal}
          />
          
          {/* Modal Content */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden mx-4">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-lg text-slate-800">Transaction Details</h3>
                <p className="text-sm text-slate-500 font-mono">{selectedTransaction.dr_number || 'No DR #'}</p>
              </div>
              <button 
                onClick={closeModal}
                className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            
            {/* Body */}
            <div className="px-6 py-5 overflow-y-auto max-h-[calc(90vh-140px)]">
              {/* Status & Payment Mode Badges */}
              <div className="flex items-center gap-3 mb-6">
                <span className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold border ${
                  selectedTransaction.status === 'PAID'
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                    : 'bg-amber-50 text-amber-600 border-amber-200'
                }`}>
                  {selectedTransaction.status}
                </span>
                <span className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold ${
                  selectedTransaction.payment_mode === 'CASH'
                    ? 'bg-emerald-100 text-emerald-700'
                    : selectedTransaction.payment_mode === 'P.O'
                      ? 'bg-amber-100 text-amber-700'
                      : selectedTransaction.payment_mode === 'GCASH'
                        ? 'bg-blue-100 text-blue-700'
                        : selectedTransaction.payment_mode === 'BANK_TRANSFER'
                          ? 'bg-violet-100 text-violet-700'
                          : selectedTransaction.payment_mode === 'OFFSET'
                            ? 'bg-pink-100 text-pink-700'
                            : selectedTransaction.payment_mode === 'DONATION'
                            ? 'bg-rose-100 text-rose-700'
                            : selectedTransaction.payment_mode === 'SPLIT'
                              ? 'bg-cyan-100 text-cyan-700'
                            : 'bg-slate-100 text-slate-600'
                }`}>
                  {selectedTransaction.payment_mode === 'BANK_TRANSFER'
                    ? 'BANK TRANSFER'
                    : selectedTransaction.payment_mode}
                </span>
              </div>

              {/* Basic Info Section */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <DetailItem 
                  label="Transaction Date" 
                  value={formatDateLabel(selectedTransaction.transaction_date, { 
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
                  })} 
                />
                <DetailItem 
                  label="DR Number" 
                  value={selectedTransaction.dr_number || '—'} 
                  mono 
                />
                <DetailItem 
                  label="Customer" 
                  value={selectedTransaction.customers?.name ?? '—'} 
                />
                <DetailItem 
                  label="Truck" 
                  value={selectedTransaction.trucks?.plate_number ?? '—'} 
                  mono 
                />
                <DetailItem 
                  label="Material Type" 
                  value={selectedTransaction.material_type || '—'} 
                />
              </div>

              <hr className="border-slate-200 my-5" />

              {/* Dimensions Section */}
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Dimensions</h4>
              <div className="grid grid-cols-4 gap-4 mb-6">
                <DetailItem label="Length" value={`${selectedTransaction.length_cm ?? 0} cm`} />
                <DetailItem label="Width" value={`${selectedTransaction.width_cm ?? 0} cm`} />
                <DetailItem label="Height" value={`${selectedTransaction.height_cm ?? 0} cm`} />
                <DetailItem 
                  label="Volume" 
                  value={`${formatVolume(selectedTransaction.volume_m3 ?? 0)} m³`} 
                  highlight 
                />
              </div>

              <hr className="border-slate-200 my-5" />

              {/* Pricing Section */}
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Pricing Breakdown</h4>
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Unit Price</span>
                  <span className="text-slate-700 font-medium tabular-nums">₱{fmt(selectedTransaction.unit_price ?? 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Base Amount (Volume × Unit Price)</span>
                  <span className="text-slate-700 font-medium tabular-nums">₱{fmt(selectedTransaction.amount ?? 0)}</span>
                </div>
                
                <hr className="border-slate-200" />
                
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">DR Capitol</span>
                  <span className="text-slate-700 tabular-nums">₱{fmt(selectedTransaction.dr_capitol ?? 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Passway</span>
                  <span className="text-slate-700 tabular-nums">₱{fmt(selectedTransaction.passway ?? 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Kulot</span>
                  <span className="text-slate-700 tabular-nums">₱{fmt(selectedTransaction.kulot ?? 0)}</span>
                </div>
                
                <hr className="border-slate-200" />
                
                <div className="flex justify-between text-base font-bold">
                  <span className="text-slate-700">Total Amount</span>
                  <span className="text-emerald-600 tabular-nums">₱{fmt(selectedTransaction.total_amount ?? 0)}</span>
                </div>
              </div>

              {/* Notes Section */}
              {selectedTransaction.notes && (
                <>
                  <hr className="border-slate-200 my-5" />
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Notes</h4>
                  <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">
                    {selectedTransaction.notes}
                  </p>
                </>
              )}

              {/* Metadata */}
              <hr className="border-slate-200 my-5" />
              <p className="text-xs text-slate-400">
                Created: {selectedTransaction.created_at 
                  ? new Date(selectedTransaction.created_at).toLocaleString('en-PH', {
                      weekday: 'short',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) 
                  : '—'}
              </p>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              {canEditTransactions && onEditTransaction && (
                <button
                  onClick={editSelectedTransaction}
                  className="px-4 py-2 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Pencil size={15} />
                  Edit Transaction
                </button>
              )}
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
          <p className="text-slate-500 text-sm mt-0.5">Sales, customer performance, and net income views</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60 text-sm font-semibold transition-colors">
            <Download size={15} />
            CSV
          </button>
          <button onClick={exportPdf} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60 text-sm font-semibold transition-colors">
            <FileText size={15} />
            PDF
          </button>
          <button onClick={fetchReportData} disabled={loading} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'sales', label: 'Sales Summary' },
            { id: 'customers', label: 'Customer Sales History' },
            { id: 'expenses', label: 'Expense Summary' },
            { id: 'net', label: 'Expense vs Revenue' },
            { id: 'products', label: 'Product Sales Report' },
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
              <select
                value={paymentModeFilter}
                onChange={e => setPaymentModeFilter(e.target.value as 'ALL' | PaymentMode)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                <option value="ALL">All Payment Modes</option>
                <option value="CASH">Cash</option>
                <option value="P.O">P.O</option>
                <option value="GCASH">GCash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="OFFSET">Offset</option>
                <option value="DONATION">Donation</option>
                <option value="SPLIT">Split</option>
              </select>
              {materialTypeOptions.length > 0 && (
                <select
                  value={materialTypeFilter}
                  onChange={e => setMaterialTypeFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200"
                >
                  <option value="ALL">All Products</option>
                  {materialTypeOptions.map(mt => (
                    <option key={mt} value={mt}>{mt}</option>
                  ))}
                </select>
              )}
              <select
                value={extraFeeFilter}
                onChange={e => setExtraFeeFilter(e.target.value as ExtraFeeFilter)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                <option value="ALL">All Extra Fees</option>
                <option value="dr_capitol">DR Capitol</option>
                <option value="passway">Passway</option>
                <option value="kulot">Kulot</option>
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

          {activeTab === 'expenses' && (
            <div className="flex items-center gap-1.5">
              {(['DAY', 'WEEK', 'MONTH'] as const).map(group => (
                <button
                  key={group}
                  onClick={() => setExpenseGrouping(group)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    expenseGrouping === group
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {group}
                </button>
              ))}
            </div>
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
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
            {[
              { label: 'Net Sales', value: `₱${fmt(grandNetSales)}`, icon: <DollarSign size={18} className="text-emerald-500" />, bg: 'bg-emerald-50' },
              { label: 'Extra Fees', value: `₱${fmt(grandExtraFees)}`, icon: <ReceiptText size={18} className="text-orange-500" />, bg: 'bg-orange-50' },
              { label: 'Total Volume', value: `${formatVolume(grandVolume)} m³`, icon: <Layers size={18} className="text-sky-500" />, bg: 'bg-sky-50' },
              { label: 'Cash Sales', value: `₱${fmt(cashTotal)}`, icon: <TrendingUp size={18} className="text-emerald-500" />, bg: 'bg-emerald-50' },
              { label: 'P.O Receivable', value: `₱${fmt(poTotal)}`, icon: <ReceiptText size={18} className="text-amber-500" />, bg: 'bg-amber-50' },
              { label: 'GCash Sales', value: `₱${fmt(gcashTotal)}`, icon: <Banknote size={18} className="text-blue-500" />, bg: 'bg-blue-50' },
              { label: 'Bank Transfer', value: `₱${fmt(bankTransferTotal)}`, icon: <Banknote size={18} className="text-violet-500" />, bg: 'bg-violet-50' },
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
                      <th className="px-4 py-3 text-right">GCash</th>
                      <th className="px-4 py-3 text-right">Bank</th>
                      <th className="px-4 py-3 text-right">Extra Fees</th>
                      <th className="px-4 py-3 text-right">Net Sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedSalesSummary.map(summary => (
                      <tr key={summary.bucketStart} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">
                          {formatBucketLabel(summary.bucketStart, range.salesGrouping)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{summary.count}</td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-semibold tabular-nums">{formatVolume(summary.volume)}</td>
                        <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{summary.cash > 0 ? `₱${fmt(summary.cash)}` : '—'}</td>
                        <td className="px-4 py-3 text-right text-amber-600 tabular-nums">{summary.po > 0 ? `₱${fmt(summary.po)}` : '—'}</td>
                        <td className="px-4 py-3 text-right text-slate-500 tabular-nums">{summary.offset > 0 ? `₱${fmt(summary.offset)}` : '—'}</td>
                        <td className="px-4 py-3 text-right text-blue-600 tabular-nums">{summary.gcash > 0 ? `₱${fmt(summary.gcash)}` : '—'}</td>
                        <td className="px-4 py-3 text-right text-violet-600 tabular-nums">{summary.bankTransfer > 0 ? `₱${fmt(summary.bankTransfer)}` : '—'}</td>
                        <td className="px-4 py-3 text-right text-orange-500 tabular-nums">{summary.extraFees > 0 ? `₱${fmt(summary.extraFees)}` : '—'}</td>
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
                      <td className="px-4 py-3 text-right text-slate-400 font-semibold tabular-nums">₱{fmt(offsetTotal)}</td>
                      <td className="px-4 py-3 text-right text-blue-400 font-semibold tabular-nums">₱{fmt(gcashTotal)}</td>
                      <td className="px-4 py-3 text-right text-violet-400 font-semibold tabular-nums">₱{fmt(bankTransferTotal)}</td>
                      <td className="px-4 py-3 text-right text-orange-400 font-semibold tabular-nums">₱{fmt(grandExtraFees)}</td>
                      <td className="px-4 py-3 text-right text-white font-bold tabular-nums">₱{fmt(grandNetSales)}</td>
                    </tr>
                  </tfoot>
                </table>
                <Pagination page={salesCurrentPage} pageSize={REPORT_PAGE_SIZE} totalItems={salesSummaryList.length} onPageChange={setSalesPage} />
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
              { label: selectedCustomer ? 'Transactions' : 'Customers Reached', value: String(selectedCustomer ? customerTransactions.length : customerCount), icon: <Users size={18} className="text-violet-500" />, bg: 'bg-violet-50' },
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
                    {pagedCustomerSummary.map(summary => (
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
                <Pagination page={customerSummaryCurrentPage} pageSize={REPORT_PAGE_SIZE} totalItems={customerSummaryList.length} onPageChange={setCustomerSummaryPage} />
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-800">Transaction Drill-down</h2>
                <p className="text-xs text-slate-500 mt-1">Double-click a row to view full transaction details.</p>
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
                    <th className="px-4 py-3 text-left">Material</th>

                    <th className="px-4 py-3 text-right">Length (cm)</th>
                    <th className="px-4 py-3 text-right">Width (cm)</th>
                    <th className="px-4 py-3 text-right">Height (cm)</th>
                    <th className="px-4 py-3 text-right">Volume (m³)</th>

                    <th className="px-4 py-3 text-right">Unit Price</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right">DR Capitol</th>
                    <th className="px-4 py-3 text-right">Passway</th>
                    <th className="px-4 py-3 text-right">Kulot</th>
                    <th className="px-4 py-3 text-right">Total</th>

                    <th className="px-4 py-3 text-center">Mode</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-left">Notes</th>
                    {/* <th className="px-4 py-3 text-left">Created At</th> */}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {pagedCustomerTransactions.map(tx => (
                    <tr
                      key={tx.id}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                      onDoubleClick={() => handleRowDoubleClick(tx)}
                      title="Double-click to view details"
                    >
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {formatDateLabel(tx.transaction_date, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </td>

                      <td className="px-4 py-3 font-mono font-semibold text-slate-700 whitespace-nowrap">
                        {tx.dr_number || '—'}
                      </td>

                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {tx.customers?.name ?? '—'}
                      </td>

                      <td className="px-4 py-3 text-slate-500 font-mono text-xs whitespace-nowrap">
                        {tx.trucks?.plate_number ?? '—'}
                      </td>

                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {tx.material_type ?? '—'}
                      </td>

                      <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                        {fmt(tx.length_cm ?? 0)}
                      </td>

                      <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                        {fmt(tx.width_cm ?? 0)}
                      </td>

                      <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                        {fmt(tx.height_cm ?? 0)}
                      </td>

                      <td className="px-4 py-3 text-right text-emerald-600 font-semibold tabular-nums">
                        {formatVolume(tx.volume_m3 ?? 0)}
                      </td>

                      <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                        ₱{fmt(tx.unit_price ?? 0)}
                      </td>

                      <td className="px-4 py-3 text-right text-slate-700 font-semibold tabular-nums">
                        ₱{fmt(tx.amount ?? 0)}
                      </td>

                      <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                        ₱{fmt(tx.dr_capitol ?? 0)}
                      </td>

                      <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                        ₱{fmt(tx.passway ?? 0)}
                      </td>

                      <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                        ₱{fmt(tx.kulot ?? 0)}
                      </td>

                      <td className="px-4 py-3 text-right font-bold text-slate-800 tabular-nums">
                        ₱{fmt(tx.total_amount ?? 0)}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${
                            tx.payment_mode === 'CASH'
                              ? 'bg-emerald-100 text-emerald-700'
                              : tx.payment_mode === 'P.O'
                                ? 'bg-amber-100 text-amber-700'
                                : tx.payment_mode === 'GCASH'
                                  ? 'bg-blue-100 text-blue-700'
                                  : tx.payment_mode === 'BANK_TRANSFER'
                                    ? 'bg-violet-100 text-violet-700'
                                    : tx.payment_mode === 'OFFSET'
                                      ? 'bg-pink-100 text-pink-700'
                                        : tx.payment_mode === 'DONATION'
                                      ? 'bg-rose-100 text-rose-700'
                                      : tx.payment_mode === 'SPLIT'
                                        ? 'bg-cyan-100 text-cyan-700'
                                      : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {tx.payment_mode === 'BANK_TRANSFER'
                            ? 'BANK'
                            : tx.payment_mode === 'DONATION'
                              ? 'DONATE'
                            : tx.payment_mode || '—'}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${
                            tx.status === 'PAID'
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                              : 'bg-amber-50 text-amber-600 border-amber-200'
                          }`}
                        >
                          {tx.status || '—'}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-slate-500 max-w-[240px] truncate">
                        {tx.notes || '—'}
                      </td>

                      {/* <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {tx.created_at
                          ? formatDateLabel(tx.created_at, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })
                          : '—'}
                      </td> */}
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={customerTransactionsCurrentPage} pageSize={REPORT_PAGE_SIZE} totalItems={customerTransactions.length} onPageChange={setCustomerTransactionsPage} />
            </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'expenses' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Expenses', value: `₱${fmt(totalExpenses)}`, icon: <Banknote size={18} className="text-red-500" />, bg: 'bg-red-50' },
              { label: 'Records', value: String(totalExpenseRecords), icon: <ReceiptText size={18} className="text-amber-500" />, bg: 'bg-amber-50' },
              { label: 'Top Category', value: topExpenseCategory, icon: <FileBarChart2 size={18} className="text-violet-500" />, bg: 'bg-violet-50' },
              { label: 'Top Category Total', value: `₱${fmt(topExpenseCategoryAmount)}`, icon: <TrendingUp size={18} className="text-sky-500" />, bg: 'bg-sky-50' },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>{card.icon}</div>
                <p className="text-xs text-slate-500 font-medium">{card.label}</p>
                <p className="text-lg font-bold text-slate-800 mt-0.5 tabular-nums truncate">{loading ? '—' : card.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">{expenseGrouping === 'MONTH' ? 'Monthly Breakdown' : expenseGrouping === 'WEEK' ? 'Weekly Breakdown' : 'Daily Breakdown'}</h2>
            </div>
            {loading ? (
              <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
                <RefreshCw size={16} className="animate-spin" /> Loading expense report...
              </div>
            ) : expenseSummaryList.length === 0 ? (
              <div className="py-16 text-center">
                <Banknote size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">No expense data in selected range</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Period</th>
                      <th className="px-4 py-3 text-right">Records</th>
                      <th className="px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedExpenseSummary.map(row => (
                      <tr key={row.bucketStart} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">
                          {formatBucketLabel(row.bucketStart, expenseGrouping)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{row.count}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600 tabular-nums">₱{fmt(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-900">
                      <td className="px-4 py-3 text-slate-300 font-semibold text-xs uppercase">Totals</td>
                      <td className="px-4 py-3 text-right text-slate-300 font-semibold tabular-nums">{totalExpenseRecords}</td>
                      <td className="px-4 py-3 text-right text-red-300 font-bold tabular-nums">₱{fmt(totalExpenses)}</td>
                    </tr>
                  </tfoot>
                </table>
                <Pagination page={expenseSummaryCurrentPage} pageSize={REPORT_PAGE_SIZE} totalItems={expenseSummaryList.length} onPageChange={setExpenseSummaryPage} />
              </div>
            )}
          </div>

          {expenseCategoryTotals.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-800">By Category</h2>
              </div>
              {loading ? (
                <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
                  <RefreshCw size={16} className="animate-spin" /> Loading...
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                        <th className="px-4 py-3 text-left">Category</th>
                        <th className="px-4 py-3 text-right">Total</th>
                        <th className="px-4 py-3 text-right">Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pagedExpenseCategories.map(([catName, catTotal]) => (
                        <tr key={catName} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-700">{catName}</td>
                          <td className="px-4 py-3 text-right text-red-600 font-semibold tabular-nums">₱{fmt(catTotal)}</td>
                          <td className="px-4 py-3 text-right text-slate-500 tabular-nums">
                            {totalExpenses > 0 ? `${((catTotal / totalExpenses) * 100).toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-900">
                        <td className="px-4 py-3 text-slate-300 font-semibold text-xs uppercase">Total</td>
                        <td className="px-4 py-3 text-right text-red-300 font-bold tabular-nums">₱{fmt(totalExpenses)}</td>
                        <td className="px-4 py-3 text-right text-slate-400 tabular-nums">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                  <Pagination page={expenseCategoryCurrentPage} pageSize={REPORT_PAGE_SIZE} totalItems={expenseCategoryTotals.length} onPageChange={setExpenseCategoryPage} />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === 'net' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { label: 'Revenue', value: `₱${fmt(grandTotalWithFees)}`, icon: <DollarSign size={18} className="text-emerald-500" />, bg: 'bg-emerald-50' },
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

          {loading ? (
            <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2 bg-white rounded-xl border border-slate-200">
              <RefreshCw size={16} className="animate-spin" /> Loading net income report...
            </div>
          ) : grandTotalWithFees === 0 && totalExpenses === 0 ? (
            <div className="py-16 text-center bg-white rounded-xl border border-slate-200">
              <Banknote size={32} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No revenue or expenses in selected range</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <FinancialStatementTable
                  title="Revenue Line Items"
                  rows={revenueLineItems}
                  total={grandTotalWithFees}
                  totalLabel="Total Revenue"
                  tone="revenue"
                />
                <FinancialStatementTable
                  title="Expense Line Items"
                  rows={expenseLineItems}
                  total={totalExpenses}
                  totalLabel="Total Expenses"
                  tone="expense"
                />
              </div>

              <div className="bg-sky-50/70 rounded-xl border border-sky-100 p-5">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center">
                      <TrendingUp size={22} className={netIncome >= 0 ? 'text-emerald-600' : 'text-red-500'} />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-semibold">Net Income (Revenue - Expenses)</p>
                      <p className={`text-2xl font-bold tabular-nums ${netIncome >= 0 ? 'text-slate-900' : 'text-red-600'}`}>₱{fmt(netIncome)}</p>
                    </div>
                  </div>
                  <FormulaAmount label="Revenue" value={grandTotalWithFees} tone="revenue" />
                  <FormulaAmount label="Expenses" value={totalExpenses} tone="expense" prefix="-" />
                  <FormulaAmount label="Net Income" value={netIncome} tone={netIncome >= 0 ? 'net' : 'expense'} prefix="=" />
                </div>
              </div>
            </>
          )}
        </>
      )}
      {activeTab === 'products' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { label: 'Top Product', value: productSalesList[0]?.materialType ?? '—', icon: <Package size={18} className="text-emerald-500" />, bg: 'bg-emerald-50' },
              { label: 'Quantity Sold', value: String(productTotals.quantity), icon: <Layers size={18} className="text-sky-500" />, bg: 'bg-sky-50' },
              { label: 'Products Sold', value: String(productSalesList.length), icon: <FileBarChart2 size={18} className="text-violet-500" />, bg: 'bg-violet-50' },
              { label: 'Revenue', value: `₱${fmt(productTotals.revenue)}`, icon: <DollarSign size={18} className="text-amber-500" />, bg: 'bg-amber-50' },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>{card.icon}</div>
                <p className="text-xs text-slate-500 font-medium">{card.label}</p>
                <p className="text-lg font-bold text-slate-800 mt-0.5 tabular-nums truncate">{loading ? '—' : card.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
              <div className="mb-4">
                <h2 className="font-semibold text-slate-800">Product Distribution</h2>
                <p className="text-xs text-slate-500 mt-1">By quantity sold</p>
              </div>
              {loading ? (
                <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
                  <RefreshCw size={16} className="animate-spin" /> Loading product sales...
                </div>
              ) : productSalesList.length === 0 ? (
                <div className="py-16 text-center">
                  <Package size={32} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm">No data available</p>
                </div>
              ) : (
                <PieChart data={productChartData} />
              )}
            </div>

            <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-800">Product Sales Table</h2>
              </div>
              {loading ? (
                <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
                  <RefreshCw size={16} className="animate-spin" /> Loading product sales...
                </div>
              ) : productSalesList.length === 0 ? (
                <div className="py-16 text-center">
                  <Package size={32} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm">No product sales in selected range</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                        <th className="px-4 py-3 text-left">Product</th>
                        <th className="px-4 py-3 text-right">Quantity Sold</th>
                        <th className="px-4 py-3 text-right">Volume (m³)</th>
                        <th className="px-4 py-3 text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pagedProductSales.map(product => (
                        <tr key={product.materialType} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-700">{product.materialType}</td>
                          <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{product.quantity}</td>
                          <td className="px-4 py-3 text-right text-emerald-600 font-semibold tabular-nums">{formatVolume(product.volume)}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-800 tabular-nums">₱{fmt(product.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-900">
                        <td className="px-4 py-3 text-slate-300 font-semibold text-xs uppercase">Totals</td>
                        <td className="px-4 py-3 text-right text-slate-300 font-semibold tabular-nums">{productTotals.quantity}</td>
                        <td className="px-4 py-3 text-right text-emerald-400 font-bold tabular-nums">{formatVolume(productTotals.volume)}</td>
                        <td className="px-4 py-3 text-right text-white font-bold tabular-nums">₱{fmt(productTotals.revenue)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  <Pagination page={productsCurrentPage} pageSize={REPORT_PAGE_SIZE} totalItems={productSalesList.length} onPageChange={setProductsPage} />
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
