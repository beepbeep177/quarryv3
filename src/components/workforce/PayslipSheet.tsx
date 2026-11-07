import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { money, qty, formatPeriod } from '../../lib/workforce/format';
import type { PayrollLine } from '../../lib/workforce/payroll';

interface Props {
  dateFrom: string;
  dateTo: string;
  lines: PayrollLine[];
  /** C.A balance remaining after this payroll, by employee. */
  caBalanceAfter: Map<string, number>;
  onClose: () => void;
}

// Only the payslips are printed: everything else in <body> is hidden.
const PRINT_CSS = `
@media print {
  @page { size: A4 landscape; margin: 8mm; }
  body > *:not(.wf-print-root) { display: none !important; }
  html, body { background: #fff !important; }
  .wf-print-root { position: static !important; overflow: visible !important; background: #fff !important; padding: 0 !important; }
  .wf-print-root .wf-no-print { display: none !important; }
  .wf-print-sheet { box-shadow: none !important; border: 0 !important; padding: 0 !important; max-width: none !important; }
  .wf-payslip { break-inside: avoid; page-break-inside: avoid; }
}
`;

/** Salary.xlsx style payslips, 4 per row. */
export default function PayslipSheet({ dateFrom, dateTo, lines, caBalanceAfter, onClose }: Props) {
  return createPortal(
    <div className="wf-print-root fixed inset-0 z-[80] overflow-auto bg-slate-900/50 p-4 sm:p-8">
      <style>{PRINT_CSS}</style>
      <div className="wf-print-sheet mx-auto max-w-7xl rounded-xl bg-white p-6 shadow-2xl">
        <div className="wf-no-print mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Payslips</h2>
            <p className="text-sm text-slate-500">{formatPeriod(dateFrom, dateTo)} · {lines.length} employees</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600">
              <Printer size={16} /> Print
            </button>
            <button type="button" onClick={onClose} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              <X size={16} /> Close
            </button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {lines.map(line => (
            <div key={line.employeeId} className="wf-payslip border border-slate-400 p-2 text-[10px] leading-tight text-slate-900">
              <div className="mb-1 border-b border-slate-400 pb-1 text-center">
                <p className="font-bold uppercase">{line.employeeName}</p>
                <p className="text-[9px]">{formatPeriod(dateFrom, dateTo)}</p>
              </div>
              <Row label="DAYS OF WORK" value={qty(line.days)} />
              <Row label="OT HRS" value={qty(line.otHours)} />
              <Row label="NIGHT DIF HRS" value={qty(line.ndHours)} />
              <Row label="REG. HOLIDAY" value={qty(line.regHolidays)} />
              <Row label="SPE. HOLIDAY" value={qty(line.specialHolidaysWorked)} />
              <Row label="RATE" value={money(line.dailyRate)} />
              <Row label="RATE PER HR" value={money(line.hourlyRate)} />
              <Row label="WEEKLY PAY" value={money(line.basicPay)} divider />
              <Row label="O.T PAY" value={money(line.otPay)} />
              <Row label="NIGHT DIF PAY" value={money(line.ndPay)} />
              <Row label="HOLIDAY PAY" value={money(line.holidayPay)} />
              <Row label="TOTAL SALARY" value={money(line.grossPay)} strong divider />
              <Row label="DEDUCTIONS" value={money(line.totalDeductions)} />
              <Row label="C.A BALANCE" value={money(caBalanceAfter.get(line.employeeId) ?? 0)} />
              <Row label="NET SALARY" value={money(line.netPay)} strong divider />
              <div className="mt-3 border-t border-slate-400 pt-0.5 text-center text-[8px] uppercase">Received by</div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Row({ label, value, strong, divider }: { label: string; value: string; strong?: boolean; divider?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 py-px ${divider ? 'border-t border-slate-300' : ''} ${strong ? 'font-bold' : ''}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
