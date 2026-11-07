import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { buildSalesInsights } from '../../lib/salesInsights';
import { salesInsightsFixture } from '../../test/fixtures/salesInsights';
import DailySalesInsights from './DailySalesInsights';
import SalesInsightsContent from './SalesInsightsContent';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

describe('sales insight presentation', () => {
  it('shows evidence and a top-products table', () => {
    const data = salesInsightsFixture();
    const html = renderToStaticMarkup(<SalesInsightsContent data={data} insights={buildSalesInsights(data)} />);
    expect(html).toContain('20.0% higher');
    expect(html).toContain('Top products by net sales');
    expect(html).toContain('G1'); expect(html).toContain('Sand');
    expect(html).toContain('Full business day');
  });
  it('warns when the parent reconciliation found allocation problems', () => {
    const data = salesInsightsFixture();
    const html = renderToStaticMarkup(<SalesInsightsContent data={data} insights={buildSalesInsights(data)} allocationIssues />);
    expect(html).toContain('payment-mix figures as provisional');
  });
  it('shows missing timestamp coverage for time-matched comparisons', () => {
    const data = salesInsightsFixture(); data.partial_day = true; data.comparison_cutoff = '12:30:00'; data.current.missing_times = 1;
    const html = renderToStaticMarkup(<SalesInsightsContent data={data} insights={buildSalesInsights(data)} />);
    expect(html).toContain('comparisons through 12:30:00 PHT');
    expect(html).toContain('have no posting time');
  });
  it('discloses untimed rows on completed dates without excluding them from daily comparisons', () => {
    const data = salesInsightsFixture(); data.current.missing_times = 2;
    const html = renderToStaticMarkup(<SalesInsightsContent data={data} insights={buildSalesInsights(data)} />);
    expect(html).toContain('excluded from peak-hour findings');
    expect(html).toContain('Full-day comparisons and totals still include');
  });
  it('shows an empty state instead of fabricated findings', () => {
    const data = salesInsightsFixture(); data.current.transactions = 0; data.top_products = [];
    const html = renderToStaticMarkup(<SalesInsightsContent data={data} insights={buildSalesInsights(data)} />);
    expect(html).toContain('No recorded non-donation sales');
    expect(html).not.toContain('Leading product');
  });
  it('does not show findings before the data has loaded', () => {
    const html = renderToStaticMarkup(<DailySalesInsights date="2026-10-19" />);
    expect(html).toContain('Calculating sales insights');
    expect(html).not.toContain('higher');
  });
});
