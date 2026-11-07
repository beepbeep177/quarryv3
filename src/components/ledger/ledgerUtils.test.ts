import { describe, expect, it } from 'vitest';
import type { TransactionWithRelations } from '../../lib/database.types';
import { balanceInterpretation, getCustomerOffsetAmount, getSplitOffsetAmount } from './ledgerUtils';

describe('ledger amounts after extraction', () => {
  it('counts only the offset portion of split payments', () => {
    expect(getSplitOffsetAmount([{ mode: 'CASH', amount: 500 }, { mode: 'OFFSET', amount: '250' }, { mode: 'offset', amount: 50 }, { mode: 'OFFSET', amount: 'invalid' }])).toBe(300);
  });
  it.each([null, {}, 'invalid', 123])('handles invalid split payment details: %s', value => {
    expect(getSplitOffsetAmount(value)).toBe(0);
  });
  it.each(['P.O', 'OFFSET'] as const)('uses the full transaction total for %s', payment_mode => {
    expect(getCustomerOffsetAmount({ payment_mode, total_amount: 1250 } as TransactionWithRelations)).toBe(1250);
  });
  it('does not count a cash transaction as a customer offset', () => {
    expect(getCustomerOffsetAmount({ payment_mode: 'CASH', total_amount: 1250 } as TransactionWithRelations)).toBe(0);
  });
  it('preserves the meaning of positive, negative, and settled hauler balances', () => {
    expect(balanceInterpretation(100)).toBe('Company owes hauler');
    expect(balanceInterpretation(-100)).toBe('Hauler owes company / over-offset');
    expect(balanceInterpretation(0)).toBe('Fully settled');
  });
});
