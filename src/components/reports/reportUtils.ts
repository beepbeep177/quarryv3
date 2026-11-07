import type { TransactionWithRelations } from '../../lib/database.types';
import type { DateRangeSummary, FinancialLineItem, Grouping, PeriodMode } from './types';
export const REPORT_PAGE_SIZE = 10;

export function fmt(v: number) {
  return v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatVolume(v: number) {
  return v.toFixed(2);
}

export function csvEscape(value: string | number) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function formatCsvCell(value: string | number) {
  if (typeof value === 'number') return String(value);
  return value;
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

export function htmlEscape(value: string | number) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function toInputDate(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function toMonthInput(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0')].join('-');
}

export function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function addDays(value: string, amount: number) {
  const next = parseDate(value);
  next.setDate(next.getDate() + amount);
  return toInputDate(next);
}

export function getMonthRange(value: string) {
  const [year, month] = value.split('-').map(Number);
  const start = new Date(year, month - 1, 1, 12, 0, 0, 0);
  const end = new Date(year, month, 0, 12, 0, 0, 0);
  return { start: toInputDate(start), end: toInputDate(end) };
}

export function getYearRange(value: string) {
  const year = Number(value);
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

export function startOfWeek(value: string) {
  const date = parseDate(value);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return toInputDate(date);
}

export function startOfMonth(value: string) {
  const date = parseDate(value);
  date.setDate(1);
  return toInputDate(date);
}

export function addMonths(value: string, amount: number) {
  const date = parseDate(value);
  date.setMonth(date.getMonth() + amount);
  date.setDate(1);
  return toInputDate(date);
}

export function compareDateStrings(a: string, b: string) {
  return a.localeCompare(b);
}

export function formatDateLabel(value: string, options: Intl.DateTimeFormatOptions) {
  return parseDate(value).toLocaleDateString('en-PH', options);
}

export function parseTransactionHour(value?: string | null) {
  if (!value) return 0;
  const [hourText = '0'] = value.split(':');
  const hour = Number(hourText);
  return Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : 0;
}

export function formatTransactionTime(value?: string | null) {
  if (!value) return '—';
  const hour = parseTransactionHour(value);
  const minute = Number(value.split(':')[1] ?? 0);
  const date = new Date();
  date.setHours(hour, Number.isFinite(minute) ? minute : 0, 0, 0);
  return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

export function formatHourBucket(hour: number) {
  const start = new Date();
  const end = new Date();
  start.setHours(hour, 0, 0, 0);
  end.setHours(hour + 1, 0, 0, 0);
  return `${start.toLocaleTimeString('en-PH', { hour: 'numeric' })} - ${end.toLocaleTimeString('en-PH', { hour: 'numeric' })}`;
}

export function formatRangeLabel(start: string, end: string) {
  return `${formatDateLabel(start, { month: 'short', day: 'numeric', year: 'numeric' })} - ${formatDateLabel(end, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export function getDateRangeSummary(periodMode: PeriodMode, dateFrom: string, dateTo: string, selectedMonth: string, selectedYear: string): DateRangeSummary {
  if (periodMode === 'MONTHLY') {
    const range = getMonthRange(selectedMonth);
    return {
      ...range,
      label: formatDateLabel(range.start, { month: 'long', year: 'numeric' }),
      salesGrouping: 'DAY',
    };
  }

  if (periodMode === 'YEARLY') {
    const range = getYearRange(selectedYear);
    return {
      ...range,
      label: selectedYear,
      salesGrouping: 'MONTH',
    };
  }

  const start = compareDateStrings(dateFrom, dateTo) <= 0 ? dateFrom : dateTo;
  const end = compareDateStrings(dateFrom, dateTo) <= 0 ? dateTo : dateFrom;
  return {
    start,
    end,
    label: formatRangeLabel(start, end),
    salesGrouping: 'DAY',
  };
}

export function getBucketStart(value: string, grouping: Grouping) {
  if (grouping === 'WEEK') return startOfWeek(value);
  if (grouping === 'MONTH') return startOfMonth(value);
  return value;
}

export function createContinuousBuckets(start: string, end: string, grouping: Grouping) {
  const buckets: string[] = [];
  let cursor = getBucketStart(start, grouping);
  const last = getBucketStart(end, grouping);

  while (compareDateStrings(cursor, last) <= 0) {
    buckets.push(cursor);
    cursor = grouping === 'DAY' ? addDays(cursor, 1) : grouping === 'WEEK' ? addDays(cursor, 7) : addMonths(cursor, 1);
  }

  return buckets;
}

export function formatBucketLabel(bucketStart: string, grouping: Grouping) {
  if (grouping === 'MONTH') {
    return formatDateLabel(bucketStart, { month: 'long', year: 'numeric' });
  }

  if (grouping === 'WEEK') {
    const weekEnd = addDays(bucketStart, 6);
    return `${formatDateLabel(bucketStart, { month: 'short', day: 'numeric' })} - ${formatDateLabel(weekEnd, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }

  return formatDateLabel(bucketStart, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function tabButtonClass(active: boolean) {
  return active
    ? 'bg-slate-900 text-white shadow-sm'
    : 'bg-white text-slate-500 hover:text-slate-700 border border-slate-200';
}

export function compactFinancialLineItems(rows: FinancialLineItem[], otherLabel: string, limit = 6) {
  if (rows.length <= limit + 1) return rows;
  const visible = rows.slice(0, limit);
  const otherAmount = rows.slice(limit).reduce((sum, row) => sum + row.amount, 0);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return [
    ...visible,
    {
      label: otherLabel,
      amount: otherAmount,
      share: total > 0 ? (otherAmount / total) * 100 : 0,
    },
  ];
}

export function reportNetSalesAmount(tx: TransactionWithRelations) {
  return (tx.amount ?? 0) + (tx.dr_capitol ?? 0);
}

export function reportDrFeesAmount(tx: TransactionWithRelations) {
  return tx.dr_capitol ?? 0;
}

export function reportDeliveryFeesAmount(tx: TransactionWithRelations) {
  return tx.delivery_fee ?? 0;
}

export function reportExcludedFeesAmount(tx: TransactionWithRelations) {
  return (tx.passway ?? 0) + (tx.kulot ?? 0);
}
