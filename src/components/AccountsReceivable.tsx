import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ReceiptText, CheckCircle, Search, TrendingDown, Download, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { TransactionWithRelations } from '../lib/database.types';
import ReadOnlyNotice from './ReadOnlyNotice';
import Pagination from './Pagination';
import { paginate } from '../lib/pagination';

const PAGE_SIZE = 10;

function fmt(v: number) {
  return v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatVolume(v: number) {
  return v.toFixed(2);
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
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
  const [records, setRecords] = useState<TransactionWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => { fetchAR(); }, []);
  useEffect(() => { setPage(1); }, [search]);

  async function fetchAR() {
    setLoading(true);
    const { data } = await supabase
      .from('transactions')
      .select('*, customers(*), trucks(*)')
      .in('payment_mode', ['P.O', 'OFFSET'])
      .eq('status', 'PENDING')
      .order('transaction_date', { ascending: true });
    setRecords((data ?? []) as TransactionWithRelations[]);
    setLoading(false);
  }

  async function markPaid(id: string) {
    setMarkingId(id);
    await supabase.from('transactions').update({ status: 'PAID' }).eq('id', id);
    setRecords(prev => prev.filter(r => r.id !== id));
    setMarkingId(null);
  }

  const filtered = records.filter(r => {
    const q = search.toLowerCase();
    return !q || (r.customers?.name ?? '').toLowerCase().includes(q) || r.dr_number.toLowerCase().includes(q);
  });

  const totalPending = filtered.reduce((s, r) => s + (r.total_amount ?? 0), 0);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRecords = useMemo(() => paginate(filtered, currentPage, PAGE_SIZE), [filtered, currentPage]);

  const uniqueCustomerNames = useMemo(() => {
    const names = new Set(filtered.map(r => r.customers?.name ?? '').filter(Boolean));
    return [...names];
  }, [filtered]);

  function exportCsv() {
    if (filtered.length === 0) { alert('No records to export.'); return; }
    const headers = ['Date', 'DR Number', 'Customer', 'Volume (m3)', 'Amount', 'Mode', 'Payment Status'];
    const rows = filtered.map(r => [
      fmtDate(r.transaction_date),
      r.dr_number,
      r.customers?.name ?? '',
      r.volume_m3 ?? 0,
      r.total_amount ?? 0,
      r.payment_mode,
      r.status,
    ]);
    const totalRow = ['TOTAL', '', '', filtered.reduce((s, r) => s + (r.volume_m3 ?? 0), 0), totalPending, '', ''];
    const filterLine = search ? `Filter: ${search}` : 'All pending P.O and OFFSET transactions';
    const lines = [
      [`Accounts Receivable Report`],
      [filterLine],
      [`Generated: ${new Date().toLocaleString('en-PH')}`],
      [],
      headers,
      ...rows,
      totalRow,
    ];
    const csv = `\uFEFF${lines.map(row => row.map(cell => csvEscape(cell)).join(',')).join('\r\n')}`;
    const slug = search ? search.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : 'all';
    downloadTextFile(`accounts-receivable-${slug}-${new Date().toISOString().split('T')[0]}.csv`, csv, 'text/csv;charset=utf-8');
  }

  function exportPdf() {
    if (filtered.length === 0) { alert('No records to export.'); return; }
    const generated = new Date().toLocaleString('en-PH');
    const isSingleCustomer = uniqueCustomerNames.length === 1;
    const reportTitle = isSingleCustomer
      ? `Statement of Account — ${uniqueCustomerNames[0]}`
      : 'Accounts Receivable Report';
    const filterNote = search ? `Filter: ${htmlEscape(search)}` : 'All pending P.O and OFFSET transactions';
    const totalVolume = filtered.reduce((s, r) => s + (r.volume_m3 ?? 0), 0);

    const rowsHtml = filtered.map(r => `
      <tr>
        <td>${htmlEscape(fmtDate(r.transaction_date))}</td>
        <td>${htmlEscape(r.dr_number)}</td>
        <td>${htmlEscape(r.customers?.name ?? '—')}</td>
        <td class="num">${htmlEscape(formatVolume(r.volume_m3 ?? 0))}</td>
        <td class="num">${htmlEscape(r.payment_mode)}</td>
        <td class="num">₱${htmlEscape(fmt(r.total_amount ?? 0))}</td>
      </tr>`).join('');

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow pop-ups to export the report PDF.');
      return;
    }
    printWindow.document.write(`<!doctype html>
      <html>
        <head>
          <title>${htmlEscape(reportTitle)}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; margin: 32px; }
            h1 { font-size: 20px; margin: 0 0 4px; }
            .subtitle { color: #92400e; font-size: 12px; margin: 0 0 16px; }
            .meta { color: #475569; font-size: 11px; line-height: 1.55; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th { text-align: left; background: #f1f5f9; color: #475569; text-transform: uppercase; letter-spacing: .03em; }
            th, td { border: 1px solid #e2e8f0; padding: 7px 8px; }
            td.num, th.num { text-align: right; }
            tfoot td { background: #0f172a; color: white; font-weight: 700; }
            tfoot td.num { text-align: right; }
            @media print { body { margin: 18mm; } }
          </style>
        </head>
        <body>
          <h1>${htmlEscape(reportTitle)}</h1>
          <p class="subtitle">Pending P.O and OFFSET Transactions</p>
          <div class="meta">
            <div>${filterNote}</div>
            <div>Generated: ${htmlEscape(generated)}</div>
            <div>${filtered.length} pending transaction${filtered.length !== 1 ? 's' : ''} &nbsp;|&nbsp; Total Outstanding: ₱${htmlEscape(fmt(totalPending))}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>DR #</th>
                <th>Customer</th>
                <th class="num">Volume (m³)</th>
                <th class="num">Mode</th>
                <th class="num">Amount Due</th>
              </tr>
            </thead>
            <tbody>${rowsHtml || `<tr><td colspan="6">No records found.</td></tr>`}</tbody>
            <tfoot>
              <tr>
                <td colspan="3">Total Outstanding</td>
                <td class="num">${htmlEscape(formatVolume(totalVolume))} m³</td>
                <td></td>
                <td class="num">₱${htmlEscape(fmt(totalPending))}</td>
              </tr>
            </tfoot>
          </table>
        </body>
      </html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }


  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Accounts Receivable</h1>
          <p className="text-slate-500 text-sm mt-0.5">Pending P.O and OFFSET transactions</p>
        </div>
        <button onClick={fetchAR} disabled={loading} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {!canEdit && <ReadOnlyNotice message="This user group can review outstanding balances only." />}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
          <TrendingDown size={22} className="text-amber-600" />
        </div>
        <div>
          <p className="text-sm text-amber-700 font-medium">Total Outstanding</p>
          <p className="text-2xl font-bold text-amber-800 tabular-nums">₱{fmt(totalPending)}</p>
          <p className="text-xs text-amber-600">{filtered.length} pending transaction{filtered.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative max-w-sm flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search customer or DR#..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 bg-white" />
        </div>
        <button onClick={exportCsv} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60 text-sm font-semibold transition-colors">
          <Download size={15} />
          CSV
        </button>
        <button onClick={exportPdf} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60 text-sm font-semibold transition-colors">
          <FileText size={15} />
          PDF
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
            <RefreshCw size={16} className="animate-spin" /> Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <ReceiptText size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">No outstanding receivables</p>
            <p className="text-slate-400 text-xs mt-1">All accounts are settled!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">DR #</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-right">Volume (m³)</th>
                  <th className="px-4 py-3 text-right">Total Amount</th>
                  <th className="px-4 py-3 text-center">Mode</th>
                  {canEdit && <th className="px-4 py-3 text-center">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedRecords.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {new Date(r.transaction_date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-slate-700">{r.dr_number}</td>
                    <td className="px-4 py-3 text-slate-700">{r.customers?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-600 font-semibold">{formatVolume(r.volume_m3 ?? 0)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-800">₱{fmt(r.total_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      {r.payment_mode === 'P.O'
                        ? <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">P.O</span>
                        : <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">OFFSET</span>}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => markPaid(r.id)}
                          disabled={markingId === r.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors disabled:opacity-60"
                        >
                          {markingId === r.id ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                          Mark Paid
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={currentPage} pageSize={PAGE_SIZE} totalItems={filtered.length} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
