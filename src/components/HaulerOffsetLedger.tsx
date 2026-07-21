import { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
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
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Customer, HaulerOffsetLedgerRow, Json, Truck as TruckType } from '../lib/database.types';
import Pagination from './Pagination';
import ReadOnlyNotice from './ReadOnlyNotice';
import { paginate } from '../lib/pagination';

const PAGE_SIZE = 10;

type HaulerTruck = TruckType & { customers?: Customer | null };
type LedgerEntry = HaulerOffsetLedgerRow & { row_kind: 'ENTRY' };
type ManualType = 'HAULING_SERVICE' | 'CASH_PAYMENT' | 'OPENING_BALANCE' | 'ADJUSTMENT';
type EntrySide = 'DEBIT' | 'CREDIT';
type QuickFilter = 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_QUARTER' | 'CUSTOM';

interface HaulerOffsetLedgerProps {
  canAdd?: boolean;
  canAdjust?: boolean;
  canExport?: boolean;
  canViewDetail?: boolean;
  canViewStatement?: boolean;
  canExportStatement?: boolean;
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
  truck_plate: string;
  driver_name: string;
  rate_per_trip: string;
  payment_method: string;
  payment_reference: string;
  reason: string;
}

function todayInput() {
  return new Date().toISOString().split('T')[0];
}

