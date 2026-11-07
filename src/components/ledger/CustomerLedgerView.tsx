import {
  Banknote,
  CheckCircle,
  Loader2,
  ReceiptText,
  Scale,
  Search,
  Users
} from 'lucide-react';
import type { Customer, CustomerCreditLedgerRow } from '../../lib/database.types';
import Pagination from '../Pagination';
import { SummaryCard, SummaryLine } from './LedgerComponents';
import { currency, customerCreditTypeBadgeClass, customerCreditTypeLabel, fmt, formatDate, PAGE_SIZE } from './ledgerUtils';
import type { CustomerCreditLedgerEntry, CustomerOffsetRow, CustomerStatusFilter, OffsetLedgerTab } from './types';

interface CustomerLedgerViewProps {
  activeLedgerTab: OffsetLedgerTab;
  customerError: string;
  customerLoading: boolean;
  customerOffsetRows: CustomerOffsetRow[];
  customerOffsetTotal: number;
  customerTransactionTotal: number;
  customerAvailableCredit: number;
  selectedCustomer: Customer | null;
  dateFrom: string;
  dateTo: string;
  customerStatusFilter: CustomerStatusFilter;
  setCustomerStatusFilter: React.Dispatch<React.SetStateAction<CustomerStatusFilter>>;
  customerSearch: string;
  setCustomerSearch: React.Dispatch<React.SetStateAction<string>>;
  filteredCustomerRows: CustomerOffsetRow[];
  canCustomerCreditAdjust: boolean;
  pagedCustomerRows: CustomerOffsetRow[];
  settleCustomerReceivable: (row: CustomerOffsetRow) => Promise<void>;
  settlingTransactionId: string | null;
  customerCurrentPage: number;
  setCustomerPage: React.Dispatch<React.SetStateAction<number>>;
  customerVolumeTotal: number;
  customerCreditClosingBalance: number;
  customerCreditSummary: CustomerCreditLedgerRow | null;
  customerCreditAdvances: number;
  customerCreditPurchases: number;
  customerCreditAdjustmentsNet: number;
  customerCreditEntries: CustomerCreditLedgerEntry[];
  highlightedSourceId: string | null;
}

export default function CustomerLedgerView({
  activeLedgerTab,
  customerError,
  customerLoading,
  customerOffsetRows,
  customerOffsetTotal,
  customerTransactionTotal,
  customerAvailableCredit,
  selectedCustomer,
  dateFrom,
  dateTo,
  customerStatusFilter,
  setCustomerStatusFilter,
  customerSearch,
  setCustomerSearch,
  filteredCustomerRows,
  canCustomerCreditAdjust,
  pagedCustomerRows,
  settleCustomerReceivable,
  settlingTransactionId,
  customerCurrentPage,
  setCustomerPage,
  customerVolumeTotal,
  customerCreditClosingBalance,
  customerCreditSummary,
  customerCreditAdvances,
  customerCreditPurchases,
  customerCreditAdjustmentsNet,
  customerCreditEntries,
  highlightedSourceId
}: CustomerLedgerViewProps) {
  return (<>
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
              <SummaryCard label="Credit Balance" value={customerAvailableCredit} sub={selectedCustomer ? customerAvailableCredit < 0 ? 'Negative balance: customer owes company' : 'Current customer balance' : 'Select one customer'} icon={<Banknote size={21} className="text-teal-500" />} bg="bg-teal-50" />
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
                                    disabled={settlingTransactionId === row.id}
                                    title={customerAvailableCredit + 0.005 < row.offset_amount ? 'Settle using customer credit; the remaining balance will be negative' : 'Settle using customer credit'}
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
  </>);
}
