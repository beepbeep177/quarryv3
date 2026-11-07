import type { CompanyEquipment, FuelBranch, FuelInventoryLedger, FuelPurchase } from '../../lib/database.types';
import type { useDateRange } from '../../lib/dateRange';
import { csvEscape, downloadTextFile, equipmentBranchLabel, fmt, formatDateTime, formatEquipmentTarget, htmlEscape, todayInput } from './fuelUtils';
import type { FuelIssuanceWithTarget, FuelReversals, FuelTab } from './types';

interface ExportOptions {
  usesDateFilter: boolean;
  fuelDates: Pick<ReturnType<typeof useDateRange>, 'start' | 'end' | 'active' | 'label'>;
  activeTab: FuelTab;
  issuanceCategoryFilter: string;
  search: string;
  filteredPurchases: FuelPurchase[];
  reversal: FuelReversals;
  purchaseFilteredTotals: { liters: number; amount: number; };
  filteredIssuances: FuelIssuanceWithTarget[];
  issuanceFilteredTotals: { liters: number; amount: number; };
  visibleCompanyEquipment: CompanyEquipment[];
  branches: FuelBranch[];
  filteredLedger: FuelInventoryLedger[];
  selectedBranch: FuelBranch | null;
  setInfoModal: React.Dispatch<React.SetStateAction<string>>;
}

export function createFuelExports({
  usesDateFilter,
  fuelDates,
  activeTab,
  issuanceCategoryFilter,
  search,
  filteredPurchases,
  reversal,
  purchaseFilteredTotals,
  filteredIssuances,
  issuanceFilteredTotals,
  visibleCompanyEquipment,
  branches,
  filteredLedger,
  selectedBranch,
  setInfoModal
}: ExportOptions) {
  function exportFilterLines() {
    if (!usesDateFilter) return [];
    return [
      `Dates: ${fuelDates.active ? fuelDates.label : 'All dates'}`,
      ...(activeTab === 'issuances' ? [`Category: ${issuanceCategoryFilter === 'ALL' ? 'All categories' : issuanceCategoryFilter}`] : []),
      ...(search.trim() ? [`Search: ${search.trim()}`] : []),
    ];
  }

  function exportSlug() {
    const parts = [
      activeTab === 'issuances' && issuanceCategoryFilter !== 'ALL' ? issuanceCategoryFilter : '',
      fuelDates.active ? `${fuelDates.start || 'start'}-to-${fuelDates.end || 'today'}` : '',
    ].filter(Boolean).join('-');
    return parts ? `-${parts.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}` : '';
  }

  function exportRows(): { title: string; filename: string; headers: string[]; rows: (string | number)[][]; } {
    if (activeTab === 'purchases') {
      return {
        title: 'Fuel Purchases',
        filename: `fuel-purchases${exportSlug()}`,
        headers: ['Date', 'Supplier', 'Reference', 'Liters', 'Unit Cost', 'Total', 'Status', 'Encoded At', 'Remarks'],
        rows: [
          ...filteredPurchases.map(item => [item.purchase_date, item.supplier, item.reference_no, fmt(item.liters), fmt(item.unit_cost), fmt(item.total_amount), reversal.reversedSourceIds.has(item.id) ? 'Reversed' : 'Active', formatDateTime(item.created_at), item.remarks]),
          ['Total (excluding reversed)', '', '', fmt(purchaseFilteredTotals.liters), '', fmt(purchaseFilteredTotals.amount), '', '', ''],
        ],
      };
    }
    if (activeTab === 'issuances') {
      return {
        title: issuanceCategoryFilter === 'ALL' ? 'Fuel Issuances' : `Fuel Issuances - ${issuanceCategoryFilter}`,
        filename: `fuel-issuances${exportSlug()}`,
        headers: ['Date', 'Category', 'Issued To', 'Truck', 'Equipment', 'Reference', 'Liters', 'Unit Cost', 'Total Value', 'Status', 'Encoded At', 'Remarks'],
        rows: [
          ...filteredIssuances.map(item => [item.issuance_date, item.category, item.issued_to, item.trucks?.plate_number ?? '', item.company_equipment ? formatEquipmentTarget(item.company_equipment) : '', item.reference_no, fmt(item.liters), fmt(item.unit_cost_snapshot), fmt(item.total_value), reversal.reversedSourceIds.has(item.id) ? 'Reversed' : 'Active', formatDateTime(item.created_at), item.remarks]),
          ['Total (excluding reversed)', '', '', '', '', '', fmt(issuanceFilteredTotals.liters), '', fmt(issuanceFilteredTotals.amount), '', '', ''],
        ],
      };
    }
    if (activeTab === 'equipment') {
      return {
        title: 'Company Equipment',
        filename: 'company-equipment',
        headers: ['Name', 'Type', 'Code / Plate', 'Operator', 'Branch', 'Notes'],
        rows: visibleCompanyEquipment.map(item => [item.name, item.equipment_type, item.plate_or_code, item.operator_name, equipmentBranchLabel(item, branches), item.notes]),
      };
    }
    return {
      title: 'Fuel Inventory History',
      filename: `fuel-inventory-history${exportSlug()}`,
      headers: ['Date', 'Encoded At', 'Type', 'Reference', 'Description', 'Liters Delta', 'Unit Cost', 'Value Delta', 'Balance Liters', 'Average Cost'],
      rows: filteredLedger.map(item => [item.movement_date, formatDateTime(item.created_at), item.movement_type, item.reference_no, item.description, fmt(item.liters_delta), fmt(item.unit_cost), fmt(item.value_delta), fmt(item.balance_liters_after), fmt(item.weighted_average_cost_after)]),
    };
  }

  function exportCsv() {
    const report = exportRows();
    const lines = [
      [report.title],
      [`Branch: ${selectedBranch?.name ?? 'All branches'}`],
      ...exportFilterLines().map(line => [line]),
      [`Generated: ${new Date().toLocaleString('en-PH')}`],
      [],
      report.headers,
      ...report.rows,
    ];
    const csv = `\uFEFF${lines.map(row => row.map(cell => csvEscape(cell)).join(',')).join('\r\n')}`;
    downloadTextFile(`${report.filename}-${todayInput()}.csv`, csv, 'text/csv;charset=utf-8');
  }

  function exportPdf() {
    const report = exportRows();
    const rowsHtml = report.rows.map(row => `<tr>${row.map(cell => `<td>${htmlEscape(cell)}</td>`).join('')}</tr>`).join('');
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
            .meta { color: #475569; font-size: 12px; margin-bottom: 18px; line-height: 1.55; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th { text-align: left; background: #f1f5f9; color: #475569; text-transform: uppercase; }
            th, td { border: 1px solid #e2e8f0; padding: 7px 8px; }
            td:nth-child(n+4), th:nth-child(n+4) { text-align: right; }
            @media print { body { margin: 18mm; } }
          </style>
        </head>
        <body>
          <h1>${htmlEscape(report.title)}</h1>
          <div class="meta">
            <div>Branch: ${htmlEscape(selectedBranch?.name ?? 'All branches')}</div>
            ${exportFilterLines().map(line => `<div>${htmlEscape(line)}</div>`).join('')}
            <div>Generated: ${htmlEscape(new Date().toLocaleString('en-PH'))}</div>
          </div>
          <table>
            <thead><tr>${report.headers.map(header => `<th>${htmlEscape(header)}</th>`).join('')}</tr></thead>
            <tbody>${rowsHtml || `<tr><td colspan="${report.headers.length}">No records found.</td></tr>`}</tbody>
          </table>
        </body>
      </html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }
  return { exportCsv, exportPdf };
}
