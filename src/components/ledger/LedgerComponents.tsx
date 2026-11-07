import {
  X
} from 'lucide-react';
import type { Json } from '../../lib/database.types';
import { asRecord, currency, fmt, formatDate, numberValue, textValue, typeBadgeClass, typeLabel } from './ledgerUtils';
import type { LedgerEntry } from './types';
export function Field({ label, children }: { label: string; children: React.ReactNode; }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-500 mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

export function SummaryCard({ label, value, sub, icon, bg }: { label: string; value: number; sub: string; icon: React.ReactNode; bg: string; }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center mb-4`}>{icon}</div>
      <p className="text-sm text-slate-500 font-medium">{label}</p>
      <p className={`text-2xl font-bold mt-1 tabular-nums ${value < 0 ? 'text-red-600' : 'text-slate-800'}`}>{currency(value)}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </div>
  );
}

export function StatementRow({ label, value, positive = false }: { label: string; value: number; positive?: boolean; }) {
  const color = value > 0 || positive ? 'text-emerald-700' : value < 0 ? 'text-red-600' : 'text-slate-700';
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold tabular-nums ${color}`}>{value < 0 ? '-' : ''}{currency(Math.abs(value))}</span>
    </div>
  );
}

export function SummaryLine({ label, value, positive = false }: { label: string; value: string; positive?: boolean; }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold tabular-nums ${positive ? 'text-emerald-700' : 'text-slate-700'}`}>{value}</span>
    </div>
  );
}

export function DetailModal({
  entry,
  canAdjust,
  saving,
  onClose,
  onVoid,
}: {
  entry: LedgerEntry;
  canAdjust: boolean;
  saving: boolean;
  onClose: () => void;
  onVoid: () => void;
}) {
  const payload = asRecord(entry.source_payload);
  const canVoid = canAdjust && entry.source_module === 'hauler_offset_entries';

  return (
    <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800">Transaction Detail</h2>
              <span className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-semibold ${typeBadgeClass(entry.transaction_type)}`}>
                {typeLabel(entry.transaction_type)}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">{entry.reference_no || 'No reference'}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DetailBox label="Date" value={formatDate(entry.transaction_date)} />
            <DetailBox label="Source Module" value={entry.source_module ?? '—'} />
            <DetailBox label="Debit (-)" value={entry.debit_amount > 0 ? currency(entry.debit_amount) : '—'} danger />
            <DetailBox label="Credit (+)" value={entry.credit_amount > 0 ? currency(entry.credit_amount) : '—'} positive />
            <DetailBox label="Running Balance" value={currency(entry.running_balance)} positive={entry.running_balance >= 0} danger={entry.running_balance < 0} />
            <DetailBox label="Description" value={entry.description || '—'} />
          </div>

          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-800 mb-3">Structured Details</h3>
            <TypeSpecificDetails entry={entry} payload={payload} />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Related Documents</h3>
            </div>
            <RelatedDocuments entry={entry} payload={payload} />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-between gap-3">
          {canVoid ? (
            <button onClick={onVoid} disabled={saving} className="px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-60">
              Void Entry
            </button>
          ) : <span />}
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800">Close</button>
        </div>
      </div>
    </div>
  );
}

