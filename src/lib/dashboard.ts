import { peso } from './reconciliation';
import { percentageChange, postingHourLabel, type SalesInsight } from './salesInsights';

export interface ChartValue { label: string; value: number }
export interface SalesDashboard {
  from: string; to: string; days: number; bucket: 'day' | 'month' | 'year'; generated_at: string;
  partial: boolean; has_previous: boolean; previous_from: string; previous_to: string; previous_net_sales: number | null;
  totals: { sales: number; net_sales: number; transactions: number; volume: number; pending_ar: number; allocation_mismatches: number; missing_times: number };
  products: (ChartValue & { transactions: number; volume: number })[];
  leading_product_count: number;
  payments: ChartValue[];
  trend: { date: string; value: number; transactions: number }[];
  peak_hours: { hour: number; transactions: number }[];
  recent: { id: string; transaction_date: string; dr_number: string; material_type: string; total_amount: number; payment_mode: string; customer: string | null; truck: string | null }[];
}
export const paymentLabel = (mode: string) => ({ BANK_TRANSFER: 'Bank transfer', CUSTOMER_CREDIT: 'Customer credit', CASH: 'Cash', GCASH: 'GCash' }[mode] ?? mode);
export const paymentAmount = (data: SalesDashboard, ...modes: string[]) => data.payments.reduce((sum, row) => sum + (modes.includes(row.label) ? row.value : 0), 0);

export function dashboardInsights(data: SalesDashboard): SalesInsight[] {
  if (!data.totals.transactions) return [];
  const facts: SalesInsight[] = [];
  const change = data.has_previous ? percentageChange(data.totals.net_sales, data.previous_net_sales ?? 0) : null;
  facts.push({ id: 'comparison', title: change === null ? 'Period comparison' : 'Net sales versus the previous period', tone: 'neutral',
    detail: change === null
      ? data.partial ? 'This range includes today and is still in progress. Growth is shown only for completed periods.'
        : !data.has_previous ? 'Choose a bounded, completed date range to compare with the preceding period of equal length.'
          : 'The previous period has no positive net sales. A growth percentage is unavailable.'
      : `${Math.abs(change).toFixed(1)}% ${change > 0 ? 'higher' : change < 0 ? 'lower' : 'change'}: ${peso(data.totals.net_sales)} versus ${peso(data.previous_net_sales ?? 0)}.`,
    note: data.has_previous ? `Previous ${data.days} calendar day(s): ${data.previous_from} to ${data.previous_to}. Zero-record days are included.` : 'Comparisons use Philippine business dates.' });
  // The last chart row may combine several products; it must not be called a single leading product.
  const top = data.products[0];
  if (top && data.totals.net_sales > 0) facts.push({ id: 'product', title: data.leading_product_count > 1 ? 'Products share the sales lead' : 'Leading product', tone: 'neutral',
    detail: `${top.label}: ${peso(top.value)} (${(top.value / data.totals.net_sales * 100).toFixed(1)}% of net sales), ${top.volume.toFixed(2)} m³.`,
    note: data.leading_product_count > 1 ? `${data.leading_product_count} products share the highest net sales amount.` : 'Recorded material demand across the selected range.' });
  const deferred = paymentAmount(data, 'P.O', 'OFFSET');
  facts.push({ id: 'payments', title: 'Payment allocation', tone: data.totals.sales > 0 && deferred / data.totals.sales >= 0.5 ? 'attention' : 'neutral',
    detail: `${peso(paymentAmount(data, 'CASH', 'GCASH', 'BANK_TRANSFER'))} direct payments; ${peso(deferred)} P.O / OFFSET; ${peso(paymentAmount(data, 'CUSTOMER_CREDIT'))} customer credit used.`,
    note: 'Customer credit use is not new cash. Later receivable collections are excluded from this sales allocation.' });
  facts.push({ id: 'average', title: 'Sales per transaction', tone: 'neutral', detail: `${peso(data.totals.net_sales / data.totals.transactions)} average net sales and ${(data.totals.volume / data.totals.transactions).toFixed(2)} m³ per transaction.`, note: `${data.totals.transactions} recorded sales across ${data.days} calendar day(s).` });
  if (data.peak_hours.length) facts.push({ id: 'peak', title: data.peak_hours.length > 1 ? 'Peak posting hours are tied' : 'Peak posting hour', tone: 'neutral',
    detail: `${data.peak_hours.slice(0, 3).map(row => postingHourLabel(row.hour)).join(', ')}${data.peak_hours.length > 3 ? ` and ${data.peak_hours.length - 3} more` : ''}: ${data.peak_hours[0].transactions} entries per peak hour.`,
    note: `Encoding activity across this range, based on posting time; this does not measure dispatch traffic.${data.totals.missing_times ? ` ${data.totals.missing_times} untimed entries excluded from this finding.` : ''}` });
  return facts;
}
