import { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  CheckCircle,
  Download,
  Eye,
  FileText,
  Loader2,
  Plus,
  ReceiptText,
  RefreshCw,
  Scale,
  Search,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Customer, CustomerCreditLedgerRow, HaulerOffsetLedgerRow, Json, TransactionWithRelations, Truck as TruckType } from '../lib/database.types';
import Pagination from './Pagination';
import ReadOnlyNotice from './ReadOnlyNotice';
import { paginate } from '../lib/pagination';
import ActionModal from './ActionModal';

const PAGE_SIZE = 10;

type HaulerTruck = TruckType & { customers?: Customer | null };
type LedgerEntry = HaulerOffsetLedgerRow & { row_kind: 'ENTRY' };
type CustomerCreditLedgerEntry = CustomerCreditLedgerRow & { row_kind: 'ENTRY' };
type ManualType = 'HAULING_SERVICE' | 'CASH_PAYMENT' | 'OPENING_BALANCE' | 'ADJUSTMENT';
type CustomerCreditManualType = 'ADVANCE_PAYMENT' | 'OPENING_BALANCE' | 'ADJUSTMENT';
type EntrySide = 'DEBIT' | 'CREDIT';
type QuickFilter = 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_QUARTER' | 'CUSTOM';
type OffsetLedgerTab = 'HAULER' | 'CUSTOMER';
type CustomerStatusFilter = 'ALL' | 'PENDING' | 'PAID';

interface HaulingLineItem {
  id: string;
  truck_id: string;
  truck_plate: string;
  driver_name: string;
  trips: string;
  rate_per_trip: string;
}

interface HaulerOffsetLedgerProps {
  canAdd?: boolean;
  canAdjust?: boolean;
  canExport?: boolean;
  canViewDetail?: boolean;
  canViewStatement?: boolean;
  canExportStatement?: boolean;
  canCustomerCreditAdd?: boolean;
  canCustomerCreditAdjust?: boolean;
  canCustomerCreditExport?: boolean;
}

interface EntryForm {
  transaction_type: ManualType;
  transaction_date: string;
  reference_no: string;
  description: string;
  amount: string;
  entry_side: EntrySide;
  remarks: string;
  trip_count: string;
  truck_count: string;
  truck_id: string;
  truck_plate: string;
  driver_name: string;
  rate_per_trip: string;
  hauling_items: HaulingLineItem[];
  payment_method: string;
  payment_reference: string;
  reason: string;
}

interface CustomerCreditForm {
  transaction_type: CustomerCreditManualType;
  transaction_date: string;
  reference_no: string;
  description: string;
  amount: string;
  entry_side: EntrySide;
  remarks: string;
}

type CustomerOffsetRow = TransactionWithRelations & {
  offset_amount: number;
  running_total: number;
};

function normalizeCustomerName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function customerSelectLabel(customer: Customer, duplicateCount: number, activityCount: number) {
  const details = [
    activityCount > 0 ? `${activityCount} offset${activityCount === 1 ? '' : 's'}` : '',
    duplicateCount > 1 ? `id ${customer.id.slice(0, 8)}` : '',
  ].filter(Boolean);

  return details.length > 0 ? `${customer.name} (${details.join(', ')})` : customer.name;
}

function todayInput() {
  return toInputDate(new Date());
}

function toInputDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { start: toInputDate(start), end: toInputDate(end) };
}

function quarterRange() {
  const now = new Date();
  const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
  const start = new Date(now.getFullYear(), quarterStartMonth, 1);
  const end = new Date(now.getFullYear(), quarterStartMonth + 3, 0);
  return { start: toInputDate(start), end: toInputDate(end) };
}

