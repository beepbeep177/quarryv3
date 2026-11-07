import type { Customer, CustomerCreditLedgerRow, HaulerOffsetLedgerRow } from '../../lib/database.types';
import { balanceInterpretation, csvEscape, customerCreditTypeLabel, downloadTextFile, fmt, formatDate, htmlEscape, slugify, typeLabel } from './ledgerUtils';
import type { CustomerCreditLedgerEntry, CustomerOffsetRow, LedgerEntry } from './types';

interface ExportOptions {
  canExport: boolean;
  filteredEntries: LedgerEntry[];
  setInfoModal: React.Dispatch<React.SetStateAction<string>>;
  selectedHauler: Customer | null;
  dateFrom: string;
  dateTo: string;
  openingBalance: number;
  haulingEarnings: number;
  productOffsets: number;
  dieselOffsets: number;
  cashPayments: number;
  adjustmentsNet: number;
  closingBalance: number;
  filteredCustomerRows: CustomerOffsetRow[];
  selectedCustomer: Customer | null;
  customerOffsetTotal: number;
  customerCreditSummary: CustomerCreditLedgerRow | null;
  customerCreditAdvances: number;
  customerCreditPurchases: number;
  customerCreditAdjustmentsNet: number;
  customerCreditClosingBalance: number;
  customerCreditEntries: CustomerCreditLedgerEntry[];
  canViewStatement: boolean;
  summary: HaulerOffsetLedgerRow | undefined;
  ledgerEntries: LedgerEntry[];
}

export function createLedgerExports({
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
}: ExportOptions) {
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
  return { exportExcel, exportCustomerExcel, printStatement };
}
