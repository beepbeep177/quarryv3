import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import Dashboard from '../Dashboard';
import DashboardCharts from './DashboardCharts';
import DashboardInsights from './DashboardInsights';
import DashboardRecentSales from './DashboardRecentSales';
import { dashboardInsights, type SalesDashboard } from '../../lib/dashboard';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const fixture = (): SalesDashboard => ({
  from: '2026-10-01', to: '2026-10-02', days: 2, bucket: 'day', generated_at: '2026-10-03T08:00:00Z',
  partial: false, has_previous: true, previous_from: '2026-09-29', previous_to: '2026-09-30', previous_net_sales: 1000,
  totals: { sales: 1500, net_sales: 1200, volume: 30, transactions: 6, pending_ar: 600, allocation_mismatches: 0, missing_times: 0 },
  products: [{ label: 'Sand', value: 720, volume: 20, transactions: 4 }, { label: 'G1', value: 480, volume: 10, transactions: 2 }], leading_product_count: 1,
  payments: [{ label: 'CASH', value: 600 }, { label: 'P.O', value: 600 }, { label: 'CUSTOMER_CREDIT', value: 300 }],
  trend: [{ date: '2026-10-01', value: 1200, transactions: 6 }, { date: '2026-10-02', value: 0, transactions: 0 }],
  peak_hours: [{ hour: 9, transactions: 4 }], recent: [],
});

describe('range dashboard', () => {
  it('starts with date controls and loading, without unverified totals', () => {
    const html = renderToStaticMarkup(<Dashboard onNavigate={() => {}} onOpenProductReport={() => {}} refreshKey={0} canManageRecords={false} />);
    expect(html).toContain('From date'); expect(html).toContain('To date');
    expect(html).toContain('Loading dashboard for the selected range');
    expect(html).not.toContain('Pending receivables');
  });
  it('compares completed periods of the same length', () => {
    const fact = dashboardInsights(fixture())[0];
    expect(fact.detail).toContain('20.0% higher');
    expect(fact.note).toContain('Previous 2 calendar day(s): 2026-09-29 to 2026-09-30');
  });
  it('does not compare an incomplete period or divide by zero', () => {
    const data = fixture(); data.partial = true; data.has_previous = false;
    expect(dashboardInsights(data)[0].detail).toContain('still in progress');
    expect(dashboardInsights(data)[0].detail).not.toContain('%');
    data.partial = false; data.has_previous = true; data.previous_net_sales = 0;
    expect(dashboardInsights(data)[0].detail).toContain('no positive net sales');
  });
  it('keeps insights collapsible and surfaces allocation discrepancies', () => {
    const data = fixture(); data.totals.allocation_mismatches = 1;
    const html = renderToStaticMarkup(<DashboardInsights data={data} />);
    expect(html).toContain('<details open'); expect(html).toContain('<summary');
    expect(html).toContain('payment charts and insights as provisional');
    expect(html).toContain('Customer credit use is not new cash');
  });
  it('provides chart legends, exact trend values, and zero-sales days', () => {
    const html = renderToStaticMarkup(<DashboardCharts data={fixture()} />);
    expect(html).toContain('Product sales bar chart'); expect(html).toContain('Payment allocation pie chart');
    expect(html).toContain('View trend values'); expect(html).toContain('Oct 2, 2026');
    expect(html).toContain('40.0%'); expect(html).toContain('Customer credit');
    expect(html).not.toContain('NaN'); expect(html).not.toContain('Infinity');
  });
  it('handles an empty date range without fabricated facts or broken charts', () => {
    const data = fixture(); data.totals.transactions = 0; data.products = []; data.payments = []; data.trend.forEach(row => { row.value = 0; row.transactions = 0; });
    expect(dashboardInsights(data)).toEqual([]);
    const html = renderToStaticMarkup(<><DashboardCharts data={data} /><DashboardInsights data={data} /><DashboardRecentSales data={data} /></>);
    expect(html).toContain('No sales data in this range'); expect(html).toContain('No recorded sales in this range');
    expect(html).not.toContain('NaN'); expect(html).not.toContain('Infinity');
  });
  it('preserves tied product and posting-hour leaders', () => {
    const data = fixture(); data.leading_product_count = 2; data.peak_hours.push({ hour: 10, transactions: 4 });
    const facts = dashboardInsights(data);
    expect(facts.find(fact => fact.id === 'product')?.title).toContain('share');
    expect(facts.find(fact => fact.id === 'peak')?.title).toContain('tied');
  });
});
