import {
  Download,
  FileText,
  Plus,
  ReceiptText,
  RefreshCw,
  Truck,
  Users
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Customer, CustomerCreditLedgerRow, HaulerOffsetLedgerRow, Json, TransactionWithRelations } from '../lib/database.types';
import { fetchAllPages } from '../lib/fetchAll';
import { paginate } from '../lib/pagination';
import { supabase } from '../lib/supabase';
import ActionModal from './ActionModal';
import { createLedgerExports } from './ledger/createLedgerExports';
import CustomerCreditModal from './ledger/CustomerCreditModal';
import CustomerLedgerView from './ledger/CustomerLedgerView';
import HaulerEntryModal from './ledger/HaulerEntryModal';
import HaulerLedgerView from './ledger/HaulerLedgerView';
import { DetailModal, Field } from './ledger/LedgerComponents';
import { createHaulingLineItem, customerSelectLabel, emptyCustomerCreditForm, emptyForm, fmt, getCustomerOffsetAmount, inputClass, monthRange, normalizeCustomerName, PAGE_SIZE, quarterRange, todayInput, typeLabel } from './ledger/ledgerUtils';
import type { CustomerCreditForm, CustomerCreditLedgerEntry, CustomerOffsetRow, CustomerStatusFilter, EntryForm, HaulerOffsetLedgerProps, HaulerTruck, HaulingLineItem, LedgerEntry, OffsetLedgerTab, QuickFilter } from './ledger/types';
import ReadOnlyNotice from './ReadOnlyNotice';

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
      fetchAllPages<Customer>(async (from, to) => {
        const page = await supabase
          .from('customers')
          .select('*')
          .order('name', { ascending: true })
          .order('id')
          .range(from, to);
        return { data: page.data as Customer[] | null, error: page.error };
      }),
      fetchAllPages<{ customer_id: string | null; }>(async (from, to) => {
        const page = await supabase
          .from('transactions')
          .select('customer_id')
          .in('payment_mode', ['P.O', 'OFFSET', 'SPLIT'])
          .not('customer_id', 'is', null)
          .order('id')
          .range(from, to);
        return { data: page.data as { customer_id: string | null; }[] | null, error: page.error };
      }),
    ]);

    if (customersError) {
      setCustomerError(customersError.message);
      return;
    }
    if (offsetsError) {
      setCustomerError(offsetsError.message);
    }

    setCustomers((data ?? []) as Customer[]);
    const counts = ((offsetRows ?? []) as Array<{ customer_id: string | null; }>).reduce<Record<string, number>>((nextCounts, row) => {
      if (row.customer_id) nextCounts[row.customer_id] = (nextCounts[row.customer_id] ?? 0) + 1;
      return nextCounts;
    }, {});
    setCustomerActivityCounts(counts);
  }

  async function fetchLedger(nextRange?: { haulerId?: string; dateFrom?: string; dateTo?: string; }) {
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

  async function fetchCustomerOffsets(nextRange?: { customerId?: 'ALL' | string; dateFrom?: string; dateTo?: string; }) {
    const targetCustomerId = nextRange?.customerId ?? customerId;
    const targetDateFrom = nextRange?.dateFrom ?? dateFrom;
    const targetDateTo = nextRange?.dateTo ?? dateTo;
    setCustomerLoading(true);
    setCustomerError('');

    const query = fetchAllPages<TransactionWithRelations>(async (from, to) => {
      let pageQuery = supabase
        .from('transactions')
        .select('*, customers(*), trucks(*)')
        .gte('transaction_date', targetDateFrom)
        .lte('transaction_date', targetDateTo)
        .in('payment_mode', ['P.O', 'OFFSET', 'SPLIT']);
      if (targetCustomerId !== 'ALL') {
        pageQuery = pageQuery.eq('customer_id', targetCustomerId);
      }
      const page = await pageQuery
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to);
      return { data: page.data as TransactionWithRelations[] | null, error: page.error };
    });

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

  // Blocks double-submit (double click / Enter pressed twice) while a save is in progress.
  const saveManualEntryInFlight = useRef(false);
  async function saveManualEntry(event: React.FormEvent) {
    event.preventDefault();
    if (saveManualEntryInFlight.current) return;
    saveManualEntryInFlight.current = true;
    try {
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
    } finally {
      saveManualEntryInFlight.current = false;
    }
  }

  // Blocks double-submit (double click / Enter pressed twice) while a save is in progress.
  const saveCustomerCreditEntryInFlight = useRef(false);
  async function saveCustomerCreditEntry(event: React.FormEvent) {
    event.preventDefault();
    if (saveCustomerCreditEntryInFlight.current) return;
    saveCustomerCreditEntryInFlight.current = true;
    try {
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
    } finally {
      saveCustomerCreditEntryInFlight.current = false;
    }
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

  const { exportExcel, exportCustomerExcel, printStatement } = createLedgerExports({
    canExport,
    filteredEntries,
    setInfoModal,
    selectedHauler,
    dateFrom,
    dateTo,
    openingBalance,
    haulingEarnings,
    productOffsets,
    dieselOffsets,
    cashPayments,
    adjustmentsNet,
    closingBalance,
    filteredCustomerRows,
    selectedCustomer,
    customerOffsetTotal,
    customerCreditSummary,
    customerCreditAdvances,
    customerCreditPurchases,
    customerCreditAdjustmentsNet,
    customerCreditClosingBalance,
    customerCreditEntries,
    canViewStatement,
    summary,
    ledgerEntries
  });

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

      <HaulerLedgerView
        activeLedgerTab={activeLedgerTab}
        loading={loading}
        haulers={haulers}
        haulingEarnings={haulingEarnings}
        productOffsets={productOffsets}
        dieselOffsets={dieselOffsets}
        cashPayments={cashPayments}
        closingBalance={closingBalance}
        dateFrom={dateFrom}
        openingBalance={openingBalance}
        search={search}
        setSearch={setSearch}
        filteredEntries={filteredEntries}
        pagedEntries={pagedEntries}
        canViewDetail={canViewDetail}
        setSelectedEntry={setSelectedEntry}
        highlightedSourceId={highlightedSourceId}
        currentPage={currentPage}
        setPage={setPage}
        canViewStatement={canViewStatement}
        dateTo={dateTo}
        canExportStatement={canExportStatement}
        printStatement={printStatement}
        adjustmentsNet={adjustmentsNet}
      />

      <CustomerLedgerView
        activeLedgerTab={activeLedgerTab}
        customerError={customerError}
        customerLoading={customerLoading}
        customerOffsetRows={customerOffsetRows}
        customerOffsetTotal={customerOffsetTotal}
        customerTransactionTotal={customerTransactionTotal}
        customerAvailableCredit={customerAvailableCredit}
        selectedCustomer={selectedCustomer}
        dateFrom={dateFrom}
        dateTo={dateTo}
        customerStatusFilter={customerStatusFilter}
        setCustomerStatusFilter={setCustomerStatusFilter}
        customerSearch={customerSearch}
        setCustomerSearch={setCustomerSearch}
        filteredCustomerRows={filteredCustomerRows}
        canCustomerCreditAdjust={canCustomerCreditAdjust}
        pagedCustomerRows={pagedCustomerRows}
        settleCustomerReceivable={settleCustomerReceivable}
        settlingTransactionId={settlingTransactionId}
        customerCurrentPage={customerCurrentPage}
        setCustomerPage={setCustomerPage}
        customerVolumeTotal={customerVolumeTotal}
        customerCreditClosingBalance={customerCreditClosingBalance}
        customerCreditSummary={customerCreditSummary}
        customerCreditAdvances={customerCreditAdvances}
        customerCreditPurchases={customerCreditPurchases}
        customerCreditAdjustmentsNet={customerCreditAdjustmentsNet}
        customerCreditEntries={customerCreditEntries}
        highlightedSourceId={highlightedSourceId}
      />

      <HaulerEntryModal
        showAddModal={showAddModal}
        saveManualEntry={saveManualEntry}
        selectedHauler={selectedHauler}
        setShowAddModal={setShowAddModal}
        setFormError={setFormError}
        formError={formError}
        form={form}
        setFormValue={setFormValue}
        manualTypeOptions={manualTypeOptions}
        addHaulingLineItem={addHaulingLineItem}
        selectedHaulerTrucks={selectedHaulerTrucks}
        setHaulingLineTruck={setHaulingLineTruck}
        updateHaulingLineItem={updateHaulingLineItem}
        removeHaulingLineItem={removeHaulingLineItem}
        haulingLineTotals={haulingLineTotals}
        haulingServiceAmount={haulingServiceAmount}
        saving={saving}
      />

      <CustomerCreditModal
        showCustomerCreditModal={showCustomerCreditModal}
        selectedCustomer={selectedCustomer}
        saveCustomerCreditEntry={saveCustomerCreditEntry}
        setShowCustomerCreditModal={setShowCustomerCreditModal}
        setFormError={setFormError}
        formError={formError}
        customerAvailableCredit={customerAvailableCredit}
        customerCreditForm={customerCreditForm}
        setCustomerCreditFormValue={setCustomerCreditFormValue}
        customerCreditTypeOptions={customerCreditTypeOptions}
        saving={saving}
      />

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
