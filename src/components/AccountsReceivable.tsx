import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Download, FileText, History, ReceiptText, RefreshCw, RotateCcw, Search, TrendingDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { CustomerCreditEntry, ReceivableSettlementHistoryRow, TransactionWithRelations } from '../lib/database.types';
import { getReceivableAmount, getReceivableModeLabel } from '../lib/payment';
import { fetchAllPages } from '../lib/fetchAll';
import ReadOnlyNotice from './ReadOnlyNotice';
import Pagination from './Pagination';
import { paginate } from '../lib/pagination';
import ActionModal from './ActionModal';

const PAGE_SIZE = 10;
const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200';

type SettlementMethod = 'CASH' | 'GCASH' | 'BANK_TRANSFER' | 'CHECK' | 'OTHER';
type ReceivableRecord = TransactionWithRelations & { amountDue: number; modeLabel: string };

function fmt(value: number) {
  return value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatVolume(value: number) {
  return value.toFixed(2);
}

function fmtDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function todayInput() {
  const today = new Date();
  return [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
}

function htmlEscape(value: string | number) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function csvEscape(value: string | number) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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

export default function AccountsReceivable({ canEdit = false }: { canEdit?: boolean }) {
  const [records, setRecords] = useState<ReceivableRecord[]>([]);
  const [history, setHistory] = useState<ReceivableSettlementHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [customerCreditBalances, setCustomerCreditBalances] = useState<Record<string, number>>({});
  const [actionError, setActionError] = useState('');
  const [infoModal, setInfoModal] = useState('');
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [settlementTarget, setSettlementTarget] = useState<ReceivableRecord | null>(null);
  const [voidTarget, setVoidTarget] = useState<ReceivableSettlementHistoryRow | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [settlementForm, setSettlementForm] = useState({
    settlement_date: todayInput(),
    payment_method: 'CASH' as SettlementMethod,
    reference_no: '',
    remarks: '',
  });

  useEffect(() => { void fetchAR(); }, []);
  useEffect(() => { setPage(1); }, [search]);

  async function fetchAR() {
    setLoading(true);
    setActionError('');

    const [transactionsResult, creditResult, historyResult] = await Promise.all([
      fetchAllPages<TransactionWithRelations>(async (from, to) => {
        const result = await supabase
          .from('transactions')
          .select('*, customers(*), trucks(*)')
          .in('payment_mode', ['P.O', 'OFFSET', 'SPLIT'])
          .eq('status', 'PENDING')
          .order('transaction_date', { ascending: true })
          .range(from, to);
        return { data: result.data as TransactionWithRelations[] | null, error: result.error };
      }),
      fetchAllPages<Pick<CustomerCreditEntry, 'customer_id' | 'debit_amount' | 'credit_amount' | 'status'>>(async (from, to) => {
        const result = await supabase
          .from('customer_credit_entries')
          .select('customer_id, debit_amount, credit_amount, status')
          .eq('status', 'ACTIVE')
          .range(from, to);
        return { data: result.data, error: result.error };
      }),
      supabase.rpc('get_receivable_settlement_history', { p_limit: 200 }),
    ]);

    const firstError = transactionsResult.error || creditResult.error || historyResult.error;
    if (firstError) setActionError(firstError.message);

    setRecords((transactionsResult.data ?? [])
      .map(transaction => ({
        ...transaction,
        amountDue: getReceivableAmount(transaction),
        modeLabel: getReceivableModeLabel(transaction),
      }))
      .filter(transaction => transaction.amountDue > 0));

    setCustomerCreditBalances((creditResult.data ?? []).reduce<Record<string, number>>((map, row) => {
      map[row.customer_id] = (map[row.customer_id] ?? 0) + Number(row.credit_amount ?? 0) - Number(row.debit_amount ?? 0);
      return map;
    }, {}));
    setHistory((historyResult.data ?? []) as ReceivableSettlementHistoryRow[]);
    setLoading(false);
  }

  async function settleWithCredit(record: ReceivableRecord) {
    setSavingId(record.id);
    setActionError('');
    const { error } = await supabase.rpc('settle_receivable_with_customer_credit', {
      p_transaction_id: record.id,
      p_settlement_date: todayInput(),
      p_remarks: 'Settled from Accounts Receivable',
    });
    setSavingId(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    await fetchAR();
  }

  async function saveSettlement() {
    if (!settlementTarget) return;
    setSavingId(settlementTarget.id);
    setActionError('');
    const { error } = await supabase.rpc('settle_receivable', {
      p_transaction_id: settlementTarget.id,
      p_settlement_date: settlementForm.settlement_date,
      p_payment_method: settlementForm.payment_method,
      p_reference_no: settlementForm.reference_no.trim(),
      p_remarks: settlementForm.remarks.trim(),
    });
    setSavingId(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    setSettlementTarget(null);
    setSettlementForm({ settlement_date: todayInput(), payment_method: 'CASH', reference_no: '', remarks: '' });
    await fetchAR();
  }

  async function voidSettlement() {
    if (!voidTarget || !voidReason.trim()) return;
    setSavingId(voidTarget.settlement_id);
    setActionError('');
    const { error } = voidTarget.settlement_kind === 'CUSTOMER_CREDIT'
      ? await supabase.rpc('void_customer_credit_settlement', { p_settlement_id: voidTarget.settlement_id, p_reason: voidReason.trim() })
      : await supabase.rpc('void_receivable_settlement', { p_settlement_id: voidTarget.settlement_id, p_reason: voidReason.trim() });
    setSavingId(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    setVoidTarget(null);
    setVoidReason('');
    await fetchAR();
  }

  const filtered = useMemo(() => records.filter(record => {
    const query = search.toLowerCase();
    return !query
      || (record.customers?.name ?? '').toLowerCase().includes(query)
      || record.dr_number.toLowerCase().includes(query)
      || record.modeLabel.toLowerCase().includes(query);
  }), [records, search]);

  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const pagedRecords = useMemo(() => paginate(filtered, currentPage, PAGE_SIZE), [filtered, currentPage]);
  const currentHistoryPage = Math.min(historyPage, Math.max(1, Math.ceil(history.length / PAGE_SIZE)));
  const pagedHistory = useMemo(() => paginate(history, currentHistoryPage, PAGE_SIZE), [history, currentHistoryPage]);
  const totalPending = filtered.reduce((sum, record) => sum + record.amountDue, 0);
  const totalVolume = filtered.reduce((sum, record) => sum + (record.volume_m3 ?? 0), 0);

  function exportCsv() {
    if (filtered.length === 0) { setInfoModal('No records to export.'); return; }
    const rows = filtered.map(record => [record.transaction_date, record.dr_number, record.customers?.name ?? '', formatVolume(record.volume_m3 ?? 0), record.modeLabel, record.total_amount, record.amountDue]);
    const lines = [
      ['Accounts Receivable'],
      [`Generated: ${new Date().toLocaleString('en-PH')}`],
      [],
      ['Date', 'DR #', 'Customer', 'Volume (m3)', 'Mode', 'Transaction Total', 'Amount Due'],
      ...rows,
      ['', '', 'Total', formatVolume(totalVolume), '', '', totalPending],
    ];
    downloadTextFile('accounts-receivable.csv', `\uFEFF${lines.map(row => row.map(csvEscape).join(',')).join('\r\n')}`, 'text/csv;charset=utf-8');
  }

  function exportPdf() {
    if (filtered.length === 0) { setInfoModal('No records to export.'); return; }
    const printWindow = window.open('', '_blank');
    if (!printWindow) { setInfoModal('Please allow pop-ups to export the report PDF.'); return; }
    const rowsHtml = filtered.map(record => `<tr>
      <td>${htmlEscape(fmtDate(record.transaction_date))}</td><td>${htmlEscape(record.dr_number)}</td>
      <td>${htmlEscape(record.customers?.name ?? '')}</td><td class="num">${htmlEscape(formatVolume(record.volume_m3 ?? 0))}</td>
      <td>${htmlEscape(record.modeLabel)}</td><td class="num">PHP ${htmlEscape(fmt(record.amountDue))}</td>
    </tr>`).join('');
    printWindow.document.write(`<!doctype html><html><head><title>Accounts Receivable</title><style>
      body{font-family:Arial,sans-serif;color:#0f172a;margin:32px}h1{font-size:22px;margin:0 0 6px}.meta{color:#64748b;font-size:12px;margin-bottom:18px}
      table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #e2e8f0;padding:7px 8px}th{background:#f1f5f9;text-align:left}.num{text-align:right}tfoot td{background:#0f172a;color:#fff;font-weight:700}@media print{body{margin:18mm}}
      </style></head><body><h1>Accounts Receivable</h1><div class="meta">Pending P.O/OFFSET portions, including split payments<br>Generated: ${htmlEscape(new Date().toLocaleString('en-PH'))}</div>
      <table><thead><tr><th>Date</th><th>DR #</th><th>Customer</th><th class="num">Volume</th><th>Mode</th><th class="num">Amount Due</th></tr></thead>
      <tbody>${rowsHtml}</tbody><tfoot><tr><td colspan="3">Total Outstanding</td><td class="num">${htmlEscape(formatVolume(totalVolume))} m3</td><td></td><td class="num">PHP ${htmlEscape(fmt(totalPending))}</td></tr></tfoot></table></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-slate-800">Accounts Receivable</h1><p className="mt-0.5 text-sm text-slate-500">Pending P.O and OFFSET amounts, including split payments</p></div>
        <button onClick={() => void fetchAR()} disabled={loading} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100" title="Refresh"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      {!canEdit && <ReadOnlyNotice message="This user group can review outstanding balances and settlements only." />}
      {actionError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div>}

      <div className="flex items-center gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-100"><TrendingDown size={22} className="text-amber-600" /></div>
        <div><p className="text-sm font-medium text-amber-700">Total Outstanding</p><p className="text-2xl font-bold tabular-nums text-amber-800">PHP {fmt(totalPending)}</p><p className="text-xs text-amber-600">{filtered.length} pending transaction{filtered.length !== 1 ? 's' : ''}</p></div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 max-w-sm flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search customer, DR, or mode..." className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200" /></div>
        <button onClick={exportCsv} disabled={loading} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"><Download size={15} /> CSV</button>
        <button onClick={exportPdf} disabled={loading} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"><FileText size={15} /> PDF</button>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {loading ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400"><RefreshCw size={16} className="animate-spin" /> Loading...</div> : filtered.length === 0 ? <div className="py-16 text-center"><ReceiptText size={32} className="mx-auto mb-3 text-slate-300" /><p className="text-sm font-medium text-slate-500">No outstanding receivables</p></div> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-xs font-semibold uppercase text-slate-500"><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">DR #</th><th className="px-4 py-3 text-left">Customer</th><th className="px-4 py-3 text-right">Volume</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Amount Due</th><th className="px-4 py-3 text-center">Mode</th>{canEdit && <th className="px-4 py-3 text-center">Actions</th>}</tr></thead>
            <tbody className="divide-y divide-slate-100">{pagedRecords.map(record => <tr key={record.id} className="hover:bg-slate-50">
              <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{fmtDate(record.transaction_date)}</td><td className="px-4 py-3 font-mono font-semibold text-slate-700">{record.dr_number}</td><td className="px-4 py-3 text-slate-700">{record.customers?.name ?? '-'}</td><td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-600">{formatVolume(record.volume_m3 ?? 0)}</td><td className="px-4 py-3 text-right tabular-nums text-slate-500">PHP {fmt(record.total_amount)}</td><td className="px-4 py-3 text-right font-bold tabular-nums text-slate-800">PHP {fmt(record.amountDue)}</td><td className="px-4 py-3 text-center"><span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">{record.modeLabel}</span></td>
              {canEdit && <td className="px-4 py-3"><div className="flex items-center justify-center gap-2"><button onClick={() => void settleWithCredit(record)} disabled={savingId === record.id || (customerCreditBalances[record.customer_id] ?? 0) < record.amountDue} title={(customerCreditBalances[record.customer_id] ?? 0) < record.amountDue ? `Insufficient credit: PHP ${fmt(customerCreditBalances[record.customer_id] ?? 0)}` : 'Settle using customer credit'} className="rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-40">Use Credit</button><button onClick={() => setSettlementTarget(record)} disabled={savingId === record.id} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"><CheckCircle size={12} /> Record Payment</button></div></td>}
            </tr>)}</tbody>
          </table><Pagination page={currentPage} pageSize={PAGE_SIZE} totalItems={filtered.length} onPageChange={setPage} /></div>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4"><History size={17} className="text-slate-500" /><h2 className="font-semibold text-slate-800">Recent Settlements</h2></div>
        {history.length === 0 ? <div className="py-10 text-center text-sm text-slate-400">No settlement history yet</div> : <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="bg-slate-50 text-xs font-semibold uppercase text-slate-500"><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">DR #</th><th className="px-4 py-3 text-left">Customer</th><th className="px-4 py-3 text-left">Method</th><th className="px-4 py-3 text-left">Reference</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-center">Status</th>{canEdit && <th className="px-4 py-3" />}</tr></thead>
          <tbody className="divide-y divide-slate-100">{pagedHistory.map(row => <tr key={`${row.settlement_kind}-${row.settlement_id}`}><td className="px-4 py-3 text-xs text-slate-500">{fmtDate(row.settlement_date)}</td><td className="px-4 py-3 font-mono font-semibold text-slate-700">{row.dr_number}</td><td className="px-4 py-3 text-slate-700">{row.customer_name}</td><td className="px-4 py-3 text-slate-600">{row.payment_method.replace('_', ' ')}</td><td className="px-4 py-3 text-slate-500">{row.reference_no || '-'}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">PHP {fmt(row.amount)}</td><td className="px-4 py-3 text-center"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${row.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{row.status}</span></td>{canEdit && <td className="px-4 py-3 text-center">{row.status === 'ACTIVE' && <button onClick={() => setVoidTarget(row)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Void settlement"><RotateCcw size={14} /></button>}</td>}</tr>)}</tbody>
        </table><Pagination page={currentHistoryPage} pageSize={PAGE_SIZE} totalItems={history.length} onPageChange={setHistoryPage} /></div>}
      </div>

      <ActionModal open={!!settlementTarget} title="Record Receivable Payment" description={settlementTarget ? `${settlementTarget.dr_number} - PHP ${fmt(settlementTarget.amountDue)} due` : ''} variant="success" confirmLabel="Record Payment" loading={!!settlementTarget && savingId === settlementTarget.id} onClose={() => setSettlementTarget(null)} onConfirm={saveSettlement}>
        <div className="space-y-4"><label className="block text-xs font-semibold uppercase text-slate-500">Payment Date<input type="date" value={settlementForm.settlement_date} onChange={event => setSettlementForm(form => ({ ...form, settlement_date: event.target.value }))} className={`${inputClass} mt-1.5`} /></label><label className="block text-xs font-semibold uppercase text-slate-500">Payment Method<select value={settlementForm.payment_method} onChange={event => setSettlementForm(form => ({ ...form, payment_method: event.target.value as SettlementMethod }))} className={`${inputClass} mt-1.5`}><option value="CASH">Cash</option><option value="GCASH">GCash</option><option value="BANK_TRANSFER">Bank Transfer</option><option value="CHECK">Check</option><option value="OTHER">Other</option></select></label><label className="block text-xs font-semibold uppercase text-slate-500">OR / Reference<input value={settlementForm.reference_no} onChange={event => setSettlementForm(form => ({ ...form, reference_no: event.target.value }))} className={`${inputClass} mt-1.5`} placeholder="Optional reference" /></label><label className="block text-xs font-semibold uppercase text-slate-500">Remarks<textarea value={settlementForm.remarks} onChange={event => setSettlementForm(form => ({ ...form, remarks: event.target.value }))} className={`${inputClass} mt-1.5 resize-none`} rows={2} placeholder="Optional remarks" /></label></div>
      </ActionModal>
      <ActionModal open={!!voidTarget} title="Void Settlement" description="This reopens the receivable and preserves the settlement as voided history." variant="danger" confirmLabel="Void Settlement" loading={!!voidTarget && savingId === voidTarget.settlement_id} onClose={() => { setVoidTarget(null); setVoidReason(''); }} onConfirm={voidSettlement}><label className="block text-xs font-semibold uppercase text-slate-500">Reason<input value={voidReason} onChange={event => setVoidReason(event.target.value)} className={`${inputClass} mt-1.5`} placeholder="Required reason" /></label></ActionModal>
      <ActionModal open={!!infoModal} title="Export Notice" description={infoModal} variant="info" confirmLabel="Got It" showCancel={false} onClose={() => setInfoModal('')} onConfirm={() => setInfoModal('')} />
    </div>
  );
}
