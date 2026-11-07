import { useCallback } from 'react';
import { csvEscape, downloadTextFile, fmt, formatBucketLabel, formatCsvCell, formatDateLabel, formatTransactionTime, formatVolume, htmlEscape, slugify } from './reportUtils';
import type { ExportReportData } from './types';
import type { ReportsData } from './useReportsData';

export function useReportExport(data: ReportsData) {
  const {
    activeTab,
    periodMode,
    paymentModeFilter,
    materialTypeFilter,
    transactions,
    expenseLedgerFilter,
    setInfoModal,
    range,
    salesSummaryList,
    grandNetSales,
    grandDrFees,
    grandDeliveryFees,
    grandExtraFees,
    grandVolume,
    cashTotal,
    poTotal,
    offsetTotal,
    gcashTotal,
    bankTransferTotal,
    customerCreditTotal,
    hourlyKpiList,
    expenseCategoryTotals,
    customerTransactions,
    customerTotalSales,
    customerTotalVolume,
    productSalesList,
    productTotals,
    totalExpenses,
    revenueLineItems,
    expenseLineItems,
    netIncomeList,
    netIncome,
    selectedCustomer
  } = data;
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
        headers: ['Period', 'Transactions', 'Volume (m3)', 'Cash', 'P.O', 'Offset', 'GCash', 'Bank', 'Customer Credit', 'DR Fees', 'Delivery Fee', 'Extra Fees', 'Net Sales'],
        rows: salesSummaryList.map(summary => [
          formatBucketLabel(summary.bucketStart, range.salesGrouping),
          summary.count,
          formatVolume(summary.volume),
          fmt(summary.cash),
          fmt(summary.po),
          fmt(summary.offset),
          fmt(summary.gcash),
          fmt(summary.bankTransfer),
          fmt(summary.customerCredit),
          fmt(summary.drFees),
          fmt(summary.deliveryFees),
          fmt(summary.extraFees),
          fmt(summary.total),
        ]),
        totals: ['Totals', transactions.length, formatVolume(grandVolume), fmt(cashTotal), fmt(poTotal), fmt(offsetTotal), fmt(gcashTotal), fmt(bankTransferTotal), fmt(customerCreditTotal), fmt(grandDrFees), fmt(grandDeliveryFees), fmt(grandExtraFees), fmt(grandNetSales)],
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
        headers: ['Date', 'Time', 'DR #', 'Customer', 'Truck', 'Material', 'Length (cm)', 'Width (cm)', 'Height (cm)', 'Volume (m3)', 'Unit Price', 'Amount', 'DR Capitol', 'Delivery Fee', 'Passway', 'Kulot', 'Total', 'Mode', 'Status', 'Notes'],
        rows: customerTransactions.map(tx => [
          formatDateLabel(tx.transaction_date, { month: 'short', day: 'numeric', year: 'numeric' }),
          formatTransactionTime(tx.transaction_time),
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
          fmt(tx.delivery_fee ?? 0),
          fmt(tx.passway ?? 0),
          fmt(tx.kulot ?? 0),
          fmt(tx.total_amount ?? 0),
          tx.payment_mode ?? '',
          tx.status ?? '',
          tx.notes ?? '',
        ]),
        totals: ['Totals', '', '', '', '', '', '', '', '', formatVolume(customerTotalVolume), '', fmt(customerTransactions.reduce((sum, tx) => sum + (tx.amount ?? 0), 0)), fmt(customerTransactions.reduce((sum, tx) => sum + (tx.dr_capitol ?? 0), 0)), fmt(customerTransactions.reduce((sum, tx) => sum + (tx.delivery_fee ?? 0), 0)), fmt(customerTransactions.reduce((sum, tx) => sum + (tx.passway ?? 0), 0)), fmt(customerTransactions.reduce((sum, tx) => sum + (tx.kulot ?? 0), 0)), fmt(customerTotalSales), '', '', ''],
      };
    }

    if (activeTab === 'expenses' && expenseLedgerFilter?.active) {
      // Export only what the ledger filters show (category / dates / search), item by item.
      const rows = expenseLedgerFilter.filtered;
      const filteredTotal = rows.reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);
      const filteredLiters = rows.reduce((sum, expense) => sum + Number(expense.liters_counter ?? 0), 0);
      return {
        title: expenseLedgerFilter.category ? `Expense Summary - ${expenseLedgerFilter.category}` : 'Expense Summary (Filtered)',
        filename: `expense-summary-${expenseLedgerFilter.category ? `${slugify(expenseLedgerFilter.category)}-` : 'filtered-'}${slugify(range.label)}`,
        filterLines: [
          ...baseFilterLines,
          `Category: ${expenseLedgerFilter.category ?? 'All categories'}`,
          ...(expenseLedgerFilter.dateLabel ? [`Ledger dates: ${expenseLedgerFilter.dateLabel}`] : []),
          ...(expenseLedgerFilter.search ? [`Search: ${expenseLedgerFilter.search}`] : []),
          `Records: ${rows.length}`,
        ],
        headers: ['Date', 'Category', 'Payee / Supplier', 'Description', 'Liters', 'Amount'],
        rows: rows.map(expense => [
          formatDateLabel(expense.expense_date, { month: 'short', day: 'numeric', year: 'numeric' }),
          expense.expense_categories?.name ?? 'Uncategorized',
          expense.payee_supplier ?? '',
          expense.description ?? '',
          expense.liters_counter ? fmt(Number(expense.liters_counter)) : '',
          fmt(Number(expense.amount ?? 0)),
        ]),
        totals: ['Total', '', '', '', filteredLiters ? fmt(filteredLiters) : '', fmt(filteredTotal)],
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

    if (activeTab === 'hourly') {
      return {
        title: 'Hourly Transaction KPI',
        filename: `hourly-transaction-kpi-${slugify(range.label)}`,
        filterLines: baseFilterLines,
        headers: ['Hour', 'Transactions', 'Volume (m3)', 'Net Sales', 'Avg Sale / Transaction', 'Cash', 'P.O', 'Offset', 'GCash', 'Bank', 'Customer Credit'],
        rows: hourlyKpiList.map(bucket => [
          bucket.label,
          bucket.count,
          formatVolume(bucket.volume),
          fmt(bucket.netSales),
          fmt(bucket.count > 0 ? bucket.netSales / bucket.count : 0),
          fmt(bucket.cash),
          fmt(bucket.po),
          fmt(bucket.offset),
          fmt(bucket.gcash),
          fmt(bucket.bankTransfer),
          fmt(bucket.customerCredit),
        ]),
        totals: ['Totals', transactions.length, formatVolume(grandVolume), fmt(grandNetSales), fmt(transactions.length > 0 ? grandNetSales / transactions.length : 0), fmt(cashTotal), fmt(poTotal), fmt(offsetTotal), fmt(gcashTotal), fmt(bankTransferTotal), fmt(customerCreditTotal)],
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
          grandNetSales > 0 ? `${item.share.toFixed(2)}%` : '',
        ]),
        ['Revenue', 'Total Revenue', fmt(grandNetSales), grandNetSales > 0 ? '100.00%' : ''],
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
    customerCreditTotal,
    customerTotalSales,
    customerTotalVolume,
    customerTransactions,
    expenseCategoryTotals,
    expenseLedgerFilter,
    gcashTotal,
    grandDeliveryFees,
    grandExtraFees,
    grandDrFees,
    grandNetSales,
    grandVolume,
    hourlyKpiList,
    materialTypeFilter,
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
      setInfoModal('Please allow pop-ups to export the report PDF.');
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
  }, [getReportExportData, setInfoModal]);
  return { exportCsv, exportPdf };
}