function fmt(value: number) {
  return Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function currency(value: number) {
  return `₱${fmt(value)}`;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function csvEscape(value: string | number) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function htmlEscape(value: string | number) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'hauler';
}

function asRecord(value: Json): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textValue(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
}

function numberValue(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getSplitOffsetAmount(details: Json): number {
  if (!Array.isArray(details)) return 0;
  return details.reduce<number>((sum, item) => {
    const row = asRecord(item);
    const mode = textValue(row, 'mode').toUpperCase();
    const amount = numberValue(row, 'amount');
    return mode === 'OFFSET' ? sum + amount : sum;
  }, 0);
}

function getCustomerOffsetAmount(tx: TransactionWithRelations): number {
  if (tx.payment_mode === 'P.O') return tx.total_amount ?? 0;
  if (tx.payment_mode === 'OFFSET') return tx.total_amount ?? 0;
  if (tx.payment_mode === 'SPLIT') return getSplitOffsetAmount(tx.split_payment_details);
  return 0;
}

function customerCreditTypeLabel(type: CustomerCreditLedgerRow['transaction_type']) {
  switch (type) {
    case 'ADVANCE_PAYMENT': return 'Advance Payment';
    case 'PURCHASE_DEDUCTION': return 'Purchase Deduction';
    case 'OPENING_BALANCE': return 'Opening Balance';
    case 'ADJUSTMENT': return 'Adjustment';
    case 'REVERSAL': return 'Reversal';
    default: return 'Summary';
  }
}

function customerCreditTypeBadgeClass(type: CustomerCreditLedgerRow['transaction_type']) {
  switch (type) {
    case 'ADVANCE_PAYMENT': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'PURCHASE_DEDUCTION': return 'bg-teal-50 text-teal-700 border-teal-200';
    case 'OPENING_BALANCE': return 'bg-slate-50 text-slate-700 border-slate-200';
    case 'ADJUSTMENT': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'REVERSAL': return 'bg-red-50 text-red-700 border-red-200';
    default: return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

function typeLabel(type: HaulerOffsetLedgerRow['transaction_type']) {
  switch (type) {
    case 'HAULING_SERVICE': return 'Hauling Service';
    case 'PRODUCT_OFFSET': return 'Product Offset';
    case 'DIESEL_OFFSET': return 'Diesel Offset';
    case 'CASH_PAYMENT': return 'Cash Payment';
    case 'OPENING_BALANCE': return 'Opening Balance';
    case 'ADJUSTMENT': return 'Adjustment';
    default: return 'Summary';
  }
}

function typeBadgeClass(type: HaulerOffsetLedgerRow['transaction_type']) {
  switch (type) {
    case 'HAULING_SERVICE': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'PRODUCT_OFFSET': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'DIESEL_OFFSET': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'CASH_PAYMENT': return 'bg-violet-50 text-violet-700 border-violet-200';
    case 'OPENING_BALANCE': return 'bg-slate-50 text-slate-700 border-slate-200';
    case 'ADJUSTMENT': return 'bg-amber-50 text-amber-700 border-amber-200';
    default: return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

function createHaulingLineItem(): HaulingLineItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    truck_id: '',
    truck_plate: '',
    driver_name: '',
    trips: '',
    rate_per_trip: '',
  };
}

function emptyForm(defaultType: ManualType = 'HAULING_SERVICE'): EntryForm {
  return {
    transaction_type: defaultType,
    transaction_date: todayInput(),
    reference_no: '',
    description: '',
    amount: '',
    entry_side: 'CREDIT',
    remarks: '',
    trip_count: '',
    truck_count: '',
    truck_id: '',
    truck_plate: '',
    driver_name: '',
    rate_per_trip: '',
    hauling_items: [createHaulingLineItem()],
    payment_method: '',
    payment_reference: '',
    reason: '',
  };
}

export default function HaulerOffsetLedger({
  canAdd = false,
  canAdjust = false,
  canExport = false,
  canViewDetail = false,
  canViewStatement = false,
  canExportStatement = false,
  canCustomerCreditAdd = false,
  canCustomerCreditAdjust = false,
  canCustomerCreditExport = false,
}: HaulerOffsetLedgerProps) {
  const initialRange = monthRange();
  const [activeLedgerTab, setActiveLedgerTab] = useState<OffsetLedgerTab>('HAULER');
  const [haulers, setHaulers] = useState<Customer[]>([]);
  const [haulerTrucks, setHaulerTrucks] = useState<HaulerTruck[]>([]);
  const [haulerId, setHaulerId] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerActivityCounts, setCustomerActivityCounts] = useState<Record<string, number>>({});
  const [customerId, setCustomerId] = useState<'ALL' | string>('ALL');
  const [customerTransactions, setCustomerTransactions] = useState<TransactionWithRelations[]>([]);
  const [customerCreditRows, setCustomerCreditRows] = useState<CustomerCreditLedgerRow[]>([]);
  const [customerAvailableCredit, setCustomerAvailableCredit] = useState(0);
  const [dateFrom, setDateFrom] = useState(initialRange.start);
  const [dateTo, setDateTo] = useState(initialRange.end);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('THIS_MONTH');
  const [search, setSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerStatusFilter, setCustomerStatusFilter] = useState<CustomerStatusFilter>('ALL');
  const [ledgerRows, setLedgerRows] = useState<HaulerOffsetLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [customerError, setCustomerError] = useState('');
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [highlightedSourceId, setHighlightedSourceId] = useState<string | null>(null);
  const [settlingTransactionId, setSettlingTransactionId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [customerPage, setCustomerPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCustomerCreditModal, setShowCustomerCreditModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);
  const [voidTarget, setVoidTarget] = useState<LedgerEntry | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [infoModal, setInfoModal] = useState('');
  const [form, setForm] = useState<EntryForm>(() => emptyForm(canAdd ? 'HAULING_SERVICE' : 'OPENING_BALANCE'));
  const [customerCreditForm, setCustomerCreditForm] = useState<CustomerCreditForm>(() => emptyCustomerCreditForm(canCustomerCreditAdd ? 'ADVANCE_PAYMENT' : 'OPENING_BALANCE'));

  const canHaulerManualAdd = canAdd || canAdjust;
  const canCustomerManualAdd = canCustomerCreditAdd || canCustomerCreditAdjust;
  const summary = ledgerRows.find(row => row.row_kind === 'SUMMARY');
  const selectedHauler = haulers.find(hauler => hauler.id === haulerId) ?? null;
  const selectedCustomer = customerId === 'ALL' ? null : customers.find(customer => customer.id === customerId) ?? null;
  const customerNameCounts = useMemo(() => customers.reduce<Record<string, number>>((counts, customer) => {
    const key = normalizeCustomerName(customer.name);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {}), [customers]);
  const customerOptions = useMemo(
    () => [...customers].sort((a, b) => {
      const nameCompare = a.name.localeCompare(b.name);
      if (nameCompare !== 0) return nameCompare;
      return (customerActivityCounts[b.id] ?? 0) - (customerActivityCounts[a.id] ?? 0) || a.id.localeCompare(b.id);
    }),
    [customers, customerActivityCounts],
  );
  const matchingCustomerWithActivity = useMemo(() => {
    if (!selectedCustomer || (customerActivityCounts[selectedCustomer.id] ?? 0) > 0) return null;
    const selectedName = normalizeCustomerName(selectedCustomer.name);
    return customerOptions.find(customer =>
      customer.id !== selectedCustomer.id &&
      normalizeCustomerName(customer.name) === selectedName &&
      (customerActivityCounts[customer.id] ?? 0) > 0
    ) ?? null;
  }, [selectedCustomer, customerOptions, customerActivityCounts]);
  const selectedHaulerTrucks = useMemo(
    () => haulerTrucks.filter(truck => truck.customer_id === haulerId),
    [haulerId, haulerTrucks],
  );
  const ledgerEntries = useMemo(
    () => ledgerRows.filter((row): row is LedgerEntry => row.row_kind === 'ENTRY'),
    [ledgerRows],
  );

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ledgerEntries;
    return ledgerEntries.filter(row =>
      typeLabel(row.transaction_type).toLowerCase().includes(q) ||
      row.reference_no.toLowerCase().includes(q) ||
      row.description.toLowerCase().includes(q)
    );
  }, [ledgerEntries, search]);

  const currentPage = Math.min(page, Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE)));
  const pagedEntries = useMemo(() => paginate(filteredEntries, currentPage, PAGE_SIZE), [currentPage, filteredEntries]);

  const customerOffsetRows = useMemo<CustomerOffsetRow[]>(() => {
    let runningTotal = 0;
    return customerTransactions
      .map(tx => ({ tx, offsetAmount: getCustomerOffsetAmount(tx) }))
      .filter(({ offsetAmount }) => offsetAmount > 0)
      .sort((a, b) => a.tx.transaction_date.localeCompare(b.tx.transaction_date) || a.tx.created_at.localeCompare(b.tx.created_at))
      .map(({ tx, offsetAmount }) => {
        runningTotal += offsetAmount;
        return {
          ...tx,
          offset_amount: offsetAmount,
          running_total: runningTotal,
        };
      })
      .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at));
  }, [customerTransactions]);

  const filteredCustomerRows = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    return customerOffsetRows.filter(row =>
      (customerStatusFilter === 'ALL' || row.status === customerStatusFilter) &&
      (!q ||
      (row.customers?.name ?? '').toLowerCase().includes(q) ||
      (row.trucks?.plate_number ?? '').toLowerCase().includes(q) ||
      row.dr_number.toLowerCase().includes(q) ||
      row.material_type.toLowerCase().includes(q))
    );
  }, [customerOffsetRows, customerSearch, customerStatusFilter]);

  const customerCurrentPage = Math.min(customerPage, Math.max(1, Math.ceil(filteredCustomerRows.length / PAGE_SIZE)));
  const pagedCustomerRows = useMemo(() => paginate(filteredCustomerRows, customerCurrentPage, PAGE_SIZE), [customerCurrentPage, filteredCustomerRows]);
  const customerOffsetTotal = useMemo(() => customerOffsetRows.reduce((sum, row) => sum + row.offset_amount, 0), [customerOffsetRows]);
  const customerTransactionTotal = useMemo(() => customerOffsetRows.reduce((sum, row) => sum + (row.total_amount ?? 0), 0), [customerOffsetRows]);
  const customerVolumeTotal = useMemo(() => customerOffsetRows.reduce((sum, row) => sum + (row.volume_m3 ?? 0), 0), [customerOffsetRows]);
  const customerCreditSummary = customerCreditRows.find(row => row.row_kind === 'SUMMARY') ?? null;
  const customerCreditEntries = useMemo(
    () => customerCreditRows.filter((row): row is CustomerCreditLedgerEntry => row.row_kind === 'ENTRY'),
    [customerCreditRows],
  );
  const customerCreditClosingBalance = customerCreditSummary?.closing_balance ?? 0;
  const customerCreditAdvances = customerCreditSummary?.advances ?? 0;
  const customerCreditPurchases = customerCreditSummary?.purchases ?? 0;
  const customerCreditAdjustmentsNet = (customerCreditSummary?.adjustments_credit ?? 0) - (customerCreditSummary?.adjustments_debit ?? 0);

  const openingBalance = summary?.opening_balance ?? 0;
  const haulingEarnings = summary?.hauling_earnings ?? 0;
  const productOffsets = summary?.product_offsets ?? 0;
  const dieselOffsets = summary?.diesel_offsets ?? 0;
  const cashPayments = summary?.cash_payments ?? 0;
  const adjustmentsNet = (summary?.adjustments_credit ?? 0) - (summary?.adjustments_debit ?? 0);
  const closingBalance = summary?.closing_balance ?? 0;
  const haulingLineTotals = useMemo(() => {
    const rows = form.hauling_items.map(item => {
      const trips = Number(item.trips);
      const rate = Number(item.rate_per_trip);
      return {
        ...item,
        tripsValue: Number.isFinite(trips) ? trips : 0,
        rateValue: Number.isFinite(rate) ? rate : 0,
        amount: Number.isFinite(trips) && Number.isFinite(rate) ? trips * rate : 0,
      };
    });
    return {
      rows,
      trips: rows.reduce((sum, item) => sum + item.tripsValue, 0),
      amount: rows.reduce((sum, item) => sum + item.amount, 0),
      truckCount: rows.filter(item => item.truck_id).length,
    };
  }, [form.hauling_items]);
  const haulingServiceAmount = haulingLineTotals.amount;

  useEffect(() => {
    fetchHaulers();
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (haulerId) fetchLedger();
  }, [haulerId, dateFrom, dateTo]);

  useEffect(() => {
    if (activeLedgerTab === 'CUSTOMER') fetchCustomerOffsets();
  }, [activeLedgerTab, customerId, dateFrom, dateTo]);

  useEffect(() => {
    setPage(1);
  }, [haulerId, dateFrom, dateTo, search]);

  useEffect(() => {
    setCustomerPage(1);
  }, [customerId, dateFrom, dateTo, customerSearch, customerStatusFilter]);

  async function fetchHaulers() {
    setLoading(true);
    setError('');

    const { data, error: trucksError } = await supabase
      .from('trucks')
      .select('*, customers(*)')
      .eq('is_hauler', true)
      .not('customer_id', 'is', null)
      .order('plate_number');

    if (trucksError) {
      setError(trucksError.message);
      setLoading(false);
      return;
    }

    const trucks = (data ?? []) as HaulerTruck[];
    setHaulerTrucks(trucks);

    const unique = new Map<string, Customer>();
    trucks.forEach(truck => {
      if (truck.customers) unique.set(truck.customers.id, truck.customers);
    });
    const nextHaulers = Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
    setHaulers(nextHaulers);
    setHaulerId(current => current || nextHaulers[0]?.id || '');
    if (nextHaulers.length === 0) {
      setLedgerRows([]);
      setLoading(false);
    }
  }

  async function fetchCustomers() {
    const [{ data, error: customersError }, { data: offsetRows, error: offsetsError }] = await Promise.all([
      supabase
        .from('customers')
        .select('*')
        .order('name', { ascending: true }),
      supabase
        .from('transactions')
        .select('customer_id')
        .in('payment_mode', ['P.O', 'OFFSET', 'SPLIT'])
        .not('customer_id', 'is', null),
    ]);

    if (customersError) {
      setCustomerError(customersError.message);
      return;
    }
    if (offsetsError) {
      setCustomerError(offsetsError.message);
    }

    setCustomers((data ?? []) as Customer[]);
    const counts = ((offsetRows ?? []) as Array<{ customer_id: string | null }>).reduce<Record<string, number>>((nextCounts, row) => {
      if (row.customer_id) nextCounts[row.customer_id] = (nextCounts[row.customer_id] ?? 0) + 1;
      return nextCounts;
    }, {});
    setCustomerActivityCounts(counts);
  }

  async function fetchLedger(nextRange?: { haulerId?: string; dateFrom?: string; dateTo?: string }) {
    const targetHaulerId = nextRange?.haulerId ?? haulerId;
    const targetDateFrom = nextRange?.dateFrom ?? dateFrom;
    const targetDateTo = nextRange?.dateTo ?? dateTo;
    if (!targetHaulerId) return;
    setLoading(true);
    setError('');

    const { data, error: ledgerError } = await supabase.rpc('get_hauler_offset_ledger', {
      p_hauler_id: targetHaulerId,
      p_date_from: targetDateFrom,
      p_date_to: targetDateTo,
    });

    if (ledgerError) {
      setError(ledgerError.message);
      setLedgerRows([]);
    } else {
      setLedgerRows((data ?? []) as HaulerOffsetLedgerRow[]);
    }
    setLoading(false);
  }

  async function fetchCustomerOffsets(nextRange?: { customerId?: 'ALL' | string; dateFrom?: string; dateTo?: string }) {
    const targetCustomerId = nextRange?.customerId ?? customerId;
    const targetDateFrom = nextRange?.dateFrom ?? dateFrom;
    const targetDateTo = nextRange?.dateTo ?? dateTo;
    setCustomerLoading(true);
    setCustomerError('');

    let query = supabase
      .from('transactions')
      .select('*, customers(*), trucks(*)')
      .gte('transaction_date', targetDateFrom)
      .lte('transaction_date', targetDateTo)
      .in('payment_mode', ['P.O', 'OFFSET', 'SPLIT'])
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (targetCustomerId !== 'ALL') {
      query = query.eq('customer_id', targetCustomerId);
    }

    const creditPromise = targetCustomerId === 'ALL'
      ? Promise.resolve({ data: [] as CustomerCreditLedgerRow[], error: null })
      : supabase.rpc('get_customer_credit_ledger', {
          p_customer_id: targetCustomerId,
          p_date_from: targetDateFrom,
          p_date_to: targetDateTo,
        });
    const balancePromise = targetCustomerId === 'ALL'
      ? Promise.resolve({ data: 0, error: null })
      : supabase.rpc('get_customer_credit_balance', {
          p_customer_id: targetCustomerId,
          p_exclude_source_table: null,
          p_exclude_source_id: null,
        });

    const [
      { data, error: transactionsError },
      { data: creditData, error: creditError },
      { data: balanceData, error: balanceError },
    ] = await Promise.all([query, creditPromise, balancePromise]);
    if (transactionsError) {
      setCustomerError(transactionsError.message);
      setCustomerTransactions([]);
    } else {
      setCustomerTransactions((data ?? []) as TransactionWithRelations[]);
    }
    if (creditError) {
      setCustomerError(current => current || creditError.message);
      setCustomerCreditRows([]);
    } else {
      setCustomerCreditRows((creditData ?? []) as CustomerCreditLedgerRow[]);
    }
    if (balanceError) {
      setCustomerError(current => current || balanceError.message);
      setCustomerAvailableCredit(0);
    } else {
      setCustomerAvailableCredit(Number(balanceData ?? 0));
    }
    setCustomerLoading(false);
  }

  function applyQuickFilter(filter: QuickFilter) {
    setQuickFilter(filter);
    if (filter === 'THIS_MONTH') {
      const range = monthRange();
      setDateFrom(range.start);
      setDateTo(range.end);
    } else if (filter === 'LAST_MONTH') {
      const range = monthRange(-1);
      setDateFrom(range.start);
      setDateTo(range.end);
    } else if (filter === 'THIS_QUARTER') {
      const range = quarterRange();
      setDateFrom(range.start);
      setDateTo(range.end);
    }
  }

  function updateDateFrom(value: string) {
    setQuickFilter('CUSTOM');
    setDateFrom(value);
  }

  function updateDateTo(value: string) {
    setQuickFilter('CUSTOM');
    setDateTo(value);
  }

  function handleHaulerChange(value: string) {
    setHaulerId(value);
    setForm(current => ({
      ...current,
      truck_id: '',
      truck_plate: '',
      driver_name: '',
      hauling_items: [createHaulingLineItem()],
    }));
  }

  function openAddModal() {
    setForm(emptyForm(canAdd ? 'HAULING_SERVICE' : 'OPENING_BALANCE'));
    setFormError('');
    setSuccessMessage('');
    setShowAddModal(true);
  }

  function openCustomerCreditModal() {
    if (customerId === 'ALL' || !canCustomerManualAdd) return;
    setCustomerCreditForm(emptyCustomerCreditForm(canCustomerCreditAdd ? 'ADVANCE_PAYMENT' : 'OPENING_BALANCE'));
    setFormError('');
    setSuccessMessage('');
    setShowCustomerCreditModal(true);
  }

  function setFormValue<K extends keyof EntryForm>(key: K, value: EntryForm[K]) {
    setForm(current => ({ ...current, [key]: value }));
    setFormError('');
  }

  function setCustomerCreditFormValue<K extends keyof CustomerCreditForm>(key: K, value: CustomerCreditForm[K]) {
    setCustomerCreditForm(current => ({ ...current, [key]: value }));
    setFormError('');
  }

  function addHaulingLineItem() {
    setForm(current => ({
      ...current,
      hauling_items: [...current.hauling_items, createHaulingLineItem()],
    }));
    setFormError('');
  }

  function removeHaulingLineItem(id: string) {
    setForm(current => ({
      ...current,
      hauling_items: current.hauling_items.length > 1
        ? current.hauling_items.filter(item => item.id !== id)
        : current.hauling_items,
    }));
    setFormError('');
  }

  function updateHaulingLineItem(id: string, changes: Partial<HaulingLineItem>) {
    setForm(current => ({
      ...current,
      hauling_items: current.hauling_items.map(item => item.id === id ? { ...item, ...changes } : item),
    }));
    setFormError('');
  }

  function setHaulingLineTruck(lineId: string, truckId: string) {
    const truck = selectedHaulerTrucks.find(item => item.id === truckId);
    updateHaulingLineItem(lineId, {
      truck_id: truck?.id ?? '',
      truck_plate: truck?.plate_number ?? '',
      driver_name: truck?.driver_name ?? '',
    });
  }

  function getHaulingDescription() {
    const selectedRows = haulingLineTotals.rows.filter(item => item.truck_id);
    const truckLabels = selectedRows.map(item => item.truck_plate).filter(Boolean);
    const tripsLabel = `${fmt(haulingLineTotals.trips).replace('.00', '')} trip${haulingLineTotals.trips === 1 ? '' : 's'}`;
    if (truckLabels.length === 0) return tripsLabel;
    return `${tripsLabel} - ${truckLabels.join(', ')}`;
  }

  function buildDetails() {
    const details: Record<string, Json> = {};
    if (form.transaction_type === 'HAULING_SERVICE') {
      const lineItems = haulingLineTotals.rows
        .filter(item => item.truck_id || item.tripsValue > 0 || item.rateValue > 0)
        .map(item => ({
          truck_id: item.truck_id,
          truck_plate: item.truck_plate,
          driver_name: item.driver_name,
          trips: item.tripsValue,
          rate_per_trip: item.rateValue,
          amount: item.amount,
        }));
      details.line_items = lineItems;
      details.trip_count = haulingLineTotals.trips;
      details.truck_count = haulingLineTotals.truckCount;
      details.truck_plate = lineItems.map(item => item.truck_plate).filter(Boolean).join(', ');
      details.driver_name = lineItems.map(item => item.driver_name).filter(Boolean).join(', ');
      details.total_amount = haulingLineTotals.amount;
    }
    if (form.transaction_type === 'CASH_PAYMENT') {
      if (form.payment_method) details.payment_method = form.payment_method.trim();
      if (form.payment_reference) details.payment_reference = form.payment_reference.trim();
    }
    if (form.transaction_type === 'ADJUSTMENT' || form.transaction_type === 'OPENING_BALANCE') {
      if (form.reason) details.reason = form.reason.trim();
    }
    return details;
  }

  async function saveManualEntry(event: React.FormEvent) {
    event.preventDefault();
    if (!haulerId || !canHaulerManualAdd) return;

    const isHaulingService = form.transaction_type === 'HAULING_SERVICE';
    let amount = Number(form.amount);
    if (isHaulingService) {
      if (selectedHaulerTrucks.length === 0) {
        setFormError('No assigned hauler trucks found. Assign trucks to this hauler in Logistics first.');
        return;
      }

      for (const [index, item] of haulingLineTotals.rows.entries()) {
        const rowLabel = `Line ${index + 1}`;
        if (!item.truck_id) {
          setFormError(`${rowLabel}: select an assigned truck.`);
          return;
        }
        if (!Number.isFinite(item.tripsValue) || item.tripsValue <= 0) {
          setFormError(`${rowLabel}: trips must be greater than zero.`);
          return;
        }
        if (!Number.isFinite(item.rateValue) || item.rateValue <= 0) {
          setFormError(`${rowLabel}: rate per trip must be greater than zero.`);
          return;
        }
      }

      if (haulingLineTotals.amount <= 0) {
        setFormError('Total hauling amount must be greater than zero.');
        return;
      }
      amount = haulingLineTotals.amount;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Amount must be greater than zero.');
      return;
    }

    setSaving(true);
    setError('');
    setFormError('');
    const { data: savedEntry, error: rpcError } = await supabase.rpc('create_hauler_offset_entry', {
      p_hauler_id: haulerId,
      p_transaction_date: form.transaction_date,
      p_transaction_type: form.transaction_type,
      p_reference_no: form.reference_no.trim(),
      p_description: isHaulingService ? (form.description.trim() || getHaulingDescription()) : form.description.trim(),
      p_amount: amount,
      p_entry_side: form.transaction_type === 'OPENING_BALANCE' || form.transaction_type === 'ADJUSTMENT' ? form.entry_side : null,
      p_remarks: form.remarks.trim(),
      p_details: buildDetails() as Json,
    });
    setSaving(false);

    if (rpcError) {
      setFormError(rpcError.message);
      return;
    }

    setShowAddModal(false);
    setSuccessMessage('Hauler transaction saved successfully.');
    const savedSourceId = typeof savedEntry === 'object' && savedEntry && 'id' in savedEntry ? String(savedEntry.id) : null;
    setHighlightedSourceId(savedSourceId);
    window.setTimeout(() => {
      setSuccessMessage('');
      setHighlightedSourceId(null);
    }, 3500);

    const savedDate = form.transaction_date || todayInput();
    const nextDateFrom = savedDate < dateFrom ? savedDate : dateFrom;
    const nextDateTo = savedDate > dateTo ? savedDate : dateTo;
    if (nextDateFrom !== dateFrom || nextDateTo !== dateTo) {
      setQuickFilter('CUSTOM');
      setDateFrom(nextDateFrom);
      setDateTo(nextDateTo);
    }
    await fetchLedger({ dateFrom: nextDateFrom, dateTo: nextDateTo });
  }

  async function saveCustomerCreditEntry(event: React.FormEvent) {
    event.preventDefault();
    if (customerId === 'ALL' || !canCustomerManualAdd) return;

    const amount = Number(customerCreditForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Amount must be greater than zero.');
      return;
    }

    setSaving(true);
    setCustomerError('');
    setFormError('');
    const { data: savedEntry, error: rpcError } = await supabase.rpc('create_customer_credit_entry', {
      p_customer_id: customerId,
      p_transaction_date: customerCreditForm.transaction_date,
      p_transaction_type: customerCreditForm.transaction_type,
      p_reference_no: customerCreditForm.reference_no.trim(),
      p_description: customerCreditForm.description.trim(),
      p_amount: amount,
      p_entry_side: customerCreditForm.transaction_type === 'OPENING_BALANCE' || customerCreditForm.transaction_type === 'ADJUSTMENT'
        ? customerCreditForm.entry_side
        : null,
      p_remarks: customerCreditForm.remarks.trim(),
      p_details: {} as Json,
    });
    setSaving(false);

    if (rpcError) {
      setFormError(rpcError.message);
      return;
    }

    setShowCustomerCreditModal(false);
    setSuccessMessage('Customer credit entry saved successfully.');
    const savedDate = customerCreditForm.transaction_date || todayInput();
    const nextDateFrom = savedDate < dateFrom ? savedDate : dateFrom;
    const nextDateTo = savedDate > dateTo ? savedDate : dateTo;
    if (nextDateFrom !== dateFrom || nextDateTo !== dateTo) {
      setQuickFilter('CUSTOM');
      setDateFrom(nextDateFrom);
      setDateTo(nextDateTo);
    }
    window.setTimeout(() => setSuccessMessage(''), 3500);
    await fetchCustomerOffsets({ dateFrom: nextDateFrom, dateTo: nextDateTo });

    const savedSourceId = typeof savedEntry === 'object' && savedEntry && 'id' in savedEntry ? String(savedEntry.id) : null;
    setHighlightedSourceId(savedSourceId);
    window.setTimeout(() => setHighlightedSourceId(null), 3500);
  }

  async function settleCustomerReceivable(row: CustomerOffsetRow) {
    if (!canCustomerCreditAdjust || row.status !== 'PENDING') return;

    setSettlingTransactionId(row.id);
    setCustomerError('');
    const { data, error: settleError } = await supabase.rpc('settle_receivable_with_customer_credit', {
      p_transaction_id: row.id,
      p_settlement_date: todayInput(),
      p_remarks: 'Settled from Customer Ledger',
    });

    if (settleError) {
      setCustomerError(settleError.message);
    } else {
      setSuccessMessage('Receivable settled using customer credit.');
      window.setTimeout(() => setSuccessMessage(''), 3500);
      await fetchCustomerOffsets();
      const settlementId = typeof data === 'object' && data && 'id' in data ? String(data.id) : null;
      setHighlightedSourceId(settlementId);
      window.setTimeout(() => setHighlightedSourceId(null), 3500);
    }
    setSettlingTransactionId(null);
  }

  function voidManualEntry(entry: LedgerEntry) {
    if (!canAdjust || entry.source_module !== 'hauler_offset_entries' || !entry.source_id) return;
    setVoidTarget(entry);
    setVoidReason('');
  }

  async function confirmVoidManualEntry() {
    if (!canAdjust || !voidTarget?.source_id) return;
    const reason = voidReason.trim();
    if (!reason) {
      setFormError('Void reason is required.');
      return;
    }

    setFormError('');
    setSaving(true);
    const { error: rpcError } = await supabase.rpc('void_hauler_offset_entry', {
      p_entry_id: voidTarget.source_id,
      p_reason: reason,
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setVoidTarget(null);
    setVoidReason('');
    setSelectedEntry(null);
    await fetchLedger();
  }

  function exportExcel() {
    if (!canExport || filteredEntries.length === 0) {
      setInfoModal('No ledger rows to export.');
      return;
    }

    const lines = [
      ['Accounts Ledger'],
      [`Hauler: ${selectedHauler?.name ?? '—'}`],
      [`Period: ${formatDate(dateFrom)} to ${formatDate(dateTo)}`],
      [`Generated: ${new Date().toLocaleString('en-PH')}`],
      [],
      ['Date', 'Type', 'Reference', 'Description', 'Debit', 'Credit', 'Running Balance'],
      ...filteredEntries.map(row => [
        formatDate(row.transaction_date),
        typeLabel(row.transaction_type),
        row.reference_no,
        row.description,
        row.debit_amount ? fmt(row.debit_amount) : '',
        row.credit_amount ? fmt(row.credit_amount) : '',
        fmt(row.running_balance),
      ]),
      [],
      ['Opening Balance', '', '', '', '', '', fmt(openingBalance)],
      ['Hauling Earnings', '', '', '', '', fmt(haulingEarnings), ''],
      ['Product Offsets', '', '', '', fmt(productOffsets), '', ''],
      ['Diesel Offsets', '', '', '', fmt(dieselOffsets), '', ''],
      ['Cash Payments', '', '', '', fmt(cashPayments), '', ''],
      ['Adjustments Net', '', '', '', adjustmentsNet < 0 ? fmt(Math.abs(adjustmentsNet)) : '', adjustmentsNet > 0 ? fmt(adjustmentsNet) : '', ''],
      ['Closing Balance', '', '', '', '', '', fmt(closingBalance)],
    ];
    const csv = `\uFEFF${lines.map(row => row.map(cell => csvEscape(cell)).join(',')).join('\r\n')}`;
    downloadTextFile(`accounts-ledger-${slugify(selectedHauler?.name ?? 'hauler')}-${dateFrom}-${dateTo}.csv`, csv, 'text/csv;charset=utf-8');
  }

  function exportCustomerExcel() {
    if (!canExport || filteredCustomerRows.length === 0) {
      setInfoModal('No customer offset rows to export.');
      return;
    }

    const customerLabel = selectedCustomer?.name ?? 'All Customers';
    const lines = [
      ['Customer Receivable Ledger'],
      [`Customer: ${customerLabel}`],
      [`Period: ${formatDate(dateFrom)} to ${formatDate(dateTo)}`],
      [`Generated: ${new Date().toLocaleString('en-PH')}`],
      [],
      ['Date', 'DR #', 'Customer', 'Truck', 'Material', 'Payment Mode', 'Status', 'Receivable Amount', 'Transaction Total', 'Running Total'],
      ...filteredCustomerRows.map(row => [
        formatDate(row.transaction_date),
        row.dr_number,
        row.customers?.name ?? '',
        row.trucks?.plate_number ?? '',
        row.material_type,
        row.payment_mode,
        row.status,
        fmt(row.offset_amount),
        fmt(row.total_amount ?? 0),
        fmt(row.running_total),
      ]),
      [],
      ['Total Receivable', '', '', '', '', '', '', fmt(customerOffsetTotal), '', ''],
      ...(selectedCustomer ? [
        [],
        ['Customer Credit Ledger'],
        ['Opening Balance', '', '', '', '', '', fmt(customerCreditSummary?.opening_balance ?? 0), '', '', ''],
        ['Advances', '', '', '', '', '', fmt(customerCreditAdvances), '', '', ''],
        ['Purchases Used', '', '', '', '', '', fmt(customerCreditPurchases), '', '', ''],
        ['Adjustments Net', '', '', '', '', '', fmt(customerCreditAdjustmentsNet), '', '', ''],
        ['Closing Balance', '', '', '', '', '', fmt(customerCreditClosingBalance), '', '', ''],
        [],
        ['Date', 'Type', 'Reference', 'Description', 'Debit', 'Credit', 'Running Balance', '', '', ''],
        ...customerCreditEntries.map(row => [
          formatDate(row.transaction_date),
          customerCreditTypeLabel(row.transaction_type),
          row.reference_no,
          row.description,
          row.debit_amount ? fmt(row.debit_amount) : '',
          row.credit_amount ? fmt(row.credit_amount) : '',
          fmt(row.running_balance),
          '',
          '',
          '',
        ]),
      ] : []),
    ];
    const csv = `\uFEFF${lines.map(row => row.map(cell => csvEscape(cell)).join(',')).join('\r\n')}`;
    downloadTextFile(`customer-offset-ledger-${slugify(customerLabel)}-${dateFrom}-${dateTo}.csv`, csv, 'text/csv;charset=utf-8');
  }

  function printStatement() {
    if (!canViewStatement || !summary) return;
    const rowsHtml = ledgerEntries.map(row => `
      <tr>
        <td>${htmlEscape(formatDate(row.transaction_date))}</td>
        <td>${htmlEscape(row.description)}</td>
        <td>${htmlEscape(row.reference_no || '—')}</td>
        <td class="num">${row.debit_amount > 0 ? `₱${htmlEscape(fmt(row.debit_amount))}` : '—'}</td>
        <td class="num">${row.credit_amount > 0 ? `₱${htmlEscape(fmt(row.credit_amount))}` : '—'}</td>
        <td class="num">₱${htmlEscape(fmt(row.running_balance))}</td>
      </tr>`).join('');
    const generated = new Date().toLocaleString('en-PH');
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setInfoModal('Please allow pop-ups to export the statement PDF.');
      return;
    }

    printWindow.document.write(`<!doctype html>
      <html>
        <head>
          <title>Hauler Statement - ${htmlEscape(selectedHauler?.name ?? '')}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; margin: 28px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 22px; }
            .brand { display: flex; align-items: center; gap: 12px; }
            .brand img { width: 54px; height: 54px; object-fit: contain; }
            h1 { font-size: 20px; margin: 0; letter-spacing: .04em; }
            .muted { color: #64748b; font-size: 11px; line-height: 1.5; }
            .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 18px 0; }
            .box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
            .row { display: flex; justify-content: space-between; font-size: 12px; padding: 4px 0; }
            .total { border-top: 1px solid #e2e8f0; margin-top: 6px; padding-top: 8px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-top: 16px; }
            th { text-align: left; background: #f1f5f9; color: #475569; text-transform: uppercase; }
            th, td { border: 1px solid #e2e8f0; padding: 6px 7px; }
            .num { text-align: right; white-space: nowrap; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; margin-top: 44px; font-size: 11px; }
            .line { border-top: 1px solid #94a3b8; padding-top: 7px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="brand">
              <img src="/jafcor_logo.png" alt="JAFCOR" />
              <div>
                <strong>JAFCOR DEVELOPMENT COMPANY, INC.</strong>
                <div class="muted">Brgy. Sto. Nino, Bamban, Tarlac<br/>Generated: ${htmlEscape(generated)}</div>
              </div>
            </div>
            <div style="text-align:right">
              <h1>HAULER STATEMENT</h1>
              <div class="muted">
                Hauler: ${htmlEscape(selectedHauler?.name ?? '—')}<br/>
                Period: ${htmlEscape(formatDate(dateFrom))} - ${htmlEscape(formatDate(dateTo))}
              </div>
            </div>
          </div>

          <div class="summary">
            <div class="box">
              <strong>Statement Summary</strong>
              <div class="row"><span>Opening Balance</span><span>₱${htmlEscape(fmt(openingBalance))}</span></div>
              <div class="row"><span>Add: Hauling Earnings</span><span>₱${htmlEscape(fmt(haulingEarnings))}</span></div>
              <div class="row"><span>Less: Product Offsets</span><span>-₱${htmlEscape(fmt(productOffsets))}</span></div>
              <div class="row"><span>Less: Diesel Offsets</span><span>-₱${htmlEscape(fmt(dieselOffsets))}</span></div>
              <div class="row"><span>Less: Cash Payments</span><span>-₱${htmlEscape(fmt(cashPayments))}</span></div>
              <div class="row"><span>Adjustments Net</span><span>${adjustmentsNet >= 0 ? '+' : '-'}₱${htmlEscape(fmt(Math.abs(adjustmentsNet)))}</span></div>
              <div class="row total"><span>Closing Balance</span><span>₱${htmlEscape(fmt(closingBalance))}</span></div>
            </div>
            <div class="box">
              <strong>Statement Details</strong>
              <div class="row"><span>Prepared By</span><span>${htmlEscape('System User')}</span></div>
              <div class="row"><span>Prepared On</span><span>${htmlEscape(generated)}</span></div>
              <div class="row"><span>Interpretation</span><span>${htmlEscape(balanceInterpretation(closingBalance))}</span></div>
            </div>
          </div>

          <table>
            <thead>
              <tr><th>Date</th><th>Description</th><th>Reference</th><th class="num">Debit (-)</th><th class="num">Credit (+)</th><th class="num">Balance</th></tr>
            </thead>
            <tbody>${rowsHtml || '<tr><td colspan="6">No period activity.</td></tr>'}</tbody>
            <tfoot>
              <tr><td colspan="5"><strong>Closing Balance</strong></td><td class="num"><strong>₱${htmlEscape(fmt(closingBalance))}</strong></td></tr>
            </tfoot>
          </table>

          <div class="signatures">
            <div class="line">Prepared By</div>
            <div class="line">Approved By</div>
          </div>
        </body>
      </html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  const manualTypeOptions = [
    ...(canAdd ? [
      { value: 'HAULING_SERVICE' as const, label: 'Hauling Service' },
      { value: 'CASH_PAYMENT' as const, label: 'Cash Payment' },
    ] : []),
    ...(canAdjust ? [
      { value: 'OPENING_BALANCE' as const, label: 'Opening Balance' },
      { value: 'ADJUSTMENT' as const, label: 'Adjustment' },
    ] : []),
  ];
  const customerCreditTypeOptions = [
    ...(canCustomerCreditAdd ? [
      { value: 'ADVANCE_PAYMENT' as const, label: 'Advance Payment' },
    ] : []),
    ...(canCustomerCreditAdjust ? [
      { value: 'OPENING_BALANCE' as const, label: 'Opening Balance' },
      { value: 'ADJUSTMENT' as const, label: 'Adjustment' },
    ] : []),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ReceiptText size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Accounts Ledger</h1>
              <p className="text-slate-500 text-sm mt-0.5">Track hauler and customer account balances in one ledger workspace.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(activeLedgerTab === 'HAULER' ? canExport : canCustomerCreditExport) && (
            <button
              onClick={activeLedgerTab === 'HAULER' ? exportExcel : exportCustomerExcel}
              disabled={activeLedgerTab === 'HAULER' ? loading || filteredEntries.length === 0 : customerLoading || filteredCustomerRows.length === 0}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 text-sm font-semibold"
            >
              <Download size={15} /> Export Excel
            </button>
          )}
          {activeLedgerTab === 'HAULER' && canExportStatement && (
            <button onClick={printStatement} disabled={loading || !summary} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60 text-sm font-semibold">
              <FileText size={15} /> Export PDF
            </button>
          )}
          <button
            onClick={() => activeLedgerTab === 'HAULER' ? fetchLedger() : fetchCustomerOffsets()}
            disabled={activeLedgerTab === 'HAULER' ? loading || !haulerId : customerLoading}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-60"
          >
            <RefreshCw size={15} className={activeLedgerTab === 'HAULER' ? loading ? 'animate-spin' : '' : customerLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveLedgerTab('HAULER')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeLedgerTab === 'HAULER' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
        >
          <Truck size={15} /> Hauler Ledger
        </button>
        <button
          type="button"
          onClick={() => setActiveLedgerTab('CUSTOMER')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeLedgerTab === 'CUSTOMER' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
        >
          <Users size={15} /> Customer Ledger
        </button>
      </div>

      {activeLedgerTab === 'HAULER' && !canHaulerManualAdd && !canExport && <ReadOnlyNotice message="This user group can review hauler balances only." />}
      {activeLedgerTab === 'CUSTOMER' && !canCustomerManualAdd && !canCustomerCreditExport && <ReadOnlyNotice message="This user group can review customer credit balances only." />}

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          {activeLedgerTab === 'HAULER' ? (
            <Field label="Hauler">
              <select value={haulerId} onChange={e => handleHaulerChange(e.target.value)} className={inputClass}>
                <option value="">Select hauler...</option>
                {haulers.map(hauler => <option key={hauler.id} value={hauler.id}>{hauler.name}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Customer">
              <select value={customerId} onChange={e => setCustomerId(e.target.value as 'ALL' | string)} className={inputClass}>
                <option value="ALL">All customers</option>
                {customerOptions.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customerSelectLabel(customer, customerNameCounts[normalizeCustomerName(customer.name)] ?? 1, customerActivityCounts[customer.id] ?? 0)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Date From">
            <input type="date" value={dateFrom} onChange={e => updateDateFrom(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Date To">
            <input type="date" value={dateTo} onChange={e => updateDateTo(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Quick Filter">
            <select value={quickFilter} onChange={e => applyQuickFilter(e.target.value as QuickFilter)} className={inputClass}>
              <option value="THIS_MONTH">This Month</option>
              <option value="LAST_MONTH">Last Month</option>
              <option value="THIS_QUARTER">This Quarter</option>
              <option value="CUSTOM">Custom Range</option>
            </select>
          </Field>
          <div className="flex items-end">
            {activeLedgerTab === 'HAULER' && canHaulerManualAdd && (
              <button onClick={openAddModal} disabled={!haulerId} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60">
                <Plus size={16} /> Add Transaction
              </button>
            )}
            {activeLedgerTab === 'CUSTOMER' && canCustomerManualAdd && (
              <button onClick={openCustomerCreditModal} disabled={customerId === 'ALL'} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60">
                <Plus size={16} /> Add Credit
              </button>
            )}
          </div>
        </div>
        {activeLedgerTab === 'CUSTOMER' && selectedCustomer && matchingCustomerWithActivity && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <span>
              Heads up: this {selectedCustomer.name} record has no offset rows, but another {selectedCustomer.name} record has {customerActivityCounts[matchingCustomerWithActivity.id] ?? 0} offset rows.
            </span>
            <button
              type="button"
              onClick={() => setCustomerId(matchingCustomerWithActivity.id)}
              className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-900 text-xs font-semibold hover:bg-amber-200"
            >
              Use matching record
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm font-medium">
          {successMessage}
        </div>
      )}

      {activeLedgerTab === 'HAULER' && (loading ? (
        <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2 bg-white rounded-xl border border-slate-200">
          <Loader2 size={18} className="animate-spin" /> Loading hauler ledger...
        </div>
      ) : haulers.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
          <Truck size={34} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-semibold">No hauler trucks found</p>
          <p className="text-slate-400 text-sm mt-1">Mark trucks as hauler trucks and assign them to a customer first.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <SummaryCard label="Hauling Earnings" value={haulingEarnings} sub="Credit this period" icon={<ReceiptText size={21} className="text-emerald-500" />} bg="bg-emerald-50" />
            <SummaryCard label="Product Offsets" value={productOffsets} sub="Debit this period" icon={<Scale size={21} className="text-orange-500" />} bg="bg-orange-50" />
            <SummaryCard label="Diesel Offsets" value={dieselOffsets} sub="Debit this period" icon={<Truck size={21} className="text-blue-500" />} bg="bg-blue-50" />
            <SummaryCard label="Cash Payments" value={cashPayments} sub="Debit this period" icon={<Banknote size={21} className="text-violet-500" />} bg="bg-violet-50" />
            <div className={`rounded-xl border p-5 ${closingBalance >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <p className="text-xs uppercase font-bold text-slate-500">Net Payable to Hauler</p>
              <p className={`text-2xl font-bold tabular-nums mt-2 ${closingBalance >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{currency(closingBalance)}</p>
              <p className="text-xs text-slate-500 mt-1">{balanceInterpretation(closingBalance)}</p>
            </div>
          </div>

          <div className="text-xs text-slate-500 bg-emerald-50/70 border border-emerald-100 rounded-xl px-4 py-3">
            Net Payable = Opening Balance + Hauling Earnings - Product Offsets - Diesel Offsets - Cash Payments, plus/minus manual adjustments.
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-800">Running Ledger</h2>
                  <p className="text-xs text-slate-500 mt-1">Opening balance before {formatDate(dateFrom)}: {currency(openingBalance)}</p>
                </div>
                <div className="relative w-full md:w-72">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search type, reference, description..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                </div>
              </div>
              {filteredEntries.length === 0 ? (
                <div className="py-16 text-center">
                  <ReceiptText size={32} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm">No ledger activity for this range</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                        <th className="px-4 py-3 text-left">Date</th>
                        <th className="px-4 py-3 text-left">Type</th>
                        <th className="px-4 py-3 text-left">Reference</th>
                        <th className="px-4 py-3 text-left">Description</th>
                        <th className="px-4 py-3 text-right">Debit (-)</th>
                        <th className="px-4 py-3 text-right">Credit (+)</th>
                        <th className="px-4 py-3 text-right">Balance</th>
                        <th className="px-4 py-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pagedEntries.map(entry => (
                        <tr
                          key={`${entry.source_module}-${entry.source_id}`}
                          onDoubleClick={() => canViewDetail && setSelectedEntry(entry)}
                          className={`${entry.source_id === highlightedSourceId ? 'bg-emerald-50 animate-pulse' : 'hover:bg-slate-50'} transition-colors ${canViewDetail ? 'cursor-pointer' : ''}`}
                          title={canViewDetail ? 'Double-click to view details' : undefined}
                        >
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDate(entry.transaction_date)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-semibold ${typeBadgeClass(entry.transaction_type)}`}>
                              {typeLabel(entry.transaction_type)}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">{entry.reference_no || '—'}</td>
                          <td className="px-4 py-3 text-slate-700 min-w-[220px]">{entry.description || '—'}</td>
                          <td className="px-4 py-3 text-right text-red-500 font-semibold tabular-nums">{entry.debit_amount > 0 ? currency(entry.debit_amount) : '—'}</td>
                          <td className="px-4 py-3 text-right text-emerald-600 font-semibold tabular-nums">{entry.credit_amount > 0 ? currency(entry.credit_amount) : '—'}</td>
                          <td className={`px-4 py-3 text-right font-bold tabular-nums ${entry.running_balance >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{currency(entry.running_balance)}</td>
                          <td className="px-4 py-3 text-center">
                            <button disabled={!canViewDetail} onClick={() => setSelectedEntry(entry)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40" title="View details">
                              <Eye size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Pagination page={currentPage} pageSize={PAGE_SIZE} totalItems={filteredEntries.length} onPageChange={setPage} />
                </div>
              )}
            </div>

            {canViewStatement && (
              <div className="bg-white rounded-xl border border-slate-200 p-5 h-fit">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="font-semibold text-slate-800">Hauler Statement</h2>
                    <p className="text-xs text-slate-500 mt-1">{formatDate(dateFrom)} to {formatDate(dateTo)}</p>
                  </div>
                  {canExportStatement && (
                    <button onClick={printStatement} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600">
                      <FileText size={14} /> PDF
                    </button>
                  )}
                </div>
                <div className="space-y-2 text-sm">
                  <StatementRow label="Opening Balance" value={openingBalance} />
                  <StatementRow label="Add: Hauling Earnings" value={haulingEarnings} positive />
                  <StatementRow label="Less: Product Offsets" value={-productOffsets} />
                  <StatementRow label="Less: Diesel Offsets" value={-dieselOffsets} />
                  <StatementRow label="Less: Cash Payments" value={-cashPayments} />
                  <StatementRow label="Adjustments Net" value={adjustmentsNet} />
                  <div className="pt-3 mt-3 border-t border-slate-200 flex items-center justify-between">
                    <span className="font-bold text-slate-700">Closing Balance</span>
                    <span className={`font-bold tabular-nums ${closingBalance >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{currency(closingBalance)}</span>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-4">{balanceInterpretation(closingBalance)}</p>
              </div>
            )}
          </div>
        </>
      ))}

      {activeLedgerTab === 'CUSTOMER' && (
        <>
          {customerError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              {customerError}
            </div>
          )}

          {customerLoading ? (
            <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2 bg-white rounded-xl border border-slate-200">
              <Loader2 size={18} className="animate-spin" /> Loading customer offsets...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center mb-4">
                    <ReceiptText size={21} className="text-emerald-500" />
                  </div>
                  <p className="text-sm text-slate-500 font-medium">Offset Transactions</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1 tabular-nums">{customerOffsetRows.length}</p>
                  <p className="text-xs text-slate-400 mt-1">Records this period</p>
                </div>
                <SummaryCard label="Receivable Amount" value={customerOffsetTotal} sub="P.O and offset amount this period" icon={<Scale size={21} className="text-orange-500" />} bg="bg-orange-50" />
                <SummaryCard label="Sales Value" value={customerTransactionTotal} sub="Total value of receivable rows" icon={<Banknote size={21} className="text-blue-500" />} bg="bg-blue-50" />
                <SummaryCard label="Available Credit" value={customerAvailableCredit} sub={selectedCustomer ? 'Current customer balance' : 'Select one customer'} icon={<Banknote size={21} className="text-teal-500" />} bg="bg-teal-50" />
                <div className="rounded-xl border border-sky-100 bg-sky-50 p-5">
                  <div className="w-11 h-11 rounded-xl bg-white/70 flex items-center justify-center mb-4">
                    <Users size={21} className="text-sky-600" />
                  </div>
                  <p className="text-sm text-slate-500 font-medium">Customer Scope</p>
                  <p className="text-lg font-bold text-slate-800 mt-1 truncate" title={selectedCustomer?.name ?? 'All customers'}>{selectedCustomer?.name ?? 'All customers'}</p>
                  <p className="text-xs text-slate-400 mt-1">{formatDate(dateFrom)} to {formatDate(dateTo)}</p>
                </div>
              </div>

              <div className="text-xs text-slate-500 bg-sky-50/70 border border-sky-100 rounded-xl px-4 py-3">
                Customer Ledger separates receivable activity from customer advance credits. Pending P.O/OFFSET rows can be settled using Customer Credit only when the selected customer has enough available balance.
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-slate-800">Customer Receivable Activity</h2>
                      <p className="text-xs text-slate-500 mt-1">Showing P.O, offset, and paid receivable transactions for the selected customer scope.</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                      <select value={customerStatusFilter} onChange={e => setCustomerStatusFilter(e.target.value as CustomerStatusFilter)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200">
                        <option value="ALL">All Status</option>
                        <option value="PENDING">Pending</option>
                        <option value="PAID">Paid</option>
                      </select>
                      <div className="relative w-full md:w-72">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Search customer, DR, truck, material..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                      </div>
                    </div>
                  </div>

                  {filteredCustomerRows.length === 0 ? (
                    <div className="py-16 text-center">
                      <ReceiptText size={32} className="text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 text-sm">No customer receivable activity for this range</p>
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
                            <th className="px-4 py-3 text-center">Mode</th>
                            <th className="px-4 py-3 text-center">Status</th>
                            <th className="px-4 py-3 text-right">Amount</th>
                            <th className="px-4 py-3 text-right">Running Total</th>
                            {canCustomerCreditAdjust && <th className="px-4 py-3 text-center">Action</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {pagedCustomerRows.map(row => (
                            <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDate(row.transaction_date)}</td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.dr_number || '—'}</td>
                              <td className="px-4 py-3 text-slate-700 font-medium">{row.customers?.name ?? '—'}</td>
                              <td className="px-4 py-3 text-slate-600">{row.trucks?.plate_number ?? '—'}</td>
                              <td className="px-4 py-3 text-slate-600">{row.material_type || '—'}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${row.payment_mode === 'P.O' ? 'bg-amber-100 text-amber-700' : row.payment_mode === 'SPLIT' ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-600'}`}>
                                  {row.payment_mode === 'SPLIT' ? 'SPLIT' : row.payment_mode}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`inline-flex px-2.5 py-0.5 rounded-full border text-xs font-semibold ${row.status === 'PAID' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                  {row.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-orange-600 font-semibold tabular-nums">{currency(row.offset_amount)}</td>
                              <td className="px-4 py-3 text-right text-slate-800 font-bold tabular-nums">{currency(row.running_total)}</td>
                              {canCustomerCreditAdjust && (
                                <td className="px-4 py-3 text-center">
                                  {row.status === 'PENDING' ? (
                                    <button
                                      type="button"
                                      onClick={() => settleCustomerReceivable(row)}
                                      disabled={settlingTransactionId === row.id || customerAvailableCredit + 0.005 < row.offset_amount}
                                      title={customerAvailableCredit + 0.005 < row.offset_amount ? `Insufficient credit: ${currency(customerAvailableCredit)}` : 'Settle using customer credit'}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500 text-white text-xs font-semibold hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      {settlingTransactionId === row.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                                      Use Credit
                                    </button>
                                  ) : (
                                    <span className="text-xs text-slate-400">—</span>
                                  )}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <Pagination page={customerCurrentPage} pageSize={PAGE_SIZE} totalItems={filteredCustomerRows.length} onPageChange={setCustomerPage} />
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-5 h-fit">
                  <h2 className="font-semibold text-slate-800">Customer Receivable Summary</h2>
                  <p className="text-xs text-slate-500 mt-1">{formatDate(dateFrom)} to {formatDate(dateTo)}</p>
                  <div className="mt-4 space-y-2 text-sm">
                    <SummaryLine label="Receivable Records" value={String(customerOffsetRows.length)} />
                    <SummaryLine label="Total Receivable Amount" value={currency(customerOffsetTotal)} positive />
                    <SummaryLine label="Related Sales Value" value={currency(customerTransactionTotal)} positive />
                    <SummaryLine label="Total Volume (m³)" value={fmt(customerVolumeTotal)} />
                  </div>
                  <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-500">
                    Receivable activity uses posted daily transactions with P.O, OFFSET, or SPLIT payment mode.
                  </div>
                </div>
              </div>

              {selectedCustomer ? (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-slate-800">Customer Credit Ledger</h2>
                      <p className="text-xs text-slate-500 mt-1">Advance credits, deductions from Daily Transactions, and manual adjustments.</p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-xs text-slate-500">Closing Balance</p>
                      <p className={`font-bold tabular-nums ${customerCreditClosingBalance > 0 ? 'text-emerald-700' : 'text-slate-800'}`}>{currency(customerCreditClosingBalance)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-0 border-b border-slate-100">
                    <div className="p-4 border-b md:border-b-0 md:border-r border-slate-100">
                      <p className="text-xs text-slate-500">Opening Balance</p>
                      <p className="text-lg font-bold text-slate-800 tabular-nums">{currency(customerCreditSummary?.opening_balance ?? 0)}</p>
                    </div>
                    <div className="p-4 border-b md:border-b-0 md:border-r border-slate-100">
                      <p className="text-xs text-slate-500">Advances</p>
                      <p className="text-lg font-bold text-emerald-700 tabular-nums">{currency(customerCreditAdvances)}</p>
                    </div>
                    <div className="p-4 border-b md:border-b-0 md:border-r border-slate-100">
                      <p className="text-xs text-slate-500">Purchases Used</p>
                      <p className="text-lg font-bold text-teal-700 tabular-nums">{currency(customerCreditPurchases)}</p>
                    </div>
                    <div className="p-4">
                      <p className="text-xs text-slate-500">Adjustments Net</p>
                      <p className={`text-lg font-bold tabular-nums ${customerCreditAdjustmentsNet >= 0 ? 'text-slate-800' : 'text-red-600'}`}>{currency(customerCreditAdjustmentsNet)}</p>
                    </div>
                  </div>

                  {customerCreditEntries.length === 0 ? (
                    <div className="py-14 text-center">
                      <Banknote size={32} className="text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 text-sm">No customer credit activity for this range</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                            <th className="px-4 py-3 text-left">Date</th>
                            <th className="px-4 py-3 text-left">Type</th>
                            <th className="px-4 py-3 text-left">Reference</th>
                            <th className="px-4 py-3 text-left">Description</th>
                            <th className="px-4 py-3 text-right">Debit (-)</th>
                            <th className="px-4 py-3 text-right">Credit (+)</th>
                            <th className="px-4 py-3 text-right">Balance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {customerCreditEntries.map(row => (
                            <tr key={`${row.source_module}-${row.source_id}-${row.line_no}`} className={`hover:bg-slate-50 transition-colors ${highlightedSourceId === row.source_id ? 'bg-emerald-50/70' : ''}`}>
                              <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDate(row.transaction_date)}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex px-2.5 py-0.5 rounded-full border text-xs font-semibold whitespace-nowrap ${customerCreditTypeBadgeClass(row.transaction_type)}`}>
                                  {customerCreditTypeLabel(row.transaction_type)}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.reference_no || '—'}</td>
                              <td className="px-4 py-3 text-slate-700">{row.description || '—'}</td>
                              <td className="px-4 py-3 text-right text-red-600 font-semibold tabular-nums">{row.debit_amount > 0 ? currency(row.debit_amount) : '—'}</td>
                              <td className="px-4 py-3 text-right text-emerald-700 font-semibold tabular-nums">{row.credit_amount > 0 ? currency(row.credit_amount) : '—'}</td>
                              <td className="px-4 py-3 text-right text-slate-800 font-bold tabular-nums">{currency(row.running_balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 p-6 text-sm text-slate-500">
                  Select one customer to view and manage their Customer Credit Ledger.
                </div>
              )}
            </>
          )}
        </>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={saveManualEntry} className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Add Hauler Transaction</h2>
                <p className="text-xs text-slate-500 mt-1">{selectedHauler?.name}</p>
              </div>
              <button type="button" onClick={() => { setShowAddModal(false); setFormError(''); }} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>

            <div className="p-6 space-y-5">
              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Transaction Type">
                  <select value={form.transaction_type} onChange={e => setFormValue('transaction_type', e.target.value as ManualType)} className={inputClass}>
                    {manualTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </Field>
                <Field label="Date">
                  <input required type="date" value={form.transaction_date} onChange={e => setFormValue('transaction_date', e.target.value)} className={inputClass} />
                </Field>
                <Field label="Reference">
                  <input value={form.reference_no} onChange={e => setFormValue('reference_no', e.target.value)} className={inputClass} placeholder="TRP-2026-0701-001" />
                </Field>
                {form.transaction_type !== 'HAULING_SERVICE' && (
                  <Field label="Amount">
                    <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setFormValue('amount', e.target.value)} className={inputClass} />
                  </Field>
                )}
                {(form.transaction_type === 'OPENING_BALANCE' || form.transaction_type === 'ADJUSTMENT') && (
                  <Field label="Entry Side">
                    <select value={form.entry_side} onChange={e => setFormValue('entry_side', e.target.value as EntrySide)} className={inputClass}>
                      <option value="CREDIT">Credit (+ company owes hauler)</option>
                      <option value="DEBIT">Debit (- hauler owes / offset)</option>
                    </select>
                  </Field>
                )}
                <Field label="Description">
                  <input value={form.description} onChange={e => setFormValue('description', e.target.value)} className={inputClass} placeholder={form.transaction_type === 'HAULING_SERVICE' ? 'Auto-generated if blank' : 'Short transaction description'} />
                </Field>
              </div>

              {form.transaction_type === 'HAULING_SERVICE' && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <p className="text-xs font-bold uppercase text-slate-500">Hauling Details</p>
                      <p className="text-xs text-slate-400 mt-0.5">Add one row per assigned truck. Amount is trips multiplied by rate.</p>
                    </div>
                    <button
                      type="button"
                      onClick={addHaulingLineItem}
                      disabled={selectedHaulerTrucks.length === 0}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Plus size={14} /> Add Truck
                    </button>
                  </div>

                  {selectedHaulerTrucks.length === 0 && (
                    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      No trucks are assigned to this hauler yet. Assign hauler trucks in Logistics first.
                    </div>
                  )}

                  <div className="space-y-3">
                    {form.hauling_items.map((item, index) => {
                      const lineAmount = (Number(item.trips) || 0) * (Number(item.rate_per_trip) || 0);
                      return (
                        <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_0.7fr_0.9fr_1fr_auto] gap-3 items-end">
                            <Field label={`Truck / Plate ${index + 1}`}>
                              <select value={item.truck_id} onChange={e => setHaulingLineTruck(item.id, e.target.value)} className={inputClass}>
                                <option value="">
                                  {selectedHaulerTrucks.length === 0 ? 'No assigned hauler trucks' : 'Select truck...'}
                                </option>
                                {selectedHaulerTrucks.map(truck => (
                                  <option key={truck.id} value={truck.id}>
                                    {truck.plate_number}{truck.driver_name ? ` - ${truck.driver_name}` : ''}
                                  </option>
                                ))}
                              </select>
                            </Field>
                            <Field label="Driver">
                              <input value={item.driver_name} readOnly className={`${inputClass} bg-slate-100 text-slate-500`} />
                            </Field>
                            <Field label="Trips">
                              <input required type="number" min="0.01" step="0.01" value={item.trips} onChange={e => updateHaulingLineItem(item.id, { trips: e.target.value })} className={inputClass} />
                            </Field>
                            <Field label="Rate / Trip">
                              <input required type="number" min="0.01" step="0.01" value={item.rate_per_trip} onChange={e => updateHaulingLineItem(item.id, { rate_per_trip: e.target.value })} className={inputClass} />
                            </Field>
                            <Field label="Amount">
                              <div className="w-full px-3 py-2.5 rounded-lg border border-emerald-200 text-sm font-bold text-emerald-700 bg-emerald-50 tabular-nums">
                                {currency(lineAmount)}
                              </div>
                            </Field>
                            <button
                              type="button"
                              onClick={() => removeHaulingLineItem(item.id)}
                              disabled={form.hauling_items.length === 1}
                              className="h-10 w-10 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30"
                              title="Remove truck row"
                            >
                              <X size={16} className="mx-auto" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <p className="text-xs font-semibold text-slate-500">Total Trips</p>
                      <p className="text-sm font-bold text-slate-800 tabular-nums">{fmt(haulingLineTotals.trips).replace('.00', '')}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <p className="text-xs font-semibold text-slate-500">Trucks Used</p>
                      <p className="text-sm font-bold text-slate-800 tabular-nums">{haulingLineTotals.truckCount}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <p className="text-xs font-semibold text-emerald-700">Total Amount</p>
                      <p className="text-sm font-bold text-emerald-700 tabular-nums">{currency(haulingServiceAmount)}</p>
                    </div>
                  </div>
                </div>
              )}

              {form.transaction_type === 'CASH_PAYMENT' && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className="text-xs font-bold uppercase text-slate-500 mb-3">Payment Details</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="Payment Method"><input value={form.payment_method} onChange={e => setFormValue('payment_method', e.target.value)} className={inputClass} placeholder="Cash / Check / Bank Transfer" /></Field>
                    <Field label="Check / Reference No."><input value={form.payment_reference} onChange={e => setFormValue('payment_reference', e.target.value)} className={inputClass} /></Field>
                  </div>
                </div>
              )}

              {(form.transaction_type === 'OPENING_BALANCE' || form.transaction_type === 'ADJUSTMENT') && (
                <Field label="Reason">
                  <input value={form.reason} onChange={e => setFormValue('reason', e.target.value)} className={inputClass} placeholder="Why this balance/adjustment is needed" />
                </Field>
              )}

              <Field label="Remarks">
                <textarea value={form.remarks} onChange={e => setFormValue('remarks', e.target.value)} className={`${inputClass} min-h-[90px]`} />
              </Field>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button type="button" onClick={() => { setShowAddModal(false); setFormError(''); }} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60">
                {saving ? 'Saving...' : 'Save Transaction'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showCustomerCreditModal && selectedCustomer && (
        <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={saveCustomerCreditEntry} className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Add Customer Credit</h2>
                <p className="text-xs text-slate-500 mt-1">{selectedCustomer.name}</p>
              </div>
              <button type="button" onClick={() => { setShowCustomerCreditModal(false); setFormError(''); }} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>

            <div className="p-6 space-y-5">
              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3">
                <p className="text-xs font-semibold text-teal-700 uppercase">Current Available Credit</p>
                <p className="text-2xl font-bold text-teal-800 tabular-nums mt-1">{currency(customerAvailableCredit)}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Entry Type">
                  <select value={customerCreditForm.transaction_type} onChange={e => setCustomerCreditFormValue('transaction_type', e.target.value as CustomerCreditManualType)} className={inputClass}>
                    {customerCreditTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </Field>
                <Field label="Date">
                  <input required type="date" value={customerCreditForm.transaction_date} onChange={e => setCustomerCreditFormValue('transaction_date', e.target.value)} className={inputClass} />
                </Field>
                <Field label="Reference">
                  <input value={customerCreditForm.reference_no} onChange={e => setCustomerCreditFormValue('reference_no', e.target.value)} className={inputClass} placeholder="OR / Receipt / Ref no." />
                </Field>
                <Field label="Amount">
                  <input required type="number" min="0.01" step="0.01" value={customerCreditForm.amount} onChange={e => setCustomerCreditFormValue('amount', e.target.value)} className={inputClass} />
                </Field>
                {(customerCreditForm.transaction_type === 'OPENING_BALANCE' || customerCreditForm.transaction_type === 'ADJUSTMENT') && (
                  <Field label="Entry Side">
                    <select value={customerCreditForm.entry_side} onChange={e => setCustomerCreditFormValue('entry_side', e.target.value as EntrySide)} className={inputClass}>
                      <option value="CREDIT">Credit (+ add to customer balance)</option>
                      <option value="DEBIT">Debit (- reduce customer balance)</option>
                    </select>
                  </Field>
                )}
                <Field label="Description">
                  <input value={customerCreditForm.description} onChange={e => setCustomerCreditFormValue('description', e.target.value)} className={inputClass} placeholder="Short description" />
                </Field>
              </div>

              <Field label="Remarks">
                <textarea value={customerCreditForm.remarks} onChange={e => setCustomerCreditFormValue('remarks', e.target.value)} className={`${inputClass} min-h-[90px]`} />
              </Field>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button type="button" onClick={() => { setShowCustomerCreditModal(false); setFormError(''); }} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60">
                {saving ? 'Saving...' : 'Save Credit Entry'}
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedEntry && (
        <DetailModal
          entry={selectedEntry}
          canAdjust={canAdjust}
          saving={saving}
          onClose={() => setSelectedEntry(null)}
          onVoid={() => voidManualEntry(selectedEntry)}
        />
      )}

      <ActionModal
        open={!!voidTarget}
        title="Void Manual Entry"
        description="A voided entry stays traceable in the ledger history with your reason."
        variant="warning"
        confirmLabel="Void Entry"
        loading={saving}
        onClose={() => {
          setVoidTarget(null);
          setVoidReason('');
          setFormError('');
        }}
        onConfirm={confirmVoidManualEntry}
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Entry</p>
            <p className="mt-1 font-semibold text-slate-800">{voidTarget?.description || voidTarget?.reference_no || 'Manual entry'}</p>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-500">Void Reason *</span>
            <textarea
              value={voidReason}
              onChange={event => {
                setVoidReason(event.target.value);
                setFormError('');
              }}
              className={`${inputClass} min-h-[100px] resize-none`}
              placeholder="Reason for voiding this entry"
            />
          </label>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
        </div>
      </ActionModal>

      <ActionModal
        open={!!infoModal}
        title="Export Notice"
        description={infoModal}
        variant="info"
        confirmLabel="Got It"
        showCancel={false}
        onClose={() => setInfoModal('')}
        onConfirm={() => setInfoModal('')}
      />
    </div>
  );
}

const inputClass = 'w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-500 mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function SummaryCard({ label, value, sub, icon, bg }: { label: string; value: number; sub: string; icon: React.ReactNode; bg: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center mb-4`}>{icon}</div>
      <p className="text-sm text-slate-500 font-medium">{label}</p>
      <p className="text-2xl font-bold text-slate-800 mt-1 tabular-nums">{currency(value)}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </div>
  );
}

function StatementRow({ label, value, positive = false }: { label: string; value: number; positive?: boolean }) {
  const color = value > 0 || positive ? 'text-emerald-700' : value < 0 ? 'text-red-600' : 'text-slate-700';
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold tabular-nums ${color}`}>{value < 0 ? '-' : ''}{currency(Math.abs(value))}</span>
    </div>
  );
}

function emptyCustomerCreditForm(defaultType: CustomerCreditManualType = 'ADVANCE_PAYMENT'): CustomerCreditForm {
  return {
    transaction_type: defaultType,
    transaction_date: todayInput(),
    reference_no: '',
    description: '',
    amount: '',
    entry_side: 'CREDIT',
    remarks: '',
  };
}

function SummaryLine({ label, value, positive = false }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold tabular-nums ${positive ? 'text-emerald-700' : 'text-slate-700'}`}>{value}</span>
    </div>
  );
}

function balanceInterpretation(balance: number) {
  if (balance > 0) return 'Company owes hauler';
  if (balance < 0) return 'Hauler owes company / over-offset';
  return 'Fully settled';
}

function DetailModal({
  entry,
  canAdjust,
  saving,
  onClose,
  onVoid,
}: {
  entry: LedgerEntry;
  canAdjust: boolean;
  saving: boolean;
  onClose: () => void;
  onVoid: () => void;
}) {
  const payload = asRecord(entry.source_payload);
  const canVoid = canAdjust && entry.source_module === 'hauler_offset_entries';

  return (
    <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800">Transaction Detail</h2>
              <span className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-semibold ${typeBadgeClass(entry.transaction_type)}`}>
                {typeLabel(entry.transaction_type)}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">{entry.reference_no || 'No reference'}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DetailBox label="Date" value={formatDate(entry.transaction_date)} />
            <DetailBox label="Source Module" value={entry.source_module ?? '—'} />
            <DetailBox label="Debit (-)" value={entry.debit_amount > 0 ? currency(entry.debit_amount) : '—'} danger />
            <DetailBox label="Credit (+)" value={entry.credit_amount > 0 ? currency(entry.credit_amount) : '—'} positive />
            <DetailBox label="Running Balance" value={currency(entry.running_balance)} positive={entry.running_balance >= 0} danger={entry.running_balance < 0} />
            <DetailBox label="Description" value={entry.description || '—'} />
          </div>

          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-800 mb-3">Structured Details</h3>
            <TypeSpecificDetails entry={entry} payload={payload} />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Related Documents</h3>
            </div>
            <RelatedDocuments entry={entry} payload={payload} />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-between gap-3">
          {canVoid ? (
            <button onClick={onVoid} disabled={saving} className="px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-60">
              Void Entry
            </button>
          ) : <span />}
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800">Close</button>
        </div>
      </div>
    </div>
  );
}

function DetailBox({ label, value, positive = false, danger = false }: { label: string; value: string; positive?: boolean; danger?: boolean }) {
  const color = positive ? 'text-emerald-700' : danger ? 'text-red-600' : 'text-slate-800';
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500 font-semibold uppercase">{label}</p>
      <p className={`mt-1 font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function TypeSpecificDetails({ entry, payload }: { entry: LedgerEntry; payload: Record<string, unknown> }) {
  if (entry.transaction_type === 'HAULING_SERVICE') {
    const lineItems = Array.isArray(payload.line_items)
      ? payload.line_items.map(item => asRecord(item as Json))
      : [];

    if (lineItems.length > 0) {
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase text-slate-500 border-b border-slate-200">
                <th className="py-2 text-left">Truck / Plate</th>
                <th className="py-2 text-left">Driver</th>
                <th className="py-2 text-right">Trips</th>
                <th className="py-2 text-right">Rate / Trip</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {lineItems.map((item, index) => (
                <tr key={`${textValue(item, 'truck_id')}-${index}`}>
                  <td className="py-2 pr-3 text-slate-700 font-medium">{textValue(item, 'truck_plate') || '—'}</td>
                  <td className="py-2 pr-3 text-slate-600">{textValue(item, 'driver_name') || '—'}</td>
                  <td className="py-2 pr-3 text-right text-slate-700 tabular-nums">{fmt(numberValue(item, 'trips'))}</td>
                  <td className="py-2 pr-3 text-right text-slate-700 tabular-nums">{currency(numberValue(item, 'rate_per_trip'))}</td>
                  <td className="py-2 text-right text-emerald-700 font-bold tabular-nums">{currency(numberValue(item, 'amount'))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <DetailGrid rows={[
        ['Trips', textValue(payload, 'trip_count') || '—'],
        ['Trucks', textValue(payload, 'truck_count') || '—'],
        ['Truck / Plate', textValue(payload, 'truck_plate') || '—'],
        ['Driver', textValue(payload, 'driver_name') || '—'],
        ['Rate / Trip', numberValue(payload, 'rate_per_trip') ? currency(numberValue(payload, 'rate_per_trip')) : '—'],
      ]} />
    );
  }

  if (entry.transaction_type === 'PRODUCT_OFFSET') {
    return (
      <DetailGrid rows={[
        ['DR Number', textValue(payload, 'dr_number') || entry.reference_no || '—'],
        ['Product', textValue(payload, 'material_type') || '—'],
        ['Volume', numberValue(payload, 'volume_m3') ? `${fmt(numberValue(payload, 'volume_m3'))} m³` : '—'],
        ['Unit Price', numberValue(payload, 'unit_price') ? currency(numberValue(payload, 'unit_price')) : '—'],
        ['Payment Mode', textValue(payload, 'payment_mode') || '—'],
        ['Transaction Status', textValue(payload, 'status') || '—'],
      ]} />
    );
  }

  if (entry.transaction_type === 'DIESEL_OFFSET') {
    return (
      <DetailGrid rows={[
        ['Fuel Reference', entry.reference_no || '—'],
        ['Issued To', textValue(payload, 'issued_to') || '—'],
        ['Truck', textValue(payload, 'truck_plate') || '—'],
        ['Driver', textValue(payload, 'driver_name') || '—'],
        ['Liters', numberValue(payload, 'liters') ? `${fmt(numberValue(payload, 'liters'))} L` : '—'],
        ['Price / L', numberValue(payload, 'unit_cost_snapshot') ? currency(numberValue(payload, 'unit_cost_snapshot')) : '—'],
      ]} />
    );
  }

  if (entry.transaction_type === 'CASH_PAYMENT') {
    return (
      <DetailGrid rows={[
        ['Payment Method', textValue(payload, 'payment_method') || '—'],
        ['Payment Reference', textValue(payload, 'payment_reference') || '—'],
        ['Remarks', textValue(payload, 'remarks') || '—'],
      ]} />
    );
  }

  return (
    <DetailGrid rows={[
      ['Reason', textValue(payload, 'reason') || '—'],
      ['Remarks', textValue(payload, 'remarks') || '—'],
    ]} />
  );
}

function DetailGrid({ rows }: { rows: [string, string][] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <p className="text-xs text-slate-500 font-semibold">{label}</p>
          <p className="text-sm text-slate-800 mt-0.5">{value}</p>
        </div>
      ))}
    </div>
  );
}

function RelatedDocuments({ entry, payload }: { entry: LedgerEntry; payload: Record<string, unknown> }) {
  const attachments = Array.isArray(payload.attachment_urls) ? payload.attachment_urls.filter((item): item is string => typeof item === 'string') : [];
  const rows = [
    ...(entry.source_module ? [{
      type: entry.source_module === 'transactions' ? 'Daily Transaction' : entry.source_module === 'fuel_issuances' ? 'Fuel Issuance' : 'Manual Entry',
      reference: entry.reference_no || entry.source_id || '—',
      date: formatDate(entry.transaction_date),
      url: '',
    }] : []),
    ...attachments.map((url, index) => ({
      type: 'Attachment',
      reference: `Attachment ${index + 1}`,
      date: formatDate(entry.transaction_date),
      url,
    })),
  ];

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase">
          <th className="px-4 py-3 text-left">Document Type</th>
          <th className="px-4 py-3 text-left">Reference</th>
          <th className="px-4 py-3 text-left">Date</th>
          <th className="px-4 py-3 text-center">Action</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.length === 0 ? (
          <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No related documents</td></tr>
        ) : rows.map(row => (
          <tr key={`${row.type}-${row.reference}`}>
            <td className="px-4 py-3 text-slate-700">{row.type}</td>
            <td className="px-4 py-3 text-slate-500 font-mono text-xs">{row.reference}</td>
            <td className="px-4 py-3 text-slate-500">{row.date}</td>
            <td className="px-4 py-3 text-center">
              {row.url ? (
                <a href={row.url} target="_blank" rel="noreferrer" className="text-emerald-600 hover:text-emerald-700 font-semibold text-xs">View</a>
              ) : (
                <span className="text-slate-400 text-xs">Source</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
