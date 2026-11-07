import {
  Banknote,
  Eye,
  FileText,
  Loader2,
  ReceiptText,
  Scale,
  Search,
  Truck
} from 'lucide-react';
import type { Customer } from '../../lib/database.types';
import Pagination from '../Pagination';
import { StatementRow, SummaryCard } from './LedgerComponents';
import { balanceInterpretation, currency, formatDate, PAGE_SIZE, typeBadgeClass, typeLabel } from './ledgerUtils';
import type { LedgerEntry, OffsetLedgerTab } from './types';

interface HaulerLedgerViewProps {
  activeLedgerTab: OffsetLedgerTab;
  loading: boolean;
  haulers: Customer[];
  haulingEarnings: number;
  productOffsets: number;
  dieselOffsets: number;
  cashPayments: number;
  closingBalance: number;
  dateFrom: string;
  openingBalance: number;
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  filteredEntries: LedgerEntry[];
  pagedEntries: LedgerEntry[];
  canViewDetail: boolean;
  setSelectedEntry: React.Dispatch<React.SetStateAction<LedgerEntry | null>>;
  highlightedSourceId: string | null;
  currentPage: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  canViewStatement: boolean;
  dateTo: string;
  canExportStatement: boolean;
  printStatement: () => void;
  adjustmentsNet: number;
}

export default function HaulerLedgerView({
  activeLedgerTab,
  loading,
  haulers,
  haulingEarnings,
  productOffsets,
  dieselOffsets,
  cashPayments,
  closingBalance,
  dateFrom,
  openingBalance,
  search,
  setSearch,
  filteredEntries,
  pagedEntries,
  canViewDetail,
  setSelectedEntry,
  highlightedSourceId,
  currentPage,
  setPage,
  canViewStatement,
  dateTo,
  canExportStatement,
  printStatement,
  adjustmentsNet
}: HaulerLedgerViewProps) {
  return (<>
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
  </>);
}
