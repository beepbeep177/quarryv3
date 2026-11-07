export function money(value: number): string {
  return Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function peso(value: number): string {
  return `₱${money(value)}`;
}

/** Hours/days without trailing zeros: 1, 0.5, 7.25. */
export function qty(value: number): string {
  return Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatShortDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

export function weekdayShort(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short' });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatPeriod(dateFrom: string, dateTo: string): string {
  return `${formatDate(dateFrom)} – ${formatDate(dateTo)}`;
}

/** Parses a user-typed number; blanks and junk become 0, negatives are clamped unless allowed. */
export function parseAmount(value: string, allowNegative = false): number {
  const parsed = Number.parseFloat(value.replace(/,/g, ''));
  if (!Number.isFinite(parsed)) return 0;
  return allowNegative ? parsed : Math.max(0, parsed);
}
