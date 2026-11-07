import { describe, expect, it } from 'vitest';
import { salesInsightsFixture } from '../test/fixtures/salesInsights';
import { buildSalesInsights, percentageChange, postingHourLabel, type DailySalesInsights } from './salesInsights';

const insight = (data: DailySalesInsights, id: string) => buildSalesInsights(data).find(row => row.id === id)!;

describe('recorded daily sales insights', () => {
  it('reports a change with the underlying current and previous amounts', () => {
    const row = insight(salesInsightsFixture(), 'previous-day');
    expect(row.detail).toContain('20.0% higher');
    expect(row.detail).toContain('PHP 1,200.00 versus PHP 1,000.00');
  });
  it('uses time-matched amounts for an unfinished day', () => {
    const data = salesInsightsFixture(); data.partial_day = true; data.comparison_cutoff = '12:30:00';
    data.comparable_current.net_sales = 600;
    const row = insight(data, 'previous-day');
    expect(row.detail).toContain('40.0% lower');
    expect(row.note).toContain('12:30:00 PHT on both dates');
  });
  it('does not invent growth when the previous-day amount is zero', () => {
    const data = salesInsightsFixture(); data.previous.net_sales = 0; data.previous.transactions = 0;
    expect(insight(data, 'previous-day').detail).toContain('No growth percentage is calculated');
  });
  it('does not report a 100% fall when no current entries have comparable posting times', () => {
    const data = salesInsightsFixture(); data.partial_day = true;
    data.current.missing_times = 6; data.comparable_current.transactions = 0; data.comparable_current.net_sales = 0;
    expect(insight(data, 'previous-day').detail).toContain('No growth percentage is calculated');
    expect(insight(data, 'baseline').detail).toContain('not calculated');
  });
  it('requires three active days before drawing a seven-day comparison', () => {
    const data = salesInsightsFixture(); data.baseline.active_days = 2;
    const row = insight(data, 'baseline');
    expect(row.title).toBe('Limited recent sales history');
    expect(row.detail).toContain('At least three active days');
  });
  it('labels the seven-calendar-day denominator including zero-record dates', () => {
    expect(insight(salesInsightsFixture(), 'baseline').note).toContain('includes zero-record days');
  });
  it('handles an unchanged seven-day average without a false growth claim', () => {
    const data = salesInsightsFixture(); data.comparable_current.net_sales = 1000;
    expect(insight(data, 'baseline').detail).toContain('Net sales match');
  });
  it('uses gross sales as the payment-share denominator', () => {
    expect(insight(salesInsightsFixture(), 'payment-mix').detail).toContain('PHP 600.00 (40.0%)');
  });
  it('highlights deferred/offset portions only at the stated 50 percent threshold', () => {
    const data = salesInsightsFixture(); data.current.deferred_payments = 750;
    expect(insight(data, 'payment-mix').tone).toBe('attention');
    data.current.deferred_payments = 749;
    expect(insight(data, 'payment-mix').tone).toBe('neutral');
  });
  it('does not count customer credit as new cash received', () => {
    expect(insight(salesInsightsFixture(), 'payment-mix').note).toContain('customer credit use is not new cash received');
  });
  it('uses net sales as the product-share denominator', () => {
    expect(insight(salesInsightsFixture(), 'product').detail).toContain('60.0% of net sales');
  });
  it('preserves ties between leading products', () => {
    const data = salesInsightsFixture(); data.leading_product_count = 2;
    expect(insight(data, 'product').title).toBe('Products share the sales lead');
    expect(insight(data, 'product').note).toContain('2 products');
  });
  it('preserves tied peak hours and describes posting rather than delivery time', () => {
    const data = salesInsightsFixture(); data.peak_hours.push({ hour: 10, transactions: 4, net_sales: 400 });
    const row = insight(data, 'posting-hour');
    expect(row.title).toContain('tied');
    expect(row.detail).toContain('9:00 AM–10:00 AM, 10:00 AM–11:00 AM');
    expect(row.note).toContain('system posting times');
  });
  it('omits hourly conclusions if no posting times are available', () => {
    const data = salesInsightsFixture(); data.peak_hours = [];
    expect(buildSalesInsights(data).some(row => row.id === 'posting-hour')).toBe(false);
  });
  it('does not divide by zero for zero-value recorded sales', () => {
    const data = salesInsightsFixture(); data.current.total_sales = 0; data.current.net_sales = 0;
    const rows = buildSalesInsights(data);
    expect(rows.some(row => row.id === 'payment-mix')).toBe(false);
    expect(JSON.stringify(rows)).not.toMatch(/NaN|Infinity/);
  });
  it('returns no claims for an empty selected day', () => {
    const data = salesInsightsFixture(); data.current.transactions = 0;
    expect(buildSalesInsights(data)).toEqual([]);
  });
  it('does not compute percentages against a zero or negative reference', () => {
    expect(percentageChange(100, 0)).toBeNull();
    expect(percentageChange(100, -10)).toBeNull();
  });
  it('formats posting-hour windows at noon and midnight correctly', () => {
    expect(postingHourLabel(12)).toBe('12:00 PM–1:00 PM');
    expect(postingHourLabel(23)).toBe('11:00 PM–12:00 AM');
  });
});
