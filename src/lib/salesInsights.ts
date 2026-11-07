import { peso } from './reconciliation';

export interface ComparableSalesDay { date: string; transactions: number; net_sales: number; volume: number }
export interface DailySalesInsights {
  date: string;
  generated_at: string;
  partial_day: boolean;
  comparison_cutoff: string | null;
  current: {
    transactions: number; net_sales: number; total_sales: number; volume: number;
    direct_payments: number; deferred_payments: number; credit_used: number; missing_times: number;
  };
  comparable_current: ComparableSalesDay;
  previous: ComparableSalesDay;
  baseline: { from: string; to: string; calendar_days: number; active_days: number; average_net_sales: number; average_transactions: number; excluded_missing_times: number };
  top_products: { product: string; transactions: number; net_sales: number; volume: number }[];
  leading_product_count: number;
  peak_hours: { hour: number; transactions: number; net_sales: number }[];
}
export interface SalesInsight { id: string; title: string; detail: string; note: string; tone: 'neutral' | 'attention' }
const percent = (value: number) => `${value.toFixed(1)}%`;
const number = (value: number) => value.toLocaleString('en-PH', { maximumFractionDigits: 2 });

export function percentageChange(current: number, previous: number): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}
export function postingHourLabel(hour: number): string {
  const format = (value: number) => `${value % 12 || 12}:00 ${value < 12 ? 'AM' : 'PM'}`;
  return `${format(hour)}–${format((hour + 1) % 24)}`;
}
function movement(current: number, reference: number): string {
  const change = percentageChange(current, reference);
  if (change === null) return 'No positive comparison amount is available.';
  if (Math.abs(current - reference) < 0.005) return 'Net sales are unchanged';
  return `Net sales are ${percent(Math.abs(change))} ${change > 0 ? 'higher' : 'lower'}`;
}

/** Facts computed from recorded data. No forecasts or inferred causes. */
export function buildSalesInsights(data: DailySalesInsights): SalesInsight[] {
  if (data.current.transactions === 0) return [];
  const scope = data.partial_day ? `through ${data.comparison_cutoff ?? 'the current time'} PHT on both dates` : 'using full business days';
  const current = data.comparable_current;
  const previous = data.previous;
  const noComparableCurrent = data.partial_day && current.transactions === 0;
  const previousReady = !noComparableCurrent && previous.transactions > 0 && previous.net_sales > 0;
  const insights: SalesInsight[] = [{
    id: 'previous-day', tone: 'neutral',
    title: previousReady ? 'Compared with the previous day' : 'Previous-day comparison unavailable',
    detail: previousReady
      ? `${movement(current.net_sales, previous.net_sales)}: ${peso(current.net_sales)} versus ${peso(previous.net_sales)} on ${previous.date}.`
      : noComparableCurrent ? 'No selected-date sales fall inside the current posting-time comparison window. No growth percentage is calculated.' : `${previous.date} has no positive recorded net sales for this comparison window. No growth percentage is calculated.`,
    note: `Comparison ${scope}; ${current.transactions} versus ${previous.transactions} transaction(s), ${number(current.volume)} versus ${number(previous.volume)} m³.`,
  }];
  const historyReady = !noComparableCurrent && data.baseline.active_days >= 3 && data.baseline.average_net_sales > 0;
  insights.push({
    id: 'baseline', tone: 'neutral',
    title: historyReady ? 'Compared with the last seven calendar days' : 'Limited recent sales history',
    detail: historyReady
      ? Math.abs(current.net_sales - data.baseline.average_net_sales) < 0.005
        ? `Net sales match the ${peso(data.baseline.average_net_sales)} daily average for ${data.baseline.from}–${data.baseline.to}.`
        : `${movement(current.net_sales, data.baseline.average_net_sales)} than the ${peso(data.baseline.average_net_sales)} daily average for ${data.baseline.from}–${data.baseline.to}.`
      : noComparableCurrent ? 'No selected-date sales fall inside the current comparison window, so a seven-day comparison is not calculated.' : `Only ${data.baseline.active_days} of the previous seven calendar days have recorded sales in this window. At least three active days are needed for this comparison.`,
    note: `The average includes zero-record days; ${data.partial_day ? 'all dates use the same posting-time cutoff.' : 'full business days are used.'}`,
  });
  const top = data.top_products[0];
  if (top && data.current.net_sales > 0) {
    insights.push({
      id: 'product', tone: 'neutral', title: data.leading_product_count > 1 ? 'Products share the sales lead' : 'Leading product by net sales',
      detail: `${top.product}: ${peso(top.net_sales)} (${percent(top.net_sales / data.current.net_sales * 100)} of net sales), ${number(top.volume)} m³ across ${top.transactions} transaction(s).`,
      note: data.leading_product_count > 1 ? `${data.leading_product_count} products have the same leading net sales amount. See the top-products table.` : 'Use the product mix to review material demand for this date.',
    });
  }
  const peak = data.peak_hours[0];
  if (peak) {
    insights.push({
      id: 'posting-hour', tone: 'neutral', title: data.peak_hours.length > 1 ? 'Peak posting hours are tied' : 'Peak posting hour',
      detail: `${data.peak_hours.slice(0, 3).map(hour => postingHourLabel(hour.hour)).join(', ')}${data.peak_hours.length > 3 ? `, plus ${data.peak_hours.length - 3} other hour(s)` : ''}: ${peak.transactions} transaction(s) per peak hour.`,
      note: 'Based on system posting times. Backdated entries retain their posting time; this describes encoding activity.',
    });
  }
  if (data.current.total_sales > 0) {
    const deferredShare = data.current.deferred_payments / data.current.total_sales * 100;
    insights.push({
      id: 'payment-mix', tone: deferredShare >= 50 ? 'attention' : 'neutral',
      title: deferredShare >= 50 ? 'At least half of sales are P.O / OFFSET' : 'Sales payment mix',
      detail: `${peso(data.current.direct_payments)} (${percent(data.current.direct_payments / data.current.total_sales * 100)}) was allocated to cash, GCash, or bank transfer. P.O / OFFSET: ${peso(data.current.deferred_payments)} (${percent(deferredShare)}). Customer credit used: ${peso(data.current.credit_used)}.`,
      note: 'Shares use sales totals including fees. Review P.O collections and OFFSET settlements separately; customer credit use is not new cash received.',
    });
  }
  insights.push({
    id: 'order-size', tone: 'neutral', title: 'Sales per transaction',
    detail: `${peso(data.current.net_sales / data.current.transactions)} average net sales and ${number(data.current.volume / data.current.transactions)} m³ per transaction, across ${data.current.transactions} recorded sales.`,
    note: 'Average order size can change with product mix; it does not identify the cause of a sales change.',
  });
  return insights;
}