function toInputDate(date: Date) {
  return date.toISOString().split('T')[0];
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
    truck_plate: '',
    driver_name: '',
    rate_per_trip: '',
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
}: HaulerOffsetLedgerProps) {
  const initialRange = monthRange();
  const [haulers, setHaulers] = useState<Customer[]>([]);
  const [haulerId, setHaulerId] = useState('');
  const [dateFrom, setDateFrom] = useState(initialRange.start);
  const [dateTo, setDateTo] = useState(initialRange.end);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('THIS_MONTH');
  const [search, setSearch] = useState('');
  const [ledgerRows, setLedgerRows] = useState<HaulerOffsetLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);
  const [form, setForm] = useState<EntryForm>(() => emptyForm(canAdd ? 'HAULING_SERVICE' : 'OPENING_BALANCE'));

  const canManualAdd = canAdd || canAdjust;
  const summary = ledgerRows.find(row => row.row_kind === 'SUMMARY');
  const selectedHauler = haulers.find(hauler => hauler.id === haulerId) ?? null;
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

  const openingBalance = summary?.opening_balance ?? 0;
  const haulingEarnings = summary?.hauling_earnings ?? 0;
  const productOffsets = summary?.product_offsets ?? 0;
  const dieselOffsets = summary?.diesel_offsets ?? 0;
  const cashPayments = summary?.cash_payments ?? 0;
  const adjustmentsNet = (summary?.adjustments_credit ?? 0) - (summary?.adjustments_debit ?? 0);
  const closingBalance = summary?.closing_balance ?? 0;

  useEffect(() => {
    fetchHaulers();
  }, []);

  useEffect(() => {
    if (haulerId) fetchLedger();
  }, [haulerId, dateFrom, dateTo]);

  useEffect(() => {
    setPage(1);
  }, [haulerId, dateFrom, dateTo, search]);

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

    const unique = new Map<string, Customer>();
    ((data ?? []) as HaulerTruck[]).forEach(truck => {
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

  async function fetchLedger() {
    if (!haulerId) return;
    setLoading(true);
    setError('');

    const { data, error: ledgerError } = await supabase.rpc('get_hauler_offset_ledger', {
      p_hauler_id: haulerId,
      p_date_from: dateFrom,
      p_date_to: dateTo,
    });

    if (ledgerError) {
      setError(ledgerError.message);
      setLedgerRows([]);
    } else {
      setLedgerRows((data ?? []) as HaulerOffsetLedgerRow[]);
    }
    setLoading(false);
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

  function openAddModal() {
    setForm(emptyForm(canAdd ? 'HAULING_SERVICE' : 'OPENING_BALANCE'));
    setShowAddModal(true);
  }

  function setFormValue<K extends keyof EntryForm>(key: K, value: EntryForm[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function buildDetails() {
    const details: Record<string, string | number> = {};
    if (form.transaction_type === 'HAULING_SERVICE') {
      if (form.trip_count) details.trip_count = Number(form.trip_count) || 0;
      if (form.truck_count) details.truck_count = Number(form.truck_count) || 0;
      if (form.truck_plate) details.truck_plate = form.truck_plate.trim();
      if (form.driver_name) details.driver_name = form.driver_name.trim();
      if (form.rate_per_trip) details.rate_per_trip = Number(form.rate_per_trip) || 0;
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
    if (!haulerId || !canManualAdd) return;
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }

    setSaving(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('create_hauler_offset_entry', {
      p_hauler_id: haulerId,
      p_transaction_date: form.transaction_date,
      p_transaction_type: form.transaction_type,
      p_reference_no: form.reference_no.trim(),
      p_description: form.description.trim(),
      p_amount: amount,
      p_entry_side: form.transaction_type === 'OPENING_BALANCE' || form.transaction_type === 'ADJUSTMENT' ? form.entry_side : null,
      p_remarks: form.remarks.trim(),
      p_details: buildDetails() as Json,
    });
    setSaving(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setShowAddModal(false);
    await fetchLedger();
  }

  async function voidManualEntry(entry: LedgerEntry) {
    if (!canAdjust || entry.source_module !== 'hauler_offset_entries' || !entry.source_id) return;
    const reason = prompt('Void reason?');
    if (reason === null) return;
    setSaving(true);
    const { error: rpcError } = await supabase.rpc('void_hauler_offset_entry', {
      p_entry_id: entry.source_id,
      p_reason: reason,
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setSelectedEntry(null);
    await fetchLedger();
  }

  function exportExcel() {
    if (!canExport || filteredEntries.length === 0) {
      alert('No ledger rows to export.');
      return;
    }

    const lines = [
      ['Hauler Offset Ledger'],
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
    downloadTextFile(`hauler-offset-ledger-${slugify(selectedHauler?.name ?? 'hauler')}-${dateFrom}-${dateTo}.csv`, csv, 'text/csv;charset=utf-8');
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
      alert('Please allow pop-ups to export the statement PDF.');
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

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ReceiptText size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Hauler Offset Ledger</h1>
              <p className="text-slate-500 text-sm mt-0.5">Track hauling earnings, product offsets, diesel offsets, and payments.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canExport && (
            <button onClick={exportExcel} disabled={loading || filteredEntries.length === 0} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 text-sm font-semibold">
              <Download size={15} /> Export Excel
            </button>
          )}
          {canExportStatement && (
            <button onClick={printStatement} disabled={loading || !summary} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60 text-sm font-semibold">
              <FileText size={15} /> Export PDF
            </button>
          )}
          <button onClick={fetchLedger} disabled={loading || !haulerId} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-60">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {!canManualAdd && !canExport && <ReadOnlyNotice message="This user group can review hauler offset balances only." />}

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <Field label="Hauler">
            <select value={haulerId} onChange={e => setHaulerId(e.target.value)} className={inputClass}>
              <option value="">Select hauler...</option>
              {haulers.map(hauler => <option key={hauler.id} value={hauler.id}>{hauler.name}</option>)}
            </select>
          </Field>
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
            {canManualAdd && (
              <button onClick={openAddModal} disabled={!haulerId} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60">
                <Plus size={16} /> Add Transaction
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {loading ? (
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
                          className={`hover:bg-slate-50 transition-colors ${canViewDetail ? 'cursor-pointer' : ''}`}
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
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={saveManualEntry} className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Add Hauler Transaction</h2>
                <p className="text-xs text-slate-500 mt-1">{selectedHauler?.name}</p>
              </div>
              <button type="button" onClick={() => setShowAddModal(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>

            <div className="p-6 space-y-5">
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
                <Field label="Amount">
                  <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setFormValue('amount', e.target.value)} className={inputClass} />
                </Field>
                {(form.transaction_type === 'OPENING_BALANCE' || form.transaction_type === 'ADJUSTMENT') && (
                  <Field label="Entry Side">
                    <select value={form.entry_side} onChange={e => setFormValue('entry_side', e.target.value as EntrySide)} className={inputClass}>
                      <option value="CREDIT">Credit (+ company owes hauler)</option>
                      <option value="DEBIT">Debit (- hauler owes / offset)</option>
                    </select>
                  </Field>
                )}
                <Field label="Description">
                  <input value={form.description} onChange={e => setFormValue('description', e.target.value)} className={inputClass} placeholder="Short transaction description" />
                </Field>
              </div>

              {form.transaction_type === 'HAULING_SERVICE' && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className="text-xs font-bold uppercase text-slate-500 mb-3">Hauling Details</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label="Trips"><input type="number" min="0" value={form.trip_count} onChange={e => setFormValue('trip_count', e.target.value)} className={inputClass} /></Field>
                    <Field label="Trucks"><input type="number" min="0" value={form.truck_count} onChange={e => setFormValue('truck_count', e.target.value)} className={inputClass} /></Field>
                    <Field label="Rate / Trip"><input type="number" min="0" step="0.01" value={form.rate_per_trip} onChange={e => setFormValue('rate_per_trip', e.target.value)} className={inputClass} /></Field>
                    <Field label="Truck / Plate"><input value={form.truck_plate} onChange={e => setFormValue('truck_plate', e.target.value)} className={inputClass} /></Field>
                    <Field label="Driver"><input value={form.driver_name} onChange={e => setFormValue('driver_name', e.target.value)} className={inputClass} /></Field>
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
              <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60">
                {saving ? 'Saving...' : 'Save Transaction'}
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
