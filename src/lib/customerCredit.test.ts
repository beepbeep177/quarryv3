import { describe, expect, it } from 'vitest';
import { customerCreditBalanceAfter } from './customerCredit';

describe('customer credit with negative balances', () => {
  it.each([
    [3074.10, 16701.30, -13627.20],
    [0, 500, -500],
    [-500, 200, -700],
    [500, 500, 0],
    [1000, 200, 800],
    [0.30, 0.20, 0.10],
    [-0.10, 0.20, -0.30],
    [-500, 0, -500],
  ])('projects balance %s minus payment %s as %s', (balance, amount, expected) => {
    expect(customerCreditBalanceAfter(balance, amount)).toBe(expected);
  });
});
