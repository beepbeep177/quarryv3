import { describe, expect, it } from 'vitest';
import type { TransactionWithRelations } from './database.types';
import { getPaymentModeAmount, getReceivableAmount, getReceivableModeLabel } from './payment';

function transaction(overrides: Partial<TransactionWithRelations>): TransactionWithRelations {
  return {
    payment_mode: 'CASH',
    total_amount: 1000,
    split_payment_details: [],
    ...overrides,
  } as TransactionWithRelations;
}

describe('payment calculations', () => {
  it('treats the full P.O amount as receivable', () => {
    expect(getReceivableAmount(transaction({ payment_mode: 'P.O', total_amount: 1250.55 }))).toBe(1250.55);
  });

  it('excludes paid portions from a split receivable', () => {
    const tx = transaction({
      payment_mode: 'SPLIT',
      total_amount: 1500,
      split_payment_details: [
        { mode: 'CASH', amount: 500 },
        { mode: 'P.O', amount: 1000 },
      ],
    });
    expect(getReceivableAmount(tx)).toBe(1000);
    expect(getReceivableModeLabel(tx)).toBe('SPLIT: P.O');
  });

  it('combines P.O and OFFSET portions only', () => {
    const tx = transaction({
      payment_mode: 'SPLIT',
      total_amount: 1800,
      split_payment_details: [
        { mode: 'P.O', amount: 600 },
        { mode: 'OFFSET', amount: 700 },
        { mode: 'CUSTOMER_CREDIT', amount: 500 },
      ],
    });
    expect(getReceivableAmount(tx)).toBe(1300);
    expect(getReceivableModeLabel(tx)).toBe('SPLIT: P.O + OFFSET');
  });

  it('returns zero when a split transaction is fully paid', () => {
    const tx = transaction({
      payment_mode: 'SPLIT',
      split_payment_details: [
        { mode: 'CASH', amount: 500 },
        { mode: 'GCASH', amount: 500 },
      ],
    });
    expect(getReceivableAmount(tx)).toBe(0);
  });

  it('ignores malformed split details', () => {
    const tx = transaction({
      payment_mode: 'SPLIT',
      split_payment_details: [
        null,
        { mode: 'P.O', amount: 'invalid' },
        { mode: 'OFFSET', amount: -10 },
      ],
    });
    expect(getPaymentModeAmount(tx, 'P.O')).toBe(0);
    expect(getReceivableAmount(tx)).toBe(0);
  });
});
