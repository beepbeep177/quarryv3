import { describe, expect, it } from 'vitest';
import { reconciliationChecks, type DailyReconciliationResult } from './reconciliation';

function report(): DailyReconciliationResult {
  return {
    date: '2026-10-19', generated_at: '2026-10-19T04:00:00Z', is_today: true,
    sales: { count: 3, total: 2500, net_sales: 2500, volume: 3, allocation_difference: 0, allocation_mismatches: 0, receivables_created: 500, direct_collections: 1200, receivable_collections: 150, customer_credit_used: 1000 },
    expenses: 70,
    credit: { opening: 500, credits: 0, debits: 1000, closing: -500, negative_customers: 1, expected_deductions: 1000, posted_deductions: 1000, deduction_mismatches: 0 },
    fuel: { branches: [{ id: 'main', name: 'Main', opening_liters: 0, movement_liters: 100, closing_liters: 100, closing_value: 10000, state_liters: 100, state_value: 10000, missing_state: false, liters_difference: 0, value_difference: 0 }], source_mismatches: 0, purchases_liters: 100, issuances_liters: 20, source_issues: [] },
    credit_issues: [],
  };
}

describe('daily reconciliation checks', () => {
  it('accepts a negative customer credit balance with correctly posted deductions', () => {
    expect(reconciliationChecks(report()).every(check => check.status === 'balanced')).toBe(true);
  });
  it('flags transaction mismatches even when opposite differences cancel out', () => {
    const data = report(); data.sales.allocation_mismatches = 2; data.sales.allocation_difference = 0;
    expect(reconciliationChecks(data)[0].status).toBe('issue');
  });
  it('flags source/customer mismatches even when credit amounts match', () => {
    const data = report(); data.credit.deduction_mismatches = 1;
    expect(reconciliationChecks(data)[1].status).toBe('issue');
  });
  it('flags a value-only fuel inventory discrepancy', () => {
    const data = report(); data.fuel.branches[0].value_difference = 50;
    expect(reconciliationChecks(data)[3].status).toBe('issue');
  });
  it('flags a missing inventory snapshot even if the ledger is zero', () => {
    const data = report(); data.fuel.branches[0].missing_state = true;
    expect(reconciliationChecks(data)[3].status).toBe('issue');
  });
  it('does not compare a historical closing balance with current inventory', () => {
    const data = report(); data.is_today = false;
    data.fuel.branches[0].state_liters = null;
    data.fuel.branches[0].liters_difference = null;
    expect(reconciliationChecks(data)[3].status).toBe('not-compared');
  });
  it('checks source postings separately from the inventory snapshot', () => {
    const data = report(); data.fuel.source_mismatches = 1;
    const checks = reconciliationChecks(data);
    expect(checks[2].status).toBe('issue');
    expect(checks[3].status).toBe('balanced');
  });
  it('tolerates less than half a cent/liter of numeric difference', () => {
    const data = report(); data.fuel.branches[0].value_difference = 0.004;
    expect(reconciliationChecks(data)[3].status).toBe('balanced');
  });
});
