import type { Customer, CustomerCreditLedgerRow, HaulerOffsetLedgerRow, Json, TransactionWithRelations } from '../../lib/database.types';
import type { CustomerCreditForm, CustomerCreditManualType, EntryForm, HaulingLineItem, ManualType } from './types';
export const PAGE_SIZE = 10;

export function normalizeCustomerName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function customerSelectLabel(customer: Customer, duplicateCount: number, activityCount: number) {
  const details = [
    activityCount > 0 ? `${activityCount} offset${activityCount === 1 ? '' : 's'}` : '',
    duplicateCount > 1 ? `id ${customer.id.slice(0, 8)}` : '',
  ].filter(Boolean);

  return details.length > 0 ? `${customer.name} (${details.join(', ')})` : customer.name;
}

export function todayInput() {
  return toInputDate(new Date());
}

export function toInputDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { start: toInputDate(start), end: toInputDate(end) };
}

export function quarterRange() {
  const now = new Date();
  const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
  const start = new Date(now.getFullYear(), quarterStartMonth, 1);
  const end = new Date(now.getFullYear(), quarterStartMonth + 3, 0);
  return { start: toInputDate(start), end: toInputDate(end) };
}

export function fmt(value: number) {
  return Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function currency(value: number) {
  return `₱${fmt(value)}`;
}

export function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function csvEscape(value: string | number) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function htmlEscape(value: string | number) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function downloadTextFile(filename: string, content: string, mimeType: string) {
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

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'hauler';
}

export function asRecord(value: Json): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function textValue(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
}

export function numberValue(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function getSplitOffsetAmount(details: Json): number {
  if (!Array.isArray(details)) return 0;
  return details.reduce<number>((sum, item) => {
    const row = asRecord(item);
    const mode = textValue(row, 'mode').toUpperCase();
    const amount = numberValue(row, 'amount');
    return mode === 'OFFSET' ? sum + amount : sum;
  }, 0);
}

export function getCustomerOffsetAmount(tx: TransactionWithRelations): number {
  if (tx.payment_mode === 'P.O') return tx.total_amount ?? 0;
  if (tx.payment_mode === 'OFFSET') return tx.total_amount ?? 0;
  if (tx.payment_mode === 'SPLIT') return getSplitOffsetAmount(tx.split_payment_details);
  return 0;
}

export function customerCreditTypeLabel(type: CustomerCreditLedgerRow['transaction_type']) {
  switch (type) {
    case 'ADVANCE_PAYMENT': return 'Advance Payment';
    case 'PURCHASE_DEDUCTION': return 'Purchase Deduction';
    case 'OPENING_BALANCE': return 'Opening Balance';
    case 'ADJUSTMENT': return 'Adjustment';
    case 'REVERSAL': return 'Reversal';
    default: return 'Summary';
  }
}

export function customerCreditTypeBadgeClass(type: CustomerCreditLedgerRow['transaction_type']) {
  switch (type) {
    case 'ADVANCE_PAYMENT': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'PURCHASE_DEDUCTION': return 'bg-teal-50 text-teal-700 border-teal-200';
    case 'OPENING_BALANCE': return 'bg-slate-50 text-slate-700 border-slate-200';
    case 'ADJUSTMENT': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'REVERSAL': return 'bg-red-50 text-red-700 border-red-200';
    default: return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

export function typeLabel(type: HaulerOffsetLedgerRow['transaction_type']) {
  switch (type) {
    case 'HAULING_SERVICE': return 'Hauling Service';
    case 'PRODUCT_OFFSET': return 'Product Offset';
    case 'DIESEL_OFFSET': return 'Diesel Offset';
    case 'CASH_PAYMENT': return 'Cash Payment';
    case 'OPENING_BALANCE': return 'Opening Balance';
    case 'ADJUSTMENT': return 'Adjustment';
    default: return 'Summary';
  }
}

export function typeBadgeClass(type: HaulerOffsetLedgerRow['transaction_type']) {
  switch (type) {
    case 'HAULING_SERVICE': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'PRODUCT_OFFSET': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'DIESEL_OFFSET': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'CASH_PAYMENT': return 'bg-violet-50 text-violet-700 border-violet-200';
    case 'OPENING_BALANCE': return 'bg-slate-50 text-slate-700 border-slate-200';
    case 'ADJUSTMENT': return 'bg-amber-50 text-amber-700 border-amber-200';
    default: return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

export function createHaulingLineItem(): HaulingLineItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    truck_id: '',
    truck_plate: '',
    driver_name: '',
    trips: '',
    rate_per_trip: '',
  };
}

export function emptyForm(defaultType: ManualType = 'HAULING_SERVICE'): EntryForm {
  return {
    transaction_type: defaultType,
    transaction_date: todayInput(),
    reference_no: '',
    description: '',
    amount: '',
    entry_side: 'CREDIT',
    remarks: '',
    trip_count: '',
    truck_count: '',
    truck_id: '',
    truck_plate: '',
    driver_name: '',
    rate_per_trip: '',
    hauling_items: [createHaulingLineItem()],
    payment_method: '',
    payment_reference: '',
    reason: '',
  };
}

export const inputClass = 'w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400';

export function emptyCustomerCreditForm(defaultType: CustomerCreditManualType = 'ADVANCE_PAYMENT'): CustomerCreditForm {
  return {
    transaction_type: defaultType,
    transaction_date: todayInput(),
    reference_no: '',
    description: '',
    amount: '',
    entry_side: 'CREDIT',
    remarks: '',
  };
}

export function balanceInterpretation(balance: number) {
  if (balance > 0) return 'Company owes hauler';
  if (balance < 0) return 'Hauler owes company / over-offset';
  return 'Fully settled';
}
