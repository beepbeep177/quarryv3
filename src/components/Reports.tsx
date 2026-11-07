import {
  Calendar,
  Download,
  FileText,
  RefreshCw
} from 'lucide-react';
import type { PaymentMode, TransactionWithRelations } from '../lib/database.types';
import ActionModal from './ActionModal';
import CustomersReport from './reports/CustomersReport';
import ExpensesReport from './reports/ExpensesReport';
import HourlyReport from './reports/HourlyReport';
import NetReport from './reports/NetReport';
import ProductsReport from './reports/ProductsReport';
import { tabButtonClass } from './reports/reportUtils';
import SalesReport from './reports/SalesReport';
import TransactionDetailModal from './reports/TransactionDetailModal';
import type { ExtraFeeFilter, ReportTab, ReportsProps } from './reports/types';
import { useReportExport } from './reports/useReportExport';
import { useReportsData } from './reports/useReportsData';
export type { ReportTab } from './reports/types';

export default function Reports({ initialTab = 'sales', refreshKey = 0, canEditTransactions = false, canExport = false, canPrint = false, onEditTransaction }: ReportsProps) {
  const data = useReportsData(initialTab, refreshKey);
  const {
    activeTab,
    setActiveTab,
    periodMode,
    setPeriodMode,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    selectedMonth,
    setSelectedMonth,
    selectedYear,
    setSelectedYear,
    customerId,
    setCustomerId,
    paymentModeFilter,
    setPaymentModeFilter,
    materialTypeFilter,
    setMaterialTypeFilter,
    extraFeeFilter,
    setExtraFeeFilter,
    customerGrouping,
    setCustomerGrouping,
    expenseGrouping,
    setExpenseGrouping,
    netGrouping,
    setNetGrouping,
    customers,
    loading,
    error,
    selectedTransaction,
    setSelectedTransaction,
    isModalOpen,
    setIsModalOpen,
    infoModal,
    setInfoModal,
    range,
    yearOptions,
    fetchReportData,
    materialTypeOptions
  } = data;
  const { exportCsv, exportPdf } = useReportExport(data);
  const handleRowDoubleClick = (tx: TransactionWithRelations) => {
    setSelectedTransaction(tx);
    setIsModalOpen(true);
  };

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
      {isModalOpen && selectedTransaction && <TransactionDetailModal selectedTransaction={selectedTransaction} canEditTransactions={canEditTransactions} onEditTransaction={onEditTransaction} closeModal={closeModal} editSelectedTransaction={editSelectedTransaction} />}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
          <p className="text-slate-500 text-sm mt-0.5">Sales, customer performance, and net income views</p>
        </div>
        <div className="flex items-center gap-2">
          {canExport && (
            <button onClick={exportCsv} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60 text-sm font-semibold transition-colors">
              <Download size={15} />
              CSV
            </button>
          )}
          {canPrint && (
            <button onClick={exportPdf} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60 text-sm font-semibold transition-colors">
              <FileText size={15} />
              PDF
            </button>
          )}
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
            { id: 'hourly', label: 'Hourly KPI' },
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
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${periodMode === mode
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
                <option value="CUSTOMER_CREDIT">Customer Credit</option>
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
                <option value="delivery_fee">Delivery Fee</option>
                <option value="passway">Passway</option>
                <option value="kulot">Kulot</option>
              </select>
              <div className="flex items-center gap-1.5">
                {(['DAY', 'WEEK', 'MONTH'] as const).map(group => (
                  <button
                    key={group}
                    onClick={() => setCustomerGrouping(group)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${customerGrouping === group
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
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${expenseGrouping === group
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
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${netGrouping === group
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

      {activeTab === 'sales' && <SalesReport data={data} />}

      {activeTab === 'customers' && <CustomersReport data={data} onOpenTransaction={handleRowDoubleClick} />}

      {activeTab === 'expenses' && <ExpensesReport data={data} />}

      {activeTab === 'net' && <NetReport data={data} />}

      {activeTab === 'hourly' && <HourlyReport data={data} />}

      {activeTab === 'products' && <ProductsReport data={data} />}

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