export function DetailBox({ label, value, positive = false, danger = false }: { label: string; value: string; positive?: boolean; danger?: boolean; }) {
  const color = positive ? 'text-emerald-700' : danger ? 'text-red-600' : 'text-slate-800';
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500 font-semibold uppercase">{label}</p>
      <p className={`mt-1 font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

export function TypeSpecificDetails({ entry, payload }: { entry: LedgerEntry; payload: Record<string, unknown>; }) {
  if (entry.transaction_type === 'HAULING_SERVICE') {
    const lineItems = Array.isArray(payload.line_items)
      ? payload.line_items.map(item => asRecord(item as Json))
      : [];

    if (lineItems.length > 0) {
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase text-slate-500 border-b border-slate-200">
                <th className="py-2 text-left">Truck / Plate</th>
                <th className="py-2 text-left">Driver</th>
                <th className="py-2 text-right">Trips</th>
                <th className="py-2 text-right">Rate / Trip</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {lineItems.map((item, index) => (
                <tr key={`${textValue(item, 'truck_id')}-${index}`}>
                  <td className="py-2 pr-3 text-slate-700 font-medium">{textValue(item, 'truck_plate') || '—'}</td>
                  <td className="py-2 pr-3 text-slate-600">{textValue(item, 'driver_name') || '—'}</td>
                  <td className="py-2 pr-3 text-right text-slate-700 tabular-nums">{fmt(numberValue(item, 'trips'))}</td>
                  <td className="py-2 pr-3 text-right text-slate-700 tabular-nums">{currency(numberValue(item, 'rate_per_trip'))}</td>
                  <td className="py-2 text-right text-emerald-700 font-bold tabular-nums">{currency(numberValue(item, 'amount'))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <DetailGrid rows={[
        ['Trips', textValue(payload, 'trip_count') || '—'],
        ['Trucks', textValue(payload, 'truck_count') || '—'],
        ['Truck / Plate', textValue(payload, 'truck_plate') || '—'],
        ['Driver', textValue(payload, 'driver_name') || '—'],
        ['Rate / Trip', numberValue(payload, 'rate_per_trip') ? currency(numberValue(payload, 'rate_per_trip')) : '—'],
      ]} />
    );
  }

  if (entry.transaction_type === 'PRODUCT_OFFSET') {
    return (
      <DetailGrid rows={[
        ['DR Number', textValue(payload, 'dr_number') || entry.reference_no || '—'],
        ['Product', textValue(payload, 'material_type') || '—'],
        ['Volume', numberValue(payload, 'volume_m3') ? `${fmt(numberValue(payload, 'volume_m3'))} m³` : '—'],
        ['Unit Price', numberValue(payload, 'unit_price') ? currency(numberValue(payload, 'unit_price')) : '—'],
        ['Payment Mode', textValue(payload, 'payment_mode') || '—'],
        ['Transaction Status', textValue(payload, 'status') || '—'],
      ]} />
    );
  }

  if (entry.transaction_type === 'DIESEL_OFFSET') {
    return (
      <DetailGrid rows={[
        ['Fuel Reference', entry.reference_no || '—'],
        ['Issued To', textValue(payload, 'issued_to') || '—'],
        ['Truck', textValue(payload, 'truck_plate') || '—'],
        ['Driver', textValue(payload, 'driver_name') || '—'],
        ['Liters', numberValue(payload, 'liters') ? `${fmt(numberValue(payload, 'liters'))} L` : '—'],
        ['Price / L', numberValue(payload, 'unit_cost_snapshot') ? currency(numberValue(payload, 'unit_cost_snapshot')) : '—'],
      ]} />
    );
  }

  if (entry.transaction_type === 'CASH_PAYMENT') {
    return (
      <DetailGrid rows={[
        ['Payment Method', textValue(payload, 'payment_method') || '—'],
        ['Payment Reference', textValue(payload, 'payment_reference') || '—'],
        ['Remarks', textValue(payload, 'remarks') || '—'],
      ]} />
    );
  }

  return (
    <DetailGrid rows={[
      ['Reason', textValue(payload, 'reason') || '—'],
      ['Remarks', textValue(payload, 'remarks') || '—'],
    ]} />
  );
}

export function DetailGrid({ rows }: { rows: [string, string][]; }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <p className="text-xs text-slate-500 font-semibold">{label}</p>
          <p className="text-sm text-slate-800 mt-0.5">{value}</p>
        </div>
      ))}
    </div>
  );
}

export function RelatedDocuments({ entry, payload }: { entry: LedgerEntry; payload: Record<string, unknown>; }) {
  const attachments = Array.isArray(payload.attachment_urls) ? payload.attachment_urls.filter((item): item is string => typeof item === 'string') : [];
  const rows = [
    ...(entry.source_module ? [{
      type: entry.source_module === 'transactions' ? 'Daily Transaction' : entry.source_module === 'fuel_issuances' ? 'Fuel Issuance' : 'Manual Entry',
      reference: entry.reference_no || entry.source_id || '—',
      date: formatDate(entry.transaction_date),
      url: '',
    }] : []),
    ...attachments.map((url, index) => ({
      type: 'Attachment',
      reference: `Attachment ${index + 1}`,
      date: formatDate(entry.transaction_date),
      url,
    })),
  ];

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase">
          <th className="px-4 py-3 text-left">Document Type</th>
          <th className="px-4 py-3 text-left">Reference</th>
          <th className="px-4 py-3 text-left">Date</th>
          <th className="px-4 py-3 text-center">Action</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.length === 0 ? (
          <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No related documents</td></tr>
        ) : rows.map(row => (
          <tr key={`${row.type}-${row.reference}`}>
            <td className="px-4 py-3 text-slate-700">{row.type}</td>
            <td className="px-4 py-3 text-slate-500 font-mono text-xs">{row.reference}</td>
            <td className="px-4 py-3 text-slate-500">{row.date}</td>
            <td className="px-4 py-3 text-center">
              {row.url ? (
                <a href={row.url} target="_blank" rel="noreferrer" className="text-emerald-600 hover:text-emerald-700 font-semibold text-xs">View</a>
              ) : (
                <span className="text-slate-400 text-xs">Source</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
