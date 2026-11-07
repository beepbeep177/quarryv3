import { describe, expect, it } from 'vitest';
import type { TransactionWithRelations } from '../../lib/database.types';
import { compactFinancialLineItems, createContinuousBuckets, getDateRangeSummary, reportDeliveryFeesAmount, reportDrFeesAmount, reportExcludedFeesAmount, reportNetSalesAmount } from './reportUtils';

describe('report calculations after extraction', () => {
  it('includes DR fees in net sales while keeping delivery and other fees separate', () => {
    const transaction = { amount: 1000, dr_capitol: 50, delivery_fee: 200, passway: 30, kulot: 20 } as TransactionWithRelations;
    expect(reportNetSalesAmount(transaction)).toBe(1050);
    expect(reportDrFeesAmount(transaction)).toBe(50);
    expect(reportDeliveryFeesAmount(transaction)).toBe(200);
    expect(reportExcludedFeesAmount(transaction)).toBe(50);
  });
  it('normalizes reversed custom dates', () => {
    expect(getDateRangeSummary('CUSTOM', '2026-10-19', '2026-10-01', '', '')).toMatchObject({ start: '2026-10-01', end: '2026-10-19', salesGrouping: 'DAY' });
  });
  it('includes leap day in monthly reports', () => {
    expect(getDateRangeSummary('MONTHLY', '', '', '2024-02', '')).toMatchObject({ start: '2024-02-01', end: '2024-02-29' });
  });
  it('builds continuous weekly buckets across a year boundary', () => {
    expect(createContinuousBuckets('2025-12-31', '2026-01-07', 'WEEK')).toEqual(['2025-12-29', '2026-01-05']);
  });
  it('retains the total amount and share when combining smaller categories', () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({ label: String(index), amount: 10, share: 12.5 }));
    const compact = compactFinancialLineItems(rows, 'Other', 6);
    expect(compact).toHaveLength(7);
    expect(compact[compact.length - 1]).toEqual({ label: 'Other', amount: 20, share: 25 });
    expect(compact.reduce((sum, row) => sum + row.amount, 0)).toBe(80);
  });
});

