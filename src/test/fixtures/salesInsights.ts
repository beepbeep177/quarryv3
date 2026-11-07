import type { DailySalesInsights } from '../../lib/salesInsights';

export function salesInsightsFixture(): DailySalesInsights {
  return {
    date: '2026-10-18', generated_at: '2026-10-19T04:00:00Z', partial_day: false, comparison_cutoff: null,
    current: { transactions: 6, net_sales: 1200, total_sales: 1500, volume: 30, direct_payments: 600, deferred_payments: 600, credit_used: 300, missing_times: 0 },
    comparable_current: { date: '2026-10-18', transactions: 6, net_sales: 1200, volume: 30 },
    previous: { date: '2026-10-17', transactions: 5, net_sales: 1000, volume: 25 },
    baseline: { from: '2026-10-11', to: '2026-10-17', calendar_days: 7, active_days: 5, average_net_sales: 1000, average_transactions: 5, excluded_missing_times: 0 },
    top_products: [
      { product: 'G1', transactions: 3, net_sales: 720, volume: 18 },
      { product: 'Sand', transactions: 3, net_sales: 480, volume: 12 },
    ],
    leading_product_count: 1,
    peak_hours: [{ hour: 9, transactions: 4, net_sales: 800 }],
  };
}
