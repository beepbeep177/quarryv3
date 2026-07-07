import { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  PlusCircle,
  Search,
  Filter,
  Layers,
  Trash2,
  Pencil,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { TransactionWithRelations, PaymentMode } from '../lib/database.types';
import ReadOnlyNotice from './ReadOnlyNotice';
import Pagination from './Pagination';
import { paginate } from '../lib/pagination';

const PAGE_SIZE = 10;

interface DailyLedgerProps {
  onAddEntry: () => void;
  onEditEntry: (tx: TransactionWithRelations) => void;
  refreshKey: number;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

const today = new Date().toISOString().split('T')[0];

function fmt(v: number) {
  return v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatVolume(v: number) {
  return v.toFixed(2);
}

export default function DailyLedger({ onAddEntry, onEditEntry, refreshKey, canAdd, canEdit, canDelete }: DailyLedgerProps) {
  const [transactions, setTransactions] = useState<TransactionWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState<PaymentMode | 'ALL'>('ALL');
  const [productFilter, setProductFilter] = useState<string>('ALL');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [attachmentPreview, setAttachmentPreview] = useState<string[] | null>(null);
  const [attachmentPreviewLoading, setAttachmentPreviewLoading] = useState(false);
  const canManage = canAdd || canEdit || canDelete;

  useEffect(() => { fetchTransactions(); }, [refreshKey]);
  useEffect(() => { setPage(1); }, [search, modeFilter, productFilter, refreshKey]);

  async function fetchTransactions() {
    setLoading(true);
    const { data } = await supabase
      .from('transactions')
      .select('*, customers(*), trucks(*)')
      .eq('transaction_date', today)
      .order('created_at', { ascending: false });
    setTransactions((data ?? []) as TransactionWithRelations[]);
    setLoading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this entry?')) return;
    setDeletingId(id);
    await supabase.from('transactions').delete().eq('id', id);
    setTransactions(prev => prev.filter(t => t.id !== id));
    setDeletingId(null);
  }

  async function handleOpenAttachments(attachments: string[]) {
    setAttachmentPreview([]);
    setAttachmentPreviewLoading(true);
    const signedUrls = await Promise.all(attachments.map(async (attachment) => {
      if (/^https?:\/\//i.test(attachment)) return attachment;
      const { data, error } = await supabase.storage
        .from('transaction-attachments')
        .createSignedUrl(attachment, 60 * 60);
      if (error || !data?.signedUrl) return null;
      return data.signedUrl;
    }));
    setAttachmentPreview(signedUrls.filter((url): url is string => !!url));
    setAttachmentPreviewLoading(false);
  }

  const availableProducts = useMemo(() => {
    const products = [...new Set(transactions.map(t => t.material_type).filter(Boolean))].sort();
    return products;
  }, [transactions]);

  const filtered = transactions.filter(t => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      t.dr_number.toLowerCase().includes(q) ||
      (t.customers?.name ?? '').toLowerCase().includes(q) ||
      (t.trucks?.plate_number ?? '').toLowerCase().includes(q);
    const matchMode = modeFilter === 'ALL' || t.payment_mode === modeFilter;
    const matchProduct = productFilter === 'ALL' || t.material_type === productFilter;
    return matchSearch && matchMode && matchProduct;
  });

  const totals = filtered.reduce(
    (acc, t) => ({
      volume: acc.volume + (t.volume_m3 ?? 0),
      amount: acc.amount + (t.total_amount ?? 0),
    }),
    { volume: 0, amount: 0 }
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedTransactions = useMemo(() => paginate(filtered, currentPage, PAGE_SIZE), [filtered, currentPage]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Today's Ledger</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        {canAdd && (
          <button
            onClick={onAddEntry}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors shadow-sm shadow-emerald-200"
          >
            <PlusCircle size={16} />
            Add Entry
          </button>
        )}
      </div>

      {!canManage && <ReadOnlyNotice message="This user group can review daily transactions only." />}

      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search DR#, customer, truck..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 bg-white"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter size={14} className="text-slate-400" />
          {(['ALL', 'CASH', 'P.O', 'OFFSET', 'GCASH', 'BANK_TRANSFER', 'DONATION', 'SPLIT'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setModeFilter(mode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                modeFilter === mode
                  ? mode === 'CASH' ? 'bg-emerald-500 text-white'
                    : mode === 'P.O' ? 'bg-amber-500 text-white'
                    : mode === 'OFFSET' ? 'bg-slate-600 text-white'
                    : mode === 'GCASH' ? 'bg-blue-500 text-white'
                    : mode === 'BANK_TRANSFER' ? 'bg-violet-500 text-white'
                    : mode === 'DONATION' ? 'bg-rose-500 text-white'
                    : mode === 'SPLIT' ? 'bg-cyan-500 text-white'
                    : 'bg-slate-800 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {mode === 'BANK_TRANSFER' ? 'BANK' : mode === 'DONATION' ? 'DONATE' : mode}
            </button>
          ))}
        </div>
        {availableProducts.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-slate-400 font-medium">Product:</span>
            <select
              value={productFilter}
              onChange={e => setProductFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
            >
              <option value="ALL">ALL</option>
              {availableProducts.map(product => (
                <option key={product} value={product}>
                  {product}
                </option>
              ))}
            </select>
          </div>
        )}
        <button onClick={fetchTransactions} disabled={loading} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
            <RefreshCw size={16} className="animate-spin" /> Loading transactions...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Layers size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">No transactions found</p>
            {canAdd && (
              <button onClick={onAddEntry} className="mt-3 text-sm text-emerald-600 font-medium hover:text-emerald-700">
                Add first entry
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">#</th>
                    <th className="px-4 py-3 text-left">DR #</th>
                    <th className="px-4 py-3 text-left">Customer</th>
                    <th className="px-4 py-3 text-left">Truck</th>
                    <th className="px-4 py-3 text-left">Product</th>
                    <th className="px-4 py-3 text-right">Volume (m³)</th>
                    <th className="px-4 py-3 text-right">Unit Price</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right">Extras</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-center">Mode</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-left">Notes</th>
                    <th className="px-4 py-3 text-left">Attachments</th>
                    {(canEdit || canDelete) && <th className="px-4 py-3"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedTransactions.map((tx, idx) => {
                    const extras = (tx.dr_capitol ?? 0) + (tx.passway ?? 0) + (tx.kulot ?? 0);
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-4 py-3 text-slate-400 text-xs">{(currentPage - 1) * PAGE_SIZE + idx + 1}</td>
                        <td className="px-4 py-3 font-mono font-semibold text-slate-700">{tx.dr_number}</td>
                        <td className="px-4 py-3 text-slate-700 max-w-36">
                          <p className="truncate">{tx.customers?.name ?? '—'}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{tx.trucks?.plate_number ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{tx.material_type || '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-600 tabular-nums">{formatVolume(tx.volume_m3 ?? 0)}</td>
                        <td className="px-4 py-3 text-right text-slate-500 tabular-nums">₱{fmt(tx.unit_price)}</td>
                        <td className="px-4 py-3 text-right text-slate-700 tabular-nums">₱{fmt(tx.amount)}</td>
                        <td className="px-4 py-3 text-right text-slate-500 tabular-nums text-xs">
                          {extras > 0 ? `+₱${fmt(extras)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800 tabular-nums">₱{fmt(tx.total_amount)}</td>
                        <td className="px-4 py-3 text-center"><PaymentBadge mode={tx.payment_mode} /></td>
                        <td className="px-4 py-3 text-center"><StatusBadge status={tx.status} /></td>
                        <td className="px-4 py-3 text-xs text-slate-500 max-w-40">
                          <p className="truncate" title={tx.notes || undefined}>{tx.notes || '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {(tx.attachment_urls?.length ?? 0) > 0 ? (
                            <button
                              onClick={() => handleOpenAttachments(tx.attachment_urls)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                            >
                              <ImageIcon size={12} />
                              View ({tx.attachment_urls.length})
                            </button>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        {(canEdit || canDelete) && (
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                              {canEdit && (
                                <button
                                  onClick={() => onEditEntry(tx)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                                >
                                  <Pencil size={14} />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  onClick={() => handleDelete(tx.id)}
                                  disabled={deletingId === tx.id}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={currentPage} pageSize={PAGE_SIZE} totalItems={filtered.length} onPageChange={setPage} />

            <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-sm">
              <span className="text-slate-400 font-medium">{filtered.length} entries</span>
              <div className="flex items-center gap-8">
                <div className="text-right">
                  <p className="text-slate-500 text-xs">Total Volume</p>
                  <p className="text-emerald-400 font-bold tabular-nums">{formatVolume(totals.volume)} m³</p>
                </div>
                <div className="text-right">
                  <p className="text-slate-500 text-xs">Total Amount</p>
                  <p className="text-white font-bold tabular-nums">₱{fmt(totals.amount)}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {attachmentPreview && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-xl shadow-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Transaction Attachments</p>
              <button
                onClick={() => setAttachmentPreview(null)}
                className="w-7 h-7 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 flex items-center justify-center"
              >
                <X size={14} />
              </button>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[70vh] overflow-y-auto">
              {attachmentPreviewLoading ? (
                <div className="col-span-full text-sm text-slate-500">Loading attachments...</div>
              ) : attachmentPreview.length === 0 ? (
                <div className="col-span-full text-sm text-slate-500">No attachments available.</div>
              ) : (
                attachmentPreview.map((url, index) => (
                  <a key={`${url}-${index}`} href={url} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border border-slate-200">
                    <img src={url} alt={`Attachment ${index + 1}`} className="w-full h-44 object-cover bg-slate-50" />
                  </a>
                ))
              )}
            </div>
          </div>
        </div>
      )}
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

function StatusBadge({ status }: { status: string }) {
  if (status === 'PAID') return <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200">PAID</span>;
  return <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-600 border border-amber-200">PENDING</span>;
}
